import { z } from "zod";
import { DeepgramSTT, deepgramSTTConfigSchema } from "./providers/deepgram";

// Providers
export const sttProviders = {
  deepgram: { class: DeepgramSTT, configSchema: deepgramSTTConfigSchema },
} as const;

export type STTProvider = (typeof sttProviders)[keyof typeof sttProviders]["class"];

// Config
export type STTProviderConfigInput = {
  [K in keyof typeof sttProviders]: { provider: K } & z.input<
    (typeof sttProviders)[K]["configSchema"]
  >;
};
export type STTProviderConfig = {
  [K in keyof typeof sttProviders]: { provider: K } & z.output<
    (typeof sttProviders)[K]["configSchema"]
  >;
}[keyof typeof sttProviders];
export const sttProviderConfigSchema = z.discriminatedUnion(
  "provider",
  Object.entries(sttProviders).map(([key, { configSchema }]) =>
    configSchema.extend({ provider: z.literal(key) }),
  ) as unknown as [
    z.ZodObject<{ provider: z.ZodString }>,
    ...z.ZodObject<{ provider: z.ZodString }>[],
  ],
);
