import test from "node:test";
import assert from "node:assert/strict";
import { readSavedBriefs, parseResult } from "../lib/brief-storage.ts";
import {
  SAMPLE_CASES,
  analyzeDemo,
  AnalysisValidationError,
} from "../lib/traceboard/index.ts";
import type { AnalysisInput } from "../lib/traceboard/index.ts";

function brief() {
  const sample = SAMPLE_CASES[0];
  const input: AnalysisInput = {
    title: sample.title,
    description: sample.description,
    sources: sample.sources.map((source) => ({ ...source })),
    mode: "demo",
  };
  return { input, result: analyzeDemo(input) };
}

test("valid demo history round-trips with original IDs, dates and metadata", () => {
  const original = brief();
  const restored = readSavedBriefs(JSON.parse(JSON.stringify([original])));
  assert.deepEqual(restored, [original]);
  assert.equal(restored[0].result.createdAt, original.result.createdAt);
  assert.equal(restored[0].result.id, original.result.id);
  assert.deepEqual(restored[0].result.meta, original.result.meta);
});

test("missing nested result arrays are rejected per record", () => {
  const good = brief();
  const missingChecks = brief();
  Reflect.deleteProperty(missingChecks.result.hypotheses[0], "checks");
  const missingCitations = brief();
  Reflect.deleteProperty(missingCitations.result.hypotheses[0], "citations");
  const missingContext = brief();
  Reflect.deleteProperty(missingContext.result, "missingContext");
  assert.deepEqual(
    readSavedBriefs([missingChecks, null, missingCitations, missingContext, good]),
    [good],
  );
});

test("invalid source content and unmatched citation quotes cannot be restored", () => {
  const good = brief();
  const wrongSource = brief();
  wrongSource.input.sources[0].content = "totally different file";
  const noSources = brief();
  noSources.input.sources = [];
  const forgedQuote = brief();
  forgedQuote.result.hypotheses[0].citations[0].quote = "invented code";
  assert.deepEqual(readSavedBriefs([wrongSource, noSources, forgedQuote, good]), [good]);
});

test("invalid provider and numeric metadata fail closed", () => {
  const good = brief();
  for (const invalid of [
    { provider: "other" },
    { provider: "groq" },
    { durationMs: -1 },
    { durationMs: Infinity },
    { retrievedChunks: 99 },
    { inputTokens: -1 },
    { outputTokens: 1.5 },
    { model: "" },
  ]) {
    const damaged = brief();
    Object.assign(damaged.result.meta, invalid);
    assert.deepEqual(readSavedBriefs([damaged, good]), [good]);
    assert.throws(
      () => parseResult(damaged.result, damaged.input),
      AnalysisValidationError,
    );
  }
});

test("invalid IDs and timestamps are omitted instead of regenerated", () => {
  const good = brief();
  for (const invalid of [
    { id: "" },
    { id: "bad id" },
    { createdAt: "yesterday" },
    { createdAt: "2026-02-30T12:00:00.000Z" },
  ]) {
    const damaged = brief();
    Object.assign(damaged.result, invalid);
    assert.deepEqual(readSavedBriefs([damaged, good]), [good]);
  }
});

test("unknown secret properties are stripped throughout the saved structure", () => {
  const original = brief();
  const poisoned = JSON.parse(JSON.stringify(original));
  poisoned.apiKey = "secret-top-level";
  poisoned.input.apiKey = "secret-input";
  poisoned.input.sources[0].apiKey = "secret-source";
  poisoned.result.apiKey = "secret-result";
  poisoned.result.meta.apiKey = "secret-meta";
  poisoned.result.hypotheses[0].apiKey = "secret-hypothesis";
  poisoned.result.hypotheses[0].citations[0].apiKey = "secret-citation";
  const restored = readSavedBriefs([poisoned]);
  assert.deepEqual(restored, [original]);
  assert.ok(!JSON.stringify(restored).includes("secret-"));
  assert.ok(!JSON.stringify(restored).includes("apiKey"));
});

test("restoration caps history at eight valid unique briefs and retains order", () => {
  const records = Array.from({ length: 12 }, () => brief());
  const restored = readSavedBriefs([
    null,
    {},
    records[0],
    records[0],
    ...records.slice(1),
  ]);
  assert.equal(restored.length, 8);
  assert.deepEqual(
    restored.map((item) => item.result.id),
    records.slice(0, 8).map((item) => item.result.id),
  );
  for (const invalid of [undefined, null, {}, "[]", 12])
    assert.deepEqual(readSavedBriefs(invalid), []);
});

test("API result validation retains live usage metadata and strips unknown fields", () => {
  const original = brief();
  original.input.mode = "groq";
  original.input.model = "openai/gpt-oss-20b";
  original.result.meta = {
    provider: "groq",
    model: "openai/gpt-oss-20b",
    durationMs: 412,
    retrievedChunks: original.result.meta.retrievedChunks,
    inputTokens: 455,
    outputTokens: 780,
  };
  const parsed = parseResult(
    { ...original.result, apiKey: "not-a-result-field" },
    original.input,
  );
  assert.deepEqual(parsed, original.result);
  assert.equal(parsed.meta.outputTokens, 780);
});
