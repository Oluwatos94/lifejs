import { z } from "zod";
import type { AgentServer } from "@/agent/server";
import type { AsyncQueue } from "@/shared/async-queue";
import type { SerializableValue } from "@/shared/stable-serialize";

/** 
@dev Because this plugin builder uses a lot of union and nested types, it might be a little slow with 
Intellisense. If in the future that became an issue, a simple solution could be to lose some typesafety 
depth by replacing many nested types with 'any' (not the top-level ones though, so preserving the same 
typesafe experience).
*/

// - Common
export type EmitFunction<EventsDef extends PluginEventsDefinition = PluginEventsDefinition> = (
  event: PluginEvent<EventsDef, "input">,
) => string;

// - Dependencies
export type PluginDependencyDefinition = {
  events: PluginEventsDefinition;
  config?: PluginConfigDefinition;
  context?: PluginContextDefinition;
  api?: PluginApiDefinition;
};
export type PluginDependenciesDefinition = Record<string, PluginDependencyDefinition>;
export type PluginDependencies<Defs extends PluginDependenciesDefinition> = {
  [K in keyof Defs]: {
    events: Defs[K]["events"];
    config: Defs[K]["config"] extends PluginConfigDefinition
      ? PluginConfig<Defs[K]["config"], "output">
      : Readonly<Record<string, never>>;
    context: Defs[K]["context"] extends PluginContextDefinition
      ? ReadonlyPluginContext<PluginContext<Defs[K]["context"], "output">>
      : ReadonlyPluginContext<Record<string, never>>;
    api: Defs[K]["api"] extends PluginApiDefinition
      ? PluginApi<Defs[K]["api"]>
      : Readonly<Record<string, never>>;
    emit: EmitFunction<
      Defs[K]["events"] extends PluginEventsDefinition ? Defs[K]["events"] : Record<string, never>
    >;
  };
};

// - Config
export type PluginConfigDefinition = z.AnyZodObject;
export type PluginConfig<
  Def extends PluginConfigDefinition,
  T extends "input" | "output",
> = Readonly<T extends "input" ? z.input<Def> : z.output<Def>>;

// - Context
export type PluginContextDefinition<Schema extends z.AnyZodObject = z.AnyZodObject> = {
  schema: Schema;
  initial: z.input<Schema>;
};
export type PluginContext<
  Def extends PluginContextDefinition,
  T extends "input" | "output",
> = T extends "input" ? z.input<Def["schema"]> : z.output<Def["schema"]>;

export type ReadonlyPluginContext<T> = {
  onChange<R extends SerializableValue>(
    selector: (context: T) => R,
    callback: (newValue: R, oldValue: R) => void,
  ): () => void; // Returns unsubscribe function
  get(): T; // Returns a cloned snapshot of the context
};

export type WritablePluginContext<T> = {
  onChange<R extends SerializableValue>(
    selector: (context: T) => R,
    callback: (newValue: R, oldValue: R) => void,
  ): () => void; // Returns unsubscribe function
  get(): T; // Returns a cloned snapshot of the context
  set<K extends keyof T>(key: K, valueOrUpdater: T[K] | ((prev: T[K]) => T[K])): void;
};

// - Events
export type PluginEventsDefinition = Record<string, { dataSchema?: z.Schema }>;
export type PluginEvent<EventsDef extends PluginEventsDefinition, T extends "input" | "output"> = {
  [K in keyof EventsDef]: {
    type: K extends string ? K : never;
    urgent?: boolean;
  } & (EventsDef[K]["dataSchema"] extends z.Schema
    ? {
        data: T extends "input"
          ? z.input<EventsDef[K]["dataSchema"]>
          : z.output<EventsDef[K]["dataSchema"]>;
      }
    : // biome-ignore lint/complexity/noBannedTypes: empty object type needed for conditional
      {}) &
    (T extends "output"
      ? { id: string }
      : // biome-ignore lint/complexity/noBannedTypes: empty object type needed for conditional
        {});
}[keyof EventsDef];

// - API
export interface PluginApiDefinition<
  Schema extends z.AnyZodObject = z.AnyZodObject,
  EventsDef extends PluginEventsDefinition = PluginEventsDefinition,
  ConfigDef extends PluginConfigDefinition = PluginConfigDefinition,
  ContextDef extends PluginContextDefinition = PluginContextDefinition,
