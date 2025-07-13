import { z } from "zod";
import { definePlugin } from "@/plugins/definition";

type Store = {
  id: string;
};

export const storesPlugin = definePlugin("stores").context(
  z.object({
    stores: z.custom<Map<string, Store>>().default(new Map()),
  }),
);
