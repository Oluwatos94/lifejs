import { definePlugin } from "@/plugins/plugin";
type Store = {
  id: string;
};

export const storesPlugin = definePlugin("stores").context({
  stores: new Map<string, Store>(),
});
