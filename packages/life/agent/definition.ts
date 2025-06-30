import { type ConfigDefinition, type ConfigDefinitionInput, defineConfig } from "@/config";

export interface AgentDefinitionInput {
  config: ConfigDefinitionInput;
}

export interface AgentDefinition {
  id: string;
  config: ConfigDefinition;
}

export class AgentDefinitionBuilder<
  const Def extends AgentDefinitionInput,
  ExcludedMethods extends string = never,
> {
  #output: Def;

  constructor(def: Def) {
    this.#output = def;
  }

  config(params: ConfigDefinitionInput) {
    const config = defineConfig(params);
    const agent = new AgentDefinitionBuilder<
      Def & { config: typeof config.raw },
      ExcludedMethods | "config"
    >({
      ...this.#output,
      config: config.raw,
    });
    return agent as Omit<typeof agent, ExcludedMethods | "config">;
  }

  _getDefinition() {
    return this.#output as unknown as AgentDefinition;
  }
}

export function defineAgent<const Id extends string>(id: Id) {
  return new AgentDefinitionBuilder({
    id,
    config: {},
  });
}
