import fs from "node:fs";
import path from "node:path";
import { runCase } from "./helpers";
import { handwritten } from "./handwritten";
import { config, demoOrigin } from "../src/server/config";
import { type Scenario, type Run, type RunInput } from "../src/shared/domain";
import { requirements } from "../src/server/verification";
const ai = process.argv.includes("--ai");
const mode = ai ? "ai" : "scripted";
// Ground-truth labels are evaluator-only: never pass this object to the provider or browser.
const cases = JSON.parse(
  fs.readFileSync("tests/benchmark-cases.json", "utf8"),
) as {
  id: string;
  scenario: Scenario;
  variant: RunInput["variant"];
  expectedVerdict: string;
  split: string;
  wording?: RunInput["wording"];
  expectedOverride?: string;
  path?: string;
}[];
const records: {
  id: string;
  split: string;
  expectedVerdict: string;
  actualVerdict: string;
  runId: string;
  correct: boolean;
  complete: boolean;
  explanation?: string;
  reproduction?: string;
  exportStatus?: string;
  runtimeMs: number;
  usage: Run["usage"];
}[] = [];
for (const c of cases) {
  const overrides: Partial<RunInput> = {
    mode,
    variant: c.variant,
    wording: c.wording || "standard",
    maxDuration: ai ? 240 : 120,
    maxSteps: 60,
    ...(c.scenario === "login" ? { credentialRef: "demo" as const } : {}),
    ...(c.expectedOverride !== undefined
      ? { expected: c.expectedOverride }
      : {}),
    ...(c.path ? { targetUrl: demoOrigin + c.path } : {}),
  };
  const started = Date.now();
  const r = await runCase(c.scenario, overrides);
  const specs = requirements(r.input).checks;
  const complete =
    specs.length > 0 &&
    specs.every((s) =>
      r.events.some(
        (e) => e.attempt === 1 && e.checks.some((a) => a.id === s.id),
      ),
    );
  records.push({
    id: c.id,
    split: c.split,
    expectedVerdict: c.expectedVerdict,
    actualVerdict: r.verdict || r.lifecycle,
    runId: r.id,
    correct: r.verdict === c.expectedVerdict,
    explanation: r.explanation,
    complete,
    reproduction: r.reproduction,
    exportStatus: r.exportStatus,
    runtimeMs: Date.now() - started,
    usage: r.usage,
  });
  console.log(`${c.id}: ${r.verdict} (expected ${c.expectedVerdict})`);
}
const fraction = (n: number, d: number) => ({
  numerator: n,
  denominator: d,
  rate: d ? n / d : null,
});
const count = (predicate: (r: (typeof records)[number]) => boolean) =>
  records.filter(predicate).length;
const metrics = {
  bugDetectionPrecision: fraction(
    count(
      (r) =>
        r.actualVerdict === "product_failure" &&
        r.expectedVerdict === "product_failure",
    ),
    count((r) => r.actualVerdict === "product_failure"),
  ),
  bugDetectionRecall: fraction(
    count(
      (r) =>
        r.actualVerdict === "product_failure" &&
        r.expectedVerdict === "product_failure",
    ),
    count((r) => r.expectedVerdict === "product_failure"),
  ),
  falseReportsOnCorrect: fraction(
    count(
      (r) =>
        r.expectedVerdict === "passed" && r.actualVerdict === "product_failure",
    ),
    count((r) => r.expectedVerdict === "passed"),
  ),
  taskCompletion: fraction(
    count(
      (r) =>
        r.complete && ["passed", "product_failure"].includes(r.expectedVerdict),
    ),
    count((r) => ["passed", "product_failure"].includes(r.expectedVerdict)),
  ),
  agentFailure: fraction(
    count((r) => r.actualVerdict === "agent_failure"),
    records.length,
  ),
  inconclusive: fraction(
    count((r) => r.actualVerdict === "inconclusive"),
    records.length,
  ),
  failureReproduction: fraction(
    count((r) => r.reproduction === "confirmed"),
    count((r) => r.actualVerdict === "product_failure"),
  ),
  regressionValidation: fraction(
    count((r) => r.exportStatus === "verified"),
    count((r) => ["verified", "unverified"].includes(r.exportStatus || "")),
  ),
  verdictAccuracy: fraction(
    count((r) => r.correct),
    records.length,
  ),
  meanRuntimeMs: records.reduce((n, r) => n + r.runtimeMs, 0) / records.length,
  modelInputTokens: records.reduce(
    (n, r) => n + (r.usage?.inputTokens || 0),
    0,
  ),
  modelOutputTokens: records.reduce(
    (n, r) => n + (r.usage?.outputTokens || 0),
    0,
  ),
  estimatedCost: records.every((r) => r.usage?.estimatedCost != null)
    ? records.reduce((n, r) => n + r.usage!.estimatedCost!, 0)
    : null,
};
const baseline = await handwritten();
const report = {
  at: new Date().toISOString(),
  mode,
  label: ai
    ? "Model-backed benchmark"
    : "Scripted infrastructure checks — not autonomous AI scores",
  provider: ai ? config.provider : null,
  model: ai ? config.model : null,
  metrics,
  records,
  handwritten: {
    matched: baseline.filter((r) => r.matched).length,
    total: baseline.length,
    records: baseline,
  },
};
fs.writeFileSync(
  path.join(config.dataDir, `evaluation-${mode}.json`),
  JSON.stringify(report, null, 2),
);
fs.writeFileSync(
  `docs/benchmark-${mode}.json`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(metrics, null, 2));
if (records.some((r) => !r.correct) || baseline.some((r) => !r.matched))
  process.exitCode = 1;
