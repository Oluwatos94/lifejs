import type { Agent } from "@/agent/agent";
import { type Resources, toolRequestSchema } from "@/agent/resources";
import type { LLMGenerateMessageJob } from "@/models/llm/base";
import type { TTSGenerateJob } from "@/models/tts/base";
import { AsyncQueue } from "@/shared/async-queue";
import { z } from "zod";
import type { ContinueOperation, SayOperation } from "./operations";

// Output chunk
export const generationChunkSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("content"),
    voiceChunk: z.instanceof(Int16Array),
    textChunk: z.string(),
  }),
  z.object({
    type: z.literal("tool-request"),
    toolRequest: toolRequestSchema,
  }),
  z.object({
    type: z.literal("resources-request"),
  }),
  z.object({
    type: z.literal("end"),
  }),
]);

export type GenerationChunk = z.infer<typeof generationChunkSchema>;

// Generation
export class Generation {
  #agent: Agent;

  #resources: Resources | null = null;
  #resourcesResolve: ((value: unknown) => void) | null = null;
  #toolsRequests: Record<string, boolean> = {};

  #llmEnded = false;
  #llmJob: LLMGenerateMessageJob | null = null;
  #ttsJob: Promise<TTSGenerateJob>;

  prefix = "";
  needContinue = false;
  preventInterruption = false;

  status: "idle" | "running" | "waiting" | "ended" = "idle";
  waitingFor?: "tools" | "resources";
  queue: AsyncQueue<GenerationChunk> = new AsyncQueue();

  constructor(agent: Agent) {
    this.#agent = agent;
    this.#ttsJob = this.#agent.models.tts.generate();

    // this.queue.onConsumption(() => {
    //   this.#availableChunksCount++;
    // });
  }

  addContinue(operation: ContinueOperation) {
    if (this.status !== "idle") throw new Error("Cannot add continue operation when not idle");
    this.needContinue = true;
    if (!this.preventInterruption)
      this.preventInterruption = operation.preventInterruption ?? false;
  }

  addSay(operation: SayOperation) {
    if (this.status !== "idle") throw new Error("Cannot add say operation when not idle");
    this.prefix += operation.text;
    if (!this.preventInterruption)
      this.preventInterruption = operation.preventInterruption ?? false;
  }

  addResources(resources: Resources) {
    if (this.status !== "waiting" || this.waitingFor !== "resources")
      throw new Error("This generation is not waiting for resources.");
    if (this.#resources) throw new Error("Resources already set.");
    this.#resources = resources;
    this.#resourcesResolve?.(resources);
    this.#resourcesResolve = null;
  }

  addToolResponse(toolId: string) {
    this.#toolsRequests[toolId] = true;
    // If all tools requests have been received, start LLM again
    if (Object.values(this.#toolsRequests).every((value) => value)) this.startLLM();
  }

  // Count the number of tools requests expected and received and resume if all received
  async startLLM() {
    const ttsJob = await this.#ttsJob;

    // Transcribe the prefix if any
    if (this.prefix) ttsJob.pushText(this.prefix);

    // If doesn't need to continue, return
    if (!this.needContinue) {
      this.#llmEnded = true;
      return;
    }

    // Else, if not idle or waiting, throw
    if (this.status !== "idle" && this.status !== "waiting")
      throw new Error("Cannot run LLM when not idle or waiting.");
    if (this.status === "waiting" && this.waitingFor !== "tools")
      throw new Error("Cannot run LLM when not waiting for tools.");

    // Request resources
    this.status = "waiting";
    this.waitingFor = "resources";

    // Wait for resources
    this.queue.push({ type: "resources-request" });
    await new Promise((resolve) => (this.#resourcesResolve = resolve));
    this.waitingFor = undefined;
    this.status = "running";

    // Start LLM generation
    const llmJob = await this.#agent.models.llm.generateMessage({
      messages: this.#resources?.messages ?? [],
      tools: this.#resources?.tools ?? [],
    });
    this.#llmJob = llmJob;

    // Stream received tokens
    for await (const chunk of llmJob.getStream()) {
      if (chunk.type === "content") ttsJob.pushText(chunk.content);
      else if (chunk.type === "tool") {
        this.#toolsRequests[chunk.toolId] = false;
        // TODO: In the future maybe allow actions/tools to define whether they accept to be called in advance
        // In case of long generations, as tool requests are emitted immediately, those tools could be called
        // 5-10s before the generation audio is played. In some case it's totally fine, in some other it's not.
        this.queue.push({
          type: "tool-request",
          toolRequest: { id: chunk.toolId, input: chunk.toolInput },
        });
      } else if (chunk.type === "end") this.#llmEnded = true;
    }
  }

  async startTTS() {
    const ttsJob = await this.#ttsJob;
    for await (const chunk of ttsJob.getStream()) {
      if (chunk.type === "content") {
        this.queue.push({
          type: "content",
          voiceChunk: chunk.voiceChunk,
          textChunk: chunk.textChunk,
        });
      } else if (chunk.type === "end" && this.#llmEnded) this.queue.push({ type: "end" });
    }
  }

  async start() {
    // Start a first LLM generation
    await this.startLLM();

    // Start TTS generation
    await this.startTTS();
  }

  async stop() {
    if (this.#llmJob) this.#llmJob.cancel();
    const ttsJob = await this.#ttsJob;
    ttsJob.cancel();
    this.status = "ended";
  }
}
