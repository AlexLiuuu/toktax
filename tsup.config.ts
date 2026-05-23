import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["cjs"],
  target: "node18",
  banner: { js: "#!/usr/bin/env node" },
  external: ["sql.js"],
  clean: true,
});
