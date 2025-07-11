import "dotenv/config";
import { Agent } from "./agent/agent";
import { defaults, defineAgent, defineMemory } from "./exports/define";

async function main() {
  const builder = defineAgent("demo")
    .plugins([...defaults.plugins])
    .config({
      transport: {
        provider: "livekit",
      },
    })
    .core({})
    .memories({
      items: [
        defineMemory("all-messages")
          .behavior("blocking")
          .onHistoryChange((history) => {
            console.log("history", history);
          })
          .getOutput(() => [
            {
              id: "1",
              role: "user",
              content: "Hello, how are you?",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
          ]),
      ],
    });

  const agent = new Agent(builder._definition);

  // Handle graceful shutdown
  let isShuttingDown = false;
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log("\nReceived interrupt signal, shutting down gracefully...");
    await agent.stop();
    process.exit(0);
  };

  // Listen for interrupt signals
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await agent.start();
  console.log("Agent server started");

  // Keep the process alive
  await new Promise((resolve) => {});
}

main().catch((error) => {
  console.error("Error starting agent:", error);
  process.exit(1);
});
