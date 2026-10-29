# Benchmark definitions

The 13-case dataset contains 4 correct/defect pairs, missing requirements, an interaction failure, login, and 2 held-out wording variants. Evaluator labels and fixture choices are not passed to the model. Model prompts contain no held-out examples. The held-out set is small and is not a statistically independent general-web benchmark.

`npm run eval` measures scripted infrastructure only. `npm run eval:ai` executes the configured model against the same cases and writes a separate file. Do not aggregate the modes or describe deterministic policy success as autonomous AI performance.

Every rate stores numerator, denominator and rate; zero denominators yield null, never a fabricated score.

| Metric                   | Numerator                                            | Denominator                                                               |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Bug precision            | True product-failure predictions                     | All product-failure predictions                                           |
| Bug recall               | True product-failure predictions                     | Cases labeled product failure                                             |
| False reports on correct | Correct cases predicted product failure              | Cases labeled passed                                                      |
| Task completion          | Verifiable cases with every original check completed | Cases labeled passed or product failure                                   |
| Agent failure            | Runs classified agent_failure                        | All cases, including the intended interaction-failure case                |
| Inconclusive             | Runs classified inconclusive                         | All cases, including the intended ambiguous case                          |
| Reproduction             | Findings confirmed in clean replay                   | All product-failure predictions                                           |
| Export validation        | Exports verified against correct and broken fixtures | Produced verified or unverified exports                                   |
| Verdict accuracy         | Exact expected verdict matches                       | All cases                                                                 |
| Runtime                  | Sum of queue-to-completion wall times                | All cases (milliseconds, arithmetic mean)                                 |
| Usage                    | Sum of reported input/output tokens                  | All cases; unavailable usage is not interpreted as known provider billing |

Estimated cost is null unless every case has available token counts and explicit configured rates. Scripted runs have no model calls; the UI still labels unavailable cost as unknown.

The handwritten comparison executes eight Playwright browser cases with the same four explicit business rules against both variants. It requires assertion-specific failures, not arbitrary browser errors, to count a defect detection. It provides a deterministic baseline, not proof of general agent intelligence.

Raw results are kept in `docs/benchmark-scripted.json` and (when run) `docs/benchmark-ai.json`; artifacts and full run records remain in `data/`. Evaluation UI does not populate fabricated default results.

## Execution-failure fixture correction

The first full AI measurement used `/health` as a presumed interaction failure. The agent recovered by navigating to the storefront and completed the original business checks, so that fixture did not guarantee an execution failure. Its observed pass was valid and is preserved in `benchmark-ai-initial.json`.

The corrected `blocked-redirect` case starts at `/outbound`. That route redirects to `http://tracepilot-blocked.invalid/`, which is not an allowed origin. Browser routing rejects it before outbound traffic is sent. This creates a real, deterministic navigation/tool failure without asking the model to predict a label. The case remains one of the 13 total cases.

The follow-up full measurement uses this corrected fixture and the replay provenance fix. All business expectations, model prompts, model options and held-out wording cases are unchanged. The initial and follow-up manifests make source differences explicit. The held-out results are a small regression check; their replay evidence helped diagnose an executor bug and should not be presented as independent evidence of generalization.
