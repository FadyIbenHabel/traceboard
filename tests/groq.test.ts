import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  DEFAULT_MODEL,
  INPUT_LIMITS,
  analyzeWithGroq,
  errorResponse,
  readJsonBody,
  validateModel,
  validateRequest,
} from "../lib/groq.ts";
import {
  SAMPLE_CASES,
  analyzeDemo,
  type AnalysisInput,
} from "../lib/traceboard/index.ts";
import { POST } from "../app/api/analyze/route.ts";
import { GET } from "../app/api/config/route.ts";

const input = (): AnalysisInput => ({
  ...structuredClone(SAMPLE_CASES[0]),
  mode: "groq",
  model: DEFAULT_MODEL,
});
const key = "gsk_test_key_never_return_this_value";
const rejectedWith = (code: string) => (error: unknown) =>
  error instanceof ApiError && error.code === code;
const responseWith = (data: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const mockFetch = (
  handler: (
    url: string | URL | Request,
    init?: RequestInit,
  ) => Response | Promise<Response>,
): typeof fetch => handler as typeof fetch;

test("request validation strips unknown fields and does not mix an API key into the model input", () => {
  const { input: parsed, apiKey } = validateRequest({
    ...input(),
    apiKey: key,
    arbitrary: "not copied",
  });
  assert.equal(apiKey, key);
  assert.equal(parsed.mode, "groq");
  assert.equal(Object.hasOwn(parsed, "apiKey"), false);
  assert.equal(Object.hasOwn(parsed, "arbitrary"), false);
});

test("request validation rejects duplicate source IDs, oversized source files and unsupported modes", () => {
  const request = input();
  assert.throws(
    () =>
      validateRequest({
        ...request,
        sources: [request.sources[0], request.sources[0]],
      }),
    rejectedWith("INVALID_INPUT"),
  );
  assert.throws(
    () =>
      validateRequest({
        ...request,
        sources: [
          {
            ...request.sources[0],
            content: "x".repeat(INPUT_LIMITS.sourceChars + 1),
          },
        ],
      }),
    rejectedWith("INVALID_INPUT"),
  );
  assert.throws(
    () => validateRequest({ ...request, mode: "magic" }),
    rejectedWith("INVALID_MODE"),
  );
  assert.throws(
    () => validateRequest({ ...request, apiKey: "gsk_secret\nInjected: value" }),
    rejectedWith("INVALID_API_KEY"),
  );
});

test("model IDs allow Groq namespace IDs but reject URLs, spaces and newlines", () => {
  assert.equal(validateModel(undefined), DEFAULT_MODEL);
  assert.equal(validateModel("llama-3.1-8b-instant"), "llama-3.1-8b-instant");
  for (const model of [
    "https://example.com",
    "bad model",
    "foo\nbar",
    "",
    "x".repeat(101),
  ]) {
    assert.throws(() => validateModel(model), rejectedWith("INVALID_MODEL"));
  }
});

test("bounded JSON reader rejects an oversized stream even without Content-Length", async () => {
  let canceled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(INPUT_LIMITS.bodyBytes + 1));
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request("https://traceboard.test/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(readJsonBody(request), rejectedWith("INPUT_TOO_LARGE"));
  assert.equal(canceled, true);
});

test("JSON reader rejects bad content type and malformed JSON", async () => {
  await assert.rejects(
    readJsonBody(new Request("https://example.test", { method: "POST", body: "{}" })),
    rejectedWith("INVALID_CONTENT_TYPE"),
  );
  await assert.rejects(
    readJsonBody(
      new Request("https://example.test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{nope",
      }),
    ),
    rejectedWith("INVALID_JSON"),
  );
});

test("live analysis without a key fails before any outbound request", async () => {
  let called = false;
  await assert.rejects(
    analyzeWithGroq(input(), {
      fetchImpl: mockFetch(() => {
        called = true;
        return responseWith({});
      }),
    }),
    rejectedWith("API_KEY_REQUIRED"),
  );
  assert.equal(called, false);
});

test("oversized retrieved prompts are rejected before consuming free provider quota", async () => {
  let called = false;
  const oversized = {
    ...input(),
    sources: [
      {
        id: "long-line",
        name: "large.log",
        content: "checkout timeout ".repeat(2_000),
      },
    ],
  };
  await assert.rejects(
    analyzeWithGroq(oversized, {
      apiKey: key,
      fetchImpl: mockFetch(() => {
        called = true;
        return responseWith({});
      }),
    }),
    rejectedWith("CONTEXT_TOO_LARGE"),
  );
  assert.equal(called, false);
});

