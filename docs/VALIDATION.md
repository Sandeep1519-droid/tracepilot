# Executed validation

The benchmark measurements below were recorded on 25 October 2026; publication checks reran the 19-test suite, lifecycle checks and build. Model and scripted results are kept separate.

| Check                                   | Recorded result                                                                                                                                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                              | 19 tests passed: schema boundaries, navigation, exact cents, verdicts, evidence references, safe exports, ordered verification prerequisites, observation-bound schemas, provider privacy and keyboard activation.                             |
| `npm run test:lifecycle`                | Passed: one-run admission, queued cancellation, stale lease ownership, interrupted recovery and SQLite persistence in a fresh process.                                                                                                         |
| `npm run test:integration`              | 8 checks passed, including real Chromium broken/correct coupons, clean replay, exact export validation, missing requirements, tool failure, active cancellation, artifacts, origin boundaries, actual UI form/report flow and mobile overflow. |
| `npm run eval`                          | All 13 scripted cases matched their expected verdicts. These are infrastructure checks, not AI capability scores.                                                                                                                              |
| Handwritten comparison                  | All 8 cases matched (four business rules, each correct and broken).                                                                                                                                                                            |
| Export validation in scripted benchmark | 10/11 generated exports verified against both variants; login deliberately unverified because it uses credentials.                                                                                                                             |
| `npm run smoke:ai`                      | Local Ollama `qwen3:4b` detected the expired-coupon defect, clean replay confirmed it, and the exact export was verified.                                                                                                                      |
| `npm run smoke:ai -- --correct`         | The same local model and original checks passed the correct fixture; export verified.                                                                                                                                                          |
| Full application restart                | All 74 recorded run IDs, lifecycle states and verdicts survived; the AI report and screenshot remained accessible.                                                                                                                             |
| `npm run build` / `npm run typecheck`   | Passed. Vite emits harmless third-party PURE-comment warnings from Zod.                                                                                                                                                                        |
| `npm audit --audit-level=high`          | Zero vulnerabilities.                                                                                                                                                                                                                          |
| Source/document credential scan         | No generated local control token or demo password found in source, tests, docs or example configuration.                                                                                                                                       |

The full 13-case local-model benchmark has now been executed. The initial measurement is preserved, and the latest results and remaining model limitations are described in [AI benchmark analysis](AI-BENCHMARK.md). Earlier unsuccessful local-model attempts remain honestly classified as agent failures in local history; an initial result snapshot is retained in `model-smoke-initial.json`.

The latest full AI measurement matched 8/13 expected verdicts, detected 3/5 known defects, and reported no false product failures on correct fixtures. All three findings reproduced and all six produced exports verified. Five model-execution stalls remain; `npm run eval:ai` intentionally exits nonzero for those mismatches.

Additional checks: `npm run test:evaluations` passed mode isolation, actual recorded rows, evidence navigation and mobile layout. A two-process regression test reproduces the SQLite writer race before the fix and passes 500 create/cancel cycles against 1,000 heartbeat updates after immediate transaction acquisition. Replay tests verify that only proven pre-execution rejections may be omitted, while original assertions and uncertain failures are preserved.

Raw evidence:

- `benchmark-ai.json`: latest full local-model measurement; `benchmark-ai-initial.json` preserves the first full measurement.
- `ai-benchmark-manifest.json`: model digest, model options, and source fingerprints.
- `evaluations-ai.png`: actual model benchmark ledger; a local ignored evaluation UI record captures mode isolation and evidence navigation checks.
- `benchmark-scripted.json`: all per-case predictions, denominators, runtime, usage and handwritten comparison.
- `model-smoke.json`: actual broken-fixture local model execution summaries.
- `model-smoke-correct.json`: actual correct-fixture local model execution summaries.
- The application restart preservation record remains local (ignored).
- `sample-report/report.json`, `sample-report/regression.spec.ts`, `sample-report/failure.png`: actual scripted defect report and generated test.
- `ai-run.png`, `dashboard.png`, `evaluations.png`, `workspace-mobile.png`: actual UI captures.

Reproduce the full validation with the documented README commands. Run browser harnesses sequentially, because one active application run is supported.
