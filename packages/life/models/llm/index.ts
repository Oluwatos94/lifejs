import { z } from "zod";
import { OpenAILLM, openAILLMConfigSchema } from "./providers/openai";

// Providers
export const llmProviders = {
  openai: { class: OpenAILLM, configSchema: openAILLMConfigSchema },
} as const;

export type LLMProvider = (typeof llmProviders)[keyof typeof llmProviders]["class"];

// Config
export type LLMProviderConfigInput = {
  [K in keyof typeof llmProviders]: { provider: K } & z.input<
    (typeof llmProviders)[K]["configSchema"]
  >;
};
export type LLMProviderConfig = {
  [K in keyof typeof llmProviders]: { provider: K } & z.output<
    (typeof llmProviders)[K]["configSchema"]
  >;
}[keyof typeof llmProviders];
export const llmProviderConfigSchema = z.discriminatedUnion(
  "provider",
  Object.entries(llmProviders).map(([key, { configSchema }]) =>
    configSchema.extend({ provider: z.literal(key) }),
  ) as unknown as [
    z.ZodObject<{ provider: z.ZodString }>,
    ...z.ZodObject<{ provider: z.ZodString }>[],
  ],
);
