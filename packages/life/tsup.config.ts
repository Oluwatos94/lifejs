import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["agent/agent.ts"],
  format: ["esm", "cjs"],

  dts: true,
  clean: true,
  treeshake: true,
});
