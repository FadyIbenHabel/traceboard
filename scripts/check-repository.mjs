import { execFileSync } from "node:child_process";
import { readFileSync, lstatSync, readlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/],
  ["Groq credential", /\bgsk_[A-Za-z0-9]{40,}\b/],
  ["OpenAI credential", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}\b/],
  [
    "GitHub credential",
    /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/,
  ],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["Google API credential", /\bAIza[0-9A-Za-z_-]{35}\b/],
];
const credentialAssignment =
  /(?:GROQ_API_KEY|OPENAI_API_KEY|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY|CLOUDFLARE_API_TOKEN)\s*[=:]\s*["']([^"'\r\n]+)["']/g;

/** Returns finding names only; it never returns or prints credential values. */
export function credentialFindings(content) {
  const findings = patterns
    .filter(([, pattern]) => pattern.test(content))
    .map(([name]) => name);
  for (const match of content.matchAll(credentialAssignment)) {
    const value = match[1];
    if (!/^(?:\$\{|<|YOUR_|REPLACE_|example|placeholder)/i.test(value)) {
      findings.push("nonempty credential assignment");
      break;
    }
  }
  return [...new Set(findings)];
}

export function checkRepository(root, { history = false } = {}) {
  const git = (...args) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      maxBuffer: 20_000_000,
    });
  const errors = [];
  const tracked = git("ls-files", "-z").split("\0").filter(Boolean);
  const ignored = git("ls-files", "--cached", "--ignored", "--exclude-standard", "-z")
    .split("\0")
    .filter(Boolean);
  errors.push(...ignored.map((name) => `Already tracked despite .gitignore: ${name}`));
  const names = new Set([
    ...tracked,
    ...git("ls-files", "--others", "--exclude-standard", "-z")
      .split("\0")
      .filter(Boolean),
  ]);
  const inspect = (name, buffer) => {
    if (buffer.length > 2_000_000)
      errors.push(`File exceeds the 2 MB source budget: ${name}`);
    if (buffer.subarray(0, 8000).includes(0)) return;
    for (const finding of credentialFindings(buffer.toString("utf8")))
      errors.push(`${finding}: ${name}`);
  };
  let inspected = 0;
  for (const name of names) {
    try {
      const location = path.join(root, name);
      const stat = lstatSync(location);
      if (stat.isSymbolicLink()) {
        inspect(name, Buffer.from(readlinkSync(location)));
      } else if (stat.isFile()) {
        if (stat.size > 2_000_000) {
          errors.push(`File exceeds the 2 MB source budget: ${name}`);
          continue;
        }
        inspect(name, readFileSync(location));
      } else continue;
      inspected++;
    } catch (error) {
      if (error.code !== "ENOENT") throw error; // A staged deletion is expected.
    }
  }
  let commits = 0;
  if (history) {
    for (const commit of git("rev-list", "--all").trim().split("\n").filter(Boolean)) {
      commits++;
      const files = git("ls-tree", "-r", "--name-only", "-z", commit)
        .split("\0")
        .filter(Boolean);
      for (const name of files) {
        const buffer = execFileSync("git", ["-C", root, "show", `${commit}:${name}`], {
          maxBuffer: 20_000_000,
        });
        inspect(`${commit.slice(0, 8)}:${name}`, buffer);
      }
    }
  }
  return { errors: [...new Set(errors)], inspected, commits };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  try {
    const result = checkRepository(root, { history: process.argv.includes("--history") });
    if (result.errors.length) {
      console.error(result.errors.join("\n"));
      process.exitCode = 1;
    } else {
      console.log(
        `Repository checks passed: ${result.inspected} source files${result.commits ? ` and ${result.commits} Git commits` : ""}.`,
      );
      console.log(
        "No tracked ignored files, oversized source files, or recognized credential patterns found.",
      );
    }
  } catch (error) {
    console.error(`Repository check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
