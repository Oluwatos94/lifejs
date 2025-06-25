import { LiveKitClientTransport } from "./providers/livekit/client";

export const clientTransportProviders = {
  livekit: LiveKitClientTransport,
} as const;

export type ClientTransportProvider =
  (typeof clientTransportProviders)[keyof typeof clientTransportProviders];
