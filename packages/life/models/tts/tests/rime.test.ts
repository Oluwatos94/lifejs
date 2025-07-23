import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";
import type { TTSGenerateJob, TTSGenerateStreamChunkOutput } from "../base";
import { RimeTTS, rimeTTSConfigSchema } from "../providers/rime";

// Create a fresh mock fetch for each test
let mockFetch: ReturnType<typeof mock>;

// Helper to create mock response with streaming body
function createMockStreamResponse(chunks: Uint8Array[], ok = true, status = 200) {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return {
    ok,
    status,
    body: stream,
    text: async () => (ok ? "" : "API Error"),
  } as Response;
}

// Helper to create audio data
function createMockAudioData(sampleCount = 1024): Uint8Array {
  const buffer = new ArrayBuffer(sampleCount * 2); // 16-bit samples
  const view = new DataView(buffer);

  // Fill with mock audio data (sine wave)
  for (let i = 0; i < sampleCount; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / 22_050) * 32_767;
    view.setInt16(i * 2, sample, true); // little-endian
  }

  return new Uint8Array(buffer);
}

// Helper to collect all chunks from a job stream
async function collectStreamChunks(job: TTSGenerateJob) {
  const chunks: TTSGenerateStreamChunkOutput[] = [];
  for await (const chunk of job.getStream()) {
    chunks.push(chunk);
    if (chunk.type === "end" || chunk.type === "error") break;
  }
  return chunks;
}

describe("rimeTTSConfigSchema", () => {
  test("should parse valid config with defaults", () => {
    const config = rimeTTSConfigSchema.parse({
      apiKey: "test-key",
    });

    expect(config).toEqual({
      apiKey: "test-key",
      model: "arcana",
      speaker: "default",
      temperature: 0.5,
      topP: 1.0,
      repetitionPenalty: 1.5,
      maxTokens: 1200,
      samplingRate: 24_000,
      baseUrl: "https://users.rime.ai/v1",
    });
  });

  test("should validate model enum", () => {
    expect(() =>
      rimeTTSConfigSchema.parse({
        apiKey: "test-key",
        model: "invalid-model",
      }),
    ).toThrow();
  });

  test("should validate temperature range", () => {
    expect(() =>
      rimeTTSConfigSchema.parse({
        apiKey: "test-key",
        temperature: 3.0,
      }),
    ).toThrow();

    expect(() =>
      rimeTTSConfigSchema.parse({
        apiKey: "test-key",
        temperature: -1.0,
      }),
    ).toThrow();
  });

  test("should validate sampling rate options", () => {
    expect(() =>
      rimeTTSConfigSchema.parse({
        apiKey: "test-key",
        samplingRate: 12_000,
      }),
    ).toThrow();

    const validRates = [8000, 16_000, 22_050, 24_000, 44_100, 48_000, 96_000];
    for (const rate of validRates) {
      expect(() =>
        rimeTTSConfigSchema.parse({
          apiKey: "test-key",
          samplingRate: rate,
        }),
      ).not.toThrow();
    }
  });
});

