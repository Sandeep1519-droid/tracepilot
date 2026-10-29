import fs from "node:fs";
import path from "node:path";
export type EvaluationMode = "ai" | "scripted";
export function evaluationMode(value: unknown): EvaluationMode {
  if (value === undefined) return "scripted";
  if (value !== "ai" && value !== "scripted")
    throw new Error("Benchmark mode must be ai or scripted.");
  return value;
}
export function readEvaluation(directory: string, mode: EvaluationMode) {
  const filename = path.join(directory, `evaluation-${mode}.json`);
  if (!fs.existsSync(filename)) return null;
  const report = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (report.mode !== mode)
    throw new Error(
      "Recorded benchmark mode does not match the requested mode.",
    );
  return report;
}
