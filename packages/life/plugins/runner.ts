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
} from "@/plugins/definition";
import { AsyncQueue } from "@/shared/async-queue";
import { klona } from "@/shared/klona";
import { newId } from "@/shared/prefixed-id";

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
  #externalInterceptors: PluginExternalInterceptor<PluginDefinition>[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  #finalMethods: Record<string, (...args: any[]) => unknown | Promise<unknown>> = {};
  #queue: AsyncQueue<PluginEvent<PluginEventsDefinition, "output">> = new AsyncQueue<
    PluginEvent<PluginEventsDefinition, "output">
  >();
  #servicesQueues: AsyncQueue<{
    event: PluginEvent<PluginEventsDefinition, "output">;
    context: Readonly<PluginContext<Definition["context"], "output">>;
  }>[] = [];

  constructor(agent: Agent, def: Definition, config: PluginConfig<Definition["config"], "output">) {
    this.#agent = agent;
    this.#definition = def;
    this.#config = config;
    this.#context = def.context.parse({});

    for (const [methodName, methodDef] of Object.entries(this.#definition.methods ?? {})) {
      const method = methodDef.run.bind(this, {
        agent: this.#agent,
        config: this.#config,
        context: this.#context,
        emit: this.emit.bind(this) as EmitFunction,
      });
      this.#finalMethods[methodName] = method;
    }

    Object.assign(this, this.#finalMethods);
  }

  get methods() {
    return this.#finalMethods;
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
        context: depRunner.#context,
        emit: depRunner.emit.bind(depRunner),
      };
    }

    return dependencies as PluginDependencies<Definition["dependencies"]>;
  }

  init() {
    // 1. Initialize services
    const dependencies = this.#buildDependencies();

    for (const service of Object.values(this.#definition.services ?? {}) ?? []) {
      const queue = new AsyncQueue<{
        event: PluginEvent<PluginEventsDefinition, "output">;
        context: Readonly<PluginContext<Definition["context"], "output">>;
      }>();
      this.#servicesQueues.push(queue);
      service({
        agent: this.#agent,
        queue: queue[Symbol.asyncIterator](),
        config: this.#config,
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
    for await (let event of this.#queue) {
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
          context: runner.#context,
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
          context: this.#context,
          methods: this.#finalMethods,
          emit: this.emit.bind(this) as EmitFunction<Definition["events"]>,
          dependencies,
        });
      }

      // 2. Feed services' queues
      for (const queue of this.#servicesQueues) {
        queue.push({
          event: klona(event),
          context: klona(this.#context),
        });
      }
    }
  }

  registerExternalInterceptor(interceptor: PluginExternalInterceptor<PluginDefinition>) {
    this.#externalInterceptors.push(interceptor);
  }

  async stop() {
    //
  }
}
