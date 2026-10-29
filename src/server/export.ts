import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { type Event, type Run, type LocatorSpec } from "../shared/domain";
import { artifactDir } from "./store";
import { controlToken } from "./secrets";
import { demoOrigin } from "./config";
import { replaySequence } from "./replay";
export const quote = (s: string) =>
  JSON.stringify(s)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
function loc(spec: LocatorSpec) {
  return spec.kind === "testId"
    ? `page.getByTestId(${quote(spec.value)})`
    : spec.kind === "id"
      ? `page.locator(${quote(`[id=${JSON.stringify(spec.value)}]`)})`
      : spec.kind === "label"
        ? `page.getByLabel(${quote(spec.value)}, { exact: true })`
        : `page.getByRole(${quote(spec.role!)} as any, { name: ${quote(spec.value)}, exact: true })`;
}
export function generateExport(run: Run) {
  const { events, omitted } = replaySequence(
    run.events.filter((e) => e.attempt === 1),
  );
  if (!events.length || events.some((e) => e.error))
    throw new Error("A reliable successful interaction sequence is required.");
  const lines: string[] = omitted.map(
    (e) =>
      `// Original event ${quote(e.id)} was rejected before execution; omitted from regression replay.`,
  );
  for (const e of events) {
    const a = e.action,
      l = e.locator ? loc(e.locator) : "";
    if (a.type === "navigate") {
      const target = new URL(a.url);
      const base = new URL(run.input.targetUrl);
      if (target.origin !== base.origin)
        throw new Error(
          "Multiple origins are unsupported in regression exports",
        );
      lines.push(
        `await page.goto(new URL(${quote(target.pathname + target.search + target.hash)}, baseURL).href);`,
      );
    }
    if (a.type === "click_element") lines.push(`await ${l}.click();`);
    if (a.type === "fill_field")
      lines.push(`await ${l}.fill(${quote(a.value)});`);
    if (a.type === "fill_credential")
      lines.push(
        `await ${l}.fill(requiredEnv(${quote(a.field === "email" ? "TEST_ACCOUNT_EMAIL" : "TEST_ACCOUNT_PASSWORD")}));`,
      );
    if (a.type === "press_key")
      lines.push(`await ${l}.press(${quote(a.key)});`);
    if (a.type === "select_option")
      lines.push(`await ${l}.selectOption(${quote(a.value)});`);
    if (a.type === "scroll_page")
      lines.push(
        `await page.mouse.wheel(0, ${a.direction === "down" ? 550 : -550});`,
      );
    for (const c of e.checks) {
      const target = loc(c.locator || { kind: "testId", value: c.testId! });
      if (c.pagePath)
        lines.push(
          `await expect.poll(() => new URL(page.url()).pathname).toBe(${quote(c.pagePath)});`,
        );
      if (c.operator === "visible")
        lines.push(`await expect(${target}).toBeVisible();`);
      lines.push(
        `// Original requirement: ${c.requirement.replace(/[\r\n\u2028\u2029]/g, " ")}`,
      );
      if (c.operator === "baseline")
        lines.push(`const initialTotal = minor(await ${target}.innerText());`);
      if (c.operator === "unchanged")
        lines.push(
          `await expect.poll(async () => minor(await ${target}.innerText())).toBe(initialTotal);`,
        );
      if (c.operator === "money")
        lines.push(
          `await expect.poll(async () => minor(await ${target}.innerText())).toBe(${Number(c.expected)});`,
        );
      if (c.operator === "contains")
        lines.push(
          `await expect(${target}).toContainText(${quote(String(c.expected))});`,
        );
      if (c.operator === "equals")
        lines.push(
          `await expect(${target}).toHaveText(${quote(String(c.expected))});`,
        );
      if (c.operator === "value")
        lines.push(
          `await expect(${target}).toHaveValue(${quote(String(c.expected))});`,
        );
      if (c.operator === "absent")
        lines.push(`await expect(${target}).not.toBeVisible();`);
    }
  }
  return `// Recorded by TracePilot. Verification status is in report.json.
// Run: BASE_URL=${new URL(run.input.targetUrl).origin} ${new URL(run.input.targetUrl).origin === demoOrigin ? "TRACEPILOT_DEMO=1 " : ""}npx playwright test regression.spec.ts
// Demo fixture reset needs TRACEPILOT_FIXTURE_TOKEN from your local data/local-control.json.
// Use DEMO_VARIANT=correct or the intended broken fixture. Never commit secrets.
import { test, expect } from '@playwright/test';
const baseURL = process.env.BASE_URL || ${quote(new URL(run.input.targetUrl).origin)};
function requiredEnv(name: string) { const value = process.env[name]; if (!value) throw new Error('Missing environment variable: ' + name); return value; }
function minor(value: string) { if (!/^\\s*\\$?\\s*\\d[\\d,]*\\.\\d{2}\\s*$/.test(value)) throw new Error('Invalid USD amount'); return Number(value.replace(/[^\\d]/g, '')); }
test(${quote(run.input.goal)}, async ({ page, context, request }) => {
  if (process.env.TRACEPILOT_DEMO === '1') {
    const reset = await request.post(new URL('/__fixtures', baseURL).href, { headers: { 'x-tracepilot-control': requiredEnv('TRACEPILOT_FIXTURE_TOKEN') }, data: { variant: process.env.DEMO_VARIANT || 'correct', wording: process.env.DEMO_WORDING || 'standard' } });
    expect(reset.ok()).toBeTruthy();
    const { session } = await reset.json();
    await context.addCookies([{ name: 'tp_session', value: session, url: baseURL, httpOnly: true, sameSite: 'Strict' }]);
  }
${lines.map((l) => "  " + l).join("\n")}
});
`;
}
export async function validateExport(run: Run, signal: AbortSignal) {
  const dir = artifactDir(run.id);
  const filename = path.join(dir, "regression.spec.ts");
  fs.writeFileSync(filename, generateExport(run));
  if (
    new URL(run.input.targetUrl).origin !== demoOrigin ||
    run.input.scenario === "login"
  ) {
    run.exportStatus = "unverified";
    run.exportExplanation =
      "Recorded sequence only; validation is limited to non-credential bundled demo scenarios.";
    return;
  }
  const bad = {
    expired: "expired-coupon",
    quantity: "stale-quantity",
    removal: "sticky-discount",
    checkout: "missing-required",
    custom: "correct",
    login: "correct",
  }[run.input.scenario];
  const config = path.join(dir, "validation.config.ts");
  fs.writeFileSync(
    config,
    `export default { testDir: ${quote(dir)}, testMatch: 'regression.spec.ts', timeout: 12000, expect: { timeout: 1800 }, retries: 0, workers: 1, reporter: 'line', outputDir: ${quote(path.join(dir, "validation-output"))}, use: { headless: true, trace: 'off', screenshot: 'off' } };`,
  );
  const execute = (variant: string) =>
    new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve("node_modules/@playwright/test/cli.js"),
          "test",
          "--config",
          config,
        ],
        {
          env: {
            ...process.env,
            BASE_URL: demoOrigin,
            TRACEPILOT_DEMO: "1",
            TRACEPILOT_FIXTURE_TOKEN: controlToken,
            DEMO_VARIANT: variant,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (d) => {
        output += String(d);
      });
      child.stderr.on("data", (d) => {
        output += String(d);
      });
      const timeout = setTimeout(() => child.kill("SIGTERM"), 20000);
      const abort = () => child.kill("SIGTERM");
      signal.addEventListener("abort", abort, { once: true });
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        resolve({ code, output });
      });
    });
  const good = await execute("correct");
  if (signal.aborted) throw new Error("Run cancelled");
  const broken = await execute(bad);
  if (signal.aborted) throw new Error("Run cancelled");
  // A nonzero exit is not sufficient: require the failed assertion to be the contract expectation.
  const assertions =
    broken.output.includes("expect(") || broken.output.includes("expect.");
  const verified =
    good.code === 0 &&
    broken.code === 1 &&
    assertions &&
    !broken.output.includes("Test timeout");
  run.exportStatus = verified ? "verified" : "unverified";
  run.exportExplanation = verified
    ? "This exact exported file passed on the correct fixture and failed an original assertion on the broken fixture."
    : "Validation did not establish both a correct-fixture pass and a broken-fixture assertion failure.";
  fs.writeFileSync(
    path.join(dir, "export-validation.json"),
    JSON.stringify(
      {
        correct: { exitCode: good.code },
        broken: { exitCode: broken.code, assertionFailure: assertions },
        verified,
      },
      null,
      2,
    ),
  );
}
