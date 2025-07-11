import type { Message } from "@/agent/resources";

// - Dependencies
interface _MemoryDependenciesDefinition {
  stores: { name: string }[];
  collections: { name: string }[];
}

type MemoryDependenciesDefinition =
  | _MemoryDependenciesDefinition
  | { _definition: _MemoryDependenciesDefinition };

// - Definition
export type MemoryDefinition = {
  name: string;
  behavior: "blocking" | "non-blocking";
  getOutput?: Message[] | (() => Message[]);
  onHistoryChange?: (history: Message[]) => void;
  dependencies: MemoryDependenciesDefinition;
};

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

  behavior(behavior: "blocking" | "non-blocking") {
    return new MemoryDefinitionBuilder({
      ...this.#def,
      behavior,
    });
  }

  getOutput(params: Message[] | (() => Message[])) {
    return new MemoryDefinitionBuilder({
      ...this.#def,
      getOutput: params,
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
    behavior: "blocking",
    dependencies: {
      stores: [],
      collections: [],
    },
  });
}
