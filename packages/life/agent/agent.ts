import { type ConfigDefinition, type ConfigDefinitionInput, defineConfig } from "@/config";
import { type EOUProvider, eouProviders } from "@/models/eou";
import { type LLMProvider, llmProviders } from "@/models/llm";
import { type STTProvider, sttProviders } from "@/models/stt";
import { type TTSProvider, ttsProviders } from "@/models/tts";
import { type VADProvider, vadProviders } from "@/models/vad";
import { type ServerTransportProvider, serverTransportProviders } from "@/transport/index.server";

export interface AgentDefinitionInput {
  config: ConfigDefinitionInput;
}

export interface _AgentDefinition {
  id: string;
  config: ConfigDefinition;
}

export class AgentDefinition<
  const Def extends AgentDefinitionInput,
  ExcludedMethods extends string = never,
> {
  #def: Def;

  constructor(def: Def) {
    this.#def = def;
  }

  config(params: ConfigDefinitionInput) {
    const config = defineConfig(params);
    const agent = new AgentDefinition<
      Def & { config: typeof config.raw },
      ExcludedMethods | "config"
    >({
      ...this.#def,
      config: config.raw,
    });
    return agent as Omit<typeof agent, ExcludedMethods | "config">;
  }

  _getDefinition() {
    return this.#def as unknown as _AgentDefinition;
  }
}

export function defineAgent<const Id extends string>(id: Id) {
  return new AgentDefinition({
    id,
    config: {},
  });
}

export class Agent {
  transport: InstanceType<ServerTransportProvider>;
  storage = null;
  models = {} as {
    vad: InstanceType<VADProvider>;
    stt: InstanceType<STTProvider>;
    eou: InstanceType<EOUProvider>;
    llm: InstanceType<LLMProvider>;
    tts: InstanceType<TTSProvider>;
  };
  plugins: Record<string, unknown> = {};

  constructor(definition: _AgentDefinition) {
    // Initialize VAD model
    const vadProvider = vadProviders[definition.config.models.vad.provider];
    this.models.vad = new vadProvider.class(definition.config.models.vad);

    // Initialize STT model
    const sttProvider = sttProviders[definition.config.models.stt.provider];
    this.models.stt = new sttProvider.class(definition.config.models.stt);

    // Initialize EOU model
    const eouProvider = eouProviders[definition.config.models.eou.provider];
    this.models.eou = new eouProvider.class(definition.config.models.eou);

    // Initialize LLM model
    const llmProvider = llmProviders[definition.config.models.llm.provider];
    this.models.llm = new llmProvider.class(definition.config.models.llm as never);

    // Initialize TTS model
    const ttsProvider = ttsProviders[definition.config.models.tts.provider];
    this.models.tts = new ttsProvider.class(definition.config.models.tts);

    // Initialize transport
    const serverTransportProvider = serverTransportProviders[definition.config.transport.provider];
    this.transport = new serverTransportProvider.class(definition.config.transport);

    // // Register default plugins (if not disabled)
    // if (!config.disableDefaultPlugins?.core) this.plugins.core = corePlugin;
    // if (!config.disableDefaultPlugins?.actions) this.plugins.actions = actionsPlugin;
    // if (!config.disableDefaultPlugins?.memories) this.plugins.memories = memoriesPlugin;
    // if (!config.disableDefaultPlugins?.stores) this.plugins.stores = storesPlugin;
    // if (!config.disableDefaultPlugins?.collections) this.plugins.collections = collectionsPlugin;

    // // Register extra plugins
    // for (const plugin of config.plugins) this.plugins[plugin.id] = plugin;

    // // Proxy some methods of the core plugin.
    // if (this.plugins.core) {
    //   this.newMessage = this.plugins.core.newMessage.bind(this.plugins.core);
    //   this.abort = this.plugins.core.abort.bind(this.plugins.core);
    //   this.continue = this.plugins.core.continue.bind(this.plugins.core);
    //   this.say = this.plugins.core.say.bind(this.plugins.core);
    //   this.ask = this.plugins.core.ask.bind(this.plugins.core);
    //   this.prompt = this.plugins.core.prompt.bind(this.plugins.core);
    //   this.inform = this.plugins.core.inform.bind(this.plugins.core);
    //   this.alert = this.plugins.core.alert.bind(this.plugins.core);
    // }

    // // Proxy other default plugins for easier access.
    // if (this.plugins.actions) this.actions = this.plugins.actions;
    // if (this.plugins.memories) this.memories = this.plugins.memories;
    // if (this.plugins.stores) this.stores = this.plugins.stores;
    // if (this.plugins.collections) this.collections = this.plugins.collections;
  }
}

// const agentDef = defineAgent("test")
//   .config({
//     models: {
//       eou: {
//         provider: "turnsense",
//       },
//     },
//   })
//   ._getDefinition();

// if (agentDef.config.models.eou.provider === "livekit") {
//   agentDef.config.models.eou.maxMessages;
// }

// Syntactic sugar
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
//     urgent: true,
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
//       urgent: true,
//     });
//   // Else, if the behavior is decide, decide whether to make the notification interrupt or not
//   else if (params.behavior === "decide") {
//     emit({
//       type: "operation.decide",
//       data: { messages: [], insertPolicy: "abrupt-interrupt", allowInterruption: true },
//       urgent: true,
//     });
//   }
// },
// ask: ({ emit, context }, message: string) => {
//   emit({
//     type: "operation.message",
//     data: { id: generateId(), role: "user", message: message },
//     urgent: true,
//   });
//   emit({ type: "operation.continue", urgent: true, data: { messages: context.messages } });
// },
// prompt: ({ emit, context }, message: string) => {
//   emit({
//     type: "operation.message",
//     data: { id: generateId(), role: "system", message: message },
//     urgent: true,
//   });
//   emit({ type: "operation.continue", urgent: true, data: { messages: context.messages } });
// },
