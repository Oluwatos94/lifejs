export { defineAgent } from "@/agent/definition";
export { defineMemory } from "@/plugins/memories/definition";
export { definePlugin } from "@/plugins/definition";

import { corePlugin } from "@/plugins/core/core";
import { memoriesPlugin } from "@/plugins/memories/memories";

export const defaults = {
  plugins: {
    core: corePlugin,
    memories: memoriesPlugin,
  },
} as const;
