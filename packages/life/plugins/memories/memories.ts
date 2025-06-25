import { type Message, messageSchema, toolDefinitionSchema } from "@/agent/resources";
import { definePlugin } from "@/plugins/plugin";
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
      dependencyId: "core",
      dependencyEvents: {
        "agent.resources-response": {
          dataSchema: z.object({
            history: z.array(messageSchema),
            tools: z.array(toolDefinitionSchema),
          }),
        },
      },
    },
    ({ event }) => {
      if (event.type !== "agent.resources-response") return;
    },
  );
