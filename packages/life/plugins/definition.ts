import { z } from "zod";
import type { Agent } from "@/agent/agent";
import type { AsyncQueue } from "@/shared/async-queue";

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
  config?: PluginConfigDefinition;
  context?: PluginContextDefinition;
};
export type PluginDependenciesDefinition = Record<string, PluginDependencyDefinition>;
export type PluginDependencies<Defs extends PluginDependenciesDefinition> = {
  [K in keyof Defs]: {
    events: Defs[K]["events"];
    methods: {
      [M in keyof Defs[K]["methods"]]: z.infer<Defs[K]["methods"][M]>;
    };
    config: Defs[K]["config"] extends PluginConfigDefinition
      ? PluginConfig<Defs[K]["config"], "output">
      : never;
    context: Defs[K]["context"] extends PluginContextDefinition
      ? Readonly<PluginContext<Defs[K]["context"], "output">>
      : never;
    emit: EmitFunction<Defs[K]["events"]>;
  };
};

// - Config
export type PluginConfigDefinition = z.AnyZodObject;
export type PluginConfig<
  Def extends PluginConfigDefinition,
  T extends "input" | "output",
> = Readonly<T extends "input" ? z.input<Def> : z.output<Def>>;

// - Context
export type PluginContextDefinition = z.AnyZodObject;
export type PluginContext<
  Def extends PluginContextDefinition,
  T extends "input" | "output",
> = T extends "input" ? z.input<Def> : z.output<Def>;

// Context API types
export type ReadonlyPluginContext<T> = Readonly<T> & {
  onChange<R>(
    selector: (context: T) => R,
    callback: (newValue: R, oldValue: R) => void,
  ): () => void; // Returns unsubscribe function
};

