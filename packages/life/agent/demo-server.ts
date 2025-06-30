import { Agent, defineAgent } from "./agent";

async function main() {
  console.log("Starting agent server");
  const definition = defineAgent("demo");
  const agent = new Agent(definition._getDefinition());
  await agent.start();
  console.log("Agent server started");
}

main();
