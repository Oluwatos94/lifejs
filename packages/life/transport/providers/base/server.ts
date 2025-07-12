import { ensureServer } from "@/shared/ensure-server";
import { type SerializableValue, deserialize, serialize } from "@/shared/serialize";
ensureServer("transport.server.Transport");
import type { z } from "zod";

export type ServerTransportEvent = {
  type: "audio-chunk";
  chunk: Int16Array;
};

export abstract class ServerTransportBase<ConfigSchema extends z.AnyZodObject> {
  config: z.infer<ConfigSchema>;

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  async sendText(topic: string, text: string) {
    const writer = await this.streamText(topic);
    await writer.write(text);
    await writer.close();
  }

  receiveText(topic: string, callback: (text: string, participantId: string) => void) {
    this.receiveStreamText(
      topic,
      async (iterator: AsyncIterable<string>, participantId: string) => {
        let result = "";
        for await (const chunk of iterator) {
          result += chunk;
        }
        callback(result, participantId);
      },
    );
  }

  sendObject(topic: string, obj: SerializableValue) {
    const serialized = serialize(obj);
    return this.sendText(topic, serialized);
  }

  receiveObject(topic: string, callback: (obj: unknown, participantId: string) => void) {
    this.receiveText(topic, (text, participantId) => {
      const deserialized = deserialize(text);
      callback(deserialized, participantId);
    });
  }

  // Abstract methods
  abstract leaveRoom(): Promise<void>;
  abstract streamText(
    topic: string,
  ): Promise<
    Omit<
      WritableStreamDefaultWriter<string>,
      "desiredSize" | "closed" | "ready" | "abort" | "releaseLock"
    >
  >;
  abstract receiveStreamText(
    topic: string,
    callback: (iterator: AsyncIterable<string>, participantId: string) => void | Promise<void>,
  ): void;
  abstract on<EventType extends ServerTransportEvent["type"]>(
    type: EventType,
    callback: (event: Extract<ServerTransportEvent, { type: EventType }>) => void,
  ): void;
  abstract joinRoom(roomId: string): Promise<void>;
  abstract streamAudioChunk(chunk: Int16Array): Promise<void>;
}
