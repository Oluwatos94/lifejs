import type { z } from "zod";

export abstract class VADBase<ConfigSchema extends z.AnyZodObject> {
  protected config: z.infer<ConfigSchema>;

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  // To be implemented by subclasses
  abstract checkActivity(pcm: Int16Array): Promise<number>;
}
