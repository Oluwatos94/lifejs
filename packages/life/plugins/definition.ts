import type { AsyncQueue } from "@/shared/async-queue";
import { z } from "zod";
import type { Agent } from "../agent/agent";

/** 
@dev Because this plugin builder uses a lot of union and nested types, it might be a little slow with 
Intellisense. If in the future that became an issue, a simple solution could be to lose some typesafety 
depth by replacing many nested types with 'any' (not the top-level ones though, so preserving the same 
typesafe experience).
*/

// - Common
export type EmitFunction<EventsDef extends PluginEventsDef = PluginEventsDef> = (
  event: PluginEvent<EventsDef, "input">,
) => string;

// - Dependencies
export type PluginDependency<
  Methods extends PluginMethods<
    PluginMethodsDef<PluginConfigDef, PluginContext, PluginEventsDef>,
    PluginConfigDef,
    PluginContext,
    PluginEventsDef
  >,
> = {
  _definition: { name: string; methods: Methods };
};
export type PluginDependencies<
  Dependencies extends PluginDependency<
    PluginMethods<
      PluginMethodsDef<PluginConfigDef, PluginContext, PluginEventsDef>,
      PluginConfigDef,
      PluginContext,
      PluginEventsDef
    >
  >[],
> = {
  [K in Dependencies[number] as K["_definition"]["name"]]: {
    methods: PluginMethods<
      K["_definition"]["methods"],
      PluginConfigDef,
      PluginContext,
      PluginEventsDef
    >;
  };
};
// Helper type to extract dependency names safely
type ExtractDependencyNames<
  Dependencies extends PluginDependency<
    PluginMethods<
      PluginMethodsDef<PluginConfigDef, PluginContext, PluginEventsDef>,
      PluginConfigDef,
      PluginContext,
      PluginEventsDef
    >
  >[],
> = Dependencies extends readonly []
  ? []
  : {
      [K in keyof Dependencies]: Dependencies[K] extends PluginDependency<
        PluginMethods<
          PluginMethodsDef<PluginConfigDef, PluginContext, PluginEventsDef>,
          PluginConfigDef,
          PluginContext,
          PluginEventsDef
        >
      >
        ? Dependencies[K]["_definition"]["name"]
        : never;
    };

// - Config
export type PluginConfigDef = z.AnyZodObject;
export type PluginConfig<Def extends PluginConfigDef, T extends "input" | "output"> = Readonly<
  T extends "input" ? z.input<Def> : z.output<Def>
>;

// - Context
type ContextValuePrimitives =
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint
  | Date
  | RegExp
  | Error
  | URL;
type ContextValue =
  | ContextValuePrimitives
  | ContextValue[]
  | Set<ContextValue>
  | Map<string, ContextValue>
  | { [key: string]: ContextValue };
export type PluginContext = Record<string, ContextValue>;

// - Events
export type PluginEventDataSchema = z.Schema;
export type PluginEventsDef = Record<
  string,
  {
    dataSchema?: PluginEventDataSchema;
    interceptorsPermissions?: "drop" | "alter" | "all" | "none";
  }
>;
export type PluginEvent<EventsDef extends PluginEventsDef, T extends "input" | "output"> = {
  [K in keyof EventsDef]: {
    type: K extends string ? K : never;
    urgent?: boolean;
  } & (EventsDef[K]["dataSchema"] extends PluginEventDataSchema
    ? {
        data: T extends "input"
          ? z.input<EventsDef[K]["dataSchema"]>
          : z.output<EventsDef[K]["dataSchema"]>;
      }
    : // biome-ignore lint/complexity/noBannedTypes: <explanation>
      {}) &
    (T extends "output"
      ? { id: string }
      : // biome-ignore lint/complexity/noBannedTypes: <explanation>
        {});
}[keyof EventsDef];

// - Methods
export type PluginMethodsDef<
  ConfigDef extends PluginConfigDef,
  Context extends PluginContext,
  EventsDef extends PluginEventsDef,
> = Record<
  string,
  (
    params: {
      agent: Agent;
      config: PluginConfig<ConfigDef, "output">;
      context: Readonly<Context>;
      emit: EmitFunction<EventsDef>;
    },
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    ...args: any[]
  ) => unknown | Promise<unknown>
>;
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type RemoveFirstParam<T> = T extends (first: any, ...rest: infer R) => infer Return
  ? (...args: R) => Return
  : T;
export type PluginMethods<
  MethodsConfigs extends PluginMethodsDef<ConfigDef, Context, EventsDef>,
  ConfigDef extends PluginConfigDef,
  Context extends PluginContext,
  EventsDef extends PluginEventsDef,
> = {
  [K in keyof MethodsConfigs]: RemoveFirstParam<MethodsConfigs[K]>;
};

