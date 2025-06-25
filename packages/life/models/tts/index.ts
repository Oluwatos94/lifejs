import { z } from "zod";
import { CartesiaTTS, cartesiaTTSConfigSchema } from "./providers/cartesia";

// Providers
export const ttsProviders = {
  cartesia: { class: CartesiaTTS, configSchema: cartesiaTTSConfigSchema },
} as const;

export type TTSProvider = (typeof ttsProviders)[keyof typeof ttsProviders]["class"];

// Config
export type TTSProviderConfigInput = {
  [K in keyof typeof ttsProviders]: { provider: K } & z.input<
    (typeof ttsProviders)[K]["configSchema"]
  >;
};
export type TTSProviderConfig = {
  [K in keyof typeof ttsProviders]: { provider: K } & z.output<
    (typeof ttsProviders)[K]["configSchema"]
  >;
}[keyof typeof ttsProviders];
export const ttsProviderConfigSchema = z.discriminatedUnion(
  "provider",
  Object.entries(ttsProviders).map(([key, { configSchema }]) =>
    configSchema.extend({ provider: z.literal(key) }),
  ) as unknown as [
    z.ZodObject<{ provider: z.ZodString }>,
    ...z.ZodObject<{ provider: z.ZodString }>[],
  ],
);
