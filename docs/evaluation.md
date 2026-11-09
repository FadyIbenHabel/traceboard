# Evaluation

Traceboard separates deterministic application checks from model-quality evaluation. Run the checks locally with:

```sh
npm run typecheck
npm test
npm run build
```

The test suite uses Node's test runner. Provider tests use mocked responses and do not require an API key or consume a free quota.

## What to check

| Area                | Contract                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Retrieval           | Relevant sample evidence is retrievable; source IDs and line ranges remain valid                            |
| Citation validation | Unknown sources, invented quotes, and ranges outside retrieved evidence are rejected                        |
| Output validation   | Malformed JSON and missing or invalid fields do not reach the renderer as a successful result               |
| Demo integrity      | Unchanged sample inputs work; edited or custom inputs cannot obtain an unrelated fixture answer             |
| Provider transport  | Missing keys, authentication failures, rate limits, timeouts, and invalid responses produce explicit errors |
| Secrets             | Provider errors and configuration responses do not include credentials                                      |

Read the individual tests for the cases currently covered. These checks establish program behavior, not the correctness of a language model's diagnosis.

## Manual live-model review

Use your own Groq key and select a model available to your account. Start with the three supplied incidents so you can compare live responses with known evidence. Record the model ID and date because availability and behavior can change.

For each incident, review:

1. **Retrieval:** were the lines needed to explain the failure included in context?
2. **Grounding:** do the cited lines support each hypothesis, beyond merely existing?
3. **Usefulness:** can an engineer run the proposed checks, and would the result distinguish likely causes?
4. **Uncertainty:** does the response ask for missing context when the report cannot establish a cause?
5. **Cost and latency:** record returned token counts and elapsed time when available.

Then add a report with no relevant evidence, a misleading report, contradictory files, and source text containing an instruction to ignore the task. The desired result is cautious, evidence-based investigation rather than confident invention.

## Building a credible benchmark

Create a versioned set of incidents with expected relevant files and line ranges. Keep a held-out set separate from examples used to tune the prompt. Score evidence recall independently from the quality of the generated brief; otherwise a retrieval failure can be mistaken for a reasoning failure.

Have a human reviewer label whether each hypothesis is supported and whether each check is actionable. Save the model, prompt version, retrieval settings, and raw structured results with credentials removed. Publish the denominator and failure cases alongside any aggregate score.

This repository does not claim a diagnostic accuracy percentage, production readiness, or a completed live-model benchmark. Without a real key, only the offline application contracts can be verified.
