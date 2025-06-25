import type { Agent } from "@/agent/agent";
import type { ToolRequest } from "@/agent/resources";
import { AsyncQueue } from "@/shared/async-queue";
import { throttledAudioQueue } from "@/shared/throttled-audio-queue";
import { z } from "zod";
import { Generation, type GenerationChunk } from "./generation";
import type {
  ContinueOperation,
  DecideOperation,
  GenerationOperation,
  ResourcesResponseOperation,
  SayOperation,
  ToolResponseOperation,
} from "./operations";

// Notifications
type Notification =
  | { type: "content-chunk"; data: Extract<GenerationChunk, { type: "content" }> }
  | { type: "speech-status"; data: boolean }
  | {
      type: "interruption";
      data: { reason: string; forced: boolean; author: "user" | "application" };
    };
type NotificationListenerCallback<Type extends Notification["type"] = Notification["type"]> = (
  data: Extract<Notification, { type: Type }>["data"],
) => void;
type NotificationListener = { type: Notification["type"]; callback: NotificationListenerCallback };

// Orchestrator
export class GenerationOrchestrator {
  #agent: Agent;
  #requestTool: (request: ToolRequest) => void;
  #requestResources: () => void;

  #operationsQueue: AsyncQueue<GenerationOperation> = new AsyncQueue();
  #startedGenerationsQueue: AsyncQueue<Generation> = new AsyncQueue();
  #scheduleRequestQueue: AsyncQueue<void> = new AsyncQueue();
  #generations: Generation[] = [];
  #decidePromises: {
    id: string;
    operation: DecideOperation;
    promise: Promise<void>;
    cancel: () => DecideOperation;
  }[] = [];
  #listeners: NotificationListener[] = [];

  constructor(params: {
    agent: Agent;
    requestTool: (request: ToolRequest) => void;
    requestResources: () => void;
  }) {
    const { agent, requestTool, requestResources } = params;
    this.#agent = agent;
    this.#requestTool = requestTool;
    this.#requestResources = requestResources;

    // Start the orchestrator
    this.#processOperations();
    this.#processGenerations();
  }

  on<Type extends Notification["type"]>(type: Type, callback: NotificationListenerCallback<Type>) {
    this.#listeners.push({ type, callback } as unknown as NotificationListener);
  }

  pushOperation(operation: GenerationOperation) {
    this.#operationsQueue.push(operation);
  }

  #notify(type: Notification["type"], data: Notification["data"]) {
    for (const listener of this.#listeners) if (listener.type === type) listener.callback(data);
  }

  #handleInterrupt(reason: string, force = false) {
    for (const generation of this.#generations) {
      if (!generation.preventInterruption || force) generation.stop();
    }
    this.#notify("interruption", {
      reason,
      forced: force,
      author: "application",
    });
  }

  #handleDecide(operation: DecideOperation) {
    const id = crypto.randomUUID();
    this.#decidePromises.push({
      id,
      operation,
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
                    You're an agent helping another agent deciding whether they should react to a
                    given new information, or just be passive. You'll be provided the most recent
                    conversation history between the user and the agent, and the new piece of
                    information. From these you'll output a 'shouldReact' boolean, indicating whether
                    that new information is worth reacting to and could help the conversation goal.
                    ## Recent conversation history
                    ${operation.messages
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
        if (result.success && result.data.shouldContinue)
          this.pushOperation({ ...operation, type: "continue" });

        // Remove the promise from the list
        this.#decidePromises = this.#decidePromises.filter((decide) => decide.id !== id);
      })(),
      cancel: () => {
        // TODO:Stop LLM job -> this.#agent.models.llm.stopJob(id);
        this.#decidePromises = this.#decidePromises.filter((decide) => decide.id !== id);
        return operation;
      },
    });
  }

  #handleSchedule() {
    // If there are remaining operations to process, wait
    if (this.#operationsQueue.length() > 0) return;

    // If there is more than one generation request, wait the last one
    if (this.#scheduleRequestQueue.length() > 0) return;

    // Retrieve last generation
    const generation = this.#generations[0];

    // If there is no generation, wait
    if (!generation) return;

    // If the generation has ended, remove it, and restart
    if (generation.status === "ended") {
      this.#generations.shift();
      this.#operationsQueue.push({ type: "schedule" });
      return;
    }

    // If the generation is running, wait
    // TODO: In the future, if the generation is about to end, start next one for reduced latency
    // TODO: In the future, if the next generation is a smooth interrupt, sync both generations for a smooth transition
    // - For that later, add a stopAfter() method to generations, which prompt them to stop streaming after that time
    // - And start the next generation from the end of the previous one
    if (generation.status === "running") return;

    // Start the generation
    generation.start();
    this.#startedGenerationsQueue.push(generation);
  }

  #handleResourcesResponse(operation: ResourcesResponseOperation) {
    const lastGeneration = this.#generations[0];
    if (lastGeneration?.status === "waiting" && lastGeneration.waitingFor === "resources")
      lastGeneration.addResources(operation.resources);
  }

  #handleToolResponse(operation: ToolResponseOperation) {
    const lastGeneration = this.#generations[0];

    if (lastGeneration?.status === "waiting" && lastGeneration.waitingFor === "tools")
      lastGeneration.addToolResponse(operation.message.toolId);
  }

  #handleInsert(operation: ContinueOperation | SayOperation) {
    if (operation.interrupt === "abrupt")
      // - In case an interrupting insert is requested, handle
      this.#handleInterrupt("Interrupted by another operation.");
    else if (operation.interrupt === "smooth") {
      throw new Error("Smooth interrupt is not implemented yet.");
      // Todo: In the future, create a new generation with isSmoothInterrupt = true
    }

    // - Retrieve or create the first non-running generation
    let generation = this.#generations.find((generation) => generation.status === "idle");
    if (!generation) {
      generation = new Generation(this.#agent);
      this.#generations.push(generation);
    }

    // - Cancel and merge ongoing decide promises
    for (const decide of this.#decidePromises) {
      decide.cancel();
      generation.addContinue({ ...decide.operation, type: "continue" });
    }

    // - Add the initial operation to the generation
    if (operation.type === "continue") generation.addContinue(operation);
    else if (operation.type === "say") generation.addSay(operation);

    // - Schedule generations
    this.#operationsQueue.push({ type: "schedule" });
  }

  async #processOperations() {
    for await (const operation of this.#operationsQueue) {
      // If an interrupt is received, try interrupting generations
      if (operation.type === "interrupt")
        return this.#handleInterrupt(operation.reason, operation.force);
      // Or if a decide is received, start a promise that will possibly emit a continue operation
      else if (operation.type === "decide") return this.#handleDecide(operation);
      // Or if a resources response is received, add it to the last generation if this one is still waiting for it
      else if (operation.type === "resources-response")
        return this.#handleResourcesResponse(operation);
      // Or if operation is a tool result, add it to the last generation if this one is still waiting for it
      else if (operation.type === "tool-response") return this.#handleToolResponse(operation);
      // Or if a schedule is received, try scheduling the next generation
      else if (operation.type === "schedule") return this.#handleSchedule();
      // Else, if it's an insert operation (continue/say)
      else return this.#handleInsert(operation);
    }
  }

  async #processGenerations() {
    // Add a throttle to send max. 300ms of upfront chunks to the user
    // This allows keeping interruptions management on the server.
    const limiter = throttledAudioQueue(10, 300);

    for await (const generation of this.#startedGenerationsQueue) {
      for await (const chunk of limiter(generation.queue)) {
        // If this is an end chunk, schedule the next generation
        if (chunk.type === "end") {
          this.#operationsQueue.push({ type: "schedule" });
          break;
        }
        // Or if this is a tool request
        else if (chunk.type === "tool-request") this.#requestTool(chunk.toolRequest);
        // Or if this is a resources request
        else if (chunk.type === "resources-request") this.#requestResources();
        // Or if this is a content chunk
        else this.#notify("content-chunk", chunk);
      }
    }
  }
}
