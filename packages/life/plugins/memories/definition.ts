import { z } from "zod";
import type { Message } from "@/agent/resources";

// - Dependencies
interface _MemoryDependenciesDefinition {
  stores: { name: string }[];
  collections: { name: string }[];
}

type MemoryDependenciesDefinition =
  | _MemoryDependenciesDefinition
  | { _definition: _MemoryDependenciesDefinition };

// - Config
export const memoryConfigSchema = z.object({
  behavior: z.enum(["blocking", "non-blocking"]).default("blocking"),
});

export type MemoryConfig<T extends "input" | "output"> = T extends "input"
  ? { behavior?: "blocking" | "non-blocking" }
  : { behavior: "blocking" | "non-blocking" };

// - Definition
export interface MemoryDefinition {
  name: string;
  config: MemoryConfig<"output">;
  output?: Message[] | ((params: { messages: Message[] }) => Message[] | Promise<Message[]>);
  onHistoryChange?: (history: Message[]) => void;
  dependencies: MemoryDependenciesDefinition;
}

// - Builder
export class MemoryDefinitionBuilder<const Definition extends MemoryDefinition> {
  #def: Definition;

  constructor(def: Definition) {
    this.#def = def;
  }

  dependencies<Dependencies extends MemoryDependenciesDefinition>(dependencies: Dependencies) {
    return new MemoryDefinitionBuilder({
      ...this.#def,
      dependencies: "_definition" in dependencies ? dependencies._definition : dependencies,
    }) as MemoryDefinitionBuilder<Definition & { dependencies: Dependencies }>;
  }

  config(config: MemoryConfig<"input">) {
    const parsedConfig = memoryConfigSchema.parse(config);
    return new MemoryDefinitionBuilder({
      ...this.#def,
      config: parsedConfig,
    });
  }

  output(
    // biome-ignore lint/nursery/noShadow: expected here
    params: Message[] | ((params: { messages: Message[] }) => Message[] | Promise<Message[]>),
  ) {
    return new MemoryDefinitionBuilder({
      ...this.#def,
      output: params,
    });
  }

  onHistoryChange(onHistoryChange: (history: Message[]) => void) {
    return new MemoryDefinitionBuilder({
      ...this.#def,
      onHistoryChange,
    });
  }

  _definition() {
    return this.#def;
  }
}

export function defineMemory<const Name extends string>(name: Name) {
  return new MemoryDefinitionBuilder({
    name,
    config: memoryConfigSchema.parse({}), // Will default to { behavior: "blocking" }
    dependencies: {
      stores: [],
      collections: [],
    },
  });
}
