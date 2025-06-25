import type { AsyncQueue } from "@/shared/async-queue";
import { z } from "zod";
import type { Agent } from "../agent/agent";

/** 
@dev Because this plugin builder uses a lot of union and nested types, it might be a little bit slow with 
Intellisense. If in the future that became an issue, A simple solution could be to lose some typesafety 
depth by replacing many nested types with 'any' (not the top-level ones though, so preserving the same 
typesafe experience).
*/

// - Queue
export type Queue = {
  contains: (event: string | string[]) => boolean;
  waitUntil: (eventId: string) => Promise<void>;
};

// - Dependencies
export type PluginDependency<
  Methods extends PluginMethods<
    PluginMethodsDef<
      PluginConfig<PluginConfigDef<z.AnyZodObject>>,
      PluginContext,
      PluginEvent<PluginEventsDef>
    >,
    PluginConfig<PluginConfigDef<z.AnyZodObject>>,
    PluginContext,
    PluginEvent<PluginEventsDef>
  >,
> = {
  _getDefinition(): { id: string; methods: Methods };
};
export type PluginDependencies<
  Dependencies extends PluginDependency<
    PluginMethods<
      PluginMethodsDef<
        PluginConfig<PluginConfigDef<z.AnyZodObject>>,
        PluginContext,
        PluginEvent<PluginEventsDef>
      >,
      PluginConfig<PluginConfigDef<z.AnyZodObject>>,
      PluginContext,
      PluginEvent<PluginEventsDef>
    >
  >[],
> = {
  [K in Dependencies[number] as ReturnType<K["_getDefinition"]>["id"]]: {
    methods: PluginMethods<
      ReturnType<K["_getDefinition"]>["methods"],
      PluginConfig<PluginConfigDef<z.AnyZodObject>>,
      PluginContext,
      PluginEvent<PluginEventsDef>
    >;
  };
};
// Helper type to extract dependency IDs safely
type ExtractDependencyIds<
  Dependencies extends PluginDependency<
    PluginMethods<
      PluginMethodsDef<
        PluginConfig<PluginConfigDef<z.AnyZodObject>>,
        PluginContext,
        PluginEvent<PluginEventsDef>
      >,
      PluginConfig<PluginConfigDef<z.AnyZodObject>>,
      PluginContext,
      PluginEvent<PluginEventsDef>
    >
  >[],
> = Dependencies extends readonly []
  ? []
  : {
      [K in keyof Dependencies]: Dependencies[K] extends PluginDependency<
        PluginMethods<
          PluginMethodsDef<
            PluginConfig<PluginConfigDef<z.AnyZodObject>>,
            PluginContext,
            PluginEvent<PluginEventsDef>
          >,
          PluginConfig<PluginConfigDef<z.AnyZodObject>>,
          PluginContext,
          PluginEvent<PluginEventsDef>
        >
      >
        ? ReturnType<Dependencies[K]["_getDefinition"]>["id"]
        : never;
    };

// - Config
export type PluginConfigDef<Schema extends z.AnyZodObject> = {
  schema: Schema;
  default: z.infer<Schema>;
};
export type PluginConfig<ConfigDef extends PluginConfigDef<z.AnyZodObject>> = Readonly<
  z.infer<ConfigDef["schema"]> & ConfigDef["default"]
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
export type PluginEvent<EventsDef extends PluginEventsDef> = {
  [K in keyof EventsDef]: {
    type: K extends string ? K : never;
    urgent?: boolean;
  } & (EventsDef[K]["dataSchema"] extends PluginEventDataSchema
    ? { data: z.infer<EventsDef[K]["dataSchema"]> }
    : // biome-ignore lint/complexity/noBannedTypes: <explanation>
      {});
}[keyof EventsDef];

// - Methods
export type PluginMethodsDef<
  Config extends PluginConfig<PluginConfigDef<z.AnyZodObject>>,
  Context extends PluginContext,
  Event extends PluginEvent<PluginEventsDef>,
