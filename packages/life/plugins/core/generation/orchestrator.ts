import type { Agent } from "@/agent/agent";
import type { Resources } from "@/agent/resources";
import type { EmitFunction, PluginEvent } from "@/plugins/definition";
import { AsyncQueue } from "@/shared/async-queue";
import { z } from "zod";
import type { CoreEvent, corePlugin } from "../plugin";
import { Generation, type GenerationChunk } from "./generation";

// Orchestrator
export class GenerationOrchestrator {
  #agent: Agent;
  #emit: EmitFunction<typeof corePlugin._definition.events>;
  #coreQueueSome: (predicate: (event: CoreEvent) => boolean) => boolean;
  #consumeQueue: AsyncQueue<Generation> = new AsyncQueue();
  #voiceEnabled = false;

  #generations: Generation[] = [];
  #decidePromises: {
    id: string;
    event: Extract<CoreEvent, { type: "agent.decide" }>;
    promise: Promise<void>;
    cancel: () => Extract<CoreEvent, { type: "agent.decide" }>;
  }[] = [];
  #generationsResourcesRequestsIds: Record<string, string> = {};
  #resourcesResponses: Record<string, Resources> = {};

  constructor(params: {
    agent: Agent;
    emit: (event: PluginEvent<typeof corePlugin._definition.events, "input">) => string;
    coreQueueSome: (predicate: (event: CoreEvent) => boolean) => boolean;
  }) {
    this.#agent = params.agent;
    this.#emit = params.emit;
    this.#coreQueueSome = params.coreQueueSome;

    // Start the orchestrator
    this.#consumeGenerations();
  }

  #processInterruptEvent(event: Extract<CoreEvent, { type: "agent.interrupt" }>) {
    let interrupted = false;
    // Try interrupting all generations
    for (const generation of this.#generations) {
      console.log(
        `🟢 Try interrupting gen ${generation.id} (status: ${generation.status}, canInterrupt: ${generation.canInterrupt()}, force: ${event.data.force})`,
      );
      if (generation.status === "running" && (generation.canInterrupt() || event.data.force)) {
        generation.stop(true);
        this.#generations = this.#generations.filter((g) => g !== generation);
        interrupted = true;
      }
    }

    // If at least one generation was interrupted, notify the interruption
    if (interrupted) {
      console.log("🟩 Interrupted");
      this.#emit({
        type: "agent.interrupted",
        data: {
          reason: event.data.reason,
          forced: event.data.force ?? false,
          author: event.data.author,
        },
      });
    }
  }

  #processResourcesResponseEvent(event: Extract<CoreEvent, { type: "agent.resources-response" }>) {
    this.#resourcesResponses[event.data.requestId] = event.data;
  }

  #processDecideEvent(generation: Generation, event: Extract<CoreEvent, { type: "agent.decide" }>) {
    const id = crypto.randomUUID();
    this.#decidePromises.push({
      id,
      event,
      promise: (async () => {
        const result = await this.#agent.models.llm.generateObject({
          messages: [
            {
              id: crypto.randomUUID(),
              createdAt: Date.now(),
              lastUpdated: Date.now(),
              role: "system",
              content: `
                    # Instructions
                    You're a decision assistant helping another assistant itself directly discussing with
                    the user and interacting with the application. A new system information has been received
                    and your role is to decide whether the other assistant should react to this new information,
                    or just be passive. You'll be provided the conversation history including the new information,
                    as part of the last system messages.

                    ## Output
                    Once you've taken your decision, you'll output a 'shouldReact' boolean, indicating whether
                    that new information is worth reacting to and could help the conversation goal.

                    ## Recent conversation history
                    Here is the recent conversation history, including the new information.
                    Should the agent react to the most recent system messages?

                    ${event.data.messages
                      .map((message) => {
                        if (
                          message.role === "user" ||
                          message.role === "system" ||
                          message.role === "agent"
                        )
                          return `${message.role}: ${message.content}`;
                        else return "";
                      })
                      .join("\n")}
                    `,
            },
          ],
          schema: z.object({
            shouldContinue: z.boolean(),
          }),
        });
        if (result.success && result.data.shouldContinue && generation.status === "idle") {
          this.#emit({ type: "agent.continue", data: event.data, urgent: true });
        }

        // Remove the promise from the list
        this.#decidePromises = this.#decidePromises.filter((decide) => decide.id !== id);
      })(),
      cancel: () => {
        this.#decidePromises = this.#decidePromises.filter((decide) => decide.id !== id);
        return event;
      },
    });
  }

  #processInsertEvent(
    generation: Generation,
    event: Extract<CoreEvent, { type: "agent.continue" | "agent.say" }>,
  ) {
    // In case an abrupt intrerupt insert is requested, try first interrupting the current generation
    if (event.data.interrupt === "abrupt")
      this.#processInterruptEvent({
        id: "whatever",
        type: "agent.interrupt",
        data: {
          reason: "Interrupted by another operation.",
          author: "application",
        },
      });

    // - Cancel and merge ongoing decide promises
    for (const decide of this.#decidePromises) {
      decide.cancel();
      generation.addInsertEvent({
        id: "whatever",
        type: "agent.continue",
        data: decide.event.data,
      });
    }

    // - Add the initial operation to the generation
    generation.addInsertEvent(event);

    // If a smooth interruption is requested, notify the scheduler
    return event.data.interrupt === "smooth";
  }

  #isGenerationEvent(event: CoreEvent) {
    return (
      event.type === "agent.continue" ||
      event.type === "agent.say" ||
      event.type === "agent.decide" ||
      event.type === "agent.resources-response" ||
      event.type === "agent.interrupt" ||
      event.type === "agent.generation-end"
    );
  }

  #isQueueBusy() {
    return this.#coreQueueSome((event) => this.#isGenerationEvent(event));
  }

  // If the generation is running, wait
  // TODO: In the future, if the next generation is a smooth interrupt, sync both generations for a smooth transition
  // - For that later, add a stopAfter() method to generations, which prompt them to stop streaming after that time
  // - And start the next generation from the end of the previous one
  // if (generation.status === "running") continue;
  scheduleGenerations(event: CoreEvent, voiceEnabled: boolean): unknown {
    // Update the voice enabled flag
    this.#voiceEnabled = voiceEnabled;

    // Ignore non-generation events
    if (!event || !this.#isGenerationEvent(event)) return;

    // If there are remaining operations to process, wait
    if (this.#isQueueBusy()) return console.log("😡 QUEUE WAS BUSY");

    // Filter out ended generations
    this.#generations = this.#generations.filter((generation) => generation.status !== "ended");

    // Retrieve first idle generation
    let generation = this.#generations.find((generation) => generation.status === "idle");

    // If there is no idle generation, create one
    if (!generation) {
      generation = new Generation({ agent: this.#agent, voiceEnabled: this.#voiceEnabled });
      this.#generations.push(generation);
    }

    // Handle the event if (any)
    if (event.type === "agent.continue") this.#processInsertEvent(generation, event);
    else if (event.type === "agent.say") this.#processInsertEvent(generation, event);
    else if (event.type === "agent.decide") this.#processDecideEvent(generation, event);
    else if (event.type === "agent.interrupt") this.#processInterruptEvent(event);
    else if (event.type === "agent.resources-response") this.#processResourcesResponseEvent(event);

    // If the generation is not ready to start yet, return
    if (!generation.canStart()) return;

    // If that was a continue operation, request resources
    if (event.type === "agent.continue") {
      const requestId = this.#emit({ type: "agent.resources-request" });
      this.#generationsResourcesRequestsIds[generation.id] = requestId;
    }

    // If the generation has continue but no resources yet, wait
    if (
      generation.needContinue &&
      !((this.#generationsResourcesRequestsIds[generation.id] ?? "") in this.#resourcesResponses)
    )
      return;

    // Find any currently running generation
    const runningGeneration = this.#generations.find((g) => g.status === "running");

    if (runningGeneration) {
      // DO NOTHING FOR NOW
      // - If the running generation is about to end, start the next one
      // - If smooth interruption is requested, sync both generations for a smooth transition
      //   - If not possible interrupt abruptly
    }

    // Or if there is no running generation, start the generation immediately
    else {
      const resourceRequestId = this.#generationsResourcesRequestsIds[generation.id];
      this.#emit({ type: "agent.generation-start" });
      generation.start(resourceRequestId ? this.#resourcesResponses[resourceRequestId] : undefined);
      this.#consumeQueue.push(generation);
    }
  }

  async #consumeGenerations() {
    // Add a throttle to send max. 200ms of upfront chunks to the user
    // This allows keeping interruptions management on the server.
    const limiter = throttledGenerationQueue(200);
    let agentIsSpeaking = false;

    for await (const generation of this.#consumeQueue) {
      for await (const chunk of limiter(generation.queue)) {
        // If voice has been disabled, but the agent was speaking, switch speaking status
        if (!this.#voiceEnabled && agentIsSpeaking) {
          this.#emit({ type: "agent.voice-end" });
          agentIsSpeaking = false;
        }

        // Forward content chunks
        if (chunk.type === "content") {
          // - Text chunks
          if (chunk.textChunk.length)
            this.#emit({ type: "agent.text-chunk", data: { textChunk: chunk.textChunk } });

          // - Voice chunks
          if (this.#voiceEnabled && chunk.voiceChunk?.length) {
            this.#emit({ type: "agent.voice-chunk", data: { voiceChunk: chunk.voiceChunk } });
            if (!agentIsSpeaking) {
              this.#emit({ type: "agent.voice-start" });
              agentIsSpeaking = true;
            }
          }
        }

        // Forward tool requests
        else if (chunk.type === "tool-requests" && chunk.requests.length) {
          this.#emit({ type: "agent.tool-requests", data: chunk.requests });
        }

        // Or if this is the end of the generation, try scheduling the next generation
        else if (chunk.type === "end") {
          if (agentIsSpeaking) {
            this.#emit({ type: "agent.voice-end" });
            agentIsSpeaking = false;
          }
          this.#emit({ type: "agent.generation-end" });
          break;
        }
      }
    }
  }
}

/**
 * Specialized throttling function for generation chunks that uses actual audio durations
 * instead of fixed cadence. This prevents too much audio from being buffered upfront.
 *
 * @param leadMs Maximum positive/negative lead you will allow.
 * @param sampleRate Sample rate of the audio chunks (default: 16000)
 */
function throttledGenerationQueue(leadMs = 300, sampleRate = 16000) {
  /** Wall-clock time we pegged the *first* chunk to. */
  let anchorWallTime = Date.now();

  /** Total audio duration we have *already* forwarded in milliseconds. */
  let totalAudioDurationMs = 0;

  /** Small helper: wait `ms` milliseconds. */
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return async function* <T extends GenerationChunk>(source: AsyncIterable<T>): AsyncIterable<T> {
    for await (const chunk of source) {
      // For content chunks, use actual audio duration
      if (chunk.type === "content" && chunk.voiceChunk) {
        // Calculate actual audio duration in milliseconds
        const chunkDurationMs = (chunk.voiceChunk.length / sampleRate) * 1000;

        // ----- 1. Compute current lead ---------------------------------------
        const wallElapsed = Date.now() - anchorWallTime;
        let lead = totalAudioDurationMs - wallElapsed; // +ahead / –behind

        // ----- 2. If we're *too far behind*, slide the anchor forward --------
        if (lead < -leadMs) {
          anchorWallTime += -lead - leadMs; // move anchor just enough
          lead = -leadMs; // now clamped to lower bound
        }

        // ----- 3. If we're *too far ahead*, pause until we're inside window --
        if (lead > leadMs) {
          await sleep(lead - leadMs); // throttle down
        }

        // ----- 4. Emit the chunk and advance counters ------------------------
        yield chunk;
        totalAudioDurationMs += chunkDurationMs;
      } else {
        // For non-content chunks (tool-requests, resources-request, end), emit immediately
        yield chunk;
      }
    }
  };
}
