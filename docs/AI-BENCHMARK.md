# Local AI benchmark

The full 13-case benchmark was executed with local Ollama **qwen3:4b**, without paid API calls. This measures the controlled demo and does not establish general-web reliability.

The follow-up completed all 13 cases and exits with code 1 because five expected verdicts do not match. The small model is useful for the coupon and quantity flows but is not yet reliable across all supported workflows.

## Measured results

| Metric                             | Recorded result                              |
| ---------------------------------- | -------------------------------------------- |
| Verdict matches                    | 8/13 (61.5%)                                 |
| Bug precision                      | 3/3 (100.0%)                                 |
| Bug recall                         | 3/5 (60.0%)                                  |
| False bug reports on correct cases | 0/6 (0.0%)                                   |
| Business-task completion           | 6/11 (54.5%)                                 |
| Agent failure                      | 6/13 (46.2%)                                 |
| Inconclusive                       | 1/13 (7.7%)                                  |
| Clean-session reproduction         | 3/3 (100.0%)                                 |
| Export verification                | 6/6 (100.0%)                                 |
| Mean runtime                       | 42.8 seconds/case                            |
| Model usage                        | 68,333 input / 2,249 output tokens           |
| Estimated cost                     | Unknown; no provider token prices configured |
| Handwritten comparison             | 8/8 cases matched                            |

The six agent-failure verdicts include one intentional blocked-redirect case and five unexpected model stalls. The five mismatches are two coupon-removal cases, two checkout cases, and login. Zero false reports does not imply high coverage: the model missed two defect families by failing to reach the required interactions. Runtime is one local-development measurement, including queue, evidence, replay and export validation; it is not a latency guarantee.

## Case ledger

| Case                | Expected        | Recorded        | Evaluation | Evidence                                                                    |
| ------------------- | --------------- | --------------- | ---------- | --------------------------------------------------------------------------- |
| coupon-correct      | passed          | passed          | Matched    | `970a2ce8` |
| coupon-defect       | product_failure | product_failure | Matched    | `4409390c` |
| quantity-correct    | passed          | passed          | Matched    | `30277409` |
| quantity-defect     | product_failure | product_failure | Matched    | `7ef1ef99` |
| removal-correct     | passed          | agent_failure   | Mismatch   | `93300a91` |
| removal-defect      | product_failure | agent_failure   | Mismatch   | `d4fda026` |
| checkout-correct    | passed          | agent_failure   | Mismatch   | `a770a5e8` |
| checkout-defect     | product_failure | agent_failure   | Mismatch   | `acb0e0f9` |
| missing-requirement | inconclusive    | inconclusive    | Matched    | `544313af` |
| blocked-redirect    | agent_failure   | agent_failure   | Matched    | `0a40ecc8` |
| login-correct       | passed          | agent_failure   | Mismatch   | `652049cb` |
| alternate-coupon    | product_failure | product_failure | Matched    | `3f115342` |
| alternate-quantity  | passed          | passed          | Matched    | `1b1b8845` |

Run IDs identify records in the originating local database; they are not live links in a fresh clone. The aggregate results are retained in `benchmark-ai.json`.

## Failure analysis

- Coupon removal: the model repeatedly observed the storefront and never opened the cart. Neither fixture reached any business assertion.
- Checkout: the model repeatedly clicked Shop instead of opening checkout. No checkout defect was inferred from those navigation failures.
- Login: the model entered the literal credential reference “demo” as an email, then repeated filling/tabbing instead of using the configured credential tool. Secrets remained outside prompts, screenshots and traces.

These are model execution limitations. Scripted infrastructure results remain separate. No business assertions were weakened, and no scripted policy was used in place of model decisions.

## Issues fixed during evaluation

1. **Invalid failure fixture.** The initial benchmark used a health endpoint as a presumed execution failure. The agent navigated back to the store and legitimately completed its original checks. The observed pass remains in the initial report. The replacement `blocked-redirect` case starts at `/outbound`, which redirects to an unconfigured `.invalid` origin. Browser routing blocks it before external traffic is sent, yielding a deterministic real tooling failure.
2. **Replaying rejected actions.** The first held-out coupon attempt recovered from an Apply action rejected before baseline capture, but clean replay retried that rejection and stopped. Events now record execution provenance. Only actions proven rejected before execution are omitted from replay/export, with audit entries. Partially executed and legacy uncertain failures are retained. The follow-up alternate-coupon run reproduced its defect and its generated regression verified against both variants.

3. **Concurrent SQLite writers.** The later scripted comparison exposed a `SQLITE_BUSY_SNAPSHOT` race between a deferred run-admission transaction and the worker heartbeat. A two-process regression test reproduced it before the fix. Read/write store transactions now acquire an immediate writer reservation before reading. The test passes with 500 create/cancel cycles and 1,000 concurrent heartbeat updates. This post-measurement job-store fix does not change model prompts, recorded AI verdicts, or business assertions.

Both full measurements are preserved: [initial](benchmark-ai-initial.json) and [follow-up](benchmark-ai.json). The source manifests record model digest, options and code fingerprints. The model prompt and original business expectations are unchanged. The small wording set was not used for prompt tuning; its replay evidence helped diagnose an executor bug, so follow-up wording results are regression checks rather than independent generalization evidence.

Every recorded assertion preserved its original expectation; see [evidence audit](ai-benchmark-evidence-audit.json). Remaining work is improving model navigation/planning and credential-reference use, then evaluating against a fresh unseen case set. A real-application integration requires a non-production target URL and explicit verification fixtures.
