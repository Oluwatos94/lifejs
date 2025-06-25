import { z } from "zod";

export const livekitConnectorConfigSchema = z.object({
  serverUrl: z.string().url().default("wss://localhost:7880"),
});

export type LiveKitConnectorConfig = z.infer<typeof livekitConnectorConfigSchema>;