> {
  schema: Schema;
  implementation: (
    Base: typeof PluginApiBase<EventsDef, ConfigDef, ContextDef>,
    schema: Schema,
  ) => new (
    raw: PluginApiConnector<EventsDef, ConfigDef, ContextDef>,
  ) => PluginApiBase<EventsDef, ConfigDef, ContextDef> & z.TypeOf<Schema>;
}

export type PluginApi<Def extends PluginApiDefinition> = z.TypeOf<Def["schema"]>;

export type PluginApiConnector<
  EventsDef extends PluginEventsDefinition,
  ConfigDef extends PluginConfigDefinition,
  ContextDef extends PluginContextDefinition,
> = {
  context: ReadonlyPluginContext<PluginContext<ContextDef, "output">>;
  config: PluginConfig<ConfigDef, "output">;
  emit: EmitFunction<EventsDef>;
};

export class PluginApiBase<
  EventsDef extends PluginEventsDefinition = PluginEventsDefinition,
  ConfigDef extends PluginConfigDefinition = PluginConfigDefinition,
  ContextDef extends PluginContextDefinition = PluginContextDefinition,
> {
  raw: PluginApiConnector<EventsDef, ConfigDef, ContextDef>;
  constructor(raw: PluginApiConnector<EventsDef, ConfigDef, ContextDef>) {
    this.raw = raw;
  }
}

// - Lifecycle
export type PluginLifecycle<
  ConfigDef extends PluginConfigDefinition,
  ContextDef extends PluginContextDefinition,
  EventsDef extends PluginEventsDefinition = PluginEventsDefinition,
> = {
  onStart?: (params: {
    config: PluginConfig<ConfigDef, "output">;
    context: WritablePluginContext<PluginContext<ContextDef, "output">>;
    emit: EmitFunction<EventsDef>;
  }) => void | Promise<void>;
  onStop?: (params: {
    config: PluginConfig<ConfigDef, "output">;
    context: WritablePluginContext<PluginContext<ContextDef, "output">>;
    emit: EmitFunction<EventsDef>;
  }) => void | Promise<void>;
  onError?: (params: {
    config: PluginConfig<ConfigDef, "output">;
    context: WritablePluginContext<PluginContext<ContextDef, "output">>;
    emit: EmitFunction<EventsDef>;
    error: unknown;
  }) => void | Promise<void>;
};

// - Effects
export type PluginEffectFunction<
  DependenciesDef extends PluginDependenciesDefinition,
  EventsDef extends PluginEventsDefinition,
  ConfigDef extends PluginConfigDefinition,
  ContextDef extends PluginContextDefinition,
  ApiDef extends PluginApiDefinition,
> = (params: {
  event: PluginEvent<EventsDef, "output">;
  agent: AgentServer;
  config: PluginConfig<ConfigDef, "output">;
  context: WritablePluginContext<PluginContext<ContextDef, "output">>;
  api: PluginApi<ApiDef>;
  dependencies: PluginDependencies<DependenciesDef>;
  emit: EmitFunction<EventsDef>;
}) => void | Promise<void>;

// - Services
export type PluginServiceFunction<
  DependenciesDef extends PluginDependenciesDefinition,
  EventsDef extends PluginEventsDefinition,
  ConfigDef extends PluginConfigDefinition,
  ContextDef extends PluginContextDefinition,
  ApiDef extends PluginApiDefinition,
> = (params: {
  queue: AsyncQueue<PluginEvent<EventsDef, "output">>;
  agent: AgentServer;
  config: PluginConfig<ConfigDef, "output">;
  context: ReadonlyPluginContext<PluginContext<ContextDef, "output">>;
  api: PluginApi<ApiDef>;
  dependencies: PluginDependencies<DependenciesDef>;
  emit: EmitFunction<EventsDef>;
}) => void | Promise<void>;

// - Interceptors
export type PluginInterceptorFunction<
  DependenciesDef extends PluginDependenciesDefinition,
  EventsDef extends PluginEventsDefinition,
  ConfigDef extends PluginConfigDefinition,
  ContextDef extends PluginContextDefinition,
  ApiDef extends PluginApiDefinition,
