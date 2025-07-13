export { defineAgent } from "@/agent/definition";
export { definePlugin } from "@/plugins/definition";
export { defineMemory } from "@/plugins/memories/definition";

import { corePlugin } from "@/plugins/core/core";
import { memoriesPlugin } from "@/plugins/memories/memories";
import { storesPlugin } from "@/plugins/stores/stores";

export const defaults = {
  plugins: {
    core: corePlugin,
    memories: memoriesPlugin,
    stores: storesPlugin,
    // Allows defaults to be used as an iterable, e.g., [...defaults.plugins]
    *[Symbol.iterator]() {
      for (const entry of Object.values(this)) yield entry;
    },
  },
} as const;
