# TracePilot

**Browser testing, with proof.** Describe a requirement, execute it in Chromium, inspect each action and assertion, and download a regression test built from the actual execution record.

TracePilot is a local TypeScript application with a React dashboard, Express API, separate Playwright worker, SQLite history, and a deterministic ecommerce store. The application runs locally; the public GitHub repository hosts its source.

![TracePilot dashboard](dashboard.png)

## Start locally

Requirements: Node.js 20.19+ (Node 22 recommended), npm, and Playwright Chromium. SQLite is embedded; no database service or Redis is needed. `better-sqlite3` may require native build tools if a prebuilt binary is unavailable.

```sh
npm install
npx playwright install chromium
npm run dev
```

Open **http://127.0.0.1:5173**. This command starts three processes:

| Process            | Command          | Address                         |
| ------------------ | ---------------- | ------------------------------- |
| React frontend     | `npm run web`    | http://127.0.0.1:5173           |
| API and demo store | `npm run server` | API :4310; store :4311          |
| Browser worker     | `npm run worker` | SQLite queue, no listening port |

`npm run build && npm start` serves the built UI, API, demo, and worker at **http://127.0.0.1:4310**. Run commands from this project directory. One worker and one active run are supported. All servers bind to loopback.

## Strongest demonstration — no paid API

1. Click **Expired coupon** or **New test run**.
2. Keep **Scripted demo · no API needed**.
3. Select **Defect: expired coupon discounts total**.
4. Start the test. Screenshots update after actions; they are checkpoint images, not video.
5. The rejection-message check succeeds, but the total changes from **$72.00 to $59.20**. The unchanged-total assertion fails.
6. TracePilot resets the fixture and repeats the recorded sequence in a clean context. Both attempts remain in the report.
7. Download the Playwright test. A **verified** export means this exact file passed on the correct fixture and failed an original assertion on the broken one.
8. Repeat with **Correct baseline**; the same expectations pass.

The other presets test quantity/subtotal/total arithmetic, valid coupon removal, required checkout validation, and test account login. Each fixture is isolated by an opaque, HttpOnly browser session cookie. Fixture choice and evaluator labels are excluded from agent inputs, visible text, URLs, and DOM attributes.

## Modes

### Scripted demo

Free, deterministic policies select **observed** controls. These policies use the same real Chromium tools, verification, evidence, reproduction, persistence, and export infrastructure as AI mode. The UI labels every such run **Scripted demo**. Scripted metrics are infrastructure checks, never autonomous AI scores. Scripted policies support the bundled store only.

### Free local AI with Ollama

Install Ollama from its official distribution if needed, then run a local model:

```sh
ollama serve
# In another terminal, only if the model is not already installed:
ollama pull qwen3:4b
```

Defaults already target local Ollama at `http://127.0.0.1:11434/v1`, model `qwen3:4b`. Choose **AI model** in the new-run form. No API key is required for local Ollama inference. Hardware and model quality affect latency and reliability; small local models can fail the task, which is reported honestly.

To change model configuration, copy `.env.example` to `.env.local`, edit the nonsecret settings, and restart. TracePilot never downloads a model automatically. See [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility).

### Optional hosted AI

The same adapter supports OpenAI-compatible `/chat/completions` endpoints. Set `MODEL_PROVIDER=openai`, `MODEL_BASE_URL`, `MODEL_NAME`, and an ignored `OPENAI_API_KEY` using secure credential provisioning. No hosted requests are required for development or scripted testing. Hosted providers have their own billing. Do not put keys in forms, source code, reports, or command-line arguments.

The local adapter uses Ollama’s native `/api/chat` with a schema constrained to the current observation; the hosted adapter uses `/chat/completions`.

The agent sees the immutable goal, original expectations, fixture description, supported checks, visible page text, observation-local element identifiers, recent actions, and remaining budget. It returns one schema-validated action. It cannot evaluate JavaScript, run shell commands, inspect source, modify checks, or choose arbitrary selectors. Version one uses structured observations for model decisions; screenshots are recorded for human inspection, not sent as vision inputs.

## Verification contract and verdicts

Lifecycle (`queued`, `running`, `completed`, `cancelled`, `interrupted`) is separate from verdict:

| Verdict           | Meaning                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `passed`          | Every required deterministic assertion completed and passed.                                                                                             |
| `product_failure` | Completed checks contradict an explicit requirement, with recorded evidence. Clean replay is separately marked confirmed, not reproduced, or incomplete. |
| `agent_failure`   | Navigation, model, tooling, target resolution, or execution budgets prevented the required interaction.                                                  |
| `inconclusive`    | Requirements or completed evidence cannot establish correctness.                                                                                         |

