import type { Agent } from "@/agent/agent";
import type { Resources, ToolRequest, ToolRequests } from "@/agent/resources";
import type { LLMGenerateMessageJob } from "@/models/llm/base";
import type { TTSGenerateJob } from "@/models/tts/base";
import { AsyncQueue } from "@/shared/async-queue";
import { newId } from "@/shared/prefixed-id";
import type { CoreEvent } from "../plugin";

export type GenerationChunk =
  | { type: "content"; textChunk: string; voiceChunk: Int16Array }
  | { type: "tool-requests"; requests: ToolRequests }
  | { type: "end" };

export class Generation {
  id = newId("generation");
  queue: AsyncQueue<GenerationChunk> = new AsyncQueue();
  status: "idle" | "running" | "ended" = "idle";

  prefix = "";
  needContinue = false;
  preventInterruption = false;

  #agent: Agent;

  #llmJob: LLMGenerateMessageJob | null = null;
  #ttsJob: TTSGenerateJob | null = null;
  #toolRequests: ToolRequest[] = [];

  constructor(params: { agent: Agent }) {
    this.#agent = params.agent;
  }

  canInterrupt() {
    return !this.preventInterruption;
  }

  canStart() {
    return this.status === "idle" && (this.prefix || this.needContinue);
  }

  addInsertEvent(event: Extract<CoreEvent, { type: "agent.continue" | "agent.say" }>) {
    // Error if not idle, the orchestrator should not append insert events to a non-idle generation
    if (this.status !== "idle")
      throw new Error("Cannot add continue/say operation when not idle or waiting.");

    // Set the continue, prefix, and interruptions attributes
    if (event.type === "agent.continue") this.needContinue = true;
    else if (event.type === "agent.say") this.prefix += event.data.text;
    if (!this.preventInterruption)
      this.preventInterruption = event.data.preventInterruption ?? false;
  }

  async start(resources?: Resources) {
    // Throw if thinking was already running, shouldn't happen
    if (this.status !== "idle") throw new Error("Cannot start thinking when not idle.");

    // Set status to running
    this.status = "running";

    // Start generations jobs
    this.#ttsJob = await this.#agent.models.tts.generate();
    this.#startSpeaking();
    this.#startThinking(resources);
  }

  async #startSpeaking() {
    if (!this.#ttsJob) throw new Error("TTS job not initialized, should not happen.");

    // Process TTS stream (queue will be consumed by the orchestrator)
    for await (const chunk of this.#ttsJob.getStream()) {
      if (chunk.type === "content")
        this.queue.push({
          type: "content",
          textChunk: chunk.textChunk,
          voiceChunk: chunk.voiceChunk,
        });
      else if (chunk.type === "end") {
        if (this.#toolRequests.length)
          this.queue.push({ type: "tool-requests", requests: this.#toolRequests });
        this.stop();
        break;
      } else if (chunk.type === "error") console.error("TTS error", chunk);
    }
  }

  async #startThinking(resources?: Resources) {
    if (!this.#ttsJob) throw new Error("TTS job not initialized, should not happen.");

    // If a transcribe prefix is provided, push it to the TTS job
    if (this.prefix) this.#ttsJob.pushText(this.prefix);

    // If doesn't need to continue, end thinking
    if (!this.needContinue) return this.stop();

    // Errors if continue is requested but no resources are provided
    if (!resources) throw new Error("Resources are required to continue thinking.");

    // Start LLM generation
    this.#llmJob = await this.#agent.models.llm.generateMessage(resources);

    // Forward stream chunks to speaking
    for await (const chunk of this.#llmJob.getStream()) {
      if (chunk.type === "content") this.#ttsJob.pushText(chunk.content);
      else if (chunk.type === "tool") this.#toolRequests.push(chunk.tool);
      else if (chunk.type === "end") this.#ttsJob.pushText("", true);
    }
  }

  stop(abrupt = false) {
    // Cancel any ongoing LLM job
    if (this.#llmJob) this.#llmJob.cancel();

    // Cancel any ongoing TTS job
    if (this.#ttsJob) this.#ttsJob.cancel();

    // Push an end chunk and update status
    if (abrupt) this.queue.pushFirst({ type: "end" });
    else this.queue.push({ type: "end" });
    this.status = "ended";
  }
}
