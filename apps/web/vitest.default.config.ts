import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
      exclude: ["src/**/*.integration.test.{ts,tsx}"],
    },
  }),
);