export type WritablePluginContext<T> = ReadonlyPluginContext<T> & {
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
  ContextDef extends PluginContextDefinition,
> = {
  onStart?: (params: {
    config: PluginConfig<ConfigDef, "output">;
    context: WritablePluginContext<PluginContext<ContextDef, "output">>;
  }) => void | Promise<void>;
  onStop?: (params: {
    config: PluginConfig<ConfigDef, "output">;
    context: WritablePluginContext<PluginContext<ContextDef, "output">>;
  }) => void | Promise<void>;
  onError?: (params: {
    config: PluginConfig<ConfigDef, "output">;
    context: WritablePluginContext<PluginContext<ContextDef, "output">>;
    error: unknown;
  }) => void | Promise<void>;
};

// - Effects
export type PluginEffectFunction<
  DependenciesDef extends PluginDependenciesDefinition,
  EventsDef extends PluginEventsDefinition,
  ConfigDef extends PluginConfigDefinition,
  ContextDef extends PluginContextDefinition,
  MethodsDef extends PluginMethodsDef | undefined,
> = (params: {
  event: PluginEvent<EventsDef, "output">;
  agent: Agent;
  config: PluginConfig<ConfigDef, "output">;
  context: WritablePluginContext<PluginContext<ContextDef, "output">>;
  methods: PluginMethods<MethodsDef>;
  dependencies: PluginDependencies<DependenciesDef>;
  emit: EmitFunction<EventsDef>;
}) => void | Promise<void>;

// - Services
export type PluginServiceFunction<
  DependenciesDef extends PluginDependenciesDefinition,
  EventsDef extends PluginEventsDefinition,
  ConfigDef extends PluginConfigDefinition,
  ContextDef extends PluginContextDefinition,
  MethodsDef extends PluginMethodsDef | undefined,
> = (params: {
  queue: AsyncQueue<PluginEvent<EventsDef, "output">>;
  agent: Agent;
  config: PluginConfig<ConfigDef, "output">;
  context: ReadonlyPluginContext<PluginContext<ContextDef, "output">>;
  methods: PluginMethods<MethodsDef>;
  dependencies: PluginDependencies<DependenciesDef>;
  emit: EmitFunction<EventsDef>;
}) => void | Promise<void>;

// - Interceptors
export type PluginInterceptorFunction<
  DependenciesDef extends PluginDependenciesDefinition,
  EventsDef extends PluginEventsDefinition,
  ConfigDef extends PluginConfigDefinition,
  ContextDef extends PluginContextDefinition,
> = (params: {
  dependencyName: keyof DependenciesDef;
  event: PluginEvent<DependenciesDef[keyof DependenciesDef]["events"], "output">;
  config: PluginConfig<ConfigDef, "output">;
  context: ReadonlyPluginContext<PluginContext<ContextDef, "output">>;
  emit: EmitFunction<EventsDef>;
  drop: (reason: string) => void;
  next: (event: PluginEvent<DependenciesDef[keyof DependenciesDef]["events"], "output">) => void;
}) => void | Promise<void>;

// - Definition
export interface PluginDefinition {
  readonly name: string;
  dependencies: PluginDependenciesDefinition;
  config: PluginConfigDefinition;
  context: PluginContextDefinition;
  events: PluginEventsDefinition;
  methods: PluginMethodsDef;
  lifecycle: PluginLifecycle<PluginConfigDefinition, PluginContextDefinition>;
  effects: Record<
    string,
    PluginEffectFunction<
      PluginDependenciesDefinition,
      PluginEventsDefinition,
      PluginConfigDefinition,
      PluginContextDefinition,
      PluginMethodsDef | undefined
    >
  >;
  services: Record<
    string,
    PluginServiceFunction<
      PluginDependenciesDefinition,
      PluginEventsDefinition,
      PluginConfigDefinition,
      PluginContextDefinition,
      PluginMethodsDef | undefined
    >
  >;
  interceptors: Record<
    string,
    PluginInterceptorFunction<
      PluginDependenciesDefinition,
      PluginEventsDefinition,
      PluginConfigDefinition,
      PluginContextDefinition
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

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  dependencies<const Plugins extends PluginDefinitionBuilder<any, any, any, any, any>[]>(
    plugins: Plugins,
  ) {
    // Convert array of plugin builders to dependencies definition
    const dependencies: PluginDependenciesDefinition = {};

    for (const plugin of plugins) {
      const def = plugin._definition;
      const name = def.name;

      // Extract methods with their schemas
      const methods: Record<string, AnyZodFunction> = {};
      if (def.methods) {
        for (const [methodName, methodDef] of Object.entries(def.methods)) {
          if (methodDef && typeof methodDef === "object" && "schema" in methodDef) {
            methods[methodName] = methodDef.schema as AnyZodFunction;
          }
        }
      }

      dependencies[name] = {
        events: def.events || {},
        methods,
        config: def.config,
        context: def.context || {},
      };
    }

    // Type to extract dependency definition from array of plugins
    type ExtractedDependencies = {
      [K in Plugins[number] as K["_definition"]["name"]]: {
        events: K["_definition"]["events"];
        methods: K["_definition"]["methods"] extends PluginMethodsDef
          ? {
              [M in keyof K["_definition"]["methods"]]: K["_definition"]["methods"][M]["schema"];
            }
          : Record<string, never>;
        config: K["_definition"]["config"];
        context: K["_definition"]["context"];
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

  context<ContextDef extends PluginContextDefinition>(context: ContextDef) {
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
                context: Readonly<PluginContext<Definition["context"], "output">>;
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
      Definition["context"]
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
      methods?: Array<keyof Definition["methods"]>;
      context?: Array<keyof Definition["context"]>;
      config?: boolean;
    },
  >(options: Options) {
    // Helper to pick specific keys from an object
    const pickKeys = <T extends Record<string, unknown>>(
      obj: T,
      keys: Array<keyof T> | undefined,
    ): T => {
      if (!keys) return obj;
      const result = {} as T;
      for (const key of keys) {
        if (key in obj) result[key] = obj[key];
      }
      return result;
    };

    // Helper to pick specific keys from a Zod object schema
    const pickZodSchema = (schema: z.AnyZodObject, keys: string[] | undefined): z.AnyZodObject => {
      if (!keys || keys.length === 0) return schema;
      // Use Zod's native pick method
      const pickObj: Record<string, true> = {};
      for (const key of keys) pickObj[key] = true;
      return schema.pick(pickObj);
    };

    // Build the picked definition
    const pickedDefinition: PluginDefinition = {
      name: this._definition.name,
      dependencies: {}, // Dependencies are not picked
      config: options.config ? this._definition.config : z.object({}),
      context: options.context
        ? pickZodSchema(this._definition.context, options.context as string[])
        : this._definition.context,
      events: options.events
        ? pickKeys(this._definition.events, options.events as string[])
        : this._definition.events,
      methods: options.methods
        ? pickKeys(this._definition.methods as PluginMethodsDef, options.methods as string[])
        : (this._definition.methods ?? {}),
      lifecycle: {}, // Lifecycle is not picked
      effects: {}, // Effects are not picked
      services: {}, // Services are not picked
      interceptors: {}, // Interceptors are not picked
    };

    // Type for the picked definition
    type PickedDefinition = Definition & {
      name: Definition["name"];
      dependencies: PluginDependenciesDefinition;
      config: Options["config"] extends true
        ? Definition["config"]
        : z.ZodObject<Record<string, never>>;
      context: Options["context"] extends Array<infer K>
        ? K extends keyof Definition["context"]
          ? Pick<Definition["context"], K>
          : Definition["context"]
        : Definition["context"];
      events: Options["events"] extends Array<infer K>
        ? K extends keyof Definition["events"]
          ? Pick<Definition["events"], K>
          : Definition["events"]
        : Definition["events"];
      methods: Options["methods"] extends Array<infer K>
        ? K extends keyof Definition["methods"]
          ? Pick<Definition["methods"], K>
          : PluginMethodsDef
        : Definition["methods"];
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
    context: z.object({}),
    events: {},
    methods: {},
    lifecycle: {},
    effects: {},
    interceptors: {},
    services: {},
  });
}
