import fs from "node:fs";
import { runCase } from "./helpers";
import { config } from "../src/server/config";
const correct = process.argv.includes("--correct");
const run = await runCase("expired", {
  mode: "ai",
  variant: correct ? "correct" : "expired-coupon",
  maxDuration: 240,
  maxSteps: 45,
});
const result = {
  at: new Date().toISOString(),
  mode: "ai",
  provider: config.provider,
  model: config.model,
  runId: run.id,
  lifecycle: run.lifecycle,
  verdict: run.verdict,
  explanation: run.explanation,
  reproduction: run.reproduction,
  exportStatus: run.exportStatus,
  usage: run.usage,
  actions: run.events
    .filter((e) => e.attempt === 1)
    .map((e) => ({ action: e.action, result: e.result })),
  errors: run.errors,
};
fs.writeFileSync(
  correct ? "docs/model-smoke-correct.json" : "docs/model-smoke.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
if (
  run.verdict !== (correct ? "passed" : "product_failure") ||
  (!correct && run.reproduction !== "confirmed")
)
  process.exitCode = 1;
