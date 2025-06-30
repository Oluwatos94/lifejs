import { z } from "zod";
import { LivekitEOU, livekitEOUConfigSchema } from "./providers/livekit";
import { TurnSenseEOU, turnSenseEOUConfigSchema } from "./providers/turnsense";

// Providers
export const eouProviders = {
  turnsense: { class: TurnSenseEOU, configSchema: turnSenseEOUConfigSchema },
  livekit: { class: LivekitEOU, configSchema: livekitEOUConfigSchema },
} as const;

export type EOUProvider = (typeof eouProviders)[keyof typeof eouProviders]["class"];

// Config
export type EOUProviderConfig<T extends "input" | "output"> = {
  [K in keyof typeof eouProviders]: { provider: K } & (T extends "input"
    ? z.input<(typeof eouProviders)[K]["configSchema"]>
    : z.output<(typeof eouProviders)[K]["configSchema"]>);
}[keyof typeof eouProviders];

export const eouProviderConfigSchema = z.discriminatedUnion(
  "provider",
  Object.entries(eouProviders).map(([key, { configSchema }]) =>
    configSchema.extend({ provider: z.literal(key) }),
  ) as unknown as [
    z.ZodObject<{ provider: z.ZodString }>,
    ...z.ZodObject<{ provider: z.ZodString }>[],
  ],
);
