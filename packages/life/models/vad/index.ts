import { z } from "zod";
import { SileroVAD, sileroVADConfigSchema } from "./providers/silero";

// Providers
export const vadProviders = {
  silero: { class: SileroVAD, configSchema: sileroVADConfigSchema },
} as const;

export type VADProvider = (typeof vadProviders)[keyof typeof vadProviders]["class"];

// Config
export type VADProviderConfigInput = {
  [K in keyof typeof vadProviders]: { provider: K } & z.input<
    (typeof vadProviders)[K]["configSchema"]
  >;
};
export type VADProviderConfig = {
  [K in keyof typeof vadProviders]: { provider: K } & z.output<
    (typeof vadProviders)[K]["configSchema"]
  >;
}[keyof typeof vadProviders];
export const vadProviderConfigSchema = z.discriminatedUnion(
  "provider",
  Object.entries(vadProviders).map(([key, { configSchema }]) =>
    configSchema.extend({ provider: z.literal(key) }),
  ) as unknown as [
    z.ZodObject<{ provider: z.ZodString }>,
    ...z.ZodObject<{ provider: z.ZodString }>[],
  ],
);
