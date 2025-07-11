import type { Agent } from "@/agent/agent";
import type { AsyncQueue } from "@/shared/async-queue";
import { z } from "zod";

/** 
@dev Because this plugin builder uses a lot of union and nested types, it might be a little slow with 
Intellisense. If in the future that became an issue, a simple solution could be to lose some typesafety 
depth by replacing many nested types with 'any' (not the top-level ones though, so preserving the same 
typesafe experience).
*/

// Type alias for any Zod function schema - more readable than z.ZodFunction<any, any>
// biome-ignore lint/suspicious/noExplicitAny: Required for flexible function type matching
type AnyZodFunction = z.ZodFunction<any, any>;

// - Common
export type EmitFunction<EventsDef extends PluginEventsDefinition = PluginEventsDefinition> = (
  event: PluginEvent<EventsDef, "input">,
) => string;

// - Dependencies
export type PluginDependencyDefinition = {
  events: PluginEventsDefinition;
  methods: Record<string, AnyZodFunction>;
};
export type PluginDependenciesDefinition = Record<string, PluginDependencyDefinition>;
export type PluginDependencies<Defs extends PluginDependenciesDefinition> = {
  [K in keyof Defs]: {
    events: Defs[K]["events"];
    methods: {
      [M in keyof Defs[K]["methods"]]: z.infer<Defs[K]["methods"][M]>;
    };
  };
};

// - Config
export type PluginConfigDefinition = z.AnyZodObject;
export type PluginConfig<
  Def extends PluginConfigDefinition,
  T extends "input" | "output",
> = Readonly<T extends "input" ? z.input<Def> : z.output<Def>>;

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
    : // biome-ignore lint/complexity/noBannedTypes: <explanation>
      {}) &
    (T extends "output"
      ? { id: string }
      : // biome-ignore lint/complexity/noBannedTypes: <explanation>
        {});
}[keyof EventsDef];

// - Methods
// Type for method schemas definition (the new format with schema + run)
export type PluginMethodsDef = Record<
  string,
  // biome-ignore lint/suspicious/noExplicitAny: Required for flexible function signatures
  { schema: AnyZodFunction; run: (...args: any[]) => any }
>;

// Type to extract methods from method definitions
export type PluginMethods<MethodsDef extends PluginMethodsDef | undefined> =
  MethodsDef extends PluginMethodsDef
    ? {
        [K in keyof MethodsDef]: MethodsDef[K]["schema"] extends z.ZodFunction<
          infer TArgs,
          infer TReturns
        >
          ? (
              ...args: z.infer<TArgs> extends readonly unknown[] ? z.infer<TArgs> : never
            ) => z.infer<TReturns> | Promise<z.infer<TReturns>>
          : never;
      }
    : // biome-ignore lint/complexity/noBannedTypes: <explanation>
      {};

// - Lifecycle
export type PluginLifecycle<
  ConfigDef extends PluginConfigDefinition,
  Context extends PluginContext,
> = {
  onStart?: (params: { config: PluginConfig<ConfigDef, "output">; context: Context }) => void;
  onStop?: (params: { config: PluginConfig<ConfigDef, "output">; context: Context }) => void;
  onError?: (params: { config: PluginConfig<ConfigDef, "output">; context: Context }) => void;
};

// - Effects
export type PluginEffectFunction<
  DependenciesDef extends PluginDependenciesDefinition,
  EventsDef extends PluginEventsDefinition,
  ConfigDef extends PluginConfigDefinition,
  Context extends PluginContext,
  MethodsDef extends PluginMethodsDef | undefined,
> = (params: {
  event: PluginEvent<EventsDef, "output">;
  agent: Agent;
  config: PluginConfig<ConfigDef, "output">;
  context: Context;
  methods: PluginMethods<MethodsDef>;
  dependencies: PluginDependencies<DependenciesDef>;
  emit: EmitFunction<EventsDef>;
}) => void | Promise<void>;

// - Services
export type PluginServiceFunction<
  DependenciesDef extends PluginDependenciesDefinition,
  EventsDef extends PluginEventsDefinition,
  ConfigDef extends PluginConfigDefinition,
  Context extends PluginContext,
  MethodsDef extends PluginMethodsDef | undefined,
> = (params: {
  queue: AsyncQueue<{
    event: PluginEvent<EventsDef, "output">;
    context: Readonly<Context>;
  }>;
  agent: Agent;
  config: PluginConfig<ConfigDef, "output">;
  methods: PluginMethods<MethodsDef>;
  dependencies: PluginDependencies<DependenciesDef>;
  emit: EmitFunction<EventsDef>;
}) => void | Promise<void>;