// - Lifecycle
export type PluginLifecycle<ConfigDef extends PluginConfigDef, Context extends PluginContext> = {
  onStart?: (params: { config: PluginConfig<ConfigDef, "output">; context: Context }) => void;
  onStop?: (params: { config: PluginConfig<ConfigDef, "output">; context: Context }) => void;
  onError?: (params: { config: PluginConfig<ConfigDef, "output">; context: Context }) => void;
};

// - Effects
export type PluginEffectFunction<
  EventsDef extends PluginEventsDef,
  ConfigDef extends PluginConfigDef,
  Context extends PluginContext,
  Methods extends PluginMethods<
    PluginMethodsDef<PluginConfigDef, PluginContext, PluginEventsDef>,
    PluginConfigDef,
    PluginContext,
    PluginEventsDef
  >,
  Dependencies extends PluginDependencies<
    PluginDependency<
      PluginMethods<
        PluginMethodsDef<PluginConfigDef, PluginContext, PluginEventsDef>,
        PluginConfigDef,
        PluginContext,
        PluginEventsDef
      >
    >[]
  >,
> = (params: {
  event: PluginEvent<EventsDef, "output">;
  agent: Agent;
  config: PluginConfig<ConfigDef, "output">;
  context: Context;
  methods: Methods;
  dependencies: Dependencies;
  emit: EmitFunction<EventsDef>;
}) => void | Promise<void>;

// - Services
export type PluginServiceFunction<
  EventsDef extends PluginEventsDef,
  ConfigDef extends PluginConfigDef,
  Context extends PluginContext,
  Methods extends PluginMethods<
    PluginMethodsDef<PluginConfigDef, PluginContext, PluginEventsDef>,
    PluginConfigDef,
    PluginContext,
    PluginEventsDef
  >,
  Dependencies extends PluginDependencies<
    PluginDependency<
      PluginMethods<
        PluginMethodsDef<PluginConfigDef, PluginContext, PluginEventsDef>,
        PluginConfigDef,
        PluginContext,
        PluginEventsDef
      >
    >[]
  >,
> = (params: {
  queue: AsyncQueue<{
    event: PluginEvent<EventsDef, "output">;
    context: Readonly<Context>;
  }>;
  agent: Agent;
  config: PluginConfig<ConfigDef, "output">;
  methods: Methods;
  dependencies: Dependencies;
  emit: EmitFunction<EventsDef>;
}) => void | Promise<void>;

// - Interceptors
export type PluginInterceptorFunction<
  EventsDef extends PluginEventsDef,
  ConfigDef extends PluginConfigDef,
> = (params: {
  event: PluginEvent<EventsDef, "output">;
  config: PluginConfig<ConfigDef, "output">;
  drop: (reason: string) => void;
  next: (event: PluginEvent<EventsDef, "input">) => void;
  emit: EmitFunction<EventsDef>;
}) => void | Promise<void>;
type RemoveInterceptorsPermissions<T extends Record<string, unknown>> = {
  [K in keyof T]: Omit<T[K], "interceptorsPermissions">;
};
export interface PluginInterceptorDependency {
  dependencyName: string;
  dependencyEvents: RemoveInterceptorsPermissions<PluginEventsDef>;
}

// - Definition
export interface PluginDefinition {
  readonly name: string;
  dependenciesNames: string[];
  config: PluginConfigDef;
  context: PluginContext;
  events: PluginEventsDef;
  methods: PluginMethodsDef<PluginConfigDef, PluginContext, PluginEventsDef>;
  lifecycle: PluginLifecycle<PluginConfigDef, PluginContext>;
  effects: Record<
    string,
    PluginEffectFunction<
      PluginEventsDef,
      PluginConfigDef,
      PluginContext,
      PluginMethodsDef<PluginConfigDef, PluginContext, PluginEventsDef>,
      PluginDependencies<
        PluginDependency<
          PluginMethods<
            PluginMethodsDef<PluginConfigDef, PluginContext, PluginEventsDef>,
            PluginConfigDef,
            PluginContext,
            PluginEventsDef
          >
        >[]
      >
    >
  >;
  services: Record<
    string,
    PluginServiceFunction<
      PluginEventsDef,
      PluginConfigDef,
      PluginContext,
      PluginMethodsDef<PluginConfigDef, PluginContext, PluginEventsDef>,
      PluginDependencies<
        PluginDependency<
          PluginMethods<
            PluginMethodsDef<PluginConfigDef, PluginContext, PluginEventsDef>,
            PluginConfigDef,
            PluginContext,
            PluginEventsDef
          >
        >[]
      >
    >
  >;
  interceptors: Record<
    string,
    {
      dependencyName: string;
      interceptor: PluginInterceptorFunction<PluginEventsDef, PluginConfigDef>;
    }
  >;
}

// - Plugin
export class PluginDefinitionBuilder<
  const Definition extends PluginDefinition,
  EffectKeys extends string = never,
  ServiceKeys extends string = never,
  InterceptorKeys extends string = never,
  Dependencies extends PluginDependency<
    PluginMethods<
      PluginMethodsDef<PluginConfigDef, PluginContext, PluginEventsDef>,
      PluginConfigDef,
      PluginContext,
      PluginEventsDef
    >
  >[] = [],
  ExcludedMethods extends string = never,