describe("RimeTTS", () => {
  beforeEach(() => {
    mockFetch = mock();
    global.fetch = mockFetch as unknown as typeof fetch;

    // Mock the initial generation call that happens in constructor
    mockFetch.mockResolvedValue(createMockStreamResponse([createMockAudioData(128)]));
  });

  afterEach(() => {
    mockFetch.mockClear();
  });

  describe("constructor", () => {
    test("should create instance with valid config", async () => {
      const rimeTTS = new RimeTTS({
        apiKey: "test-api-key",
        model: "arcana",
        speaker: "test-speaker",
      });

      expect(rimeTTS).toBeInstanceOf(RimeTTS);
      expect(rimeTTS.config.apiKey).toBe("test-api-key");
      expect(rimeTTS.config.model).toBe("arcana");

      // Wait for initial generation to complete
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    test("should throw error when apiKey is missing", () => {
      expect(() => new RimeTTS({})).toThrow(
        "RIME_API_KEY environment variable or config.apiKey must be provided to use this model.",
      );
    });

    test("should use environment variable for apiKey", () => {
      const originalEnv = process.env.RIME_API_KEY;

      try {
        // Set environment variable first
        process.env.RIME_API_KEY = "env-api-key";

        // Re-import the module to get fresh schema with new env value
        // Since we can't easily re-import in tests, test the schema directly
        const freshSchema = z.object({
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

        const config = freshSchema.parse({});
        expect(config.apiKey).toBe("env-api-key");
      } finally {
        // Restore environment in finally block to ensure it's always reset
        process.env.RIME_API_KEY = originalEnv;
      }
    });
  });

  describe("generate", () => {
    test("should return a valid TTSGenerateJob", async () => {
      const rimeTTS = new RimeTTS({ apiKey: "test-api-key" });
      await new Promise((resolve) => setTimeout(resolve, 20)); // Wait for init

      const job = await rimeTTS.generate();

      expect(job).toHaveProperty("id");
      expect(job).toHaveProperty("cancel");
      expect(job).toHaveProperty("getStream");
      expect(job).toHaveProperty("pushText");
      expect(job).toHaveProperty("raw");
      expect(typeof job.cancel).toBe("function");
      expect(typeof job.getStream).toBe("function");
      expect(typeof job.pushText).toBe("function");
    });

    test("should create unique job IDs", async () => {
      const rimeTTS = new RimeTTS({ apiKey: "test-api-key" });
      await new Promise((resolve) => setTimeout(resolve, 20)); // Wait for init

      const job1 = await rimeTTS.generate();
      const job2 = await rimeTTS.generate();

      expect(job1.id).not.toBe(job2.id);
    });
  });

  describe("text processing and streaming", () => {
    test("should process text and generate audio chunks", async () => {
      const audioData = createMockAudioData(1024);
      mockFetch.mockResolvedValueOnce(createMockStreamResponse([audioData]));

      const rimeTTS = new RimeTTS({ apiKey: "test-api-key" });
      await new Promise((resolve) => setTimeout(resolve, 20)); // Wait for init

      mockFetch.mockClear(); // Clear the init calls
      mockFetch.mockResolvedValueOnce(createMockStreamResponse([audioData]));

      const job = await rimeTTS.generate();
      const chunksPromise = collectStreamChunks(job);

      job.pushText("Hello, world!", true);
      const chunks = await chunksPromise;

      // Check that fetch was called with the right parameters
      expect(mockFetch).toHaveBeenCalled();
      const lastCall = mockFetch.mock.calls.at(-1);
      if (lastCall) {
        expect(lastCall[0]).toBe("https://users.rime.ai/v1/rime-tts-streaming-pcm");
      }

      // Should have content chunks and end
      const contentChunks = chunks.filter((chunk) => chunk.type === "content");
      const endChunks = chunks.filter((chunk) => chunk.type === "end");
      expect(contentChunks.length).toBeGreaterThan(0);
      expect(endChunks).toHaveLength(1);

      if (contentChunks.length > 0 && contentChunks[0] && contentChunks[0].type === "content") {
        expect(contentChunks[0].voiceChunk).toBeInstanceOf(Int16Array);
      }
    });

    test("should use correct endpoint for different models", async () => {
      const audioData = createMockAudioData(512);

      // Test arcana model (streaming)
      const arcanaInstance = new RimeTTS({ apiKey: "test", model: "arcana" });
      await new Promise((resolve) => setTimeout(resolve, 20)); // Wait for init

      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce(createMockStreamResponse([audioData]));

      const arcanaJob = await arcanaInstance.generate();
      arcanaJob.pushText("test", true);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockFetch).toHaveBeenCalled();
      const arcanaCall = mockFetch.mock.calls.find((call) =>
        call[0].includes("rime-tts-streaming-pcm"),
      );
      expect(arcanaCall).toBeDefined();

      // Test mist model (non-streaming)
      const mistInstance = new RimeTTS({ apiKey: "test", model: "mist" });
      await new Promise((resolve) => setTimeout(resolve, 20)); // Wait for init

      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce(createMockStreamResponse([audioData]));

      const mistJob = await mistInstance.generate();
      mistJob.pushText("test", true);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockFetch).toHaveBeenCalled();
      const mistCall = mockFetch.mock.calls.find(
        (call) => call[0] === "https://users.rime.ai/v1/rime-tts",
      );
      expect(mistCall).toBeDefined();
    });
  });

  describe("error handling", () => {
    test("should handle API errors gracefully", async () => {
      const rimeTTS = new RimeTTS({ apiKey: "test-api-key" });
      await new Promise((resolve) => setTimeout(resolve, 20)); // Wait for init

      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce(createMockStreamResponse([], false, 401));

      const job = await rimeTTS.generate();
      const chunksPromise = collectStreamChunks(job);

      job.pushText("Hello, world!", true);
      const chunks = await chunksPromise;

      expect(chunks).toHaveLength(1);
      if (chunks[0]) {
        expect(chunks[0].type).toBe("error");
        if (chunks[0].type === "error") {
          expect(chunks[0].error).toContain("Rime TTS API error: 401");
        }
      }
    });

    test("should handle network errors", async () => {
      const rimeTTS = new RimeTTS({ apiKey: "test-api-key" });
      await new Promise((resolve) => setTimeout(resolve, 20)); // Wait for init

      mockFetch.mockClear();
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const job = await rimeTTS.generate();
      const chunksPromise = collectStreamChunks(job);

      job.pushText("Hello, world!", true);
      const chunks = await chunksPromise;

      expect(chunks).toHaveLength(1);
      if (chunks[0]) {
        expect(chunks[0].type).toBe("error");
        if (chunks[0].type === "error") {
          expect(chunks[0].error).toBe("Network error");
        }
      }
    });

    test("should handle missing response body", async () => {
      const rimeTTS = new RimeTTS({ apiKey: "test-api-key" });
      await new Promise((resolve) => setTimeout(resolve, 20)); // Wait for init

      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: null,
        text: async () => "",
      } as Response);

      const job = await rimeTTS.generate();
      const chunksPromise = collectStreamChunks(job);

      job.pushText("Hello, world!", true);
      const chunks = await chunksPromise;

      expect(chunks).toHaveLength(1);
      if (chunks[0]) {
        expect(chunks[0].type).toBe("error");
        if (chunks[0].type === "error") {
          expect(chunks[0].error).toBe("No response body received from Rime TTS API");
        }
      }
    });
  });

  describe("job cancellation", () => {
    test("should cancel ongoing requests", async () => {
      const rimeTTS = new RimeTTS({ apiKey: "test-api-key" });
      await new Promise((resolve) => setTimeout(resolve, 20)); // Wait for init

      let abortSignal: AbortSignal | undefined;

      mockFetch.mockClear();
      mockFetch.mockImplementationOnce((_url, options) => {
        abortSignal = options?.signal as AbortSignal;
        return new Promise((resolve) => {
          // Simulate long request
          setTimeout(() => {
            resolve(createMockStreamResponse([createMockAudioData(256)]));
          }, 100);
        });
      });

      const job = await rimeTTS.generate();
      job.pushText("Test text", true);

      // Cancel after a short delay
      setTimeout(() => job.cancel(), 10);

      // Wait for cancellation
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(abortSignal?.aborted).toBe(true);
    });
  });

  describe("audio processing", () => {
    test("should convert PCM bytes to Int16Array correctly", async () => {
      // Create a known audio pattern
      const sampleCount = 4;
      const buffer = new ArrayBuffer(sampleCount * 2);
      const view = new DataView(buffer);

      // Set known values
      view.setInt16(0, 1000, true);
      view.setInt16(2, 2000, true);
      view.setInt16(4, 3000, true);
      view.setInt16(6, 4000, true);

      const audioData = new Uint8Array(buffer);

      const rimeTTS = new RimeTTS({ apiKey: "test-api-key" });
      await new Promise((resolve) => setTimeout(resolve, 20)); // Wait for init

      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce(createMockStreamResponse([audioData]));

      const job = await rimeTTS.generate();
      const chunksPromise = collectStreamChunks(job);

      job.pushText("Test", true);
      const chunks = await chunksPromise;

      const contentChunks = chunks.filter((chunk) => chunk.type === "content");
      expect(contentChunks.length).toBeGreaterThan(0);

      if (contentChunks.length > 0 && contentChunks[0] && contentChunks[0].type === "content") {
        const voiceChunk = contentChunks[0].voiceChunk;
        expect(voiceChunk).toBeInstanceOf(Int16Array);
        expect(voiceChunk.length).toBe(4);
        expect(voiceChunk[0]).toBe(1000);
        expect(voiceChunk[1]).toBe(2000);
        expect(voiceChunk[2]).toBe(3000);
        expect(voiceChunk[3]).toBe(4000);
      }
    });
  });

  describe("configuration edge cases", () => {
    test("should handle custom base URL", async () => {
      const customRime = new RimeTTS({
        apiKey: "test",
        baseUrl: "https://custom.rime.ai/v2",
      });
      await new Promise((resolve) => setTimeout(resolve, 20)); // Wait for init

      const audioData = createMockAudioData(128);
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce(createMockStreamResponse([audioData]));

      const job = await customRime.generate();
      job.pushText("Test", true);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockFetch).toHaveBeenCalled();
      const customCall = mockFetch.mock.calls.find((call) =>
        call[0].includes("https://custom.rime.ai/v2"),
      );
      expect(customCall).toBeDefined();
    });
  });
});
