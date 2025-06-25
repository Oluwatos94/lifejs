// import type {
//   Plugin,
//   PluginContext,
//   PluginDef,
//   PluginEvent,
//   PluginEventsDef,
// } from "@/plugins/plugin";
// import { AsyncQueue } from "@/shared/async-queue";

// // - Runner
// class PluginRunner {
//   #def: PluginDef;
//   #queue: AsyncQueue<PluginEvent<PluginEventsDef>> = new AsyncQueue<PluginEvent<PluginEventsDef>>();
//   #servicesQueues: AsyncQueue<{
//     event: PluginEvent<PluginEventsDef>;
//     context: Readonly<PluginContext>;
//   }>[] = [];

//   constructor(def: PluginDef) {
//     this.#def = def;
//     for (const service of Object.values(this.#def.services ?? {}) ?? []) {
//       const queue = new AsyncQueue<{
//         event: PluginEvent<PluginEventsDef>;
//         context: Readonly<PluginContext>;
//       }>();
//       this.#servicesQueues.push(queue);
//       service({
//         events: queue[Symbol.asyncIterator](),
//         config: {},
//         methods: {},
//         emit: this.emit.bind(this),
//         // waitUntil: this.waitUntil.bind(this),
//       });
//     }
//   }

//   emit(event: PluginEvent<PluginEventsDef>) {
//     if (!this.#def.events) throw new Error("This plugin doesn't have any events defined.");
//     // Validate event
//     const eventDefinition = Object.entries(this.#def.events).find(
//       ([type, def]) => type === event.type,
//     )?.[1];
//     if (!eventDefinition) throw new Error(`Event ${event.type} not found.`);
//     const dataSchema = eventDefinition.dataSchema;
//     if (dataSchema) {
//       const validated = dataSchema.safeParse(event.data);
//       if (!validated.success)
//         throw new Error(`Event ${event.type} data is invalid: ${validated.error.message}`);
//     }

//     // Append to queue
//     if (event.urgent) this.#queue.pushFirst(event);
//     else this.#queue.push(event);
//   }

//   async waitUntil(
//     test: (params: { context: PluginContext; status: PluginStatus<PluginStatusDef> }) => boolean,
//   ) {
//     // return this.#queue.waitUntil((event) => {
//     //   return event.type === params.status;
//     // });
//   }

//   start() {}
// }

// export class PluginsOrchestrator {
//   constructor(plugins: Plugin<PluginDef>[]) {
//     // Get plugin definitions
//     const definitions = plugins.map((plugin) => plugin._getDefinition());

//     // Check that top-level dependencies are met

//     // Check that interceptors dependencies are met

//     // Create plugin runners
//     const runners = definitions.map((def) => new PluginRunner(def));

//     // Wire dependencies

//     // Start plugin runners
//     for (const runner of runners) runner.start();
//   }
// }