> = Record<
  string,
  (
    params: {
      agent: Agent;
      config: Config;
      context: Readonly<Context>;
      emit: (event: Event) => void;
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
  MethodsConfigs extends PluginMethodsDef<Config, Context, Event>,
  Config extends PluginConfig<PluginConfigDef<z.AnyZodObject>>,
  Context extends PluginContext,
  Event extends PluginEvent<PluginEventsDef>,
> = {
  [K in keyof MethodsConfigs]: RemoveFirstParam<MethodsConfigs[K]>;
};

// - Lifecycle
export type PluginLifecycle<
  Config extends PluginConfig<PluginConfigDef<z.AnyZodObject>>,
  Context extends PluginContext,
> = {
  onStart?: (params: { config: Config; context: Context }) => void;
  onStop?: (params: { config: Config; context: Context }) => void;
  onError?: (params: { config: Config; context: Context }) => void;
};

// - Effects
export type PluginEffectFunction<
  Event extends PluginEvent<PluginEventsDef>,
  Config extends PluginConfig<PluginConfigDef<z.AnyZodObject>>,
  Context extends PluginContext,
  Methods extends PluginMethods<
    PluginMethodsDef<
      PluginConfig<PluginConfigDef<z.AnyZodObject>>,
      PluginContext,
      PluginEvent<PluginEventsDef>
    >,
    PluginConfig<PluginConfigDef<z.AnyZodObject>>,
    PluginContext,
    PluginEvent<PluginEventsDef>
  >,
  Dependencies extends PluginDependencies<
    PluginDependency<
      PluginMethods<
        PluginMethodsDef<
          PluginConfig<PluginConfigDef<z.AnyZodObject>>,
          PluginContext,
          PluginEvent<PluginEventsDef>
        >,
        PluginConfig<PluginConfigDef<z.AnyZodObject>>,
        PluginContext,
        PluginEvent<PluginEventsDef>
      >
    >[]
  >,
> = (params: {
  event: Event;
  agent: Agent;
  config: Config;
  context: Context;
  methods: Methods;
  dependencies: Dependencies;
  emit: (event: Event) => void;
  waitUntil: (test: (params: { context: Context }) => boolean) => Promise<void>;
}) => void | Promise<void>;

// - Services
export type PluginServiceFunction<
  Event extends PluginEvent<PluginEventsDef>,
  Config extends PluginConfig<PluginConfigDef<z.AnyZodObject>>,
  Context extends PluginContext,
  Methods extends PluginMethods<
    PluginMethodsDef<
      PluginConfig<PluginConfigDef<z.AnyZodObject>>,
      PluginContext,
      PluginEvent<PluginEventsDef>
    >,
    PluginConfig<PluginConfigDef<z.AnyZodObject>>,
    PluginContext,
    PluginEvent<PluginEventsDef>
  >,
  Dependencies extends PluginDependencies<
    PluginDependency<
      PluginMethods<
        PluginMethodsDef<
          PluginConfig<PluginConfigDef<z.AnyZodObject>>,
          PluginContext,
          PluginEvent<PluginEventsDef>
        >,
        PluginConfig<PluginConfigDef<z.AnyZodObject>>,
        PluginContext,
        PluginEvent<PluginEventsDef>
      >
    >[]
  >,
> = (params: {
  events: AsyncQueue<{
    event: Event;
    context: Readonly<Context>;
  }>;
  agent: Agent;
  config: Config;
  methods: Methods;
  dependencies: Dependencies;
  queue: Queue;
  emit: (event: Event) => void;
  waitUntil: (params: { context: Context }) => boolean;
}) => void | Promise<void>;

// - Interceptors
export type PluginInterceptorFunction<
  Event extends PluginEvent<PluginEventsDef>,
  Config extends PluginConfig<PluginConfigDef<z.AnyZodObject>>,
> = (params: {
  event: Event;
  config: Config;
  queue: Queue;
  drop: (reason: string) => void;
  next: (event: Event) => void;
  emit: (event: Event) => void;
}) => void | Promise<void>;
type RemoveInterceptorsPermissions<T extends Record<string, unknown>> = {
  [K in keyof T]: Omit<T[K], "interceptorsPermissions">;
};
export interface PluginInterceptorDependency {
  dependencyId: string;
  dependencyEvents: RemoveInterceptorsPermissions<PluginEventsDef>;
}

// - Definition
export interface PluginDef {
  readonly id: string;
  dependenciesIds: string[];
  config: PluginConfigDef<z.AnyZodObject>;
  context: PluginContext;
  events: PluginEventsDef;
  methods: PluginMethodsDef<
    PluginConfig<PluginConfigDef<z.AnyZodObject>>,
    PluginContext,
    PluginEvent<PluginEventsDef>
  >;
  lifecycle: PluginLifecycle<PluginConfig<PluginConfigDef<z.AnyZodObject>>, PluginContext>;
  effects: Record<
    string,
    PluginEffectFunction<
      PluginEvent<PluginEventsDef>,
      PluginConfig<PluginConfigDef<z.AnyZodObject>>,
      PluginContext,
      PluginMethodsDef<
        PluginConfig<PluginConfigDef<z.AnyZodObject>>,
        PluginContext,
        PluginEvent<PluginEventsDef>
      >,
      PluginDependencies<
        PluginDependency<
          PluginMethods<
            PluginMethodsDef<
              PluginConfig<PluginConfigDef<z.AnyZodObject>>,
              PluginContext,
              PluginEvent<PluginEventsDef>
            >,
            PluginConfig<PluginConfigDef<z.AnyZodObject>>,
            PluginContext,
            PluginEvent<PluginEventsDef>
          >
        >[]
      >
    >
  >;
  services: Record<
    string,
    PluginServiceFunction<
      PluginEvent<PluginEventsDef>,
      PluginConfig<PluginConfigDef<z.AnyZodObject>>,
      PluginContext,
      PluginMethodsDef<
        PluginConfig<PluginConfigDef<z.AnyZodObject>>,
        PluginContext,
        PluginEvent<PluginEventsDef>
      >,
      PluginDependencies<
        PluginDependency<
          PluginMethods<
            PluginMethodsDef<
              PluginConfig<PluginConfigDef<z.AnyZodObject>>,
              PluginContext,
              PluginEvent<PluginEventsDef>
            >,
            PluginConfig<PluginConfigDef<z.AnyZodObject>>,
            PluginContext,
            PluginEvent<PluginEventsDef>
          >
        >[]
      >
    >
  >;
  interceptors: Record<
    string,
    {
      dependencyId: string;
      interceptor: PluginInterceptorFunction<PluginEvent<PluginEventsDef>, PluginContext>;
    }
  >;
}

// - Plugin
export class Plugin<
  const Def extends PluginDef,
  EffectKeys extends string = never,
  ServiceKeys extends string = never,
  InterceptorKeys extends string = never,
  Dependencies extends PluginDependency<
    PluginMethods<
      PluginMethodsDef<
        PluginConfig<PluginConfigDef<z.AnyZodObject>>,
        PluginContext,
        PluginEvent<PluginEventsDef>
      >,
      PluginConfig<PluginConfigDef<z.AnyZodObject>>,
      PluginContext,
      PluginEvent<PluginEventsDef>
    >
  >[] = [],
  ExcludedMethods extends string = never,
> {
  #def: Def;

  constructor(def: Def) {
    this.#def = def;
  }

  dependencies<
    const NewDependencies extends PluginDependency<
      PluginMethods<
        PluginMethodsDef<
          PluginConfig<PluginConfigDef<z.AnyZodObject>>,
          PluginContext,
          PluginEvent<PluginEventsDef>
        >,
        PluginConfig<PluginConfigDef<z.AnyZodObject>>,
        PluginContext,
        PluginEvent<PluginEventsDef>
      >
    >[],
  >(dependencies: NewDependencies) {
    const plugin = new Plugin({
      ...this.#def,
      dependenciesIds: dependencies.map((d) => d._getDefinition().id),
    }) as Plugin<
      Def & {
        dependenciesIds: ExtractDependencyIds<NewDependencies>;
      },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      NewDependencies,
      ExcludedMethods | "dependencies"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "dependencies">;
  }

  config<const ConfigSchema extends z.AnyZodObject>(config: PluginConfigDef<ConfigSchema>) {
    const plugin = new Plugin({
      ...this.#def,
      config,
    }) as Plugin<
      Def & { config: PluginConfigDef<ConfigSchema> },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      Dependencies,
      ExcludedMethods | "config"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "config">;
  }

  context<ContextDef extends PluginContext>(context: ContextDef) {
    const plugin = new Plugin({
      ...this.#def,
      context,
    }) as Plugin<
      Def & { context: ContextDef },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      Dependencies,
      ExcludedMethods | "context"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "context">;
  }

  events<const EventsDef extends PluginEventsDef>(events: EventsDef) {
    const plugin = new Plugin({ ...this.#def, events }) as Plugin<
      Def & { events: EventsDef },
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
      PluginConfig<Def["config"]>,
      Def["context"],
      PluginEvent<Def["events"]>
    >,
  >(methods: MethodsDef) {
    const plugin = new Plugin({ ...this.#def, methods }) as Plugin<
      Def & { methods: MethodsDef },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      Dependencies,
      ExcludedMethods | "methods"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "methods">;
  }

  lifecycle<
    const LifecycleConfig extends PluginLifecycle<PluginConfig<Def["config"]>, Def["context"]>,
  >(lifecycle: LifecycleConfig) {
    const plugin = new Plugin({ ...this.#def, lifecycle }) as Plugin<
      Def & { lifecycle: LifecycleConfig },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      Dependencies,
      ExcludedMethods | "lifecycle"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "lifecycle">;
  }

  addEffect<const Id extends string>(
    id: Id,
    effect: PluginEffectFunction<
      PluginEvent<Def["events"]>,
      PluginConfig<Def["config"]>,
      Def["context"],
      PluginMethods<
        Def["methods"],
        PluginConfig<PluginConfigDef<z.AnyZodObject>>,
        PluginContext,
        PluginEvent<PluginEventsDef>
      >,
      PluginDependencies<Dependencies>
    >,
  ) {
    const plugin = new Plugin({
      ...this.#def,
      effects: { ...(this.#def.effects ?? {}), [id]: effect },
    }) as Plugin<Def, EffectKeys | Id, ServiceKeys, InterceptorKeys, Dependencies, ExcludedMethods>;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  removeEffect<const Id extends EffectKeys>(id: Id) {
    const { [id]: removed, ...remainingEffects } = this.#def.effects ?? {};
    const plugin = new Plugin({
      ...this.#def,
      effects: remainingEffects,
    }) as Plugin<
      Def,
      Exclude<EffectKeys, Id>,
      ServiceKeys,
      InterceptorKeys,
      Dependencies,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  addService<const Id extends string>(
    id: Id,
    service: PluginServiceFunction<
      PluginEvent<Def["events"]>,
      PluginConfig<Def["config"]>,
      Def["context"],
      PluginMethods<
        Def["methods"],
        PluginConfig<PluginConfigDef<z.AnyZodObject>>,
        PluginContext,
        PluginEvent<PluginEventsDef>
      >,
      PluginDependencies<Dependencies>
    >,
  ) {
    const plugin = new Plugin({
      ...this.#def,
      services: { ...(this.#def.services ?? {}), [id]: service },
    }) as Plugin<Def, EffectKeys, ServiceKeys | Id, InterceptorKeys, Dependencies, ExcludedMethods>;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  removeService<const Id extends ServiceKeys>(id: Id) {
    const { [id]: removed, ...remainingServices } = this.#def.services ?? {};
    const plugin = new Plugin({
      ...this.#def,
      services: remainingServices,
    }) as Plugin<
      Def,
      EffectKeys,
      Exclude<ServiceKeys, Id>,
      InterceptorKeys,
      Dependencies,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  addInterceptor<const Id extends string, const Dependency extends PluginInterceptorDependency>(
    id: Id,
    dependency: Dependency,
    interceptor: PluginInterceptorFunction<
      PluginEvent<Dependency["dependencyEvents"]>,
      PluginConfig<Def["config"]>
    >,
  ) {
    const plugin = new Plugin({
      ...this.#def,
      interceptors: {
        ...(this.#def.interceptors ?? {}),
        [id]: { ...dependency, interceptor },
      },
    }) as Plugin<Def, EffectKeys, ServiceKeys, InterceptorKeys | Id, Dependencies, ExcludedMethods>;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  removeInterceptor<const Id extends InterceptorKeys>(id: Id) {
    const { [id]: removed, ...remainingInterceptors } = this.#def.interceptors ?? {};
    const plugin = new Plugin({
      ...this.#def,
      interceptors: remainingInterceptors,
    }) as Plugin<
      Def,
      EffectKeys,
      ServiceKeys,
      Exclude<InterceptorKeys, Id>,
      Dependencies,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  _getDefinition() {
    return this.#def;
  }
}

export function definePlugin<const Id extends string>(id: Id) {
  return new Plugin({
    id,
    dependenciesIds: [],
    config: { schema: z.object({}), default: {} },
    context: {},
    events: {},
    methods: {},
    lifecycle: {},
    effects: {},
    interceptors: {},
    services: {},
  });
}

// // /* ---------- usage ---------- */

const afirstPlugin = definePlugin("afirst-plugin")
  .context({
    count: 0,
  })
  .config({
    schema: z.object({
      name: z.string(),
    }),
    default: {
      name: "sd",
    },
  })
  .events({
    event1: {
      dataSchema: z.object({ name: z.string() }),
    },
  })
  .methods({
    myMethod: ({ context, config, emit }, message: string) => {},
  })
  .addEffect("test", ({ event }) => {
    if (event.type !== "event1") return;
    event.data?.name;
  });

const myPlugin2 = definePlugin("my-plugin")
  .dependencies([afirstPlugin]) // the problem is that plugin def type exported by getdef mismatches
  .addEffect("test", ({ dependencies, methods }) => {
    dependencies["afirst-plugin"].methods.myMethod("hello");
  })
  .config({
    schema: z.object({
      name: z.string(),
    }),
    default: {
      name: "sd",
    },
  })
  .methods({
    myMethod: ({ context }, message: string) => {
      console.log(message);
      // context.count
      // context.count++;
    },
  })
  .addEffect("test", ({ dependencies, methods }) => {
    // dependencies["afirst-plugin"].methods.myMethod("hello");
    methods.myMethod("hello");
    // Test dependencies access
  })

  .addInterceptor(
    "my-plugin-effect1",
    {
      dependencyId: "afirst-plugin",
      dependencyEvents: {
        event1: {
          dataSchema: z.object({ name: z.string() }),
        },
      },
    },
    ({ event }) => {
      if (event.type !== "event1") return;
      event.data?.name;
    },
  )
  .addEffect("my-plugin-effect1", () => {});

// const anotherPlugin = myPlugin2.removeInterceptor("my-plugin-effect1");

const myPlugin =
  // TMP

  definePlugin("my-plugin")
    .config({
      schema: z.object({
        name: z.string(),
      }),
      default: {
        name: "sd",
      },
    })
    .context({
      count: 0,
    })

    .events({
      event1: {
        dataSchema: z.object({ name: z.string() }),
      },
      event2: {
        dataSchema: z.object({ name: z.string() }),
      },
      event3: {
        dataSchema: z.object({ name: z.string() }),
      },
    })
    .methods({
      myMethod: ({ context }, message: string) => {
        console.log(message);
        // context.count
        // context.count++;
      },
    })
    .lifecycle({
      onStart: ({ context }) => {
        context.count = 0;
      },
      onStop: ({ context }) => {
        context.count = 0;
      },
      onError: ({ context }) => {
        context.count = 0;
      },
    })
    // Sync logic / on internal event only
    .addEffect("my-plugin-effect1", ({ event, context, methods, config }) => {
      if (event.type !== "event1") return;
      config.name;
      context.count++;
      methods.myMethod("Hello");
    })
    // Async logic on internal event only
    .addService("my-plugin-service1", async ({ events }) => {
      for await (const { event, context } of events) {
        event.type === "event1";
        // console.log(event);
      }
    })
    // Intercept other plugins events, and modify/drop them, or just for observability
    // This code is running on the other plugin event loop, but has access to emit and context of the current plugin
    .addInterceptor(
      "my-plugin-interceptor1",
      {
        dependencyId: "afirst-plugin",
        dependencyEvents: {
          event1: {
            dataSchema: z.object({ name: z.string() }),
          },
        },
      },
      ({ event }) => {
        if (event.type !== "event1") return;
        // drop("Not allowed");
        // next(event);
        // modify();
      },
    )
    .addInterceptor(
      "my-plugin-interceptor1",
      {
        dependencyId: "afirst-plugin",
        dependencyEvents: {
          event1: {
            dataSchema: z.object({ name: z.string() }),
          },
        },
      },
      ({ event }) => {
        if (event.type !== "event1") return;
        // drop("Not allowed");
        // next(event);
        // modify();
      },
    )
    .addInterceptor(
      "my-plugin-interceptor1",
      {
        dependencyId: "afirst-plugin",
        dependencyEvents: {
          event1: {
            dataSchema: z.object({ name: z.string() }),
          },
        },
      },
      ({ event }) => {
        if (event.type !== "event1") return;
        // drop("Not allowed");
        // next(event);
        // modify();
      },
    )
    .addInterceptor(
      "my-plugin-interceptor1",
      {
        dependencyId: "afirst-plugin",
        dependencyEvents: {
          event1: {
            dataSchema: z.object({ name: z.string() }),
          },
        },
      },
      ({ event }) => {
        if (event.type !== "event1") return;
        // drop("Not allowed");
        // next(event);
        // modify();
      },
    )
    .addInterceptor(
      "my-plugin-interceptor1",
      {
        dependencyId: "afirst-plugin",
        dependencyEvents: {
          event1: {
            dataSchema: z.object({ name: z.string() }),
          },
        },
      },
      ({ event }) => {
        if (event.type !== "event1") return;
        // drop("Not allowed");
        // next(event);
        // modify();
      },
    )
    .addInterceptor(
      "my-plugin-interceptor1",
      {
        dependencyId: "afirst-plugin",
        dependencyEvents: {
          event1: {
            dataSchema: z.object({ name: z.string() }),
          },
        },
      },
      ({ event }) => {
        if (event.type !== "event1") return;
        // drop("Not allowed");
        // next(event);
        // modify();
      },
    )
    .addInterceptor(
      "my-plugin-interceptor1",
      {
        dependencyId: "afirst-plugin",
        dependencyEvents: {
          event1: {
            dataSchema: z.object({ name: z.string() }),
          },
        },
      },
      ({ event }) => {
        if (event.type !== "event1") return;
        // drop("Not allowed");
        // next(event);
        // modify();
      },
    )
    .addInterceptor(
      "my-plugin-interceptor1",
      {
        dependencyId: "afirst-plugin",
        dependencyEvents: {
          event1: {
            dataSchema: z.object({ name: z.string() }),
          },
        },
      },
      ({ event }) => {
        if (event.type !== "event1") return;
        // drop("Not allowed");
        // next(event);
        // modify();
      },
    )
    .addInterceptor(
      "my-plugin-interceptor1",
      {
        dependencyId: "afirst-plugin",
        dependencyEvents: {
          event1: {
            dataSchema: z.object({ name: z.string() }),
          },
        },
      },
      ({ event }) => {
        if (event.type !== "event1") return;
        // drop("Not allowed");
        // next(event);
        // modify();
      },
    )
    .addInterceptor(
      "my-plugin-interceptor1",
      {
        dependencyId: "afirst-plugin",
        dependencyEvents: {
          event1: {
            dataSchema: z.object({ name: z.string() }),
          },
        },
      },
      ({ event }) => {
        if (event.type !== "event1") return;
        // drop("Not allowed");
        // next(event);
        // modify();
      },
    )
    .addInterceptor(
      "my-plugin-interceptor1",
      {
        dependencyId: "afirst-plugin",
        dependencyEvents: {
          event1: {
            dataSchema: z.object({ name: z.string() }),
          },
        },
      },
      ({ event }) => {
        if (event.type !== "event1") return;
        // drop("Not allowed");
        // next(event);
        // modify();
      },
    )
    .addInterceptor(
      "my-plugin-interceptor1",
      {
        dependencyId: "afirst-plugin",
        dependencyEvents: {
          event1: {
            dataSchema: z.object({ name: z.string() }),
          },
        },
      },
      ({ event }) => {
        if (event.type !== "event1") return;
        // drop("Not allowed");
        // next(event);
        // modify();
      },
    )
    .addService("my-plugin-service1", async ({ events }) => {
      for await (const { event, context } of events) {
        event.type === "event1";
        // console.log(event);
      }
    })
    .addService("my-plugin-service1", async ({ events }) => {
      for await (const { event, context } of events) {
        event.type === "event1";
        // console.log(event);
      }
    })
    .addService("my-plugin-service1", async ({ events }) => {
      for await (const { event, context } of events) {
        event.type === "event1";
        // console.log(event);
      }
    })
    .addService("my-plugin-service1", async ({ events }) => {
      for await (const { event, context } of events) {
        event.type === "event1";
        // console.log(event);
      }
    })
    .addService("my-plugin-service1", async ({ events }) => {
      for await (const { event, context } of events) {
        event.type === "event2";
        // console.log(event);
      }
    });