> = (params: {
  event: PluginEvent<DependenciesDef[keyof DependenciesDef]["events"], "output">;
  next: (event: PluginEvent<DependenciesDef[keyof DependenciesDef]["events"], "output">) => void;
  drop: (reason: string) => void;
  dependency: PluginDependencies<DependenciesDef>[keyof DependenciesDef] & {
    name: keyof DependenciesDef;
  };
  current: {
    emit: EmitFunction<EventsDef>;
    context: ReadonlyPluginContext<PluginContext<ContextDef, "output">>;
    api: PluginApi<ApiDef>;
    config: PluginConfig<ConfigDef, "output">;
  };
}) => void | Promise<void>;

// - Definition
export interface PluginDefinition {
  readonly name: string;
  dependencies: PluginDependenciesDefinition;
  config: PluginConfigDefinition;
  context: PluginContextDefinition;
  events: PluginEventsDefinition;
  api: PluginApiDefinition;
  lifecycle: PluginLifecycle<
    PluginConfigDefinition,
    PluginContextDefinition,
    PluginEventsDefinition
  >;
  effects: Record<
    string,
    PluginEffectFunction<
      PluginDependenciesDefinition,
      PluginEventsDefinition,
      PluginConfigDefinition,
      PluginContextDefinition,
      PluginApiDefinition
    >
  >;
  services: Record<
    string,
    PluginServiceFunction<
      PluginDependenciesDefinition,
      PluginEventsDefinition,
      PluginConfigDefinition,
      PluginContextDefinition,
      PluginApiDefinition
    >
  >;
  interceptors: Record<
    string,
    PluginInterceptorFunction<
      PluginDependenciesDefinition,
      PluginEventsDefinition,
      PluginConfigDefinition,
      PluginContextDefinition,
      PluginApiDefinition
    >
  >;
}

// - Plugin
export class PluginDefinitionBuilder<
  const Definition extends PluginDefinition,
  EffectKeys extends string = never,
  ServiceKeys extends string = never,
  InterceptorKeys extends string = never,
  ExcludedMethods extends string = never,
