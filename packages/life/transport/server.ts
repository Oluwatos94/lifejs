import { ensureServer } from "@/shared/ensure-server";

ensureServer("transport.index.server");

import { z } from "zod";
import type { ServerTransportBase } from "./providers/base/server";
import { LiveKitServerTransport, livekitServerConfigSchema } from "./providers/livekit/server";
import { RPCTransport } from "./rpc";

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

// Transport
export class TransportServer extends RPCTransport {
  _provider: ServerTransportBase<z.AnyZodObject>;

  constructor(config: ServerTransportProviderConfig<"output">) {
    super();
    const serverTransportProvider = serverTransportProviders[config.provider];
    this._provider = new serverTransportProvider.class(config);
  }

  // Proxy base methods from the provider for simpler usage
  on: ServerTransportBase<z.AnyZodObject>["on"] = (...args) => this._provider.on(...args);
  joinRoom: ServerTransportBase<z.AnyZodObject>["joinRoom"] = (...args) =>
    this._provider.joinRoom(...args);
  leaveRoom: ServerTransportBase<z.AnyZodObject>["leaveRoom"] = (...args) =>
    this._provider.leaveRoom(...args);
  streamText: ServerTransportBase<z.AnyZodObject>["streamText"] = (...args) =>
    this._provider.streamText(...args);
  receiveStreamText: ServerTransportBase<z.AnyZodObject>["receiveStreamText"] = (...args) =>
    this._provider.receiveStreamText(...args);
  sendText: ServerTransportBase<z.AnyZodObject>["sendText"] = (...args) =>
    this._provider.sendText(...args);
  receiveText: ServerTransportBase<z.AnyZodObject>["receiveText"] = (...args) =>
    this._provider.receiveText(...args);
  sendObject: ServerTransportBase<z.AnyZodObject>["sendObject"] = (...args) =>
    this._provider.sendObject(...args);
  receiveObject: ServerTransportBase<z.AnyZodObject>["receiveObject"] = (...args) =>
    this._provider.receiveObject(...args);
  streamAudioChunk: ServerTransportBase<z.AnyZodObject>["streamAudioChunk"] = (...args) =>
    this._provider.streamAudioChunk(...args);
}
