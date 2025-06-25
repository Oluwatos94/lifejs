import { ensureServer } from "@/shared/ensure-server";
ensureServer("transport.index.server");

import { z } from "zod";
import { livekitConnectorConfigSchema } from "./providers/livekit/config";
import { LiveKitServerTransport } from "./providers/livekit/server";

// Providers
export const serverTransportProviders = {
  livekit: { class: LiveKitServerTransport, configSchema: livekitConnectorConfigSchema },
} as const;

export type ServerTransportProvider =
  (typeof serverTransportProviders)[keyof typeof serverTransportProviders]["class"];

// Auth
export { getToken } from "./auth";

// Config
export type ServerTransportProviderConfigInput = {
  [K in keyof typeof serverTransportProviders]: { provider: K } & z.input<
    (typeof serverTransportProviders)[K]["configSchema"]
  >;
};
export type ServerTransportProviderConfig = {
  [K in keyof typeof serverTransportProviders]: { provider: K } & z.output<
    (typeof serverTransportProviders)[K]["configSchema"]
  >;
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
