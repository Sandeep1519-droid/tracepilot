import { useEffect, useState } from "react";
import { ArrowUpRight, Check, FlaskConical, RefreshCw, X } from "lucide-react";

type Mode = "ai" | "scripted";
type Fraction = { numerator: number; denominator: number; rate: number | null };
type RecordRow = {
  id: string;
  split: string;
  expectedVerdict: string;
  actualVerdict: string;
  runId: string;
  correct: boolean;
  runtimeMs: number;
  explanation?: string;
};
type Benchmark = {
  at: string;
  mode: Mode;
  provider: string | null;
  model: string | null;
  metrics: Record<string, Fraction | number | null>;
  records: RecordRow[];
  handwritten: { matched: number; total: number };
};
const names: Record<string, string> = {
  passed: "Passed",
  product_failure: "Product failure",
  agent_failure: "Agent failure",
  inconclusive: "Inconclusive",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};
const metrics = [
  ["verdictAccuracy", "Verdict matches", "cases"],
  ["bugDetectionPrecision", "Bug precision", "reported findings"],
  ["bugDetectionRecall", "Bug recall", "known defects"],
  ["taskCompletion", "Task completion", "verifiable cases"],
  ["falseReportsOnCorrect", "False bug reports", "correct cases"],
  ["agentFailure", "Agent failure rate", "all cases"],
  ["failureReproduction", "Reproduction", "reported findings"],
  ["regressionValidation", "Verified exports", "produced exports"],
];
export function EvaluationLedger({ open }: { open: (id: string) => void }) {
  const [mode, setMode] = useState<Mode>("ai");
  const [result, setResult] = useState<Benchmark | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setResult(null);
    fetch(`/api/evaluations?mode=${mode}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Could not load recorded benchmark results.");
        const data = await response.json();
        if (!controller.signal.aborted)
          setResult(data.results?.mode === mode ? data.results : null);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [mode, revision]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MEASURE, THEN TRUST</div>
          <h1>Evaluation ledger.</h1>
          <p>
            Real model decisions and scripted infrastructure checks, recorded
            separately.
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => setRevision((n) => n + 1)}
          disabled={loading}
        >
          <RefreshCw size={14} />
          Refresh results
        </button>
      </div>
      <div
        className="evaluation-modes"
        role="group"
        aria-label="Benchmark mode"
      >
        <button aria-pressed={mode === "ai"} onClick={() => setMode("ai")}>
          AI model benchmark
        </button>
        <button
          aria-pressed={mode === "scripted"}
          onClick={() => setMode("scripted")}
        >
          Scripted infrastructure
        </button>
      </div>
      <section className="panel eval-panel">
        <FlaskConical size={28} />
        <h2>
          {loading
            ? "Loading recorded results…"
            : result
              ? mode === "ai"
                ? "AI benchmark results"
                : "Scripted infrastructure results"
              : "No completed benchmark recorded"}
        </h2>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!loading && !result && !error && (
          <>
            <p>
              A benchmark is saved after all cases finish. Refresh this page
              after execution completes.
            </p>
            <code>{mode === "ai" ? "npm run eval:ai" : "npm run eval"}</code>
          </>
        )}
        {result && (
          <div className="benchmark-record">
            <div className="benchmark-caption">
              <span className="mode">
                {mode === "ai"
                  ? "MODEL-BACKED BENCHMARK"
                  : "SCRIPTED INFRASTRUCTURE"}
              </span>
              <span>
                {new Date(result.at).toLocaleString()} · {result.records.length}{" "}
                cases
              </span>
            </div>
            {mode === "ai" && (
              <p className="benchmark-note">
                Provider: <strong>{result.provider}</strong> · Model:{" "}
                <strong>{result.model}</strong>. These results cover the
                controlled demo; they do not establish reliability on arbitrary
                websites.
              </p>
            )}
            <div className="eval-metrics">
              {metrics.map(([key, label, denominator]) => {
                const value = result.metrics[key] as Fraction | undefined;
                if (!value || typeof value !== "object") return null;
                return (
                  <div key={key}>
                    <span>{label}</span>
                    <strong>
                      {value.rate == null
                        ? "unknown"
                        : `${Math.round(value.rate * 100)}%`}
                    </strong>
                    <small>
                      {value.numerator} / {value.denominator} {denominator}
                    </small>
                  </div>
                );
              })}
            </div>
            <p className="benchmark-note">
              {mode === "scripted"
                ? "Scripted checks exercise real browsers and evidence handling; they do not measure autonomous AI capability. "
                : "A matched case means the recorded verdict equals its expected outcome. The intended tooling failure and missing-requirement cases should produce agent failure and inconclusive, respectively. "}
              Handwritten comparison: {result.handwritten.matched} /{" "}
              {result.handwritten.total} cases matched.
            </p>
            <div className="benchmark-usage">
              <span>
                Inconclusive:{" "}
                {(result.metrics.inconclusive as Fraction)?.numerator ??
                  "unknown"}{" "}
                /{" "}
                {(result.metrics.inconclusive as Fraction)?.denominator ??
                  "unknown"}{" "}
                cases
              </span>
              <span>
                Mean runtime:{" "}
                {(Number(result.metrics.meanRuntimeMs) / 1000).toFixed(1)}s
              </span>
              <span>
                Tokens:{" "}
                {Number(result.metrics.modelInputTokens).toLocaleString()} input
                / {Number(result.metrics.modelOutputTokens).toLocaleString()}{" "}
                output
              </span>
              <span>
                Estimated cost:{" "}
                {result.metrics.estimatedCost == null
                  ? "unknown"
                  : `$${Number(result.metrics.estimatedCost).toFixed(5)}`}
              </span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>CASE</th>
                    <th>EXPECTED</th>
                    <th>RECORDED</th>
                    <th>EVALUATION</th>
                    <th>SPLIT</th>
                    <th>TIME</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {result.records.map((row) => (
                    <tr key={row.id}>
                      <td title={row.explanation}>{row.id}</td>
                      <td>
                        {names[row.expectedVerdict] || row.expectedVerdict}
                      </td>
                      <td>
                        <span className={`status ${row.actualVerdict}`}>
                          {names[row.actualVerdict] || row.actualVerdict}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`assert-result ${row.correct ? "good" : "bad"}`}
                        >
                          {row.correct ? <Check size={12} /> : <X size={12} />}
                          {row.correct ? "Matched" : "Mismatch"}
                        </span>
                      </td>
                      <td>
                        <span className="mode">{row.split}</span>
                      </td>
                      <td className="mono">
                        {(row.runtimeMs / 1000).toFixed(1)}s
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => open(row.runId)}
                        >
                          Open run
                          <ArrowUpRight size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="benchmark-note">
              The small held-out wording set is reported with its split labels.
              Inspect individual run evidence before drawing broader
              conclusions.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
