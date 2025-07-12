import { z } from "zod";

export const storeConfigSchema = z.object({
  type: z.enum(["freeform", "controlled"]).default("freeform"),
  visibility: z.enum(["shared", "private"]).default("private"),
  // schema: z
});

export type StoreConfig<T extends "input" | "output"> = T extends "input"
  ? { type?: "freeform" | "controlled"; visibility?: "shared" | "private" }
  : { type: "freeform" | "controlled"; visibility: "shared" | "private" };

export interface StoreDefinition {
  name: string;
  config: StoreConfig<"output">;
}