> {
  _definition: Definition;

  constructor(def: Definition) {
    this._definition = def;
  }

  dependencies<
    const NewDependencies extends PluginDependency<
      PluginMethods<
        PluginMethodsDef<PluginConfigDef, PluginContext, PluginEventsDef>,
        PluginConfigDef,
        PluginContext,
        PluginEventsDef
      >
    >[],
  >(dependencies: NewDependencies) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      dependenciesNames: dependencies.map((d) => d._definition.name),
    }) as PluginDefinitionBuilder<
      Definition & {
        dependenciesNames: ExtractDependencyNames<NewDependencies>;
      },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      NewDependencies,
      ExcludedMethods | "dependencies"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "dependencies">;
  }

  config<const ConfigDef extends PluginConfigDef>(config: ConfigDef) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      config,
    }) as PluginDefinitionBuilder<
      Definition & { config: ConfigDef },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      Dependencies,
      ExcludedMethods | "config"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "config">;
  }

  context<ContextDef extends PluginContext>(context: ContextDef) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      context,
    }) as PluginDefinitionBuilder<
      Definition & { context: ContextDef },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      Dependencies,
      ExcludedMethods | "context"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "context">;
  }

  events<const EventsDef extends PluginEventsDef>(events: EventsDef) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      events,
    }) as PluginDefinitionBuilder<
      Definition & { events: EventsDef },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      Dependencies,
      ExcludedMethods | "events"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "events">;
  }

  methods<
    const MethodsDef extends PluginMethodsDef<
      Definition["config"],
      Definition["context"],
      Definition["events"]
    >,
  >(methods: MethodsDef) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      methods,
    }) as PluginDefinitionBuilder<
      Definition & { methods: MethodsDef },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      Dependencies,
      ExcludedMethods | "methods"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "methods">;
  }

  lifecycle<
    const LifecycleConfig extends PluginLifecycle<Definition["config"], Definition["context"]>,
  >(lifecycle: LifecycleConfig) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      lifecycle,
    }) as PluginDefinitionBuilder<
      Definition & { lifecycle: LifecycleConfig },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      Dependencies,
      ExcludedMethods | "lifecycle"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "lifecycle">;
  }

  addEffect<const Name extends string>(
    name: Name,
    effect: PluginEffectFunction<
      Definition["events"],
      Definition["config"],
      Definition["context"],
      PluginMethods<Definition["methods"], PluginConfigDef, PluginContext, PluginEventsDef>,
      PluginDependencies<Dependencies>
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
      Dependencies,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  removeEffect<const Name extends EffectKeys>(name: Name) {
    const { [name]: removed, ...remainingEffects } = this._definition.effects ?? {};
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      effects: remainingEffects,
    }) as PluginDefinitionBuilder<
      Definition,
      Exclude<EffectKeys, Name>,
      ServiceKeys,
      InterceptorKeys,
      Dependencies,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  addService<const Name extends string>(
    name: Name,
    service: PluginServiceFunction<
      Definition["events"],
      Definition["config"],
      Definition["context"],
      PluginMethods<Definition["methods"], PluginConfigDef, PluginContext, PluginEventsDef>,
      PluginDependencies<Dependencies>
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
      Dependencies,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  removeService<const Name extends ServiceKeys>(name: Name) {
    const { [name]: removed, ...remainingServices } = this._definition.services ?? {};
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      services: remainingServices,
    }) as PluginDefinitionBuilder<
      Definition,
      EffectKeys,
      Exclude<ServiceKeys, Name>,
      InterceptorKeys,
      Dependencies,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  addInterceptor<const Name extends string, const Dependency extends PluginInterceptorDependency>(
    name: Name,
    dependency: Dependency,
    interceptor: PluginInterceptorFunction<Dependency["dependencyEvents"], Definition["config"]>,
  ) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      interceptors: {
        ...(this._definition.interceptors ?? {}),
        [name]: { ...dependency, interceptor },
      },
    }) as PluginDefinitionBuilder<
      Definition,
      EffectKeys,
      ServiceKeys,
      InterceptorKeys | Name,
      Dependencies,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  removeInterceptor<const Name extends InterceptorKeys>(name: Name) {
    const { [name]: removed, ...remainingInterceptors } = this._definition.interceptors ?? {};
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      interceptors: remainingInterceptors,
    }) as PluginDefinitionBuilder<
      Definition,
      EffectKeys,
      ServiceKeys,
      Exclude<InterceptorKeys, Name>,
      Dependencies,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }
}

export function definePlugin<const Name extends string>(name: Name) {
  return new PluginDefinitionBuilder({
    name: name,
    dependenciesNames: [],
    config: z.object({}),
    context: {},
    events: {},
    methods: {},
    lifecycle: {},
    effects: {},
    interceptors: {},
    services: {},
  });
}
