import { z } from "zod";
import { TTSBase, type TTSGenerateJob } from "../base";

// Config
export const rimeTTSConfigSchema = z.object({
  apiKey: z.string().default(process.env.RIME_API_KEY ?? ""),
  model: z.enum(["arcana", "mist", "mistv2"]).default("arcana"),
  speaker: z.string().default("default"),
  temperature: z.number().min(0).max(2).default(0.5),
  topP: z.number().min(0).max(1).default(1.0),
  repetitionPenalty: z.number().min(0).max(2).default(1.5),
  maxTokens: z.number().min(200).max(5000).default(1200),
  samplingRate: z
    .union([
      z.literal(8000),
      z.literal(16_000),
      z.literal(22_050),
      z.literal(24_000),
      z.literal(44_100),
      z.literal(48_000),
      z.literal(96_000),
    ])
    .default(24_000),
  baseUrl: z.string().default("https://users.rime.ai/v1"),
});

// Model
export class RimeTTS extends TTSBase<typeof rimeTTSConfigSchema> {
  private abortControllers = new Map<string, AbortController>();
  private isInitialized = false;
  private jobProcessedText = new Map<string, string>();
  private activeStreams = new Map<string, Promise<void>>();

  constructor(config: z.input<typeof rimeTTSConfigSchema>) {
    super(rimeTTSConfigSchema, config);
    if (!this.config.apiKey) {
      throw new Error(
        "RIME_API_KEY environment variable or config.apiKey must be provided to use this model.",
      );
    }
    this.isInitialized = true;
  }

  generate(): Promise<TTSGenerateJob> {
    const job = this.createGenerateJob();

    if (this.isInitialized) {
      this.abortControllers.set(job.id, job.raw.abortController);

      this.jobProcessedText.set(job.id, "");

      job.raw.abortController.signal.addEventListener("abort", () => {
        this.abortControllers.delete(job.id);
        this.jobProcessedText.delete(job.id);
        this.activeStreams.delete(job.id);
      });
    }

    return Promise.resolve(job);
  }

  protected async _onGeneratePushText(
    job: TTSGenerateJob,
    text: string,
    isLast = false,
  ): Promise<void> {
    if (job.raw.abortController.signal.aborted) return;

    try {
      // Get the current processed text for this job
      const processedText = this.jobProcessedText.get(job.id) || "";
      const newFullText = processedText + text;

      this.jobProcessedText.set(job.id, newFullText);

      // Wait for any active stream to complete before starting a new one
      const activeStream = this.activeStreams.get(job.id);
      if (activeStream) {
        await activeStream;
      }

      // Start streaming the new incremental text
      const streamPromise = this.streamIncrementalText(job, newFullText, processedText, isLast);
      this.activeStreams.set(job.id, streamPromise);

      await streamPromise;
    } catch (error) {
      if (!job.raw.abortController.signal.aborted) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        job.raw.receiveChunk({ type: "error", error: errorMessage });
      }
    }
  }

  private async streamIncrementalText(
    job: TTSGenerateJob,
    fullText: string,
    previousText: string,
    isLast: boolean,
  ): Promise<void> {
    if (fullText === previousText) {
      if (isLast) {
        job.raw.receiveChunk({ type: "end" });
      }
      return;
    }

    // Use the streaming endpoint for Arcana model
    const endpoint =
      this.config.model === "arcana"
        ? `${this.config.baseUrl}/rime-tts-streaming-pcm`
        : `${this.config.baseUrl}/rime-tts`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "audio/pcm",
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        speaker: this.config.speaker,
        text: fullText, // Send full text for context, but we'll track what's new
        modelId: this.config.model,
        repetition_penalty: this.config.repetitionPenalty,
        temperature: this.config.temperature,
        top_p: this.config.topP,
        max_tokens: this.config.maxTokens,
        samplingRate: this.config.samplingRate,
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

    await this.processStreamingResponse(job, response.body, fullText.slice(previousText.length));

    if (isLast) {
      job.raw.receiveChunk({ type: "end" });
    }
  }

  private async processStreamingResponse(
    job: TTSGenerateJob,
    body: ReadableStream<Uint8Array>,
    newTextChunk: string,
  ): Promise<void> {
    const reader = body.getReader();

    try {
      await this.processStreamChunks(job, reader, newTextChunk);
    } catch (error) {
      this.handleStreamError(job, error);
    } finally {
      reader.releaseLock();
    }
  }

  private async processStreamChunks(
    job: TTSGenerateJob,
    reader: ReadableStreamDefaultReader<Uint8Array>,
    textChunk: string,
  ): Promise<void> {
    let isFirstChunk = true;

    while (true) {
      // biome-ignore lint/nursery/noAwaitInLoop: Necessary for processing streaming data
      const { done, value } = await reader.read();

      if (done || job.raw.abortController.signal.aborted) {
        break;
      }

      if (this.shouldProcessChunk(value)) {
        this.processAudioChunk(job, value, isFirstChunk ? textChunk : undefined);
        isFirstChunk = false;
      }
    }
  }

  private shouldProcessChunk(value: Uint8Array | undefined): value is Uint8Array {
    return Boolean(value && value.length > 0);
  }

  private processAudioChunk(job: TTSGenerateJob, value: Uint8Array, textChunk?: string): void {
    // Convert the raw PCM bytes to Int16Array
    // Rime returns PCM audio data at the specified sampling rate
    const audioData = new Int16Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );

    // Only send chunks that have actual audio data
    if (audioData.length > 0) {
      job.raw.receiveChunk({
        type: "content",
        voiceChunk: audioData,
        textChunk, // Include the text chunk only for the first audio chunk
      });
    }
  }

  private handleStreamError(job: TTSGenerateJob, error: unknown): void {
    if (!job.raw.abortController.signal.aborted) {
      const errorMessage = error instanceof Error ? error.message : "Stream processing error";
      job.raw.receiveChunk({ type: "error", error: errorMessage });
    }
  }
}
