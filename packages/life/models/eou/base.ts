import type { Message } from "@/agent/resources";
import type { z } from "zod";

export abstract class EOUBase<ConfigSchema extends z.AnyZodObject> {
  protected config: z.infer<ConfigSchema>;

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  abstract predict(messages: Message[]): Promise<number> | number;
}
