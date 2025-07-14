import { z } from "zod";
import { clientTransportProviders } from "@/transport/client";

export const agentClientConfigSchema = z.object({});

export type AgentClientConfig<T extends "input" | "output"> = T extends "input"
  ? z.input<typeof agentClientConfigSchema>
  : z.output<typeof agentClientConfigSchema>;

export class AgentClient {
  transport: InstanceType<(typeof clientTransportProviders)[keyof typeof clientTransportProviders]>;
  config: AgentClientConfig<"output">;

  constructor(config: AgentClientConfig<"output">) {
    this.transport = new clientTransportProviders.livekit();
    this.config = config;
  }

  async inviteAgent(roomId: string, token: string) {
    await this.transport.joinRoom(roomId, token);
    await this.transport.enableMicrophone();
    await this.transport.playAudio();
  }

  async say(text: string) {
    await this.transport.sendObject("rpc-say", { text });
  }
}
