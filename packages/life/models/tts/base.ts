import { AsyncQueue } from "@/shared/async-queue";
import { audioChunkToMs } from "@/shared/audio-chunk-to-ms";
import { newId } from "@/shared/prefixed-id";
import type { z } from "zod";
import { tokenizer } from "./lib/spoken-text-tokenizer";
import { WeightedAverage } from "./lib/weighted-average";

// TTSBase.generate()
export type TTSGenerateStreamChunkInput =
  | { type: "content"; voiceChunk: Int16Array; textChunk?: string; durationMs?: number }
  | { type: "end" }
  | { type: "error"; error: string };
export type TTSGenerateStreamChunkOutput =
  | { type: "content"; voiceChunk: Int16Array; textChunk: string; durationMs: number }
  | { type: "end" }
  | { type: "error"; error: string };

export interface TTSGenerateJob {
  id: string;
  cancel: () => void;
  getStream: () => AsyncQueue<TTSGenerateStreamChunkOutput>;
  pushText: (text: string) => void;
  raw: {
    asyncQueue: AsyncQueue<TTSGenerateStreamChunkOutput>;
    abortController: AbortController;
    receiveChunk: (chunk: TTSGenerateStreamChunkInput) => void;
  };
}

/**
 * Base class for all TTS providers.
 */
export abstract class TTSBase<ConfigSchema extends z.AnyZodObject> {
  config: z.infer<ConfigSchema>;

  /** ms per token */
  #pace = new WeightedAverage();
  #jobsFullText: Record<string, string> = {};
  #jobsFullAudio: Record<string, Int16Array> = {};
  #jobsTakenText: Record<string, string> = {};

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });

    // Start a minimal generation on instantion, so pace is set
    this.generate().then(async (job) => {
      job.pushText("Isn't Life beautiful? Are you talking about the Typescript framework?");
      for await (const chunk of job.getStream()) {
        if (chunk.type === "end") break;
      }
      console.log("TTS INIT DONE.");
    });
  }

  protected createGenerateJob(): TTSGenerateJob {
    const queue = new AsyncQueue<TTSGenerateStreamChunkOutput>();
    const jobId = newId("job");
    const job: TTSGenerateJob = {
      id: jobId,
      getStream: () => queue,
      cancel: () => job.raw.abortController.abort(),
      pushText: (text: string) => {
        // Append the text chunk to the full text
        if (!this.#jobsFullText[jobId]) this.#jobsFullText[jobId] = "";
        this.#jobsFullText[jobId] += text;

        this._onGeneratePushText(job, text);
      },
      raw: {
        asyncQueue: queue,
        abortController: new AbortController(),
        receiveChunk: (chunk: TTSGenerateStreamChunkInput) => {
          if (chunk.type === "content") {
            // Retrieve the voice chunk and its duration
            const voiceChunk = chunk.voiceChunk;

            // Append the voice chunk to the full audio
            if (!this.#jobsFullAudio[jobId]) this.#jobsFullAudio[jobId] = new Int16Array(0);
            this.#jobsFullAudio[jobId] = new Int16Array([
              ...(this.#jobsFullAudio[jobId] ?? []),
              ...voiceChunk,
            ]);

            // If the TTS provider doesn't already provide text transcripts, estimate it
            if (!chunk.textChunk) {
              const totalVoiceDurationMs = audioChunkToMs(this.#jobsFullAudio[jobId]);
              const tokensCount = Math.floor(totalVoiceDurationMs / this.#pace.average);
              const { taken: newTaken } = tokenizer.take(
                this.#jobsFullText[jobId] ?? "",
                tokensCount,
              );
              const alreadyTaken = this.#jobsTakenText[jobId] ?? "";
              chunk.textChunk = newTaken.replace(alreadyTaken, "");
              this.#jobsTakenText[jobId] = newTaken;
            }

            // If the TTS provider doesn't already provide audio duration, estimate it
            if (!chunk.durationMs) {
              const voiceDurationMs = audioChunkToMs(voiceChunk);
              chunk.durationMs = voiceDurationMs;
            }
          }

          // Handle end chunks
          if (chunk.type === "end") {
            // If some text remains, push those to queue empty audio
            const remainingText = (this.#jobsFullText[jobId] ?? "").replace(
              this.#jobsTakenText[jobId] ?? "",
              "",
            );
            if (remainingText.trimEnd().length) {
              queue.push({
                type: "content",
                voiceChunk: new Int16Array(0),
                textChunk: remainingText,
                durationMs: 0,
              });
            }

            // Retrieve the job's full text and audio
            const fullText = this.#jobsFullText[jobId] as string;
            const fullAudio = this.#jobsFullAudio[jobId] as Int16Array;

            // Compute full text tokens, and audio duration
            const tokensCount = tokenizer.weight(fullText);
            const duration = audioChunkToMs(fullAudio);
            const msPerToken = duration / tokensCount;

            // Update weighted average with this completed job
            this.#pace.add(msPerToken, duration);

            // Clean up job data
            this.#jobsFullText[jobId] = "";
            this.#jobsTakenText[jobId] = "";
            this.#jobsFullAudio[jobId] = new Int16Array(0);
          }

          // Handle error chunks
          if (chunk.type === "error") {
            // Clean up on error
            this.#jobsFullText[jobId] = "";
            this.#jobsTakenText[jobId] = "";
            this.#jobsFullAudio[jobId] = new Int16Array(0);
          }

          // Push the chunk to the queue
          queue.push(chunk as TTSGenerateStreamChunkOutput);
        },
      },
    };
    return job;
  }

  // To be impemented by subclasses
  abstract generate(): Promise<TTSGenerateJob>;
  protected abstract _onGeneratePushText(job: TTSGenerateJob, text: string): Promise<void>;
}
