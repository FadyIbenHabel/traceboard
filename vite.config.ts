import vinext from "vinext";
import { defineConfig } from "vite";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { configureToolEnvironment } from "./scripts/tool-environment.mjs";
import { sites } from "./scripts/vite/sites-vite-plugin.ts";

const managedLinux = readExecutionProfile() === "managed-linux";

export default defineConfig(async () => {
  configureToolEnvironment(process.cwd());
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(managedLinux ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : {}),
      ...(process.env.CODEX_SANDBOX === "seatbelt"
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites({ mockAuth: false }),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          main: "./worker/index.ts",
          compatibility_flags: ["nodejs_compat"],
        },
      }),
    ],
  };
});
