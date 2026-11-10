import {
  AnalysisValidationError,
  parseAnalysis,
  retrieveEvidence,
  validateInput,
} from "./traceboard/index.ts";
import type { AnalysisInput, AnalysisResult } from "./traceboard/index.ts";

export type SavedBrief = { result: AnalysisResult; input: AnalysisInput };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AnalysisValidationError("Invalid saved brief.");
  return value as Record<string, unknown>;
}

function nonnegativeNumber(value: unknown, name: string, integer = false): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER ||
    (integer && !Number.isSafeInteger(value))
  )
    throw new AnalysisValidationError(`Invalid brief ${name}.`);
  return value;
}

/** Validate a received/restored result without trusting client-stored metadata. */
export function parseResult(value: unknown, input: AnalysisInput): AnalysisResult {
  const data = record(value);
  const cleanInput = validateInput(input);
  const evidence = retrieveEvidence(cleanInput);
  let serialized: string;
  try {
    serialized = JSON.stringify(data);
  } catch {
    throw new AnalysisValidationError("Invalid brief result structure.");
  }
  const content = parseAnalysis(serialized, evidence, cleanInput);
  if (typeof data.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(data.id))
    throw new AnalysisValidationError("Invalid brief ID.");
  if (
    typeof data.createdAt !== "string" ||
    data.createdAt.length !== 24 ||
    !Number.isFinite(Date.parse(data.createdAt)) ||
    new Date(data.createdAt).toISOString() !== data.createdAt
  )
    throw new AnalysisValidationError("Invalid brief timestamp.");
  const meta = record(data.meta);
  if (
    (meta.provider !== "demo" && meta.provider !== "groq") ||
    meta.provider !== cleanInput.mode
  )
    throw new AnalysisValidationError("Invalid brief provider.");
  if (typeof meta.model !== "string" || !meta.model.trim() || meta.model.length > 120)
    throw new AnalysisValidationError("Invalid brief model.");
  const durationMs = nonnegativeNumber(meta.durationMs, "duration");
  const retrievedChunks = nonnegativeNumber(meta.retrievedChunks, "evidence count", true);
  if (retrievedChunks !== evidence.length)
    throw new AnalysisValidationError(
      "Saved evidence does not match the report sources.",
    );
  const inputTokens =
    meta.inputTokens === undefined
      ? undefined
      : nonnegativeNumber(meta.inputTokens, "input token count", true);
  const outputTokens =
    meta.outputTokens === undefined
      ? undefined
      : nonnegativeNumber(meta.outputTokens, "output token count", true);
  return {
    ...content,
    id: data.id,
    createdAt: data.createdAt,
    meta: {
      provider: meta.provider,
      model: meta.model,
      durationMs,
      retrievedChunks,
      ...(inputTokens === undefined ? {} : { inputTokens }),
      ...(outputTokens === undefined ? {} : { outputTokens }),
    },
  };
}

/** Browser storage is untrusted. A damaged entry must not hide other briefs. */
export function readSavedBriefs(value: unknown): SavedBrief[] {
  if (!Array.isArray(value)) return [];
  const briefs: SavedBrief[] = [];
  const seen = new Set<string>();
  // Normal history contains only eight records. Bound corrupt/hostile input too.
  for (const item of value.slice(0, 64)) {
    if (briefs.length >= 8) break;
    try {
      const saved = record(item);
      // Explicit reconstruction drops unknown fields, including API keys, from
      // the input, every source, result, hypotheses, citations and metadata.
      const input = validateInput(saved.input);
      const result = parseResult(saved.result, input);
      if (seen.has(result.id)) continue;
      seen.add(result.id);
      briefs.push({ result, input });
    } catch {
      // Local history is optional; corrupt records are omitted independently.
    }
  }
  return briefs;
}
