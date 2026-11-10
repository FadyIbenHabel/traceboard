import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { credentialFindings } from "../scripts/check-repository.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const ignoredPaths = (names: string[]) => {
  try {
    const output = execFileSync(
      "git",
      ["-C", root, "check-ignore", "--no-index", "--stdin", "-z"],
      { input: names.join("\0") + "\0", encoding: "utf8" },
    );
    return new Set(output.split("\0").filter(Boolean));
  } catch (error) {
    if ((error as { status?: number }).status === 1) return new Set<string>();
    throw error;
  }
};

test("Git excludes local secrets, dependencies, builds, archives, and browser artifacts", () => {
  const paths = [
    ".env",
    ".env.local",
    ".env.production",
    "nested/.env.test",
    ".dev.vars",
    ".dev.vars.production",
    ".aws/credentials",
    "nested/.ssh/id_ed25519",
    "credentials.json",
    "keys/private.pem",
    "keys/server.key",
    "secrets/token.txt",
    "service-account-production.json",
    ".netrc",
    ".npmrc",
    ".npmrc.local",
    "node_modules/react/index.js",
    "tools/node_modules/example/index.js",
    ".npm/cache.dat",
    "dist/server/index.js",
    ".next/cache/state.json",
    ".vinext/output.js",
    ".wrangler/state/data.sqlite",
    ".sites-runtime/wrangler/logs/dev.log",
    "test-results/trace.zip",
    "playwright-report/index.html",
    "coverage/lcov.info",
    "traceboard.rar",
    "traceboard.zip",
    "deploy.tar.gz",
    "backup.7z",
    "debug.log",
    "worker.pid",
    "local-data/customer-report.md",
    "uploads/private.txt",
    ".idea/workspace.xml",
    ".vscode/settings.json",
    ".DS_Store",
    "Thumbs.db",
    "notes.md~",
    "file.ts.swp",
  ];
  const ignored = ignoredPaths(paths);
  for (const name of paths)
    assert.equal(ignored.has(name), true, `Should be ignored: ${name}`);
});

test("Git retains source, tests, lockfile, screenshots, CI, and reviewed empty env templates", () => {
  const paths = [
    "package-lock.json",
    "package.json",
    ".env.example",
    ".dev.vars.example",
    ".gitignore",
    ".gitattributes",
    ".nvmrc",
    ".editorconfig",
    "README.md",
    "LICENSE",
    "app/page.tsx",
    "lib/traceboard/engine.ts",
    "tests/engine.test.ts",
    "tests/fixtures/example.log",
    "docs/images/workspace.png",
    ".github/workflows/ci.yml",
    "scripts/check-repository.mjs",
    "lib/build.ts",
  ];
  const ignored = ignoredPaths(paths);
  for (const name of paths)
    assert.equal(ignored.has(name), false, `Should remain publishable: ${name}`);
});

test("credential checks identify common real-token shapes without returning their values", () => {
  const token = "gsk_" + "A".repeat(48);
  assert.deepEqual(credentialFindings(token), ["Groq credential"]);
  assert.deepEqual(credentialFindings("-----BEGIN" + " PRIVATE KEY-----"), [
    "private key",
  ]);
  assert.deepEqual(credentialFindings('GROQ_API_KEY="' + token + '"'), [
    "Groq credential",
    "nonempty credential assignment",
  ]);
  assert.deepEqual(credentialFindings('GROQ_API_KEY=""\nGROQ_MODEL="example-model"'), []);
  assert.deepEqual(credentialFindings('GROQ_API_KEY="YOUR_KEY_HERE"'), []);
  assert.deepEqual(credentialFindings('GROQ_API_KEY="${GROQ_API_KEY}"'), []);
  assert.ok(!JSON.stringify(credentialFindings(token)).includes(token));
});
