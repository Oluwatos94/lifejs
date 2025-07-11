import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["exports/define.ts", "client/client.ts", "transport/auth.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  treeshake: true,
});
