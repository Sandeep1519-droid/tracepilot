import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { setTimeout as delay } from "node:timers/promises";
import { apiBase, request, scenarioInput, waitRun, runCase } from "./helpers";
import type { Run } from "../src/shared/domain";
import { config } from "../src/server/config";
const results: { name: string; runId?: string; passed: boolean }[] = [];
async function check(name: string, fn: () => Promise<string | void>) {
  const runId = await fn();
  results.push({ name, runId: runId || undefined, passed: true });
  console.log("PASS " + name + (runId ? " · " + runId : ""));
}
await check(
  "broken expired coupon: evidence, reproduction, exact exported regression validated on both variants",
  async () => {
    const r = await runCase("expired", { variant: "expired-coupon" });
    assert.equal(r.verdict, "product_failure", r.explanation);
    assert.equal(r.reproduction, "confirmed");
    assert.equal(r.exportStatus, "verified", r.exportExplanation);
    const checks = r.events
      .filter((e) => e.attempt === 1)
      .flatMap((e) => e.checks);
    assert.equal(checks.find((c) => c.id === "coupon-rejected")?.passed, true);
    assert.equal(checks.find((c) => c.id === "total-unchanged")?.actual, 5920);
    assert.equal(
      checks.find((c) => c.id === "total-unchanged")?.expected,
      7200,
    );
    const image = r.events.find((e) => e.screenshot)!.screenshot!;
    assert.equal(
      (await fetch(apiBase + `/artifacts/${r.id}/${image}`)).status,
      200,
    );
    assert.equal(
      (await fetch(apiBase + `/artifacts/${r.id}/attempt-1-trace.zip`)).status,
      200,
    );
    const report = (await (
      await fetch(apiBase + `/artifacts/${r.id}/report.json`)
    ).json()) as Run;
    assert.equal(report.verdict, r.verdict);
    assert.equal(report.events.length, r.events.length);
    fs.mkdirSync("docs/sample-report", { recursive: true });
    fs.copyFileSync(
      path.join(config.dataDir, "artifacts", r.id, "report.json"),
      "docs/sample-report/report.json",
    );
    fs.copyFileSync(
      path.join(config.dataDir, "artifacts", r.id, "regression.spec.ts"),
      "docs/sample-report/regression.spec.ts",
    );
    fs.copyFileSync(
      path.join(
        config.dataDir,
        "artifacts",
        r.id,
        r.events.findLast((e) => e.screenshot)!.screenshot!,
      ),
      "docs/sample-report/failure.png",
    );
    return r.id;
  },
);
await check(
  "correct expired coupon passes the same original checks",
  async () => {
    const r = await runCase("expired");
    assert.equal(r.verdict, "passed", r.explanation);
    assert.equal(r.exportStatus, "verified", r.exportExplanation);
    return r.id;
  },
);
await check("missing expected behavior produces inconclusive", async () => {
  const r = await runCase("expired", { expected: "" });
  assert.equal(r.verdict, "inconclusive");
  assert.equal(r.events.flatMap((e) => e.checks).length, 0);
  return r.id;
});
await check(
  "missing observed control produces agent_failure, not a product defect",
  async () => {
    const r = await runCase("expired", {
      targetUrl: "http://127.0.0.1:4311/health",
    });
    assert.equal(r.verdict, "agent_failure");
    return r.id;
  },
);
await check(
  "single active run and cancellation stop browser actions",
  async () => {
    const r = await request<Run>("/api/runs", scenarioInput("quantity"));
    let rejected = false;
    try {
      await request("/api/runs", scenarioInput("expired"));
    } catch {
      rejected = true;
    }
    assert.equal(rejected, true);
    for (let i = 0; i < 200; i++) {
      const current = await request<Run>("/api/runs/" + r.id);
      if (current.lifecycle === "running" && current.events.length > 0) break;
      if (!["queued", "running"].includes(current.lifecycle))
        throw new Error("Run finished before cancellation test");
      await delay(20);
    }
    await request("/api/runs/" + r.id + "/cancel", {});
    const done = await waitRun(r.id);
    assert.equal(done.lifecycle, "cancelled");
    const count = done.events.length;
    await delay(500);
    assert.equal(
      (await request<Run>("/api/runs/" + r.id)).events.length,
      count,
    );
    return r.id;
  },
);
await check("redirects cannot escape the configured origin", async () => {
  const r = await runCase("expired", {
    targetUrl: "http://127.0.0.1:4311/outbound",
  });
  assert.equal(r.verdict, "agent_failure", r.explanation);
  assert.ok(
    r.events.some(
      (e) =>
        e.action.type === "navigate" && e.error && e.execution === "failed",
    ),
  );
  assert.ok(
    r.errors.some(
      (e) =>
        e.kind === "network" &&
        e.message.includes("tracepilot-blocked.invalid"),
    ),
  );
  return r.id;
});
await check("origin and artifact path restrictions", async () => {
  let blocked = false;
  try {
    await request(
      "/api/runs",
      scenarioInput("expired", {
        targetUrl: "http://169.254.169.254/latest/meta-data",
      }),
    );
  } catch {
    blocked = true;
  }
  assert.equal(blocked, true);
  assert.equal((await fetch(apiBase + "/artifacts/../../.env")).status, 404);
});
await check(
  "actual UI smoke: form → worker → report → evidence; mobile layout",
  async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      await page.goto(process.env.WEB_URL || "http://127.0.0.1:5173");
      await page.getByRole("button", { name: "New test run" }).click();
      await page
        .getByLabel("Scenario", { exact: true })
        .selectOption("quantity");
      const created = page.waitForResponse(
        (r) => r.url().endsWith("/api/runs") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Start test run" }).click();
      const response = await created;
      const run = (await response.json()) as Run;
      const done = await waitRun(run.id);
      assert.equal(done.verdict, "passed", done.explanation);
      await page
        .getByText("Every required deterministic check completed and passed.")
        .waitFor({ timeout: 10000 });
      await page.locator(".browser-stage img").waitFor();
      await page.screenshot({
        path: "docs/workspace-desktop.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: "All test runs" }).click();
      await page.screenshot({ path: "docs/dashboard.png", fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: "docs/workspace-mobile.png",
        fullPage: true,
      });
      return run.id;
    } finally {
      await browser.close();
    }
  },
);
fs.writeFileSync(
  path.join(config.dataDir, "integration-results.json"),
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
);
console.log(`${results.length} browser integration checks passed.`);
