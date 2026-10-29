import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { runInputSchema, type Action } from "../src/shared/domain";
fs.mkdirSync("data", { recursive: true });
fs.mkdirSync("docs/amazon", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("data/external-validation-"));
process.env.DATA_DIR = folder;
let broken = false;
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  if (req.url === "/challenge") {
    res.writeHead(202, { "x-amzn-waf-action": "challenge" });
    res.end(
      '<title>Amazon.in</title><body style="display:none">Access check</body>',
    );
    return;
  }
  if (req.url === "/hidden") {
    res.end(
      '<title>Hidden</title><body style="display:none">Unavailable</body>',
    );
    return;
  }
  if (req.url === "/unavailable") {
    res.writeHead(503);
    res.end("<title>Service unavailable</title><body>Try later</body>");
    return;
  }
  const url = new URL(req.url!, "http://localhost");
  res.end(
    `<title>External control fixture</title><form action="/s"><label for="search">Search</label><input type="search" id="search" name="q" value="${url.pathname === "/s" ? (broken ? "wrong query" : "wireless mouse") : ""}"><input id="submit" type="submit" value="Go"></form>${url.pathname === "/s" ? '<h1 id="results">Results</h1>' : ""}<button aria-labelledby="long-name"><span id="long-name">${"Long accessible name ".repeat(7)}</span></button>`,
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as any).port}`;
process.env.ALLOWED_ORIGINS = origin;
const { BrowserTools } = await import("../src/server/browser");
const { createRun, saveRun, artifactDir, db } =
  await import("../src/server/store");
const { requirements, classify } = await import("../src/server/verification");
const { generateExport } = await import("../src/server/export");
const { executeRun } = await import("../src/server/runner");
const { observationSchema } = await import("../src/server/provider");
const input = runInputSchema.parse({
  targetUrl: origin,
  scenario: "custom",
  mode: "ai",
  goal: "Submit a search for wireless mouse and verify results.",
  expected: "The results page retains wireless mouse.",
  maxDuration: 90,
  maxSteps: 30,
  customChecks: [
    {
      id: "external-query",
      requirement: "Search retains the submitted query on the results page.",
      locator: { kind: "id", value: "search" },
      operator: "value",
      expected: "wireless mouse",
      pagePath: "/s",
    },
    {
      id: "external-results",
      requirement: "Results heading is visible on the results page.",
      locator: { kind: "role", role: "heading", value: "Results" },
      operator: "visible",
      pagePath: "/s",
    },
  ],
});
let browser: InstanceType<typeof BrowserTools> | undefined;
const checks: string[] = [];
try {
  const run = createRun(input);
  run.startedAt = new Date().toISOString();
  run.lifecycle = "running";
  saveRun(run);
  browser = new BrowserTools(run, 1, requirements(input).checks);
  await browser.start();
  await browser.execute({ type: "navigate", url: origin });
  const submit = browser.observation.elements.find(
    (e) => e.locator.value === "submit",
  )!;
  assert.equal(submit.role, "button");
  assert.equal(submit.name, "Go");
  const long = browser.observation.elements.find((e) =>
    e.name.startsWith("Long accessible name"),
  )!;
  assert.ok(long.locator.value.length > 100);
  const schema = observationSchema(
    browser.observation,
    requirements(input).checks,
    run,
  ) as any;
  const branches =
    schema.properties.action.anyOf || schema.properties.action.oneOf;
  assert.ok(
    branches
      .find((b: any) => b.properties.type.const === "click_element")
      .properties.elementId.enum.includes(submit.id),
  );
  assert.ok(
    !branches.some((b: any) => b.properties.type.const === "check_condition"),
  );
  checks.push(
    "Submit inputs are clickable buttons; long accessible names stay resolvable; checks wait for their required page.",
  );
  const premature = await browser.execute({
    type: "check_condition",
    checkId: "external-query",
  });
  assert.equal(premature.error, true);
  assert.equal(premature.execution, "rejected");
  const act = async (type: string, value: string, extra = {}) => {
    const el = browser!.observation.elements.find(
      (e) => e.locator.value === value,
    )!;
    assert.ok(el);
    const e = await browser!.execute({
      type,
      elementId: el.id,
      observationId: browser!.observation.id,
      ...extra,
    } as Action);
    assert.equal(e.error, false, e.result);
  };
  await act("fill_field", "search", { value: "wireless mouse" });
  await act("click_element", "submit");
  for (const check of input.customChecks!) {
    const e = await browser.execute({
      type: "check_condition",
      checkId: check.id,
    });
    assert.equal(e.error, false, e.result);
    assert.equal(e.checks[0].passed, true);
  }
  assert.equal(
    classify(
      requirements(input).checks,
      run.events.flatMap((e) => e.checks),
    ),
    "passed",
  );
  const filename = path.join(artifactDir(run.id), "regression.spec.ts");
  const code = generateExport(run);
  fs.writeFileSync(filename, code);
  assert.ok(code.includes(origin));
  assert.ok(code.includes("new URL(page.url()).pathname"));
  assert.ok(!code.includes("http://127.0.0.1:4311"));
  await browser.close();
  run.lifecycle = "completed";
  saveRun(run);
  const config = path.join(folder, "playwright.config.ts");
  fs.writeFileSync(
    config,
    `export default {testDir:${JSON.stringify(path.dirname(filename))},testMatch:'regression.spec.ts',timeout:15000,expect:{timeout:1000},workers:1,reporter:'line',outputDir:${JSON.stringify(path.join(folder, "output"))}}`,
  );
  const replay = () =>
    new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const env = { ...process.env };
      delete env.BASE_URL;
      delete env.TRACEPILOT_DEMO;
      const child = spawn(
        process.execPath,
        [
          path.resolve("node_modules/@playwright/test/cli.js"),
          "test",
          "--config",
          config,
        ],
        { env },
      );
      let output = "";
      child.stdout.on("data", (d) => (output += d));
      child.stderr.on("data", (d) => (output += d));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, output }));
    });
  const good = await replay();
  assert.equal(good.code, 0, good.output);
  broken = true;
  const bad = await replay();
  assert.equal(bad.code, 1, bad.output);
  assert.match(bad.output, /toHaveValue/);
  checks.push(
    "Exact generated external regression passes correct response and fails the original assertion after a controlled wrong-query response.",
  );
  const blocked = createRun({ ...input, targetUrl: origin + "/challenge" });
  blocked.startedAt = new Date().toISOString();
  blocked.lifecycle = "running";
  saveRun(blocked);
  await executeRun(blocked);
  assert.equal(blocked.verdict, "inconclusive");
  assert.equal(blocked.events.length, 1);
  assert.equal(blocked.usage, undefined);
  assert.equal(blocked.events[0].observation?.documentStatus, 202);
  assert.ok(blocked.events[0].screenshot);
  assert.ok(blocked.errors.some((e) => e.kind === "site-blocked"));
  assert.equal(blocked.exportStatus, "unsupported");
  checks.push(
    "Hidden-body AWS WAF challenge is recorded with screenshot and HTTP status; no model call, click, or product verdict.",
  );
  const hidden = createRun({ ...input, targetUrl: origin + "/hidden" });
  hidden.startedAt = new Date().toISOString();
  hidden.lifecycle = "running";
  saveRun(hidden);
  await executeRun(hidden);
  assert.equal(hidden.verdict, "agent_failure");
  assert.ok(hidden.events[0].screenshot);
  checks.push(
    "A non-challenge observation timeout still preserves its screenshot.",
  );
  const unavailable = createRun({
    ...input,
    targetUrl: origin + "/unavailable",
  });
  unavailable.startedAt = new Date().toISOString();
  unavailable.lifecycle = "running";
  saveRun(unavailable);
  await executeRun(unavailable);
  assert.equal(unavailable.verdict, "inconclusive");
  assert.equal(unavailable.usage, undefined);
  checks.push(
    "HTTP 503 stops as unavailable/inconclusive before assertions or model calls.",
  );
  fs.writeFileSync(
    "docs/amazon/local-validation.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        fixture:
          "Controlled local test of external-site mechanics, not an Amazon result",
        checks,
        passed: checks.length,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  await browser?.close();
  db.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
