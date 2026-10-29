import fs from "node:fs";
import path from "node:path";
import { runInputSchema, type Run } from "../src/shared/domain";
import { request, waitRun } from "./helpers";
const input = runInputSchema.parse({
  targetUrl: "https://www.amazon.in/",
  scenario: "custom",
  mode: "ai",
  goal: "On Amazon India, search for wireless mouse using the search field and submit it. Verify the search query and results heading. Do not sign in, add items to cart, or purchase anything. Stop if an access challenge appears.",
  expected:
    "On /s, the search field retains wireless mouse and the Results heading is visible.",
  fixture: "Signed-out read-only search. No account or purchase.",
  customChecks: [
    {
      id: "external-search-query",
      requirement: "The search results page retains the submitted query.",
      locator: { kind: "id", value: "twotabsearchtextbox" },
      operator: "value",
      expected: "wireless mouse",
      pagePath: "/s",
    },
    {
      id: "external-results",
      requirement: "The search results page displays its Results heading.",
      locator: { kind: "role", role: "heading", value: "Results" },
      operator: "visible",
      pagePath: "/s",
    },
  ],
  maxSteps: 20,
  maxDuration: 120,
});
const created = await request<Run>("/api/runs", input);
console.log("Amazon run:", created.id);
const run = await waitRun(created.id);
fs.mkdirSync("docs/amazon", { recursive: true });
fs.writeFileSync(
  `docs/amazon/run-${run.id}.json`,
  JSON.stringify(run, null, 2),
);
const screenshot = run.events.findLast((e) => e.screenshot)?.screenshot;
if (screenshot)
  fs.copyFileSync(
    path.join("data/artifacts", run.id, screenshot),
    "docs/amazon/automated-page.png",
  );
fs.writeFileSync(
  "docs/amazon/automated-run.json",
  JSON.stringify(run, null, 2),
);
console.log(
  JSON.stringify(
    {
      id: run.id,
      lifecycle: run.lifecycle,
      verdict: run.verdict,
      explanation: run.explanation,
      actions: run.events.length,
      checks: run.events.flatMap((e) => e.checks).length,
      modelUsage: run.usage || null,
    },
    null,
    2,
  ),
);
if (
  run.verdict !== "passed" &&
  !run.errors.some((e) => e.kind === "site-blocked")
)
  process.exitCode = 1;