Preset expectations compile to fixed checks. Currency is compared in integer cents. Expired coupons require **both rejection and unchanged total**. A failed message alone cannot establish a pass. Missing interaction controls are execution failures, not automatically product defects. The checkout defect is established by an actual order confirmation despite the explicit required-name rule.

V1 does **not** safely compile arbitrary business prose into new executable assertions. Custom expectations without explicit page checks, or edited preset expectations, produce inconclusive after an initial observation. Selecting a supported preset and retaining its expectation enables execution. Additional origins are an opt-in foundation for developer-authored verification contracts. External sites require explicit page checks; arbitrary natural-language business requirements are not automatically verified.

## External website checks

Choose **External website / custom checks** and **AI model**, enter the target and goal, then add page checks. Supported locators are HTML ID, label, exact role/name, and test ID. Checks assert visibility, text equality/containment, or a field value. An optional exact page path prevents a search-results assertion from running on the homepage. These verify the supplied page states; they do not infer arbitrary business logic or action-order prerequisites from prose. Missing contracts remain inconclusive.

Configure exact target origins with `ALLOWED_ORIGINS` in `.env.local` and restart the API and worker. Each navigation and subresource remains restricted to configured origins; multi-origin asset dependencies may require separate explicit configuration. Popups remain blocked. Traces and screenshots come from an isolated Chromium session, which can receive different responses from a regular signed-in browser.

Access challenges and HTTP 401/403/429/5xx pages stop as **inconclusive**, with evidence. TracePilot does not solve challenges or turn unavailability into a product failure. A failed DOM observation still attempts screenshot capture. External exports default to the actual target origin and preserve explicit page paths/checks; their production verification status remains **unverified**, since controlled good/bad fixtures are unavailable.

[Amazon India live test](AMAZON-TEST.md) records an actual local-AI attempt, its HTTP 503 blocker, a separate regular-browser check, and fixes validated on controlled local fixtures. `npm run smoke:amazon` performs a bounded, signed-out search against the configured Amazon origin. `npm run test:external` validates external mechanics locally and the form without sending another Amazon run.

## Configuration

`.env.local` takes precedence over `.env`. Environment values already set in the process take precedence over both.

| Variable                                                      | Default / behavior                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `PORT`, `DEMO_PORT`                                           | `4310`, `4311`                                                           |
| `DATA_DIR`                                                    | `./data` (ignored SQLite, local secrets, screenshots, traces, exports)   |
| `ALLOWED_ORIGINS`                                             | Comma-separated exact origins; bundled demo is always included           |
| `MODEL_PROVIDER`                                              | `ollama`; `openai` enables hosted-key authorization                      |
| `MODEL_BASE_URL`                                              | `http://127.0.0.1:11434/v1`                                              |
| `MODEL_NAME`                                                  | `qwen3:4b`                                                               |
| `OPENAI_API_KEY`                                              | Optional hosted secret; worker only                                      |
| `TEST_ACCOUNT_EMAIL`, `TEST_ACCOUNT_PASSWORD`                 | Optional account reference `configured`; never included in model prompts |
| `MODEL_INPUT_USD_PER_MILLION`, `MODEL_OUTPUT_USD_PER_MILLION` | Optional operator-provided prices. Cost is **unknown** without both.     |
| `API_URL`, `WEB_URL`, `DEMO_URL`                              | Optional integration harness addresses                                   |

If ports change, also update the Vite proxy in `vite.config.ts` and the API's local UI origin allowlist. For defaults no configuration is necessary.

## Persistence, cancellation, boundaries, and credentials

SQLite uses WAL and a transaction to admit and claim a single job. The worker holds a heartbeat lease. A fresh worker marks abandoned running jobs interrupted after the previous lease expires (10 seconds). Partial evidence and historical reports remain. Queued jobs survive restart. Cancelled jobs never receive a passing verdict. A 100ms cancellation poll aborts model calls and export validation, and closes browser contexts; screenshots and actions already completed stay in the record.

Total action and wall-clock budgets cover the initial attempt, replay, and export verification. AI retries are bounded to two recoveries after the first failure. Repeated actions trigger lack-of-progress termination. Stale observation identifiers and ambiguous locators are rejected.

Requests and redirects are checked against exact origins at the context routing layer, not just at initial navigation. WebSockets, service workers, popups, downloads and internal control paths are blocked. Unconfigured origins, credential-bearing URLs, private/metadata address destinations, and non-HTTP schemes are rejected. Exact, explicitly configured localhost origins are allowed. This is a local test-environment tool, not a hostile-site security sandbox; network/DNS controls do not replace operating-system isolation against DNS rebinding or a compromised browser.

