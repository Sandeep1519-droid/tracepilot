import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

test("run admission and cancellation tolerate a simultaneous heartbeat writer", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "tracepilot-writers-"),
  );
  const Database = (await import("better-sqlite3")).default;
  const seed = new Database(path.join(directory, "tracepilot.sqlite"));
  seed.pragma("journal_mode = WAL");
  seed.exec(
    "CREATE TABLE runs (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, lifecycle TEXT NOT NULL, payload TEXT NOT NULL); CREATE TABLE worker (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, heartbeat INTEGER NOT NULL);",
  );
  seed.close();
  const program = `
    import { setTimeout as delay } from 'node:timers/promises';
    import { createRun, cancelRun, heartbeat, takeLease, releaseLease, db } from './src/server/store.ts';
    import { runInputSchema, scenarios } from './src/shared/domain.ts';
    try {
      if (process.env.TRACEPILOT_STRESS_ROLE === 'heartbeat') {
        takeLease('stress-worker');
        for(let i=0;i<1000;i++){heartbeat('stress-worker');await delay(1);}
        releaseLease('stress-worker');
      } else {
        const input=runInputSchema.parse({targetUrl:'http://127.0.0.1:4311',goal:scenarios.expired.goal,expected:scenarios.expired.expected});
        for(let i=0;i<500;i++){const run=createRun(input);cancelRun(run.id);await delay(1);}
      }
    } finally { db.close(); }
  `;
  const run = (role: string) =>
    new Promise<{ code: number | null; error: string }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", program],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATA_DIR: directory,
            TRACEPILOT_STRESS_ROLE: role,
          },
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      let error = "";
      child.stderr.on("data", (data) => {
        error += String(data);
      });
      const timeout = setTimeout(() => child.kill("SIGTERM"), 30000);
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timeout);
        resolve({ code, error });
      });
    });
  try {
    const results = await Promise.all([run("heartbeat"), run("jobs")]);
    for (const result of results) assert.equal(result.code, 0, result.error);
    const inspect = new Database(path.join(directory, "tracepilot.sqlite"));
    try {
      assert.equal(
        (
          inspect
            .prepare(
              "SELECT COUNT(*) AS count FROM runs WHERE lifecycle='cancelled'",
            )
            .get() as { count: number }
        ).count,
        500,
      );
    } finally {
      inspect.close();
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
