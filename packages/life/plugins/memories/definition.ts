import type { Message } from "@/agent/resources";

export type MemoryDefinition = {
  name: string;
  behavior: "blocking" | "non-blocking";
  getOutput?: Message[] | (() => Message[]);
  onHistoryChange?: (history: Message[]) => void;
  //   dependencies:  /* Add collections */;
};

export class MemoryDefinitionBuilder<const Definition extends MemoryDefinition> {
  #def: Definition;

  constructor(def: Definition) {
    this.#def = def;
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
  });
}
