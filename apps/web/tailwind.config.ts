import { type Config } from "tailwindcss";
import sharedConfig from "@usesend/tailwind-config/tailwind.config";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  ...sharedConfig,
  content: [
    "./src/**/*.tsx",
    path.join(here, "../../packages/ui/src/**/*.{ts,tsx}"),
    path.join(here, "../../packages/email-editor/src/**/*.{ts,tsx}"),
    path.join(here, "../../packages/lib/src/**/*.{ts,tsx}"),
  ],
} satisfies Config;
