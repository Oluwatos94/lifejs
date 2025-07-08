import { clientTransportProviders } from "@/transport/index.client";
import { z } from "zod";

export const agentClientConfigSchema = z.object({});

export type AgentClientConfig<T extends "input" | "output"> = T extends "input"
  ? z.input<typeof agentClientConfigSchema>
  : z.output<typeof agentClientConfigSchema>;

export class AgentClient {
  transport: InstanceType<(typeof clientTransportProviders)[keyof typeof clientTransportProviders]>;

  constructor(config: AgentClientConfig<"output">) {
    this.transport = new clientTransportProviders.livekit();
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
