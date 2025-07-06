import { CartesiaClient } from "@cartesia/cartesia-js";
import type { StreamingResponse } from "@cartesia/cartesia-js/api";
import type Websocket from "@cartesia/cartesia-js/wrapper/Websocket";
import { z } from "zod";
import { TTSBase, type TTSGenerateJob } from "../base";

// Config
export const cartesiaTTSConfigSchema = z.object({
  apiKey: z.string().default(process.env.CARTESIA_API_KEY ?? ""),
});

// Model
export class CartesiaTTS extends TTSBase<typeof cartesiaTTSConfigSchema> {
  #cartesia: CartesiaClient;
  #socket: Websocket;
  #initializedJobsIds: string[] = [];

  constructor(config: z.input<typeof cartesiaTTSConfigSchema>) {
    super(cartesiaTTSConfigSchema, config);
    if (!config.apiKey)
      throw new Error(
        "CARTESIA_API_KEY environment variable or config.apiKey must be provided to use this model.",
      );
    this.#cartesia = new CartesiaClient({ apiKey: config.apiKey });
    this.#socket = this.#cartesia.tts.websocket({
      container: "raw",
      encoding: "pcm_s16le",
      sampleRate: 16000,
    });
  }

  async generate(): Promise<TTSGenerateJob> {
    // Create a new generation job
    const job = this.createGenerateJob();

    // Listen to job cancellation, and properly close the socket
    job.raw.abortController.signal.addEventListener("abort", () => {
      this.#socket.socket?.send(JSON.stringify({ context_id: job.id, cancel: true }));
    });

    return job;
  }

  protected async _onGeneratePushText(job: TTSGenerateJob, text: string): Promise<void> {
    // If the job has already been initialized, continue it
    if (this.#initializedJobsIds.includes(job.id)) {
      this.#socket.continue({
        contextId: job.id,
        modelId: "sonic-2",
        language: "en",
        voice: { mode: "id", id: "e8e5fffb-252c-436d-b842-8879b84445b6" },
        transcript: text,
        outputFormat: {
          container: "raw",
          encoding: "pcm_s16le",
          sampleRate: 16000,
        },
      });
    }
    // Else, initialize a new job response
    else {
      // Set the job to have history
      this.#initializedJobsIds.push(job.id);

      const response = await this.#socket.send({
        contextId: job.id,
        modelId: "sonic-2",
        language: "en",
        voice: { mode: "id", id: "e8e5fffb-252c-436d-b842-8879b84445b6" },
        transcript: text,
        continue: true,
        outputFormat: {
          container: "raw",
          encoding: "pcm_s16le",
          sampleRate: 16000,
        },
      });

      // Receive the job's messages
      response.on("message", (msgString: string) => {
        // If the job has been aborted, ignore incoming messages
        if (job.raw.abortController.signal.aborted) return;

        // Else parse and forward the message chunk
        const msg = JSON.parse(msgString) as StreamingResponse;
        // Handle "content" chunks
        if (msg.type === "chunk") {
          const buf = Buffer.from(msg.data, "base64");
          const pcmBytes = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
          job.raw.receiveChunk({ type: "content", voiceChunk: pcmBytes });
        }
        // Handle "end"chunks
        else if (msg.type === "done") job.raw.receiveChunk({ type: "end" });
        // Handle "error" chunks
        else if (msg.type === "error") job.raw.receiveChunk({ type: "error", error: msg.error });
      });
    }
  }
}
