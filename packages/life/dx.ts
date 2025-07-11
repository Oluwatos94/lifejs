// @ts-nocheck
import "dotenv/config";
import { defaults, defineAgent, defineMemory } from "life/define";

export default defineAgent("demo")
  .config({
    transport: {
      provider: "livekit",
    },
  })
  .plugins([...defaults.plugins])
  .core({})
  .memories({
    items: [
      defineMemory("all-messages")
        .dependencies({
          stores: [defaults.storesByName.widget],
          collections: [defaults.collectionsByName.core],
        })
        .config({ behavior: "blocking" })
        .onHistoryChange((history) => console.log("history", history))
        .getOutput(({ stores }) => [
          {
            id: "1",
            role: "user",
            content: `Hello, how are you? ${stores.widget.get("test")}`,
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ]),
    ],
  })
  .actions({
    items: [],
  })
  .stores({
    items: [...defaults.stores],
  })
  .collections({
    items: [...defaults.collections],
  })
  .percepts({
    items: [],
  })
  .widget({
    items: [],
  });
