import { type ConfigDefinition, defineConfig } from "@/config";
import type { PluginConfig, PluginDefinition, PluginDefinitionBuilder } from "@/plugins/definition";
import type { z } from "zod";

export type AgentDefinition<T extends "input" | "output"> = {
  name: string;
  config: ConfigDefinition<T>;
  plugins: PluginDefinition[];
  pluginConfigs: Record<string, unknown>;
};

export class AgentDefinitionBuilder<
  const Definition extends AgentDefinition<"input">,
  ExcludedMethods extends string = never,
> {
  #_definition: Definition;

  constructor(def: Definition) {
    this.#_definition = def;
  }

  _definition() {
    return this.#_definition as unknown as AgentDefinition<"output">;
  }

  config(params: ConfigDefinition<"input">) {
    const config = defineConfig(params);
    const agent = new AgentDefinitionBuilder<Definition, ExcludedMethods | "config">({
      ...this.#_definition,
      config: config.withDefaults,
    });
    return agent as Omit<typeof agent, ExcludedMethods | "config">;
  }

  plugins<
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const Plugins extends readonly { _definition: PluginDefinitionBuilder<any>["_definition"] }[],
  >(plugins: Plugins) {
    type PluginsDefs = {
      [K in keyof Plugins]: Plugins[K]["_definition"];
    };

    const pluginDefs = plugins.map((p) => p._definition);
    const agent = new AgentDefinitionBuilder({
      ...this.#_definition,
      plugins: pluginDefs,
      pluginConfigs: {},
    }) as AgentDefinitionBuilder<
      Definition & { plugins: PluginsDefs },
      ExcludedMethods | "plugins"
    >;

    // Generate methods for each plugin
    for (const plugin of plugins) {
      Object.assign(agent, {
        [plugin._definition.name]: this.#pluginMethod(pluginDefs, plugin._definition),
      });
    }

    // Create typed plugin methods
    type PluginMethodsType<A> = {
      [K in PluginsDefs[number]["name"]]: K extends string
        ? (
            config: PluginConfig<Extract<PluginsDefs[number], { name: K }>["config"], "input">,
          ) => Omit<A, ExcludedMethods | "plugins" | K>
        : never;
    };

    // Build and return the typed agent
    type AgentWithPluginMethods = Omit<typeof agent, ExcludedMethods | "plugins"> &
      PluginMethodsType<typeof agent>;

    return agent as typeof agent & PluginMethodsType<AgentWithPluginMethods>;
  }

  #pluginMethod(plugins: PluginDefinition[], plugin: PluginDefinition) {
    return (config: z.input<PluginDefinition["config"]>) => {
      return new AgentDefinitionBuilder({
        ...this.#_definition,
        plugins,
        pluginConfigs: {
          ...((this.#_definition as Definition).pluginConfigs ?? {}),
          [plugin.name]: plugin.config.parse(config),
        },
      });
    };
  }
}

export function defineAgent<const Name extends string>(name: Name) {
  return new AgentDefinitionBuilder({
    name,
    config: {},
    plugins: [],
    pluginConfigs: {},
  });
}
