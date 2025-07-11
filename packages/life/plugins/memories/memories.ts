import { type Message, createMessageInputSchema, resourcesSchema } from "@/agent/resources";
import { definePlugin } from "@/plugins/definition";
import { z } from "zod";
import { MemoryDefinitionBuilder } from "./definition";

export const memoriesPlugin = definePlugin("memories")
  .dependencies({
    core: {
      methods: {
        createMessage: z.function().args(createMessageInputSchema).returns(z.string()),
      },
      events: {
        "agent.resources-response": {
          dataSchema: resourcesSchema.extend({ requestId: z.string() }),
        },
      },
    },
  })
  .config(
    z.object({
      items: z.array(z.instanceof(MemoryDefinitionBuilder)).default([]),
    }),
  )
  .context({
    lastResults: new Map<string, Message[]>(),
  })
  .addInterceptor(
    "intercept-core-resources-response",
    ({ dependencyName, event, next, config }) => {
      if (dependencyName !== "core" || event.type !== "agent.resources-response") return;
      // Build memories messages
      const memoriesMessages = config.items.flatMap((item) => {
        const getOutput = item._definition().getOutput;
        if (typeof getOutput === "function") return getOutput();
        return getOutput ?? [];
      });
      // Override the resources response with the messages produced by the memories
      next({
        ...event,
        data: {
          ...event.data,
          messages: memoriesMessages,
        },
      });
    },
  );