// - Interceptors
export type PluginInterceptorFunction<
  DependenciesDef extends PluginDependenciesDefinition,
  ConfigDef extends PluginConfigDefinition,
> = (params: {
  dependencyName: keyof DependenciesDef;
  event: PluginEvent<DependenciesDef[keyof DependenciesDef]["events"], "output">;
  config: PluginConfig<ConfigDef, "output">;
  drop: (reason: string) => void;
  next: (event: PluginEvent<DependenciesDef[keyof DependenciesDef]["events"], "output">) => void;
  emit: EmitFunction<DependenciesDef[keyof DependenciesDef]["events"]>;
}) => void | Promise<void>;

// - Definition
export interface PluginDefinition {
  readonly name: string;
  dependencies: PluginDependenciesDefinition;
  config: PluginConfigDefinition;
  context: PluginContext;
  events: PluginEventsDefinition;
  methods: PluginMethodsDef;
  lifecycle: PluginLifecycle<PluginConfigDefinition, PluginContext>;
  effects: Record<
    string,
    PluginEffectFunction<
      PluginDependenciesDefinition,
      PluginEventsDefinition,
      PluginConfigDefinition,
      PluginContext,
      PluginMethodsDef | undefined
    >
  >;
  services: Record<
    string,
    PluginServiceFunction<
      PluginDependenciesDefinition,
      PluginEventsDefinition,
      PluginConfigDefinition,
      PluginContext,
      PluginMethodsDef | undefined
    >
  >;
  interceptors: Record<
    string,
    PluginInterceptorFunction<PluginDependenciesDefinition, PluginConfigDefinition>
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

  dependencies<const NewDependencies extends PluginDependenciesDefinition>(
    dependencies: NewDependencies,
  ) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      dependencies: dependencies,
    }) as PluginDefinitionBuilder<
      Definition & { dependencies: NewDependencies },
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

  context<ContextDef extends PluginContext>(context: ContextDef) {
    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      context,
    }) as PluginDefinitionBuilder<
      Definition & { context: ContextDef },
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

  methods<
    // biome-ignore lint/suspicious/noExplicitAny: Generic constraint requires any for flexible function type inference
    const Schemas extends Record<string, AnyZodFunction>,
  >(
    schemasAndImplementations: {
      [K in keyof Schemas]: {
        schema: Schemas[K];
        run: Schemas[K] extends z.ZodFunction<infer TArgs, infer TReturns>
          ? (
              params: {
                agent: Agent;
                config: PluginConfig<Definition["config"], "output">;
                context: Readonly<Definition["context"]>;
                emit: EmitFunction<Definition["events"]>;
              },
              ...args: z.infer<TArgs> extends readonly unknown[] ? z.infer<TArgs> : never
            ) => z.infer<TReturns> | Promise<z.infer<TReturns>>
          : never;
      };
    },
  ) {
    // Keep the original format and let the builder handle the conversion
    const methodsWithSchemas = schemasAndImplementations;

    const plugin = new PluginDefinitionBuilder({
      ...this._definition,
      // Store the full method definitions including schemas
      methods: methodsWithSchemas,
    }) as PluginDefinitionBuilder<
      Definition & { methods: typeof methodsWithSchemas },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
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
      Definition["methods"]
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
    const { [name]: removed, ...remainingEffects } = this._definition.effects ?? {};
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
      Definition["methods"]
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
    const { [name]: removed, ...remainingServices } = this._definition.services ?? {};
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
    interceptor: PluginInterceptorFunction<Definition["dependencies"], Definition["config"]>,
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
    const { [name]: removed, ...remainingInterceptors } = this._definition.interceptors ?? {};
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
}

export function definePlugin<const Name extends string>(name: Name) {
  return new PluginDefinitionBuilder({
    name: name,
    dependencies: {},
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

// Test the new method definition pattern
const _testPlugin = definePlugin("test")
  .events({
    test: { dataSchema: z.object({ data: z.string() }) },
  })
  .methods({
    sayHello: {
      schema: z.function().args(z.string()).returns(z.string()),
      run: ({ emit }, name) => {
        // TypeScript should know that 'name' is string
        emit({ type: "test", data: { data: name } });
        return `Hello ${name}`;
      },
    },
    calculate: {
      schema: z.function().args(z.number(), z.number()).returns(z.number()),
      run: (_params, x, y) => {
        // TypeScript should know x and y are numbers
        return x + y;
      },
    },
    noArgs: {
      schema: z.function().args().returns(z.void()),
      run: ({ emit }) => {
        emit({ type: "test", data: { data: "no args" } });
      },
    },
  });