> {
  _definition: Definition;

  constructor(def: Definition) {
    this._definition = def;
  }

  dependencies<const Plugins extends { _definition: PluginDefinition }[]>(plugins: Plugins) {
    // Convert array of plugin builders to dependencies definition
    const dependencies: PluginDependenciesDefinition = {};

    for (const plugin of plugins) {
      const def = plugin._definition;
      const name = def.name;

      dependencies[name] = {
        events: def.events || {},
        config: def.config,
        context: def.context || {},
        api: def.api,
      };
    }

    // Type to extract dependency definition from array of plugins
    type ExtractedDependencies = {
      [K in Plugins[number] as K["_definition"]["name"]]: {
        events: K["_definition"]["events"];
        config: K["_definition"]["config"];
        context: K["_definition"]["context"];
        api: K["_definition"]["api"];
      };
    };

    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      dependencies,
    }) as PluginDefinitionBuilder<
      Definition & { dependencies: ExtractedDependencies },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "dependencies"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "dependencies">;
  }

  config<const ConfigDef extends PluginConfigDefinition>(config: ConfigDef) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      config,
    }) as PluginDefinitionBuilder<
      Definition & { config: ConfigDef },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "config"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "config">;
  }

  context<Schema extends z.AnyZodObject>(context: PluginContextDefinition<Schema>) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      context,
    }) as PluginDefinitionBuilder<
      Definition & { context: PluginContextDefinition<Schema> },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "context"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "context">;
  }

  events<const EventsDef extends PluginEventsDefinition>(events: EventsDef) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      events,
    }) as PluginDefinitionBuilder<
      Definition & { events: EventsDef },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "events"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "events">;
  }

  api<const Schema extends z.AnyZodObject>(
    api: PluginApiDefinition<
      Schema,
      Definition["events"],
      Definition["config"],
      Definition["context"]
    >,
  ) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      api,
    }) as PluginDefinitionBuilder<
      Definition & { api: PluginApiDefinition<Schema> },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "api"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "api">;
  }

  lifecycle<
    const LifecycleConfig extends PluginLifecycle<
      Definition["config"],
      Definition["context"],
      Definition["events"]
    >,
  >(lifecycle: LifecycleConfig) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      lifecycle,
    }) as PluginDefinitionBuilder<
      Definition,
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "lifecycle"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "lifecycle">;
  }

  addEffect<const Name extends string>(
    name: Name,
    effect: PluginEffectFunction<
      Definition["dependencies"],
      Definition["events"],
      Definition["config"],
      Definition["context"],
      Definition["api"]
    >,
  ) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      effects: { ...(this._definition.effects ?? {}), [name]: effect },
    }) as PluginDefinitionBuilder<
      Definition,
      EffectKeys | Name,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  removeEffect<const Name extends EffectKeys>(name: Name) {
    const { [name]: _removed, ...remainingEffects } = this._definition.effects ?? {};
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      effects: remainingEffects,
    }) as PluginDefinitionBuilder<
      Definition,
      Exclude<EffectKeys, Name>,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  addService<const Name extends string>(
    name: Name,
    service: PluginServiceFunction<
      Definition["dependencies"],
      Definition["events"],
      Definition["config"],
      Definition["context"],
      Definition["api"]
    >,
  ) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      services: { ...(this._definition.services ?? {}), [name]: service },
    }) as PluginDefinitionBuilder<
      Definition,
      EffectKeys,
      ServiceKeys | Name,
      InterceptorKeys,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  removeService<const Name extends ServiceKeys>(name: Name) {
    const { [name]: _removed, ...remainingServices } = this._definition.services ?? {};
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      services: remainingServices,
    }) as PluginDefinitionBuilder<
      Definition,
      EffectKeys,
      Exclude<ServiceKeys, Name>,
      InterceptorKeys,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  addInterceptor<const Name extends string>(
    name: Name,
    interceptor: PluginInterceptorFunction<
      Definition["dependencies"],
      Definition["events"],
      Definition["config"],
      Definition["context"],
      Definition["api"]
    >,
  ) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      interceptors: { ...(this._definition.interceptors ?? {}), [name]: interceptor },
    }) as PluginDefinitionBuilder<
      Definition,
      EffectKeys,
      ServiceKeys,
      InterceptorKeys | Name,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  removeInterceptor<const Name extends InterceptorKeys>(name: Name) {
    const { [name]: _removed, ...remainingInterceptors } = this._definition.interceptors ?? {};
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      interceptors: remainingInterceptors,
    }) as PluginDefinitionBuilder<
      Definition,
      EffectKeys,
      ServiceKeys,
      Exclude<InterceptorKeys, Name>,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  pick<
    const Options extends {
      events?: Array<keyof Definition["events"]>;
      api?: Array<keyof Definition["api"]["schema"]["shape"]>;
      context?: Array<keyof Definition["context"]["schema"]["shape"]>;
      config?: boolean;
    },
  >(options: Options) {
    // Pick is now type-only - runtime always returns the full plugin
    // TypeScript will enforce the constraints at compile time
    options; // Mark as used
    const pickedDefinition: PluginDefinition = this._definition;

    // Type for the picked definition
    type PickedDefinition = {
      name: Definition["name"];
      dependencies: Definition["dependencies"];
      config: Options["config"] extends true ? Definition["config"] : never;
      events: Options["events"] extends readonly string[]
        ? Pick<Definition["events"], Options["events"][number]>
        : never;
      context: Options["context"] extends readonly string[]
        ? Omit<Definition["context"], "schema"> & {
            schema: z.ZodObject<
              Pick<Definition["context"]["schema"]["shape"], Options["context"][number]>
            >;
          }
        : never;
      api: Options["api"] extends readonly string[]
        ? Omit<Definition["api"], "schema"> & {
            schema: z.ZodObject<Pick<Definition["api"]["schema"]["shape"], Options["api"][number]>>;
          }
        : never;
      lifecycle: Definition["lifecycle"];
      effects: Definition["effects"];
      services: Definition["services"];
      interceptors: Definition["interceptors"];
    };

    return new PluginDefinitionBuilder(pickedDefinition) as unknown as PluginDefinitionBuilder<
      PickedDefinition,
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods
    >;
  }
}

export function definePlugin<const Name extends string>(name: Name) {
  return new PluginDefinitionBuilder({
    name,
    dependencies: {},
    config: z.object({}),
    context: {
      schema: z.object({}),
      initial: {},
    },
    events: {},
    api: {
      schema: z.object({}),
      implementation: (Base) => class extends Base {},
    },
    lifecycle: {},
    effects: {},
    interceptors: {},
    services: {},
  });
}
