# Architecture and tradeoffs

Traceboard turns a bounded collection of text files into an evidence-backed debugging brief. It deliberately avoids repository crawling, command execution, an embedding API, and a persistent database. This keeps the first version inexpensive to run and makes the material sent to the model inspectable.

## Boundaries

| Layer            | Responsibility                                                                         |
| ---------------- | -------------------------------------------------------------------------------------- |
| React workspace  | Collect the report and source text, select the mode, inspect citations, export a brief |
| App Router API   | Validate request limits, select a credential, return useful failure states             |
| Retrieval engine | Preserve source line numbers and rank evidence against the report                      |
| Groq transport   | Call a fixed HTTPS endpoint with a timeout and JSON response mode                      |
| Output validator | Check required fields and reject citations outside supplied evidence                   |

The retrieval engine and model-output parser are ordinary TypeScript modules. Tests can exercise them without starting a browser, Worker, or live provider.

## Request flow

1. The browser submits a title, description, source files, mode, and optional model and session key.
2. The server enforces input limits before invoking a provider. File names are labels: they are never opened as filesystem paths or fetched as URLs.
3. Source text is divided into chunks with stable file identifiers and line ranges. Lexical relevance selects a bounded evidence set.
4. The system prompt describes the output contract. Report text and evidence are provided as data, with an instruction to ignore instructions embedded in that data.
5. Groq returns JSON. The application validates its shape and checks citation identifiers, ranges, and quotes against the evidence before accepting it.
6. The browser renders hypotheses, confidence labels, verification steps, and missing context. Export uses the same structured result.

Prompt boundaries reduce ambiguity; they do not eliminate prompt injection or guarantee factual correctness. Source validation supplies a separate, deterministic check that the cited text was available.

## Demo behavior

The checkout timeout, CORS, and stale-closure incidents have curated fixture results. A sample is eligible only when its title, description, and source contents match the supplied case. Editing a sample cannot silently reuse its old answer. Demo results identify their provider as `demo`; live provider failures remain failures and do not become demo successes.

The fixtures make the interaction reviewable without credentials. They are not a substitute for evaluating an actual model.

## Credentials and data

A server-side `GROQ_API_KEY` can be supplied through the runtime environment. Alternatively, a user can enter a key in the app; the client keeps it in memory and sends it to the server for live requests. The transport forwards it only to the fixed Groq API endpoint. Configuration responses reveal whether a key is available, never the value.

Neither the model nor the app executes proposed debugging commands. The application does not fetch arbitrary URLs, clone repositories, or write uploaded file names to disk. A live request sends report text and selected source evidence to Groq, so use material you are permitted to share.

The Sites deployment starts private. If adapting the app for public use with a shared provider key, add server-side authentication and a distributed quota before opening access. In-memory counters alone would not reliably enforce a quota across Worker instances.

## Why lexical retrieval first

Bug reports often contain exact signals such as error names, symbols, configuration keys, and status codes. Lexical scoring is a useful, transparent baseline for that input, with no model download or embedding charge. It struggles with paraphrases and evidence that depends on a larger call graph.

A useful next experiment is a fixed labeled incident set comparing lexical retrieval with hybrid retrieval. Measure whether the relevant source lines make it into context before comparing the generated explanations. Do not add a vector database solely to increase the number of services in the architecture.

## Provider selection

The default is `openai/gpt-oss-20b` on Groq. Model IDs and free quotas are provider-controlled; consult [Groq's current model list](https://console.groq.com/docs/models) and account limits. JSON response mode constrains syntax, while application validation enforces the domain contract. Changing the model should include a manual run of the same incident set and comparison of citations, useful checks, latency, and token usage.

## Public repository footprint

The application has no database, connector integration, or server-side record
store. Unused starter components, database examples, and connector scaffolding
were removed. Only the framework's optional Sites build integration remains;
`npm ci` and local development do not require a Sites or Cloudflare account.

Input limits are shared between request handling and restored briefs in
`lib/traceboard/limits.ts`. Browser history uses `useSyncExternalStore` with a
stable server snapshot, cached validated client snapshots, and storage events
for cross-tab updates. Provider keys are never part of that store.
