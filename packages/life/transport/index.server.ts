import { ensureServer } from "@/shared/ensure-server";
ensureServer("transport.index.server");
import { z } from "zod";
import { LiveKitServerTransport, livekitServerConfigSchema } from "./providers/livekit/server";

// Providers
export const serverTransportProviders = {
  livekit: { class: LiveKitServerTransport, configSchema: livekitServerConfigSchema },
} as const;

export type ServerTransportProvider =
  (typeof serverTransportProviders)[keyof typeof serverTransportProviders]["class"];

// Config
export type ServerTransportProviderConfig<T extends "input" | "output"> = {
  [K in keyof typeof serverTransportProviders]: { provider: K } & (T extends "input"
    ? z.input<(typeof serverTransportProviders)[K]["configSchema"]>
    : z.output<(typeof serverTransportProviders)[K]["configSchema"]>);
}[keyof typeof serverTransportProviders];

export const serverTransportProviderConfigSchema = z.discriminatedUnion(
  "provider",
  Object.entries(serverTransportProviders).map(([key, { configSchema }]) =>
    configSchema.extend({ provider: z.literal(key) }),
  ) as unknown as [
    z.ZodObject<{ provider: z.ZodString }>,
    ...z.ZodObject<{ provider: z.ZodString }>[],
  ],
);

// Auth
export { getToken } from "./auth";
