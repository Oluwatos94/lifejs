import type { Agent } from "@/agent/agent";
import type {
  EmitFunction,
  PluginConfig,
  PluginContext,
  PluginDefinition,
  PluginEvent,
  PluginEventsDef,
} from "@/plugins/definition";
import { AsyncQueue } from "@/shared/async-queue";
import { klona } from "@/shared/klona";
import { newId } from "@/shared/prefixed-id";

// - Runner
export class PluginRunner<const Definition extends PluginDefinition> {
  #agent: Agent;
  #definition: Definition;
  #config: PluginConfig<Definition["config"], "output">;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  #finalMethods: Record<string, (...args: any[]) => unknown | Promise<unknown>> = {};
  #queue: AsyncQueue<PluginEvent<PluginEventsDef, "output">> = new AsyncQueue<
    PluginEvent<PluginEventsDef, "output">
  >();
  #servicesQueues: AsyncQueue<{
    event: PluginEvent<PluginEventsDef, "output">;
    context: Readonly<PluginContext>;
  }>[] = [];

  constructor(agent: Agent, def: Definition, config: PluginConfig<Definition["config"], "output">) {
    this.#agent = agent;
    this.#definition = def;
    this.#config = config;
    for (const [methodName, rawMethod] of Object.entries(this.#definition.methods ?? {})) {
      const method = rawMethod.bind(this, {
        agent: this.#agent,
        config: this.#config,
        context: this.#definition.context,
        emit: this.emit.bind(this) as EmitFunction,
      });
      this.#finalMethods[methodName] = method;
    }

    Object.assign(this, this.#finalMethods);

    for (const service of Object.values(this.#definition.services ?? {}) ?? []) {
      const queue = new AsyncQueue<{
        event: PluginEvent<PluginEventsDef, "output">;
        context: Readonly<PluginContext>;
      }>();
      this.#servicesQueues.push(queue);
      service({
        agent: this.#agent,
        queue: queue[Symbol.asyncIterator](),
        config: this.#config,
        methods: this.#finalMethods,
        emit: this.emit.bind(this) as EmitFunction,
        dependencies: {}, // TODO
      });
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
    for await (const event of this.#queue) {
      // if (
      //   event.type !== "user.audio-chunk" &&
      //   event.type !== "user.voice-chunk" &&
      //   event.type !== "agent.voice-chunk"
      // )
      //   console.log("🐳", event);
      // 1. Run effects
      for (const effect of Object.values(this.#definition.effects ?? {})) {
        await effect({
          agent: this.#agent,
          event: klona(event),
          config: this.#config,
          context: this.#definition.context,
          methods: this.#finalMethods,
          emit: this.emit.bind(this) as EmitFunction<Definition["events"]>,
          dependencies: {}, // TODO
        });
      }

      // 2. Feed services' queues
      for (const queue of this.#servicesQueues) {
        queue.push({
          event: klona(event),
          context: klona(this.#definition.context),
        });
      }
    }
  }

  async stop() {
    //
  }
}
