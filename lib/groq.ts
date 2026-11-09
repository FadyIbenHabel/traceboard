import {
  type AnalysisInput,
  type AnalysisResult,
  buildMessages,
  parseAnalysis,
  retrieveEvidence,
} from "./traceboard/index.ts";

export const DEFAULT_MODEL = "openai/gpt-oss-20b";
export const MODELS = [
  { id: DEFAULT_MODEL, label: "GPT OSS 20B · fast" },
  { id: "openai/gpt-oss-120b", label: "GPT OSS 120B · capable" },
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B · access varies" },
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B · access varies" },
] as const;

export const INPUT_LIMITS = {
  bodyBytes: 128_000,
  sources: 6,
  sourceChars: 15_000,
  totalSourceChars: 60_000,
  descriptionChars: 8_000,
} as const;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter?: number;

  constructor(
    code: string,
    message: string,
    status = 400,
    retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function validateModel(value: unknown): string {
  const model = value === undefined ? DEFAULT_MODEL : value;
  if (
    typeof model !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$/.test(model)
  ) {
    throw new ApiError(
      "INVALID_MODEL",
      "Choose a valid Groq model ID (up to 100 characters).",
    );
  }
  return model;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function field(value: unknown, name: string, min: number, max: number): string {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.length > max
  ) {
    throw new ApiError(
      "INVALID_INPUT",
      `${name} must contain ${min}–${max.toLocaleString("en-US")} characters.`,
    );
  }
  return value;
}

export function validateRequest(value: unknown): {
  input: AnalysisInput;
  apiKey?: string;
} {
  if (!record(value))
    throw new ApiError(
      "INVALID_INPUT",
      "Send a JSON object with a report and source files.",
    );
  if (value.mode !== "demo" && value.mode !== "groq") {
    throw new ApiError("INVALID_MODE", "Choose demo or Groq analysis.");
  }
  const title = field(value.title, "Report title", 3, 160);
  const description = field(
    value.description,
    "Bug description",
    10,
    INPUT_LIMITS.descriptionChars,
  );
  if (
    !Array.isArray(value.sources) ||
    value.sources.length < 1 ||
    value.sources.length > INPUT_LIMITS.sources
  ) {
    throw new ApiError(
      "INVALID_INPUT",
      `Attach 1–${INPUT_LIMITS.sources} text source files.`,
    );
  }
  const ids = new Set<string>();
  let total = 0;
  const sources = value.sources.map((source: unknown) => {
    if (!record(source))
      throw new ApiError(
        "INVALID_INPUT",
        "Each source must include id, name and content.",
      );
    const id = field(source.id, "Source ID", 1, 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) {
      throw new ApiError(
        "INVALID_INPUT",
        "Source IDs must be unique and use letters, numbers, dashes or underscores.",
      );
    }
    ids.add(id);
    const name = field(source.name, "File name", 1, 160);
    const content = field(
      source.content,
      `Content of ${name}`,
      1,
      INPUT_LIMITS.sourceChars,
    );
    total += content.length;
    return { id, name, content };
  });
  if (total > INPUT_LIMITS.totalSourceChars) {
    throw new ApiError(
      "INPUT_TOO_LARGE",
      `Source files must total at most ${INPUT_LIMITS.totalSourceChars.toLocaleString("en-US")} characters.`,
      413,
    );
  }
  let apiKey: string | undefined;
  if (value.apiKey !== undefined && value.apiKey !== "") {
    if (
      typeof value.apiKey !== "string" ||
      !/^[\x21-\x7e]{16,256}$/.test(value.apiKey)
    ) {
      throw new ApiError(
        "INVALID_API_KEY",
        "Enter a valid Groq API key without whitespace.",
      );
    }
    apiKey = value.apiKey;
  }
  return {
    input: {
      title,
      description,
      sources,
      mode: value.mode,
      model: value.model === undefined ? undefined : validateModel(value.model),
    },
    apiKey,
  };
}

async function getRuntimeValue(
  name: "GROQ_API_KEY" | "GROQ_MODEL",
): Promise<string | undefined> {
  // Cloudflare runtime bindings are the deployed source of truth. Dynamic import
  // keeps Node-based local tooling and tests independent of the Workers runtime.
  try {
    const { env } = await import("cloudflare:workers");
    const value = (env as unknown as Record<string, unknown>)[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // Local Node and Vite dev can supply the same environment variable.
  }
  const value = typeof process !== "undefined" ? process.env[name] : undefined;
  return value?.trim() || undefined;
}

/** Keys are read only at request time, never returned by /api/config or logged. */
export async function getServerApiKey(): Promise<string | undefined> {
  return getRuntimeValue("GROQ_API_KEY");
}

export async function getDefaultModel(): Promise<string> {
  try {
    return validateModel(await getRuntimeValue("GROQ_MODEL"));
  } catch {
    return DEFAULT_MODEL;
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new ApiError(
      "INVALID_CONTENT_TYPE",
      "Send the report as application/json.",
      415,
    );
  }
  const announcedLength = Number(request.headers.get("content-length"));
  if (announcedLength > INPUT_LIMITS.bodyBytes) {
    throw new ApiError(
      "INPUT_TOO_LARGE",
      "The request is too large. Use smaller text files.",
      413,
    );
  }
  if (!request.body)
    throw new ApiError("INVALID_JSON", "The request body is empty.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > INPUT_LIMITS.bodyBytes) {
        await reader.cancel();
        throw new ApiError(
          "INPUT_TOO_LARGE",
          "The request is too large. Use smaller text files.",
          413,
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("INVALID_JSON", "The request body must be valid JSON.");
  } finally {
    reader.releaseLock();
  }
}

function providerError(status: number, retryHeader: string | null): ApiError {
  if (status === 401)
    return new ApiError(
      "GROQ_AUTH",
      "Groq rejected this API key. Check your key in connection settings.",
      401,
    );
  if (status === 403)
    return new ApiError(
      "GROQ_ACCESS",
      "Your Groq account cannot access this model. Try a different model in connection settings.",
      403,
    );
  if (status === 404)
    return new ApiError(
      "GROQ_MODEL",
      "This model is unavailable on your Groq account. Choose another supported model.",
      400,
    );
  if (status === 429) {
    const retry = Number(retryHeader);
    const retryAfter =
      Number.isFinite(retry) && retry > 0
        ? Math.min(Math.ceil(retry), 3600)
        : undefined;
    return new ApiError(
      "GROQ_RATE_LIMIT",
      "Groq's rate limit was reached. Wait before running another analysis, or choose a smaller model.",
      429,
      retryAfter,
    );
  }
  if (status === 400 || status === 422)
    return new ApiError(
      "GROQ_REQUEST",
      "Groq could not process this report with the selected model. Try fewer source files or another model.",
      502,
    );
  return new ApiError(
    "GROQ_UNAVAILABLE",
    "Groq is temporarily unavailable. Please try again shortly.",
    503,
  );
}

export async function analyzeWithGroq(
  input: AnalysisInput,
  options: {
    apiKey?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<AnalysisResult> {
  if (!options.apiKey) {
    throw new ApiError(
      "API_KEY_REQUIRED",
      "Add a Groq API key in connection settings, or explore a sample in demo mode.",
      400,
    );
  }
  const model = validateModel(input.model);
  const evidence = retrieveEvidence(input);
  const messages = buildMessages(input, evidence);
  if (JSON.stringify(messages).length > 20_000) {
    throw new ApiError(
      "CONTEXT_TOO_LARGE",
      "The retrieved evidence is too large for this compact analysis. Use a shorter bug description or smaller, more focused source files.",
      413,
    );
  }
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 45_000,
  );
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.1,
          max_completion_tokens: 2800,
          response_format: { type: "json_object" },
          ...(model.startsWith("openai/gpt-oss-")
            ? { reasoning_effort: "low" }
            : {}),
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok)
      throw providerError(response.status, response.headers.get("retry-after"));
    const data: unknown = await response.json();
    if (
      !record(data) ||
      !Array.isArray(data.choices) ||
      !record(data.choices[0])
    ) {
      throw new ApiError(
        "INVALID_PROVIDER_RESPONSE",
        "Groq returned an incomplete result. Please try again.",
        502,
      );
    }
    const choice = data.choices[0];
    if (choice.finish_reason === "length") {
      throw new ApiError(
        "INCOMPLETE_ANALYSIS",
        "The model reached its output limit. Try fewer source files or a more focused report.",
        502,
      );
    }
    const message = choice.message;
    if (!record(message) || typeof message.content !== "string") {
      throw new ApiError(
        "INVALID_PROVIDER_RESPONSE",
        "Groq returned an incomplete result. Please try again.",
        502,
      );
    }
    let result: AnalysisResult;
    try {
      result = parseAnalysis(message.content, evidence, input);
    } catch {
      throw new ApiError(
        "INVALID_ANALYSIS",
        "The model returned a report with invalid evidence or structure. Please try again; no unverified report was saved.",
        502,
      );
    }
    const usage = record(data.usage) ? data.usage : {};
    const count = (value: unknown): number | undefined =>
      typeof value === "number" && Number.isInteger(value) && value >= 0
        ? value
        : undefined;
    return {
      ...result,
      meta: {
        provider: "groq",
        model,
        durationMs: Date.now() - startedAt,
        retrievedChunks: evidence.length,
        inputTokens: count(usage.prompt_tokens),
        outputTokens: count(usage.completion_tokens),
      },
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError(
        "GROQ_TIMEOUT",
        "The analysis timed out. Try again with fewer source files.",
        504,
      );
    throw new ApiError(
      "GROQ_CONNECTION",
      "Could not connect to Groq. Check your connection and try again.",
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function jsonResponse(
  value: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(value), { status, headers });
}

export function errorResponse(error: unknown): Response {
  const known =
    error instanceof ApiError
      ? error
      : new ApiError(
          "ANALYSIS_FAILED",
          "The analysis could not be completed. Please try again.",
          500,
        );
  return jsonResponse(
    {
      error: {
        code: known.code,
        message: known.message,
        ...(known.retryAfter ? { retryAfter: known.retryAfter } : {}),
      },
    },
    known.status,
    known.retryAfter ? { "Retry-After": String(known.retryAfter) } : undefined,
  );
}
