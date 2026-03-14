import { type Config } from "tailwindcss";
import sharedConfig from "@usesend/tailwind-config/tailwind.config";
import path from "path";

export default {
  ...sharedConfig,
  content: [
    "./src/**/*.tsx",
    `${path.join(require.resolve("@usesend/ui"), "..")}/**/*.{ts,tsx}`,
    `${path.join(require.resolve("@usesend/email-editor"), "..")}/**/*.{ts,tsx}`,
  ],
} satisfies Config;
