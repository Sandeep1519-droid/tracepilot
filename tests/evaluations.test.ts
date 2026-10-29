import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evaluationMode, readEvaluation } from "../src/server/evaluations";

test("evaluation modes cannot become filesystem paths", () => {
  assert.equal(evaluationMode(undefined), "scripted");
  assert.equal(evaluationMode("ai"), "ai");
  assert.equal(evaluationMode("scripted"), "scripted");
  for (const value of ["../../.env", "model", ["ai"], {}, null])
    assert.throws(() => evaluationMode(value), /Benchmark mode/);
});
test("AI and scripted reports stay separate, with honest absent and mismatched states", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "tracepilot-evaluations-"),
  );
  try {
    assert.equal(readEvaluation(directory, "ai"), null);
    fs.writeFileSync(
      path.join(directory, "evaluation-scripted.json"),
      JSON.stringify({ mode: "scripted", records: [{ id: "infrastructure" }] }),
    );
    assert.equal(readEvaluation(directory, "ai"), null);
    assert.equal(
      readEvaluation(directory, "scripted").records[0].id,
      "infrastructure",
    );
    fs.writeFileSync(
      path.join(directory, "evaluation-ai.json"),
      JSON.stringify({ mode: "ai", records: [{ id: "real-model" }] }),
    );
    assert.equal(readEvaluation(directory, "ai").records[0].id, "real-model");
    fs.writeFileSync(
      path.join(directory, "evaluation-ai.json"),
      JSON.stringify({ mode: "scripted" }),
    );
    assert.throws(() => readEvaluation(directory, "ai"), /does not match/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