The local fixture control token and random demo password are generated into an ignored, mode-0600 file, `data/local-control.json`. The worker fills credentials through references. All known secrets and token-like values are redacted from event text. Password values are excluded from observations. **Credential-bearing runs disable all screenshots and traces**, since password-input masking cannot sanitize network data and snapshots. Noncredential traces can contain test page content; use synthetic fixtures, not production personal data. The demo uses fake contact data and never collects payments.

Artifact access validates generated run IDs and an explicit filename allowlist; arbitrary files and internal export-validation configuration cannot be fetched. The local API has no multi-user authentication and must remain bound to loopback.

## Exports

`regression.spec.ts` is generated from recorded actions, readable locators, and original assertions. It uses JSON string escaping, `BASE_URL`, account environment references, and condition-based Playwright expectations. An unchanged amount compares against a fresh initial capture, never the observed buggy total.

Automatic validation resets two demo sessions and executes the **actual generated file** through the Playwright test runner. The baseline must pass; the corresponding broken fixture must fail an assertion. A nonzero process exit alone is insufficient. Credential and external-target exports remain unverified. Missing requirements and unreliable execution do not produce supported regression exports.

Run an export against the controlled store without printing the fixture token:

```sh
npm run replay -- --run YOUR_RUN_UUID --variant correct
npm run replay -- --run YOUR_RUN_UUID --variant expired-coupon
```

The helper reads the local token into process memory and passes it through the child environment. Broken fixtures should exit nonzero. The generated file also documents standalone environment and fixture requirements. Keep the source project running while replaying.

## Tests and benchmarks

Start `npm run dev` first for browser integration and benchmarks. Do not run harnesses concurrently; the application intentionally permits one active run.

```sh
npm test                    # schema, navigation, outcomes, assertion preservation, evidence and exports
npm run test:lifecycle      # isolated SQLite restart, interruption, lease and cancellation checks
npm run test:integration    # real browser/API/UI smoke and verified export matrix
npm run test:evaluations    # actual AI/scripted reports, evidence links and mobile layout
npm run eval                # 13 scripted infrastructure cases + 8 handwritten comparisons
npm run eval:ai             # same cases using the configured real model
npm run smoke:ai            # one real-model expired-coupon smoke run
npm run typecheck
npm run build
```

Ground truth is in evaluator-only `tests/benchmark-cases.json`. Held-out wording cases are marked separately and excluded from prompt examples. [Benchmark definitions](BENCHMARKS.md) provide exact denominators. Raw results retain run IDs, per-case runtimes, usage and export status. `data/evaluation-scripted.json` and `data/evaluation-ai.json` stay separate. The UI evaluation ledger has separate AI and scripted views, per-case evidence links, and exact metric denominators. Open `http://127.0.0.1:5173/#evaluations` directly. No model benchmark scores are inferred from scripted runs.

The full local-model benchmark has been executed. See [AI benchmark analysis](AI-BENCHMARK.md) and [raw results](benchmark-ai.json) for measured capabilities and failures; do not infer general reliability from the coupon smoke tests. The original first measurement is retained in `docs/benchmark-ai-initial.json`.

The latest local-model smoke result is recorded in [model-smoke.json](model-smoke.json). Failed model attempts stay in the run history. A successful smoke is one case, not a complete AI benchmark.

See [actual sample report](sample-report/report.json), [recorded screenshot](sample-report/failure.png), and [sample generated regression](sample-report/regression.spec.ts). These were captured from a real run. They are a snapshot; run IDs resolve in the local database that produced them.

## Project map and limitations

- [Executed validation](VALIDATION.md)
- [Architecture](ARCHITECTURE.md)
- [Benchmark definitions](BENCHMARKS.md)
- [Roadmap](ROADMAP.md)
- [Implementation checklist](IMPLEMENTATION.md)

Chromium only; one local worker; fixed demo verification contracts plus explicit external page checks; no automatic interpretation of arbitrary business requirements, CAPTCHA, real payments, production modifications, GitHub writes or distributed queue. Reproduction replays the original targets and assertions. Actions explicitly recorded as rejected before execution are omitted with an audit entry; partially executed or legacy uncertain failures are never silently discarded. The replay does not substitute a different business action. A failed replay keeps the original finding unconfirmed. There is no continuous video or private chain-of-thought display. Cost is unknown when pricing is not configured. History listing returns the latest 200 runs; SQLite preserves all runs. There is no automatic artifact retention policy.
