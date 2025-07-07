import { History } from "@/agent/history";
import {
  type CreateMessageInput,
  type Message,
  type UpdateMessageInput,
  createMessageInputSchema,
  messageSchema,
  resourcesSchema,
  toolRequestsSchema,
  toolResponseMessageSchema,
  toolSchema,
  updateMessageInputSchema,
} from "@/agent/resources";
import { audioChunkToMs } from "@/shared/audio-chunk-to-ms";
import { klona } from "@/shared/klona";
import { RollingBuffer } from "@/shared/rolling-buffer";
import { stableDeepEqual } from "@/shared/stable-deep-equal";
import { serializeError } from "serialize-error";
import { z } from "zod";
import { type PluginEvent, definePlugin } from "../definition";
import { GenerationOrchestrator } from "./generation/orchestrator";

// Core plugin
export const corePlugin = definePlugin("core")
  .config(
    z.object({
      tools: z.array(toolSchema).default([
        {
          name: "get-weather",
          description: "Get the weather for a given city",
          inputSchema: z.object({
            city: z.string(),
          }),
          outputSchema: z.object({
            weather: z.string(),
          }),
          run: () => {
            return {
              success: true,
              output: {
                weather: "Sunny",
              },
            };
          },
        },
      ]),
      voiceDetection: z
        .object({
          scoreInThreshold: z.number().default(0.5),
          scoreOutThreshold: z.number().default(0.25),
          prePaddingChunks: z.number().default(50),
          /**
           * Many STT models listen at silent chunks after voice chunks before returning
           * their final transcription result. Deepgram for example, even with `endpointing: 0` and
           * `no_delay: true`, still seems to require a good amount of silent post padding chunks to
           * return a transcript. 50 post-padding chunks wasn't enough and was leading to Deepgram getting
           * stuck sometimes (i.e., never returning transcript). Note that this value could impact
           * latency, since the user's end of turn won't be considered until user voice end is observed,
           * which is delayed by the post-padding chunks. Still, since the pipeline also have to awaits
           * for the STT model, if this value is lower than the latency of the STT model, it will have
           * no impact on latency. For now this value is set at 200 by default, which as been found to
           * be a good balance between latency and stability with most STT providers.
           *
           * You could considering lowering this value to 50 depending on how your STT provider behaves.
           * As always, benchmark carefully the change.
           */
          postPaddingChunks: z.number().default(200),
          interruptMinDurationMs: z.number().default(50),
        })
        .default({}),
      endOfTurnDetection: z
        .object({
          threshold: z.number().default(0.6),
          minTimeoutMs: z.number().default(300),
          maxTimeoutMs: z.number().default(5000),
        })
        .default({}),
    }),
  )
  .context({
    messages: [] as Message[],
    status: { listening: true as boolean, thinking: false as boolean, speaking: false as boolean },
    voiceEnabled: true as boolean,
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
    "agent.resources-response": { dataSchema: resourcesSchema.extend({ requestId: z.string() }) },
    "agent.continue": {
      dataSchema: z.object({
        interrupt: z.enum(["abrupt", "smooth"]).or(z.literal(false)).optional(),
        preventInterruption: z.boolean().optional(),
      }),
    },
    "agent.decide": {
      dataSchema: z.object({
        messages: z.array(messageSchema),
        interrupt: z.enum(["abrupt", "smooth"]).or(z.literal(false)).optional(),
        preventInterruption: z.boolean().optional(),
      }),
    },
    "agent.say": {
      dataSchema: z.object({
        text: z.string(),
        interrupt: z.enum(["abrupt", "smooth"]).or(z.literal(false)).optional(),
        preventInterruption: z.boolean().optional(),
      }),
    },
    "agent.interrupt": {
      dataSchema: z.object({
        reason: z.string(),
        author: z.enum(["user", "application"]),
        force: z.boolean().optional(),
      }),
    },
    "agent.text-chunk": { dataSchema: z.object({ textChunk: z.string() }) },
    "agent.tool-requests": { dataSchema: toolRequestsSchema },
    "agent.tool-response": {
      dataSchema: z.object({
        result: toolResponseMessageSchema.omit({
          createdAt: true,
          lastUpdated: true,
          id: true,
          role: true,
        }),
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
    "agent.generation-start": {},
    "agent.generation-end": {},
  })
  .methods({
    createMessage: ({ emit }, message: CreateMessageInput) =>
      emit({ type: "messages.create", data: message, urgent: true }),
    updateMessage: ({ emit }, message: UpdateMessageInput) =>
      emit({ type: "messages.update", data: message, urgent: true }),
    continue: (
      { emit },
      params: Extract<Parameters<typeof emit>[0], { type: "agent.continue" }>["data"],
    ) => emit({ type: "agent.continue", data: params, urgent: true }),
    decide: (
      { emit },
      params: Extract<Parameters<typeof emit>[0], { type: "agent.decide" }>["data"],
    ) => emit({ type: "agent.decide", data: params, urgent: true }),
    say: ({ emit }, params: Extract<Parameters<typeof emit>[0], { type: "agent.say" }>["data"]) =>
      emit({ type: "agent.say", data: params, urgent: true }),
    interrupt: (
      { emit },
      params: Extract<Parameters<typeof emit>[0], { type: "agent.interrupt" }>["data"],
    ) => {
      emit({ type: "agent.interrupt", data: params, urgent: true });
    },
  })
  // 1. Handle agent' status changes
  .addEffect("handle-status", ({ event, context }) => {
    if (event.type === "agent.generation-end")
      context.status = { listening: true, thinking: false, speaking: false };
    else if (event.type === "agent.voice-start") {
      context.status = { ...context.status, listening: false, speaking: true };
    } else if (event.type === "agent.generation-start") {
      context.status = { ...context.status, listening: false, thinking: true };
    }
  })
  // 2. Maintain messages history
  .addEffect("handle-messages", ({ event, context }) => {
    const _initialMessages = klona(context.messages);
    // Build the history instance
    const history = new History(context.messages);
    // Handle direct history message creation requests
    if (event.type === "messages.create") history.createMessage(event.data);
    // Handle direct history message update requests
    else if (event.type === "messages.update") history.updateMessage(event.data);
    // Handle user text chunk
    else if (event.type === "user.text-chunk") {
      // If the last subject message is from user, append the text chunk to it
      const lastSubjectMessage = history.findLastMessageOfRole(["user", "agent", "tool-response"]);
      if (lastSubjectMessage?.role === "user") {
        history.appendContentToUserMessage(lastSubjectMessage.id, event.data.textChunk);
      }
      // Else, create a new user message
      else history.createMessage({ role: "user", content: event.data.textChunk });
    }
    // Handle user interruptions
    else if (event.type === "user.interrupted") {
      const lastUserMessage = history.findLastMessageOfRole("user");
      if (!lastUserMessage) throw new Error("No user message found. Should not happen.");
      history.appendContentToUserMessage(
        lastUserMessage.id,
        "[You interrupted the user, you might want to quickly apologize or mention that]",
      );
    }
    // Handle agent tool requests
    else if (event.type === "agent.tool-requests") {
      let lastAgentMessageId = history.findLastMessageOfRole("agent")?.id;
      if (!lastAgentMessageId) {
        lastAgentMessageId = history.createMessage({ role: "agent", content: "" });
      }
      history.addToolRequestsToAgentMessage(lastAgentMessageId, event.data);
    }
    // Handle agent tool responses
    else if (event.type === "agent.tool-response") {
      history.createMessage({ ...event.data.result, role: "tool-response" });
    }
    // Handle agent interruptions
    else if (event.type === "agent.interrupted") {
      const lastAgentMessage = history.findLastMessageOfRole("agent");
      if (!lastAgentMessage) throw new Error("No agent message found. Should not happen.");
      if (lastAgentMessage.role !== "agent") return; // for typesafety below
      if (!lastAgentMessage.content.includes("[Interrupted")) {
        history.appendContentToAgentMessage(
          lastAgentMessage.id,
          `[Interrupted by ${event.data.author}]`,
        );
      }
    }
    // Handle agent text chunks
    else if (event.type === "agent.text-chunk") {
      // If the last subject message is from agent, append the text chunk to it
      const lastSubjectMessage = history.findLastMessageOfRole(["user", "agent", "tool-response"]);
      if (lastSubjectMessage?.role === "agent") {
        if (!lastSubjectMessage.content.includes("[Interrupted")) {
          history.appendContentToAgentMessage(lastSubjectMessage.id, event.data.textChunk);
        }
      }
      // Else, create a new agent message
      else history.createMessage({ role: "agent", content: event.data.textChunk });
    }

    // Save the modified messages array
    context.messages = history.getMessages();

    if (!stableDeepEqual(context.messages, _initialMessages)) {
      // console.log(
      //   "💬",
      //   context.messages.map((m) => {
      //     if (m.role === "user" || m.role === "agent") return `${m.role}: ${m.content}`;
      //     const { createdAt, lastUpdated, role, id, ...rest } = klona(m);
      //     return `${m.role}: ${JSON.stringify(rest)}`;
      //   }),
      // );
      console.log("💬", context.messages);
    }
  })
  // 3. Listen for incoming audio chunks coming from the WebRTC room
  .addService("incoming-audio", async ({ agent, emit }) => {
    agent.transport.on("audio-chunk", (event) => {
      emit({ type: "user.audio-chunk", data: { audioChunk: event.chunk } });
    });
    return new Promise((resolve) => process.once("SIGINT", () => resolve()));
  })
  // 4. Use VAD model to detect voice activity
  .addService("detect-voice", async ({ queue, agent, emit, methods, config }) => {
    const SCORE_IN_THRESHOLD = config.voiceDetection.scoreInThreshold;
    const SCORE_OUT_THRESHOLD = config.voiceDetection.scoreOutThreshold;
    const PRE_PADDING_CHUNKS = config.voiceDetection.prePaddingChunks;
    const POST_PADDING_CHUNKS = config.voiceDetection.postPaddingChunks;
    const INTERRUPT_MIN_DURATION_MS = config.voiceDetection.interruptMinDurationMs;

    let inSpeech = false;
    const prePaddingBuffer = new RollingBuffer<Int16Array>(PRE_PADDING_CHUNKS);
    let postPaddingCount = POST_PADDING_CHUNKS;
    // Keeps track of 3x the min. interruption duration in audio chunks
    const interruptBuffer = new RollingBuffer<Int16Array>((INTERRUPT_MIN_DURATION_MS / 10) * 3);

    // Sliding window for voice chunks to handle VAD imperfections
    let voiceChunksWindow: Array<{ timestamp: number; duration: number }> = [];
    const VOICE_WINDOW_MS = INTERRUPT_MIN_DURATION_MS * 2;

    // Helper to calculate current interrupt duration from sliding window
    const getCurrentInterruptDuration = () => {
      const now = Date.now();
      // Remove chunks older than the window
      voiceChunksWindow = voiceChunksWindow.filter((c) => now - c.timestamp <= VOICE_WINDOW_MS);
      // Sum up durations of remaining chunks
      return voiceChunksWindow.reduce((sum, chunk) => sum + chunk.duration, 0);
    };

    // Listen to user audio chunks
    for await (const { event, context } of queue) {
      if (event.type !== "user.audio-chunk") continue;

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
      ) => emit({ type: "user.voice-chunk", data });

      // Check if the chunk contains voice
      const score = await agent.models.vad.checkActivity(event.data.audioChunk);
      const inSpeechBefore = inSpeech;
      inSpeech = score > (inSpeech ? SCORE_IN_THRESHOLD : SCORE_OUT_THRESHOLD);
      const inSpeechChanged = inSpeech !== inSpeechBefore;

      // If the agent is currently listening
      if (context.status.listening) {
        // If the current chunk contains voice
        if (inSpeech) {
          // Reset post-padding count for the new voice session
          postPaddingCount = 0;

          // Emit the voice start event
          if (inSpeechChanged && prePaddingBuffer.length() > 0) emit({ type: "user.voice-start" });

          // Emit the pre-padding chunks
          for (let i = prePaddingBuffer.length() - 1; i >= 0; i--) {
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
          if (postPaddingCount === POST_PADDING_CHUNKS) {
            emit({ type: "user.voice-end" });
          }
        }
        // Else, add the current chunk to the pre-padding buffer
        else prePaddingBuffer.add(event.data.audioChunk);
      }

      // Or if the agent wasn't listening already
      else {
        // Buffer the audio chunk
        interruptBuffer.add(event.data.audioChunk);

        // If voice is detected, add to sliding window
        if (inSpeech) {
          const duration = audioChunkToMs(event.data.audioChunk);
          voiceChunksWindow.push({
            timestamp: Date.now(),
            duration: duration,
          });

          // Check current interrupt duration (works even during silent chunks)
          const currentInterruptDuration = getCurrentInterruptDuration();
          console.log(
            `🔴 Interrupt duration: ${currentInterruptDuration}ms / ${INTERRUPT_MIN_DURATION_MS}ms ${currentInterruptDuration >= INTERRUPT_MIN_DURATION_MS}`,
          );
        }

        // If the interruption duration is long enough, abort and emit all accumulated voice chunks
        if (getCurrentInterruptDuration() >= INTERRUPT_MIN_DURATION_MS) {
          console.log("🟥 Interrupting");
          methods.interrupt({ reason: "The user is speaking", author: "user" });
          emit({ type: "user.voice-start" });
          for (const voiceChunk of interruptBuffer.get()) {
            emitVoiceChunk({ voiceChunk, type: "voice" });
          }
          interruptBuffer.empty();
          voiceChunksWindow.length = 0; // Clear the sliding window
        }
      }
    }
  })
  // 5. Use STT model to transcribe user voice
  .addService("transcribe-audio", async ({ queue, agent, emit }) => {
    const sttJob = await agent.models.stt.generate();

    // Receive transcribe text chunk and emit those
    (async () => {
      for await (const chunk of sttJob.getStream()) {
        if (chunk.type === "content") {
          emit({ type: "user.text-chunk", data: { textChunk: chunk.textChunk } });
        }
      }
    })();

    // Push voice chunks to the STT model
    for await (const { event } of queue) {
      if (event.type !== "user.voice-chunk") continue;
      sttJob.pushVoice(event.data.voiceChunk);
    }
  })
  // 6. Use EOU model to detect user's end of turn
  .addService("detect-end-of-turn", async ({ queue, agent, methods, config }) => {
    const END_OF_TURN_THRESHOLD = config.endOfTurnDetection.threshold;
    const MAX_TIMEOUT_MS = config.endOfTurnDetection.maxTimeoutMs;
    const MIN_TIMEOUT_MS = config.endOfTurnDetection.minTimeoutMs;
    let userIsSpeaking = false;
    let timeoutId: NodeJS.Timeout | null = null;
    let lastMessageBuffer = "";

    // Helper method to check if the agent can answer
    const canAnswer = () => {
      if (userIsSpeaking) return false;
      if (!lastMessageBuffer.trim().length) return false;
      return true;
    };
    // Helper method to emit the current message buffer
    const answer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (!canAnswer()) return;
      methods.continue({ interrupt: "abrupt" });
      lastMessageBuffer = "";
    };

    for await (const { event, context } of queue) {
      if (!context.status.listening) continue;

      // Handle voice related events and text chunks
      if (event.type === "user.voice-start") userIsSpeaking = true;
      else if (event.type === "user.voice-end") userIsSpeaking = false;
      else if (event.type === "user.text-chunk") lastMessageBuffer += event.data.textChunk;
      else continue;

      // Clear the timeout if it exists
      if (timeoutId) clearTimeout(timeoutId);

      // If the agent can't answer yet, continue
      if (!canAnswer()) continue;

      // Determine if the user has finished speaking
      const endOfTurnProbability = await agent.models.eou.predict(context.messages);

      // Emit the message if the user has finished speaking
      if (endOfTurnProbability >= END_OF_TURN_THRESHOLD) answer();
      // Else, set a timeout to emit the message after a delay
      else {
        timeoutId = setTimeout(
          answer,
          Math.max(
            MIN_TIMEOUT_MS,
            MAX_TIMEOUT_MS * (1 - endOfTurnProbability / END_OF_TURN_THRESHOLD),
          ),
        );
      }
    }
  })
  // 7. Handle generation operations
  .addService("handle-generation", async ({ agent, emit, queue }) => {
    // Init the generation orchestrator
    const orchestrator = new GenerationOrchestrator({
      agent,
      emit,
      coreQueueSome: (predicate) => queue.some(({ event }) => predicate(event)),
    });

    // Forward events to the orchestrator
    for await (const { event, context } of queue)
      orchestrator.scheduleGenerations(event, context.voiceEnabled);
  })
  // 8. Handle resources requests
  .addEffect("handle-resources", ({ event, emit, context, config }) => {
    if (event.type !== "agent.resources-request") return;
    emit({
      type: "agent.resources-response",
      data: { messages: context.messages, tools: config.tools, requestId: event.id },
    });
  })
  // 9. Handle tools executions
  .addEffect("handle-tools", async ({ event, emit, config, methods }) => {
    if (event.type !== "agent.tool-requests") return;

    for (const request of event.data) {
      const tool = config.tools.find((tool) => tool.name === request.name);
      if (!tool) throw new Error(`Tool with id "${request.name}" not found.`);

      try {
        const result = await tool.run(request.input);
        emit({
          type: "agent.tool-response",
          data: {
            result: {
              toolId: request.id,
              toolSuccess: result.success,
              toolOutput: result.output,
            },
          },
          urgent: true,
        });
      } catch (error) {
        emit({
          type: "agent.tool-response",
          data: {
            result: {
              toolId: request.id,
              toolSuccess: false,
              toolError: JSON.stringify(serializeError(error)),
            },
          },
          urgent: true,
        });
      }

      methods.continue({ interrupt: "abrupt" });
    }
  })
  // 10. Stream agent speech to the user
  .addService("outgoing-audio", async ({ queue, agent }) => {
    for await (const { event } of queue) {
      if (event.type !== "agent.voice-chunk") continue;
      agent.transport.streamAudioChunk(event.data.voiceChunk);
    }
  });

export type CoreEvent = PluginEvent<typeof corePlugin._definition.events, "output">;
