import type { z } from "zod";
import { defineConfig, type ServerConfig } from "@/config/server";
import type { PluginConfig, PluginDefinition, PluginDefinitionBuilder } from "@/plugins/definition";

export type AgentDefinition = {
  name: string;
  config: ServerConfig<"output">;
  plugins: PluginDefinition[];
  pluginConfigs: Record<string, unknown>;
};

type WithPluginsMethods<
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  Builder extends AgentDefinitionBuilder<any, any>,
  PluginsDefs extends readonly PluginDefinition[],
  ExcludedMethods extends string,
> = Builder & {
  [K in PluginsDefs[number]["name"]]: K extends string
    ? (
        config: PluginConfig<Extract<PluginsDefs[number], { name: K }>["config"], "input">,
      ) => Omit<WithPluginsMethods<Builder, PluginsDefs, ExcludedMethods | K>, ExcludedMethods | K>
    : never;
};

export class AgentDefinitionBuilder<
  const Definition extends AgentDefinition,
  ExcludedMethods extends string = never,
> {
  _definition: Definition;

  constructor(definition: Definition) {
    this._definition = definition;
  }

  config(params: ServerConfig<"input">) {
    // Create a new builder instance with the provided config
    const builder = new AgentDefinitionBuilder({
      ...this._definition,
      config: defineConfig(params).withDefaults,
    }) as AgentDefinitionBuilder<Definition, ExcludedMethods | "config">;

    // Return the new builder with the plugins methods, minus excluded methods
    return this.#withPluginsMethods(builder, this._definition.plugins) as Omit<
      WithPluginsMethods<typeof builder, Definition["plugins"], ExcludedMethods | "config">,
      ExcludedMethods | "config"
    >;
  }

  plugins<
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const Plugins extends readonly { _definition: PluginDefinitionBuilder<any>["_definition"] }[],
  >(plugins: Plugins) {
    // Create a new builder instance with the provided plugins
    const pluginDefs = plugins.map((p) => p._definition);
    const builder = new AgentDefinitionBuilder({
      ...this._definition,
      plugins: pluginDefs,
    }) as AgentDefinitionBuilder<
      Omit<Definition, "plugins"> & { plugins: Plugins[number]["_definition"][] },
      ExcludedMethods | "plugins"
    >;

    // Return the new builder with the plugins methods, minus excluded methods
    return this.#withPluginsMethods(builder, pluginDefs) as Omit<
      WithPluginsMethods<
        typeof builder,
        Plugins[number]["_definition"][],
        ExcludedMethods | "plugins"
      >,
      ExcludedMethods | "plugins"
    >;
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  #withPluginsMethods<Builder extends AgentDefinitionBuilder<any, any>>(
    builder: Builder,
    plugins: PluginDefinition[],
  ) {
    for (const plugin of plugins) {
      Object.assign(builder, {
        [plugin.name]: this.#pluginMethod(plugin, plugins),
      });
    }
    return builder;
  }

  #pluginMethod(plugin: PluginDefinition, plugins: PluginDefinition[]) {
    return (config: z.input<PluginDefinition["config"]>): unknown => {
      const builder = new AgentDefinitionBuilder({
        ...this._definition,
        pluginConfigs: {
          ...((this._definition as Definition).pluginConfigs ?? {}),
          [plugin.name]: plugin.config.parse(config),
        },
      });
      return this.#withPluginsMethods(builder, plugins);
    };
  }
}

export function defineAgent<const Name extends string>(name: Name) {
  return new AgentDefinitionBuilder({
    name,
    config: defineConfig({}).withDefaults as ServerConfig<"output">,
    plugins: [],
    pluginConfigs: {},
  });
}
