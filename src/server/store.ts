import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config";
import { scenarios, type Run, type RunInput } from "../shared/domain";
fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
export const db = new Database(path.join(config.dataDir, "tracepilot.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.exec(
  `CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, lifecycle TEXT NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS worker (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, heartbeat INTEGER NOT NULL);`,
);
// Acquire the writer reservation before reads: a deferred WAL read-to-write
// upgrade can raise SQLITE_BUSY_SNAPSHOT despite busy_timeout.
export function saveRun(run: Run) {
  db.transaction(() => {
    const previous = getRun(run.id);
    run.cancelRequested = run.cancelRequested || !!previous?.cancelRequested;
    run.interruptRequested =
      run.interruptRequested || !!previous?.interruptRequested;
    db.prepare("UPDATE runs SET lifecycle=?,payload=? WHERE id=?").run(
      run.lifecycle,
      JSON.stringify(run),
      run.id,
    );
  }).immediate();
}
export function getRun(id: string): Run | undefined {
  const r = db.prepare("SELECT payload FROM runs WHERE id=?").get(id) as
    { payload: string } | undefined;
  return r ? JSON.parse(r.payload) : undefined;
}
export function listRuns(): Run[] {
  return (
    db
      .prepare("SELECT payload FROM runs ORDER BY created_at DESC LIMIT 200")
      .all() as { payload: string }[]
  ).map((r) => JSON.parse(r.payload));
}
export function createRun(input: RunInput): Run {
  const transaction = db.transaction(() => {
    if (
      db
        .prepare(
          "SELECT id FROM runs WHERE lifecycle IN ('queued','running') LIMIT 1",
        )
        .get()
    )
      throw new Error(
        "A test is already active. Stop it or wait for completion.",
      );
    const run: Run = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      lifecycle: "queued",
      input,
      plan: input.customChecks?.length
        ? [input.goal, ...input.customChecks.map((c) => c.requirement)]
        : [...scenarios[input.scenario].plan],
      cancelRequested: false,
      events: [],
      errors: [],
    };
    db.prepare("INSERT INTO runs VALUES(?,?,?,?)").run(
      run.id,
      run.createdAt,
      run.lifecycle,
      JSON.stringify(run),
    );
    return run;
  });
  return transaction.immediate();
}
export function claimRun(): Run | undefined {
  return db
    .transaction(() => {
      const row = db
        .prepare(
          "SELECT id FROM runs WHERE lifecycle='queued' ORDER BY created_at LIMIT 1",
        )
        .get() as { id: string } | undefined;
      if (!row) return;
      const r = getRun(row.id)!;
      if (r.cancelRequested) {
        r.lifecycle = "cancelled";
        r.finishedAt = new Date().toISOString();
        saveRun(r);
        return;
      }
      r.lifecycle = "running";
      r.startedAt = new Date().toISOString();
      saveRun(r);
      return r;
    })
    .immediate();
}
export function cancelRun(id: string) {
  return db
    .transaction(() => {
      const r = getRun(id);
      if (!r) return;
      if (!["queued", "running"].includes(r.lifecycle)) return r;
      r.cancelRequested = true;
      if (r.lifecycle === "queued") {
        r.lifecycle = "cancelled";
        r.finishedAt = new Date().toISOString();
        r.explanation = "Cancelled before execution.";
      }
      saveRun(r);
      return r;
    })
    .immediate();
}
export function interruptRun(id: string) {
  return db
    .transaction(() => {
      const r = getRun(id);
      if (!r || r.lifecycle !== "running") return;
      r.interruptRequested = true;
      saveRun(r);
      return r;
    })
    .immediate();
}
export function takeLease(owner: string) {
  return db
    .transaction(() => {
      const previous = db.prepare("SELECT * FROM worker WHERE id=1").get() as
        { owner: string; heartbeat: number } | undefined;
      if (previous && Date.now() - previous.heartbeat < 10000)
        throw new Error("Another worker owns the browser.");
      for (const r of listRuns().filter((r) => r.lifecycle === "running")) {
        r.lifecycle = "interrupted";
        r.verdict = undefined;
        r.finishedAt = new Date().toISOString();
        r.explanation =
          "Worker stopped before execution completed. Partial evidence is preserved.";
        saveRun(r);
      }
      db.prepare("INSERT OR REPLACE INTO worker VALUES(1,?,?)").run(
        owner,
        Date.now(),
      );
    })
    .immediate();
}
export function heartbeat(owner: string) {
  return (
    db
      .prepare("UPDATE worker SET heartbeat=? WHERE id=1 AND owner=?")
      .run(Date.now(), owner).changes === 1
  );
}
export function releaseLease(owner: string) {
  db.prepare("DELETE FROM worker WHERE id=1 AND owner=?").run(owner);
}
export function artifactDir(id: string) {
  if (!/^[\da-f-]{36}$/.test(id)) throw new Error("Invalid run identifier");
  const dir = path.join(config.dataDir, "artifacts", id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}
