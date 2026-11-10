import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default defineConfig([
  globalIgnores([
    "dist/**",
    ".vinext/**",
    ".wrangler/**",
    ".sites-runtime/**",
    "test-results/**",
    "playwright-report/**",
    "coverage/**",
    "outputs/**",
    "work/**",
    "scripts/vite/**",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    files: ["app/**/*.{ts,tsx}", "lib/history-store.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
]);
