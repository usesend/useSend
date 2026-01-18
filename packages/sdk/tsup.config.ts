import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  noExternal: ["@usesend/lib"],
  clean: true,
});
