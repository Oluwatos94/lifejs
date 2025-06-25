import {
  type EOUProviderConfig,
  type EOUProviderConfigInput,
  eouProviderConfigSchema,
} from "@/models/eou";
import {
  type LLMProviderConfig,
  type LLMProviderConfigInput,
  llmProviderConfigSchema,
} from "@/models/llm";
import {
  type STTProviderConfig,
  type STTProviderConfigInput,
  sttProviderConfigSchema,
} from "@/models/stt";
import {
  type TTSProviderConfig,
  type TTSProviderConfigInput,
  ttsProviderConfigSchema,
} from "@/models/tts";
import {
  type VADProviderConfig,
  type VADProviderConfigInput,
  vadProviderConfigSchema,
} from "@/models/vad";
import {
  type ServerTransportProviderConfig,
  type ServerTransportProviderConfigInput,
  serverTransportProviderConfigSchema,
} from "@/transport/index.server";
import { z } from "zod";

export const configDefinitionSchema = z.object({
  transport: serverTransportProviderConfigSchema.default({ provider: "livekit" }),
  models: z.object({
    vad: vadProviderConfigSchema.default({ provider: "silero" }),
    stt: sttProviderConfigSchema.default({ provider: "deepgram" }),
    eou: eouProviderConfigSchema.default({ provider: "livekit" }),
    llm: llmProviderConfigSchema.default({ provider: "openai" }),
    tts: ttsProviderConfigSchema.default({ provider: "cartesia" }),
  }),
});

export interface ConfigDefinitionInput {
  transport?: ServerTransportProviderConfigInput[keyof ServerTransportProviderConfigInput];
  models?: {
    vad?: VADProviderConfigInput[keyof VADProviderConfigInput];
    stt?: STTProviderConfigInput[keyof STTProviderConfigInput];
    eou?: EOUProviderConfigInput[keyof EOUProviderConfigInput];
    llm?: LLMProviderConfigInput[keyof LLMProviderConfigInput];
    tts?: TTSProviderConfigInput[keyof TTSProviderConfigInput];
  };
}

export interface ConfigDefinition {
  transport: ServerTransportProviderConfig;
  models: {
    vad: VADProviderConfig;
    stt: STTProviderConfig;
    eou: EOUProviderConfig;
    llm: LLMProviderConfig;
    tts: TTSProviderConfig;
  };
}

export function defineConfig(def: ConfigDefinitionInput) {
  const parsedConfig = configDefinitionSchema.parse(def);
  return { raw: def, withDefaults: parsedConfig };
}
