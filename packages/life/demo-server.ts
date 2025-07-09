import "dotenv/config";
import { Agent } from "./agent/agent";
import { defineAgent } from "./agent/definition";
import { corePlugin } from "./plugins/core/plugin";

async function main() {
  console.log("Starting agent server");
  const definition = defineAgent("demo")
    .config({
      transport: {
        provider: "livekit",
      },
    })
    .plugins([corePlugin])
    .core({})
    ._definition();

  const agent = new Agent(definition);

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