test("provider failures are sanitized, preserve useful status and never silently become demo results", async () => {
  for (const [status, code] of [
    [401, "GROQ_AUTH"],
    [403, "GROQ_ACCESS"],
    [404, "GROQ_MODEL"],
    [429, "GROQ_RATE_LIMIT"],
    [503, "GROQ_UNAVAILABLE"],
  ] as const) {
    await assert.rejects(
      analyzeWithGroq(input(), {
        apiKey: key,
        fetchImpl: mockFetch(() =>
          responseWith(
            { error: { message: `internal provider detail ${key}` } },
            status,
            { "retry-after": "7" },
          ),
        ),
      }),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.code, code);
        assert.ok(!error.message.includes(key));
        if (status === 429) assert.equal(error.retryAfter, 7);
        return true;
      },
    );
  }
});

test("provider content must pass evidence and structure validation", async () => {
  for (const content of [
    "not json",
    JSON.stringify({ summary: "I guessed this", hypotheses: [] }),
  ]) {
    await assert.rejects(
      analyzeWithGroq(input(), {
        apiKey: key,
        fetchImpl: mockFetch(() =>
          responseWith({
            choices: [{ message: { content }, finish_reason: "stop" }],
          }),
        ),
      }),
      rejectedWith("INVALID_ANALYSIS"),
    );
  }
  await assert.rejects(
    analyzeWithGroq(input(), {
      apiKey: key,
      fetchImpl: mockFetch(() =>
        responseWith({
          choices: [{ message: { content: "{}" }, finish_reason: "length" }],
        }),
      ),
    }),
    rejectedWith("INCOMPLETE_ANALYSIS"),
  );
});

test("a validated provider report contains real usage metadata and a fixed HTTPS provider endpoint", async () => {
  const canned = analyzeDemo({ ...input(), mode: "demo" });
  let calls = 0;
  const result = await analyzeWithGroq(input(), {
    apiKey: key,
    fetchImpl: mockFetch((url, init) => {
      calls++;
      assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), `Bearer ${key}`);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, DEFAULT_MODEL);
      assert.equal(body.response_format.type, "json_object");
      assert.equal(body.reasoning_effort, "low");
      assert.ok(!JSON.stringify(body.messages).includes(key));
      return responseWith({
        choices: [
          {
            message: { content: JSON.stringify(canned) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 123, completion_tokens: 456 },
      });
    }),
  });
  assert.equal(calls, 1);
  assert.equal(result.meta.provider, "groq");
  assert.equal(result.meta.model, DEFAULT_MODEL);
  assert.equal(result.meta.inputTokens, 123);
  assert.equal(result.meta.outputTokens, 456);
  assert.ok(result.meta.retrievedChunks > 0);
});

test("outbound network errors do not expose request keys", async () => {
  await assert.rejects(
    analyzeWithGroq(input(), {
      apiKey: key,
      fetchImpl: mockFetch(() => {
        throw new Error(`request failed with ${key}`);
      }),
    }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === "GROQ_CONNECTION" &&
      !error.message.includes(key),
  );
  const response = errorResponse(new Error(`sensitive ${key}`));
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes(key));
});

test("timeout aborts the provider fetch and reports a useful timeout error", async () => {
  await assert.rejects(
    analyzeWithGroq(input(), {
      apiKey: key,
      timeoutMs: 5,
      fetchImpl: mockFetch(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    }),
    rejectedWith("GROQ_TIMEOUT"),
  );
});

test("analysis route rejects cross-origin calls before touching payloads or keys", async () => {
  const response = await POST(
    new Request("https://traceboard.test/api/analyze", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.test",
      },
      body: JSON.stringify({ ...input(), apiKey: key }),
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "INVALID_ORIGIN");
});

test("analysis route serves unchanged demo cases and rejects edited demos explicitly", async () => {
  const request = (title = input().title) =>
    new Request("https://traceboard.test/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input(), title, mode: "demo" }),
    });
  const response = await POST(request());
  assert.equal(response.status, 200);
  const successBody = (await response.json()) as {
    result: { meta: { provider: string } };
  };
  assert.equal(successBody.result.meta.provider, "demo");
  const edited = await POST(request("An unrelated custom incident"));
  assert.equal(edited.status, 400);
  const errorBody = (await edited.json()) as { error: { code: string } };
  assert.equal(errorBody.error.code, "DEMO_SAMPLE_REQUIRED");
});

test("config exposes server availability and model preference without leaking a server key", async (context) => {
  const previousKey = process.env.GROQ_API_KEY;
  const previousModel = process.env.GROQ_MODEL;
  context.after(() => {
    if (previousKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = previousModel;
  });
  process.env.GROQ_API_KEY = key;
  process.env.GROQ_MODEL = "llama-3.3-70b-versatile";
  const response = await GET();
  const body = await response.text();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(!body.includes(key));
  assert.equal(JSON.parse(body).configured, true);
  assert.equal(JSON.parse(body).defaultModel, "llama-3.3-70b-versatile");
  process.env.GROQ_MODEL = "invalid model id";
  assert.equal(
    ((await (await GET()).json()) as { defaultModel: string }).defaultModel,
    DEFAULT_MODEL,
  );
});
