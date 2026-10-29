import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tracepilot-lifecycle-"));
process.env.DATA_DIR = temp;
const { createRun, claimRun, getRun, cancelRun, takeLease, releaseLease, db } =
  await import("../src/server/store");
const { runInputSchema, scenarios } = await import("../src/shared/domain");
try {
  const input = runInputSchema.parse({
    targetUrl: "http://127.0.0.1:4311",
    goal: scenarios.expired.goal,
    expected: scenarios.expired.expected,
  });
  const r = createRun(input);
  assert.equal(r.lifecycle, "queued");
  assert.throws(() => createRun(input), /already active/);
  assert.equal(claimRun()?.lifecycle, "running");
  takeLease("first");
  assert.equal(getRun(r.id)?.lifecycle, "interrupted");
  assert.equal(getRun(r.id)?.verdict, undefined);
  assert.throws(() => takeLease("second"), /Another worker/);
  db.prepare("UPDATE worker SET heartbeat=0").run();
  takeLease("second");
  releaseLease("second");
  const queued = createRun(input);
  cancelRun(queued.id);
  assert.equal(getRun(queued.id)?.lifecycle, "cancelled");
  assert.equal(claimRun(), undefined);
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `const {getRun}=await import('./src/server/store.ts'); console.log(getRun(${JSON.stringify(r.id)}).lifecycle)`,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATA_DIR: temp },
      encoding: "utf8",
    },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), "interrupted");
  console.log(
    "PASS single-run admission, queued cancellation, stale lease, interrupted recovery and persistence across a new process.",
  );
} finally {
  db.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
