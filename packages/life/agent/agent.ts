import { type EOUProvider, eouProviders } from "@/models/eou";
import { type LLMProvider, llmProviders } from "@/models/llm";
import { type STTProvider, sttProviders } from "@/models/stt";
import { type TTSProvider, ttsProviders } from "@/models/tts";
import { type VADProvider, vadProviders } from "@/models/vad";
import type { PluginDefinition } from "@/plugins/definition";
import { PluginRunner } from "@/plugins/runner";
import { type ServerTransportProvider, serverTransportProviders } from "@/transport/index.server";
import type { AgentDefinition } from "./definition";

export class Agent {
  definition: AgentDefinition<"output">;
  transport: InstanceType<ServerTransportProvider>;
  storage = null;
  models: {
    vad: InstanceType<VADProvider>;
    stt: InstanceType<STTProvider>;
    eou: InstanceType<EOUProvider>;
    llm: InstanceType<LLMProvider>;
    tts: InstanceType<TTSProvider>;
  };
  plugins: Record<string, PluginRunner<PluginDefinition>> = {};

  constructor(definition: AgentDefinition<"output">) {
    this.definition = definition;

    // Initialize transport
    const serverTransportProvider = serverTransportProviders[definition.config.transport.provider];
    this.transport = new serverTransportProvider.class(definition.config.transport);
    this.transport.joinRoom("room-1").then(() => {
      this.transport.receiveObject("rpc-say", (data) => {
        // @ts-ignore
        this.plugins.core.say(data);
      });
    });

    // Initialize storage
    // TODO

    // Initialize models
    const vadProvider = vadProviders[definition.config.models.vad.provider];
    const sttProvider = sttProviders[definition.config.models.stt.provider];
    const eouProvider = eouProviders[definition.config.models.eou.provider];
    const llmProvider = llmProviders[definition.config.models.llm.provider];
    const ttsProvider = ttsProviders[definition.config.models.tts.provider];
    this.models = {
      vad: new vadProvider.class(definition.config.models.vad),
      stt: new sttProvider.class(definition.config.models.stt),
      eou: new eouProvider.class(definition.config.models.eou),
      llm: new llmProvider.class(definition.config.models.llm as never),
      tts: new ttsProvider.class(definition.config.models.tts),
    };

    // Proxy some methods of the core plugin.
    // if (this.plugins.core) {

    // }

    // // Proxy other default plugins for easier access.
    // if (this.plugins.actions) this.actions = this.plugins.actions;
    // if (this.plugins.memories) this.memories = this.plugins.memories;
    // if (this.plugins.stores) this.stores = this.plugins.stores;
    // if (this.plugins.collections) this.collections = this.plugins.collections;
  }

  async start() {
    for (const plugin of this.definition.plugins) {
      const runner = new PluginRunner(
        this,
        plugin,
        this.definition.pluginConfigs[plugin.name] ?? {},
      );
      this.plugins[plugin.name] = runner;
      runner.start();
    }
  }

  async stop() {
    console.log("Stopping agent...");

    // Stop all plugins
    for (const [pluginId, plugin] of Object.entries(this.plugins)) {
      try {
        await plugin.stop();
      } catch (error) {
        console.error(`Error stopping plugin ${pluginId}:`, error);
      }
    }

    // Disconnect transport
    if (this.transport.isConnected) {
      try {
        await this.transport.leaveRoom();
        console.log("Transport disconnected");
      } catch (error) {
        console.error("Error disconnecting transport:", error);
      }
    }

    console.log("Agent stopped");
  }
}

// notify: (
//   { emit, context },
//   params: {
//     source: "user" | "application";
//     behavior: "inform" | "interrupt" | "decide";
//     message: string;
//   },
// ) => {
//   // Insert the notification message
//   const message = `${params.source === "user" ? "User" : "Application"} update: ${params.message}`;
//   emit({
//     type: "operation.message",
//     data: {
//       id: generateId(),
//       role: params.source === "user" ? "user" : "system",
//       message,
//     },
//   });

//   // If the behavior is "discrete", return
//   if (params.behavior === "inform") return;
//   // Else, if the behavior is interrupt, run continue
//   else if (params.behavior === "interrupt")
//     emit({
//       type: "operation.continue",
//       data: {
//         messages: context.messages,
//         insertPolicy: "abrupt-interrupt",
//         allowInterruption: true,
//       },
//     });
//   // Else, if the behavior is decide, decide whether to make the notification interrupt or not
//   else if (params.behavior === "decide") {
//     emit({
//       type: "operation.decide",
//       data: { messages: [], insertPolicy: "abrupt-interrupt", allowInterruption: true },
//     });
//   }
// },
// ask: ({ emit, context }, message: string) => {
//   emit({
//     type: "operation.message",
//     data: { id: generateId(), role: "user", message: message },
//   });
//   emit({ type: "operation.continue", data: { messages: context.messages } });
// },
// prompt: ({ emit, context }, message: string) => {
//   emit({
//     type: "operation.message",
//     data: { id: generateId(), role: "system", message: message },
//   });
//   emit({ type: "operation.continue", data: { messages: context.messages } });
// },
