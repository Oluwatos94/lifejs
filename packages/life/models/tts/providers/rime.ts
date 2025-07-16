import { z } from "zod";
import { TTSBase, type TTSGenerateJob } from "../base";

// Config
export const rimeTTSConfigSchema = z.object({
  apiKey: z.string().default(process.env.RIME_API_KEY ?? ""),
  model: z.enum(["arcana", "mist", "mistv2"]).default("arcana"),
  speaker: z.string().default("default"),
  temperature: z.number().min(0).max(2).default(0.5),
  topP: z.number().min(0).max(1).default(0.5),
  repetitionPenalty: z.number().min(0).max(2).default(1.5),
  maxTokens: z.number().min(1).max(1200).default(1200),
  baseUrl: z.string().default("https://users.rime.ai/v1"),
});

// Model
export class RimeTTS extends TTSBase<typeof rimeTTSConfigSchema> {
  #abortControllers: Map<string, AbortController> = new Map();

  constructor(config: z.input<typeof rimeTTSConfigSchema>) {
    super(rimeTTSConfigSchema, config);
    if (!config.apiKey) {
      throw new Error(
        "RIME_API_KEY environment variable or config.apiKey must be provided to use this model.",
      );
    }
  }

  generate(): Promise<TTSGenerateJob> {
    const job = this.createGenerateJob();

    // Store abort controller for this job
    this.#abortControllers.set(job.id, job.raw.abortController);

    // Clean up abort controller when job is done
    job.raw.abortController.signal.addEventListener("abort", () => {
      this.#abortControllers.delete(job.id);
    });

    return Promise.resolve(job);
  }

  protected async _onGeneratePushText(
    job: TTSGenerateJob,
    text: string,
    isLast = false,
  ): Promise<void> {
    // If the job has been aborted, don't start new requests
    if (job.raw.abortController.signal.aborted) return;

    try {
      const response = await fetch(`${this.config.baseUrl}/rime-tts`, {
        method: "POST",
        headers: {
          Accept: "audio/pcm",
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          speaker: this.config.speaker,
          text,
          modelId: this.config.model,
          repetition_penalty: this.config.repetitionPenalty,
          temperature: this.config.temperature,
          top_p: this.config.topP,
          max_tokens: this.config.maxTokens,
        }),
        signal: job.raw.abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Rime TTS API error: ${response.status} - ${errorText}`);
      }

      if (!response.body) {
        throw new Error("No response body received from Rime TTS API");
      }

      // Handle streaming response
      await this.#processStreamingResponse(job, response.body);

      // Signal end if this is the last text chunk
      if (isLast) {
        job.raw.receiveChunk({ type: "end" });
      }
    } catch (error) {
      // Don't report errors if the job was aborted
      if (!job.raw.abortController.signal.aborted) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        job.raw.receiveChunk({ type: "error", error: errorMessage });
      }
    }
  }

  async #processStreamingResponse(
    job: TTSGenerateJob,
    body: ReadableStream<Uint8Array>,
  ): Promise<void> {
    const reader = body.getReader();

    try {
      const processChunk = async (): Promise<void> => {
        const { done, value } = await reader.read();

        if (done || job.raw.abortController.signal.aborted) return;

        // Convert the chunk to audio data
        // Rime returns PCM audio data directly
        const audioData = new Int16Array(value.buffer, value.byteOffset, value.byteLength / 2);

        if (audioData.length > 0) {
          job.raw.receiveChunk({
            type: "content",
            voiceChunk: audioData,
          });
        }

        await processChunk();
      };

      await processChunk();
    } catch (error) {
      if (!job.raw.abortController.signal.aborted) {
        const errorMessage = error instanceof Error ? error.message : "Stream processing error";
        job.raw.receiveChunk({ type: "error", error: errorMessage });
      }
    } finally {
      reader.releaseLock();
    }
  }
}
