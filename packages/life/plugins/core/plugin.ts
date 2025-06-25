import { History } from "@/agent/history";
import {
  type CreateMessageInput,
  type Message,
  type UpdateMessageInput,
  createMessageInputSchema,
  messageSchema,
  toolDefinitionSchema,
  toolRequestSchema,
  toolResponseMessage,
  updateMessageInputSchema,
} from "@/agent/resources";
import { audioChunkToMs } from "@/shared/audio-chunk-to-ms";
import { RollingBuffer } from "@/shared/rolling-buffer";
import { z } from "zod";
import { definePlugin } from "../plugin";
import {
  type ContinueOperation,
  type DecideOperation,
  type InterruptOperation,
  type SayOperation,
  continueOperationSchema,
  decideOperationSchema,
  interruptOperationSchema,
  sayOperationSchema,
} from "./generation/operations";
import { GenerationOrchestrator } from "./generation/orchestrator";

// Core plugin
export const corePlugin = definePlugin("core")
  .config({
    schema: z.object({
      voiceDetection: z.object({
        scoreInThreshold: z.number(),
        scoreOutThreshold: z.number(),
        prePaddingChunks: z.number(),
        postPaddingChunks: z.number(),
        interruptMinDurationMs: z.number(),
      }),
      endOfTurnDetection: z.object({
        threshold: z.number(),
        maxTimeoutMs: z.number(),
        minTimeoutMs: z.number(),
      }),
    }),
    default: {
      voiceDetection: {
        scoreInThreshold: 0.5,
        scoreOutThreshold: 0.25,
        prePaddingChunks: 50,
        postPaddingChunks: 50,
        interruptMinDurationMs: 500,
      },
      endOfTurnDetection: {
        threshold: 0.8,
        maxTimeoutMs: 8000,
        minTimeoutMs: 1000,
      },
    },
  })
  .events({
    "messages.create": { dataSchema: createMessageInputSchema },
    "messages.update": { dataSchema: updateMessageInputSchema },
    "user.audio-chunk": { dataSchema: z.object({ audioChunk: z.instanceof(Int16Array) }) },
    "user.voice-start": {},
    "user.voice-chunk": {
      dataSchema: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("voice"),
          voiceChunk: z.instanceof(Int16Array),
        }),
        z.object({
          type: z.literal("padding"),
          voiceChunk: z.instanceof(Int16Array),
          paddingSide: z.enum(["pre", "post"]),
          paddingIndex: z.number(),
        }),
      ]),
    },
    "user.voice-end": {},
    "user.text-chunk": { dataSchema: z.object({ textChunk: z.string() }) },
    "user.interrupted": {},
    "agent.resources-request": {},
    "agent.resources-response": {
      dataSchema: z.object({
        history: z.array(messageSchema),
        tools: z.array(toolDefinitionSchema),
      }),
    },
    "agent.continue": { dataSchema: continueOperationSchema.omit({ type: true }) },
    "agent.decide": { dataSchema: decideOperationSchema.omit({ type: true }) },
    "agent.say": { dataSchema: sayOperationSchema.omit({ type: true }) },
    "agent.interrupt": { dataSchema: interruptOperationSchema.omit({ type: true }) },
    "agent.text-chunk": { dataSchema: z.object({ textChunk: z.string() }) },
    "agent.tool-request": { dataSchema: z.object({ request: toolRequestSchema }) },
    "agent.tool-response": {
      dataSchema: z.object({
        result: toolResponseMessage
          .omit({ createdAt: true, lastUpdated: true, role: true })
          .extend({ id: z.string().optional() }),
      }),
    },
    "agent.interrupted": {
      dataSchema: z.object({
        reason: z.string(),
        forced: z.boolean(),
        author: z.enum(["user", "application"]),
      }),
    },
    "agent.voice-start": {},
    "agent.voice-chunk": { dataSchema: z.object({ voiceChunk: z.instanceof(Int16Array) }) },
    "agent.voice-end": {},
  })
  .context({
    messages: [] as Message[],
    status: { listening: false as boolean, thinking: false as boolean, speaking: false as boolean },
  })
  .methods({
    createMessage: ({ emit }, message: CreateMessageInput) => {
      emit({ type: "messages.create", data: message, urgent: true });
    },
    updateMessage: ({ emit }, message: UpdateMessageInput) => {
      emit({ type: "messages.update", data: message, urgent: true });
    },
    continue: ({ emit }, params: Omit<ContinueOperation, "type">) => {
      emit({ type: "agent.continue", data: params, urgent: true });
    },
    decide: ({ emit }, params: Omit<DecideOperation, "type">) => {
      emit({ type: "agent.decide", data: params, urgent: true });
    },
    say: ({ emit }, params: Omit<SayOperation, "type">) => {
      emit({ type: "agent.say", data: params, urgent: true });
    },
    interrupt: ({ emit }, params: Omit<InterruptOperation, "type">) => {
      emit({ type: "agent.interrupt", data: params, urgent: true });
    },
  })
  // 1. Handle status changes
  .addEffect("handle-agent-status", ({ event, context }) => {
    // Handle listening changes
    if (event.type === "user.voice-start")
      context.status = { listening: true, thinking: false, speaking: false };
    else if (event.type === "user.voice-end") context.status.listening = false;
    else if (event.type === "user.interrupted") context.status.listening = false;
    // Handle a speaking changes
    else if (event.type === "agent.voice-start")
      context.status = { ...context.status, listening: false, speaking: true };
    else if (event.type === "agent.voice-end") context.status.speaking = false;

    // Handle thinking changes
    // if (event.type === "agent.thinking") context.status.thinking = true;
    // else if (event.type === "agent.thinking-end") context.status.thinking = false;
  })
  // 2. Maintain history
  .addEffect("handle-messages", ({ event, context }) => {
    // Build the history instance
    const history = new History(context.messages);
    // Handle direct history message creation requests
    if (event.type === "messages.create") history.createMessage(event.data);
    // Handle direct history message update requests
    else if (event.type === "messages.update") history.updateMessage(event.data);
    // Handle user text chunk
    else if (event.type === "user.text-chunk") {
      const lastUserMessageId = history.findLastMessageIdOfRole("user");
      if (!lastUserMessageId) throw new Error("No user message found. Should not happen.");
      history.appendContentToUserMessage(lastUserMessageId, event.data.textChunk);
    }
    // Handle user interruptions
    else if (event.type === "user.interrupted") {
      const lastUserMessageId = history.findLastMessageIdOfRole("user");
      if (!lastUserMessageId) throw new Error("No user message found. Should not happen.");
      history.appendContentToUserMessage(
        lastUserMessageId,
        "[You interrupted the user, apologize for that]",
      );
    }
    // Handle agent tool requests
    else if (event.type === "agent.tool-request") {
      const lastAgentMessageId = history.findLastMessageIdOfRole("agent");
      if (!lastAgentMessageId) throw new Error("No agent message found. Should not happen.");
      history.addToolRequestToAgentMessage(lastAgentMessageId, event.data.request);
    }
    // Handle agent tool responses
    else if (event.type === "agent.tool-response") {
      history.createMessage({
        role: "tool-response",
        toolId: event.data.result.toolId,
        success: event.data.result.success,
        error: event.data.result.error,
        output: event.data.result.output,
      });
    }
    // Handle agent interruptions
    else if (event.type === "agent.interrupted") {
      const lastAgentMessageId = history.findLastMessageIdOfRole("agent");
      if (!lastAgentMessageId) throw new Error("No agent message found. Should not happen.");
      history.appendContentToAgentMessage(
        lastAgentMessageId,
        `[Interrupted by ${event.data.author}]`,
      );
    }
    // Handle agent text chunks
    else if (event.type === "agent.text-chunk") {
      const lastAgentMessageId = history.findLastMessageIdOfRole("agent");
      if (!lastAgentMessageId) throw new Error("No agent message found. Should not happen.");
      history.appendContentToAgentMessage(lastAgentMessageId, event.data.textChunk);
    }
    // Save the modified messages array
    context.messages = history.getMessages();
  })
  // 3. Listen for incoming audio chunks
  .addService("incoming-audio", async ({ agent, emit }) => {
    agent.transport.on("audio-chunk", (event) => {
      emit({
        type: "user.audio-chunk",
        data: { audioChunk: event.chunk },
        urgent: true,
      });
    });
    return new Promise((resolve) => process.once("SIGINT", () => resolve()));
  })
  // 4. Use VAD model to detect voice activity
  .addService("detect-voice", async ({ events, agent, emit, methods, config }) => {
    const SCORE_IN_THRESHOLD = config.voiceDetection.scoreInThreshold;
    const SCORE_OUT_THRESHOLD = config.voiceDetection.scoreOutThreshold;
    const PRE_PADDING_CHUNKS = config.voiceDetection.prePaddingChunks;
    const POST_PADDING_CHUNKS = config.voiceDetection.postPaddingChunks;
    const INTERRUPT_MIN_DURATION_MS = config.voiceDetection.interruptMinDurationMs;

    let inSpeech = false;
    const prePaddingBuffer = new RollingBuffer<Int16Array>(PRE_PADDING_CHUNKS);
    let postPaddingCount = 0;
    const interruptBuffer = new RollingBuffer<Int16Array>(
      (INTERRUPT_MIN_DURATION_MS / 1000) * 16000 * 4, // Keeps track of 4x the min. interruption duration in audio chunks
    );
    let interruptDuration = 0;

    // Listen to user audio chunks
    for await (const { event, context } of events) {
      if (event.type !== "user.audio-chunk") return;

      // Helper method to emit a voice chunk
      const emitVoiceChunk = (
        data:
          | { type: "voice"; voiceChunk: Int16Array }
          | {
              type: "padding";
              voiceChunk: Int16Array;
              paddingSide: "pre" | "post";
              paddingIndex: number;
            },
      ) => emit({ type: "user.voice-chunk", data, urgent: true });

      // Check if the chunk contains voice
      const score = await agent.models.vad.checkActivity(event.data.audioChunk);
      const hasVoice: boolean = score > (inSpeech ? SCORE_IN_THRESHOLD : SCORE_OUT_THRESHOLD);
      inSpeech = hasVoice;

      // If the agent is currently listening
      if (context.status.listening) {
        // If the current chunk contains voice
        if (hasVoice) {
          // Emit the voice start event
          emit({ type: "user.voice-start", urgent: true });

          // Emit the pre-padding chunks
          for (let i = 0; i < prePaddingBuffer.length(); i++) {
            const voiceChunk = prePaddingBuffer.get()[i];
            if (!voiceChunk) continue;
            emitVoiceChunk({
              type: "padding",
              voiceChunk,
              paddingSide: "pre",
              paddingIndex: i,
            });
          }
          prePaddingBuffer.empty();

          // Emit the voice chunk
          emitVoiceChunk({ voiceChunk: event.data.audioChunk, type: "voice" });
        }
        // Else, emit the current chunk if post-padding limit is not met yet
        else if (postPaddingCount < POST_PADDING_CHUNKS) {
          emitVoiceChunk({
            voiceChunk: event.data.audioChunk,
            type: "padding",
            paddingSide: "post",
            paddingIndex: postPaddingCount,
          });
          postPaddingCount++;
          if (postPaddingCount === POST_PADDING_CHUNKS)
            emit({ type: "user.voice-end", urgent: true });
        }
        // Else, add the current chunk to the pre-padding buffer
        else prePaddingBuffer.add(event.data.audioChunk);
      }

      // Or if the agent wasn't listening already
      else {
        // Buffer the voice chunk
        interruptBuffer.add(event.data.audioChunk);

        // If voice is detected, increment the interrupt duration
        if (hasVoice) {
          const duration = audioChunkToMs(event.data.audioChunk);
          interruptDuration += duration;
          setTimeout(() => {
            interruptDuration -= duration;
          }, INTERRUPT_MIN_DURATION_MS * 2);
        }

        // If the interruption buffer is long enough, abort and emit all accumulated voice chunks
        if (interruptDuration > INTERRUPT_MIN_DURATION_MS) {
          methods.interrupt({ reason: "The user is speaking", author: "user" });
          emit({ type: "user.voice-start", urgent: true });
          for (const voiceChunk of interruptBuffer.get()) {
            emitVoiceChunk({ voiceChunk, type: "voice" });
          }
          interruptBuffer.empty();
          interruptDuration = 0;
        }
      }
    }
  })
  // 5. Use STT model to transcribe user voice
  .addService("transcribe-audio", async ({ events, agent, emit }) => {
    const sttJob = await agent.models.stt.generate();

    // Receive transcribe text chunk and emit those
    (async () => {
      for await (const chunk of sttJob.getStream()) {
        if (chunk.type === "content")
          emit({ type: "user.text-chunk", data: { textChunk: chunk.textChunk } });
      }
    })();

    // Push voice chunks to the STT model
    for await (const { event } of events) {
      if (event.type !== "user.voice-chunk") return;
      sttJob.pushVoice(event.data.voiceChunk);
    }
  })
  // 6. Use EOU model to detect user's end of turn
  .addService("detect-end-of-turn", async ({ events, agent, methods, config }) => {
    const END_OF_TURN_THRESHOLD = config.endOfTurnDetection.threshold;
    const MAX_TIMEOUT_MS = config.endOfTurnDetection.maxTimeoutMs;
    const MIN_TIMEOUT_MS = config.endOfTurnDetection.minTimeoutMs;
    let userIsSpeaking = false;
    let lastMessageBuffer = "";
    let timeoutId: NodeJS.Timeout | null = null;

    for await (const { event, context } of events) {
      // Helper method to emit the current message buffer
      const emitMessage = () => {
        methods.continue({ interrupt: "abrupt" });
        lastMessageBuffer = "";
      };

      // Handle voice related events
      if (event.type === "user.voice-start") userIsSpeaking = true;
      else if (event.type === "user.voice-end") userIsSpeaking = false;
      else if (event.type === "user.text-chunk") lastMessageBuffer += ` ${event.data.textChunk}`;
      else return;

      // Return early if the message buffer is empty
      if (!lastMessageBuffer.length) return;

      // Clear the timeout if it exists
      if (timeoutId) clearTimeout(timeoutId);

      // Determine if the user has finished speaking
      const endOfTurnProbability = await agent.models.eou.predict(context.messages);

      // Emit the message if the user has finished speaking
      if (endOfTurnProbability >= END_OF_TURN_THRESHOLD && !userIsSpeaking) emitMessage();
      // Else, set a timeout to emit the message after a delay
      else {
        const duration = Math.max(
          MIN_TIMEOUT_MS,
          MAX_TIMEOUT_MS * (1 - endOfTurnProbability / END_OF_TURN_THRESHOLD),
        );
        timeoutId = setTimeout(emitMessage, duration);
      }
    }
  })
  // 7. Provide generation resources when requested
  .addEffect("provide-resources", ({ event, emit, context }) => {
    if (event.type !== "agent.resources-request") return;
    emit({ type: "agent.resources-response", data: { history: context.messages, tools: [] } });
  })
  // 8. Handle generation operations
  .addService("handle-operations", async ({ agent, emit, events }) => {
    let userIsSpeaking = false;

    // Init the generative operations orchestrator
    const orchestrator = new GenerationOrchestrator({
      agent,
      requestTool: (request) => {
        if (!request) return;
        emit({ type: "agent.tool-request", data: { request } });
      },
      requestResources: () => {
        emit({ type: "agent.resources-request" });
      },
    });

    // Stream back orchestrator events
    orchestrator.on("content-chunk", (chunk) => {
      const { voiceChunk, textChunk } = chunk;
      if (userIsSpeaking) {
        emit({ type: "user.interrupted" });
        userIsSpeaking = false;
      }
      emit({ type: "agent.voice-chunk", data: { voiceChunk } });
      emit({ type: "agent.text-chunk", data: { textChunk } });
    });
    orchestrator.on("interruption", (data) => {
      emit({ type: "agent.interrupted", data });
    });
    orchestrator.on("speech-status", (isSpeaking) => {
      if (isSpeaking) emit({ type: "agent.voice-start" });
      else emit({ type: "agent.voice-end" });
    });

    for await (const { event } of events) {
      // Track user speaking status
      if (event.type === "user.voice-start") userIsSpeaking = true;
      else if (event.type === "user.voice-end") userIsSpeaking = false;

      // Push generation operations to the generations orchestrator
      // if (event.type === "agent.operation") orchestrator.pushOperation(event.data);
    }
  })
  // 9. Tools executions are not implemented in the core
  .addService("run-tools", async ({ events, emit }) => {
    for await (const { event } of events) {
      if (event.type === "agent.tool-request") {
        emit({
          type: "agent.tool-response",
          data: {
            result: {
              toolId: event.data.request.id,
              success: false,
              error: "Tools not implemented. Ask developer.",
            },
          },
        });
      }
    }
  })
  // 10. Stream agent speech to the user
  .addService("outgoing-audio", async ({ events, agent }) => {
    for await (const { event } of events) {
      if (event.type !== "agent.voice-chunk") return;
      agent.transport.streamAudioChunk(event.data.voiceChunk);
    }
  });
