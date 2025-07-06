import { type Message, messageSchema, toolSchema } from "@/agent/resources";
import { definePlugin } from "@/plugins/definition";
import { z } from "zod";

interface Memory {
  id: string;
}

const memoriesPlugin = definePlugin("memories")
  .context({
    lastResults: new Map<string, Message[]>(),
  })
  .addInterceptor(
    "intercept-core-resources-requests",
    {
      dependencyName: "core",
      dependencyEvents: {
        "agent.resources-response": {
          dataSchema: z.object({
            history: z.array(messageSchema),
            tools: z.array(toolSchema),
          }),
        },
      },
    },
    ({ event }) => {
      if (event.type !== "agent.resources-response") return;
    },
  );
