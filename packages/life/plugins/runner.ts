import type { Agent } from "@/agent/agent";
import type {
  EmitFunction,
  PluginConfig,
  PluginConfigDefinition,
  PluginContext,
  PluginContextDefinition,
  PluginDefinition,
  PluginDependencies,
  PluginDependenciesDefinition,
  PluginEvent,
  PluginEventsDefinition,
  PluginInterceptorFunction,
  ReadonlyPluginContext,
  WritablePluginContext,
} from "@/plugins/definition";
import { AsyncQueue } from "@/shared/async-queue";
import { klona } from "@/shared/klona";
import { newId } from "@/shared/prefixed-id";
import { equal } from "@/shared/stable-equal";
import type { SerializableValue } from "@/shared/stable-serialize";

type PluginExternalInterceptor<TDefinition extends PluginDefinition = PluginDefinition> = {
  runner: PluginRunner<TDefinition>;
  interceptor: PluginInterceptorFunction<
    PluginDependenciesDefinition,
    PluginEventsDefinition,
    PluginConfigDefinition,
    PluginContextDefinition
  >;
};

// - Runner
export class PluginRunner<const Definition extends PluginDefinition> {
  #agent: Agent;
  #definition: Definition;
  #config: PluginConfig<Definition["config"], "output">;
  #context: PluginContext<Definition["context"], "output">;
  #contextListeners = new Set<{
    selector: (context: PluginContext<Definition["context"], "output">) => SerializableValue;
    callback: (newValue: SerializableValue, oldValue: SerializableValue) => void;
    lastValue: SerializableValue;
  }>();
  #externalInterceptors: PluginExternalInterceptor<PluginDefinition>[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: we don't know the methods args types
  #finalMethods: Record<string, (...args: any[]) => unknown | Promise<unknown>> = {};
  #queue: AsyncQueue<PluginEvent<PluginEventsDefinition, "output">> = new AsyncQueue<
    PluginEvent<PluginEventsDefinition, "output">
  >();
  #servicesQueues: AsyncQueue<PluginEvent<PluginEventsDefinition, "output">>[] = [];

  constructor(agent: Agent, def: Definition, config: PluginConfig<Definition["config"], "output">) {
    this.#agent = agent;
    this.#definition = def;
    this.#config = config;
    this.#context = def.context.parse({});

    for (const [methodName, methodDef] of Object.entries(this.#definition.methods ?? {})) {
      const method = methodDef.run.bind(this, {
        agent: this.#agent,
        config: this.#config,
        context: this.#createReadonlyContext(),
        emit: this.emit.bind(this) as EmitFunction,
      });
      this.#finalMethods[methodName] = method;
    }

    Object.assign(this, this.#finalMethods);
  }

  get methods() {
    return this.#finalMethods;
  }

  // Create read-only context with onChange (always returns fresh values)
  #createReadonlyContext(): ReadonlyPluginContext<PluginContext<Definition["context"], "output">> {
    const runner = this;
    return new Proxy({} as ReadonlyPluginContext<PluginContext<Definition["context"], "output">>, {
      get(_, prop) {
        if (prop === "onChange") return runner.#onContextChange.bind(runner);
        // Always return fresh value from current context
        return runner.#context[prop as keyof PluginContext<Definition["context"], "output">];
      },
      set() {
        throw new Error("Context is read-only. Use set() method in effects to modify context.");
      },
    });
  }

  // Create writable context for effects
  #createWritableContext(): WritablePluginContext<PluginContext<Definition["context"], "output">> {
    const runner = this;
    return new Proxy({} as WritablePluginContext<PluginContext<Definition["context"], "output">>, {
      get(_, prop) {
        if (prop === "onChange") return runner.#onContextChange.bind(runner);
        if (prop === "set") return runner.#setContext.bind(runner);
        return runner.#context[prop as keyof PluginContext<Definition["context"], "output">];
      },
      set() {
        throw new Error("Direct assignment not allowed. Use set() method to modify context.");
      },
    });
  }

  // Context setter
  #setContext<K extends keyof PluginContext<Definition["context"], "output">>(
    key: K,
    valueOrUpdater:
      | PluginContext<Definition["context"], "output">[K]
      | ((
          prev: PluginContext<Definition["context"], "output">[K],
        ) => PluginContext<Definition["context"], "output">[K]),
  ): void {
    const oldValue = klona(this.#context);
    const newKeyValue =
      typeof valueOrUpdater === "function"
        ? (
            valueOrUpdater as (
              prev: PluginContext<Definition["context"], "output">[K],
            ) => PluginContext<Definition["context"], "output">[K]
          )(this.#context[key])
        : valueOrUpdater;

    this.#context[key] = klona(newKeyValue);

    // Notify listeners
    this.#notifyContextListeners(oldValue);
  }

  // Subscribe to context changes
  #onContextChange<R extends SerializableValue>(
    selector: (context: PluginContext<Definition["context"], "output">) => R,
    callback: (newValue: R, oldValue: R) => void,
  ): () => void {
    const listener = {
      selector,
      callback: callback as (newValue: SerializableValue, oldValue: SerializableValue) => void,
      lastValue: selector(this.#context),
    };

    this.#contextListeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.#contextListeners.delete(listener);
    };
  }

  // Notify all listeners
  #notifyContextListeners(oldContext: PluginContext<Definition["context"], "output">): void {
    for (const listener of this.#contextListeners) {
      const newSelectedValue = listener.selector(this.#context);
      const oldSelectedValue = listener.selector(oldContext);

      // Only call if value actually changed
      if (!equal(newSelectedValue, oldSelectedValue)) {
        listener.callback(newSelectedValue, oldSelectedValue);
        listener.lastValue = newSelectedValue;
      }
    }
  }

  // Helper method to call onError lifecycle hook
  async #callOnErrorHook(error: unknown): Promise<void> {
    if (this.#definition.lifecycle?.onError) {
      try {
        await this.#definition.lifecycle.onError({
          config: this.#config,
          context: this.#createWritableContext(),
          error,
        });
      } catch (errorHandlerError) {
        console.error(
          `Error in onError lifecycle hook for plugin ${this.#definition.name}:`,
          errorHandlerError,
        );
      }
    }
  }

  #buildDependencies() {
    const dependencies: Record<string, unknown> = {};

    for (const [depName, depDef] of Object.entries(this.#definition.dependencies ?? {})) {
      const depRunner = this.#agent.plugins[depName];
      if (!depRunner) continue;

      dependencies[depName] = {
        events: depDef.events,
        methods: depRunner.methods,
        config: depRunner.#config,
        context: depRunner.#createReadonlyContext(),
        emit: depRunner.emit.bind(depRunner),
      };
    }

    return dependencies as PluginDependencies<Definition["dependencies"]>;
  }

  init() {
    // 1. Initialize services
    const dependencies = this.#buildDependencies();

    for (const service of Object.values(this.#definition.services ?? {}) ?? []) {
      const queue = new AsyncQueue<PluginEvent<PluginEventsDefinition, "output">>();
      this.#servicesQueues.push(queue);

      // Create a single readonly context that always returns fresh values
      const readonlyContext = this.#createReadonlyContext();

      service({
        agent: this.#agent,
        queue: queue[Symbol.asyncIterator](),
        config: this.#config,
        context: readonlyContext,
        methods: this.#finalMethods,
        emit: this.emit.bind(this) as EmitFunction,
        dependencies,
      });
    }

    // 2. Register interceptors with dependencies
    for (const interceptor of Object.values(this.#definition.interceptors ?? {})) {
      // Register this interceptor with each dependency it intercepts
      for (const depName of Object.keys(this.#definition.dependencies ?? {})) {
        const dependentRunner = this.#agent.plugins[depName];
        if (dependentRunner) {
          dependentRunner.registerExternalInterceptor({
            runner: this as unknown as PluginRunner<PluginDefinition>,
            interceptor,
          });
        }
      }
    }
  }

  emit(event: PluginEvent<Definition["events"], "input">) {
    // Ensure the event type exists
    const eventDefinition = this.#definition?.events?.[event.type];
    if (!eventDefinition) throw new Error(`Event of type '${event.type}' not found.`);

    // Validate the event data
    if ("data" in event && eventDefinition.dataSchema) {
      const validation = eventDefinition.dataSchema?.safeParse(event.data);
      if (!validation.success)
        throw new Error(`Event '${event.type}' data is invalid: ${validation.error.message}.`);
    } else if ("data" in event) {
      throw new Error(`Event '${event.type}' provided unexpected data.`);
    }

    // Generate an id for the event
    const id = newId("event");
    const outputEvent = { id, ...event };

    // Append to queue
    if (event.urgent) this.#queue.pushFirst(outputEvent);
    else this.#queue.push(outputEvent);

    // Return the id
    return id;
  }

  async start() {
    // Run start lifecycle hook
    if (this.#definition.lifecycle?.onStart) {
      try {
        await this.#definition.lifecycle.onStart({
          config: this.#config,
          context: this.#createWritableContext(),
        });
      } catch (error) {
        console.error(
          `Error in onStart lifecycle hook for plugin ${this.#definition.name}:`,
          error,
        );
        // Call onError hook if it exists
        await this.#callOnErrorHook(error);
        throw error;
      }
    }

    // Run the queue
    for await (let event of this.#queue) {
      try {
        if (
          event.type !== "user.audio-chunk" &&
          event.type !== "user.voice-chunk" &&
          event.type !== "agent.voice-chunk"
        )
          console.log("🐳", event);

        // 1. Run external interceptors
        let isDropped = false;
        for (const { interceptor, runner } of this.#externalInterceptors) {
          const drop = (_reason: string) => (isDropped = true);
          const next = (newEvent: PluginEvent<PluginEventsDefinition, "output">) => {
            event = newEvent;
          };
          // biome-ignore lint/nursery/noAwaitInLoop: sequential execution expected here
          await interceptor({
            config: runner.#config,
            context: runner.#createReadonlyContext(),
            emit: runner.emit.bind(runner),
            dependencyName: this.#definition.name,
            event,
            drop,
            next,
          });
          if (isDropped) break;
        }
        if (isDropped) continue;

        // 2. Run effects
        const dependencies = this.#buildDependencies();
        for (const effect of Object.values(this.#definition.effects ?? {})) {
          // biome-ignore lint/nursery/noAwaitInLoop: sequential execution expected here
          await effect({
            agent: this.#agent,
            event: klona(event),
            config: this.#config,
            context: this.#createWritableContext(),
            methods: this.#finalMethods,
            emit: this.emit.bind(this) as EmitFunction<Definition["events"]>,
            dependencies,
          });
        }

        // 2. Feed services' queues
        for (const queue of this.#servicesQueues) {
          queue.push(klona(event));
        }
      } catch (error) {
        console.error(`Error processing event in plugin ${this.#definition.name}:`, error);
        // Call onError hook if it exists
        await this.#callOnErrorHook(error);
      }
    }
  }

  registerExternalInterceptor(interceptor: PluginExternalInterceptor<PluginDefinition>) {
    this.#externalInterceptors.push(interceptor);
  }

  async stop() {
    // Run stop lifecycle hook
    if (this.#definition.lifecycle?.onStop) {
      try {
        await this.#definition.lifecycle.onStop({
          config: this.#config,
          context: this.#createWritableContext(),
        });
      } catch (error) {
        console.error(`Error in onStop lifecycle hook for plugin ${this.#definition.name}:`, error);
        // Call onError hook if it exists
        await this.#callOnErrorHook(error);
        throw error;
      }
    }
  }
}
