import { z } from "zod";
import { type Message, messageSchema } from "@/agent/resources";
import { definePlugin } from "@/plugins/definition";
import { stableObjectSHA256 } from "@/shared/stable-sha256";
import { corePlugin } from "../core/core";
import { type MemoryDefinition, MemoryDefinitionBuilder } from "./definition";

// Helper function to build a memory and get its output messages
async function buildMemory(
  memory: MemoryDefinitionBuilder<MemoryDefinition>,
  messages: Message[],
): Promise<Message[]> {
  const { getOutput } = memory._definition();
  if (typeof getOutput === "function") return await getOutput({ messages });
  return getOutput ?? [];
}

export const memoriesPlugin = definePlugin("memories")
  .dependencies([corePlugin.pick({ events: ["agent.resources-response"] })])
  .config(
    z.object({
      items: z.array(z.instanceof(MemoryDefinitionBuilder)).default([]),
    }),
  )
  .events({
    "build-request": {
      dataSchema: corePlugin._definition.events["agent.resources-response"].dataSchema,
    },
    "build-response": {
      dataSchema: corePlugin._definition.events["agent.resources-response"].dataSchema,
    },
    "memory-result": {
      dataSchema: z.object({
        name: z.string(),
        messages: z.array(messageSchema),
        timestamp: z.number(),
      }),
    },
    "cache-update": {
      dataSchema: z.object({
        messagesHash: z.string(),
        memories: z.array(messageSchema),
      }),
    },
  })
  .context(
    z.object({
      memoriesLastResults: z.custom<Map<string, Message[]>>().default(new Map()),
      memoriesLastTimestamp: z.custom<Map<string, number>>().default(new Map()),
      processedRequestsIds: z.custom<Set<string>>().default(new Set()),
      computedMemoriesCache: z
        .custom<Map<string, { hash: string; memories: Message[] }>>()
        .default(new Map()),
    }),
  )
  // Intercept the 'agent.resources-response' from core plugin
  .addInterceptor(
    "intercept-core-resources-response",
    ({ dependencyName, event, drop, emit, context }) => {
      if (dependencyName !== "core" || event.type !== "agent.resources-response") return;

      // Ignore already processed requests
      if (context.processedRequestsIds.has(event.data.requestId)) return;

      // Drop the agent.resources-response event
      drop("Will be re-emitted by memories later.");

      // Emit a build-request event
      emit({ type: "build-request", data: event.data });
    },
  )

  // Build non-blocking memories when build-request is received
  .addService("build-non-blocking-memories", async ({ config, emit, queue }) => {
    for await (const event of queue) {
      if (event.type !== "build-request") continue;

      const timestamp = Date.now();

      // Update each non-blocking memory asynchronously
      for (const item of config.items) {
        const def = item._definition();
        if (def.config.behavior !== "non-blocking") continue;

        // Fire and forget - don't await
        buildMemory(item, event.data.messages)
          .then((messages) => {
            emit({ type: "memory-result", data: { name: def.name, messages, timestamp } });
          })
          .catch((error) => {
            console.error(`Failed to update non-blocking memory '${def.name}':`, error);
          });
      }
    }
  })

  // Build memories messages and emit build response
  .addService("build-memories", async ({ config, emit, queue, context }) => {
    for await (const event of queue) {
      if (event.type !== "build-request") continue;

      // Compute hash of input messages to check cache
      const messagesHash = await stableObjectSHA256({ messages: event.data.messages });

      // Check if we've already computed memories for these messages
      const cachedResult = context.computedMemoriesCache.get(messagesHash);
      if (cachedResult) {
        // Use cached result
        emit({
          type: "build-response",
          data: {
            ...event.data,
            messages: cachedResult.memories,
          },
        });
        continue;
      }

      // Process memories in the order they were defined
      const memoriesMessages: Message[] = [];

      const timestamp = Date.now();

      // Build all blocking memories concurrently
      const blockingResults = new Map<number, Message[]>();
      const blockingPromises = config.items.map(async (item, index) => {
        const def = item._definition();
        if (def.config.behavior !== "blocking") return;

        const messages = await buildMemory(item, event.data.messages);
        blockingResults.set(index, messages);
        emit({
          type: "memory-result",
          data: { name: def.name, messages, timestamp },
        });
      });

      await Promise.all(blockingPromises);

      // Build final array in original order
      for (let i = 0; i < config.items.length; i++) {
        const item = config.items[i];
        if (!item) continue;

        const def = item._definition();
        if (def.config.behavior === "blocking") {
          const messages = blockingResults.get(i) ?? [];
          memoriesMessages.push(...messages);
        } else {
          const cached = context.memoriesLastResults.get(def.name) ?? [];
          memoriesMessages.push(...cached);
        }
      }

      // Emit cache update event
      emit({
        type: "cache-update",
        data: { messagesHash, memories: memoriesMessages },
      });

      // Re-emit the resources response with the memories messages
      emit({
        type: "build-response",
        data: {
          ...event.data,
          messages: memoriesMessages,
        },
      });
    }
  })
  // Store memory results in context (only if newer than existing)
  .addEffect("store-memory-result", ({ event, context }) => {
    if (event.type !== "memory-result") return;

    const currentTimestamp = context.memoriesLastTimestamp.get(event.data.name) ?? 0;
    if (event.data.timestamp >= currentTimestamp) {
      context.set("memoriesLastResults", (prev) => {
        const newMap = new Map(prev);
        newMap.set(event.data.name, event.data.messages);
        return newMap;
      });
      context.set("memoriesLastTimestamp", (prev) => {
        const newMap = new Map(prev);
        newMap.set(event.data.name, event.data.timestamp);
        return newMap;
      });
    }
  })
  // Update the computed memories cache
  .addEffect("update-cache", ({ event, context }) => {
    if (event.type !== "cache-update") return;
    
    context.set("computedMemoriesCache", (prev) => {
      const newMap = new Map(prev);
      newMap.set(event.data.messagesHash, {
        hash: event.data.messagesHash,
        memories: event.data.memories,
      });
      return newMap;
    });
  })
  // Re-emit the build-response event
  .addEffect("re-emit-build-response", ({ event, dependencies, context }) => {
    if (event.type !== "build-response") return;
    // Add the request id to the processed requests ids
    context.set("processedRequestsIds", (prev) => {
      const newSet = new Set(prev);
      newSet.add(event.data.requestId);
      return newSet;
    });
    // Re-emit the resources response event
    // dependencies.core.context.

    dependencies.core.emit({ type: "agent.resources-response", data: event.data });
  });
