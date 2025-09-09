import { type Config } from "tailwindcss";
import sharedConfig from "@usesend/tailwind-config/tailwind.config";

export default {
  ...sharedConfig,
  content: ["./src/**/*.tsx"],
} satisfies Config;
