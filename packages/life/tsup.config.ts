import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["agent/agent.ts", "client/client.ts", "transport/auth.ts"],
  format: ["esm", "cjs"],

  dts: true,
  clean: true,
  treeshake: true,
});
