import { LiveKitClientTransport } from "./providers/livekit/client";

// Providers
export const clientTransportProviders = {
  livekit: LiveKitClientTransport,
  // configSchema: livekitClientConfigSchema
} as const;

// export type ClientTransportProvider =
//   (typeof clientTransportProviders)[keyof typeof clientTransportProviders]["class"];

// // Config
// export type ClientTransportProviderConfig<T extends "input" | "output"> = {
//   [K in keyof typeof clientTransportProviders]: { provider: K } & (T extends "input"
//     ? z.input<(typeof clientTransportProviders)[K]["configSchema"]>
//     : z.output<(typeof clientTransportProviders)[K]["configSchema"]>);
// }[keyof typeof clientTransportProviders];

// export const clientTransportProviderConfigSchema = z.discriminatedUnion(
//   "provider",
//   Object.entries(clientTransportProviders).map(([key, { configSchema }]) =>
//     configSchema.extend({ provider: z.literal(key) }),
//   ) as unknown as [
//     z.ZodObject<{ provider: z.ZodString }>,
//     ...z.ZodObject<{ provider: z.ZodString }>[],
//   ],
// );
