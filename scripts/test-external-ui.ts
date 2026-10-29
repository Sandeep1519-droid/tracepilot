import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { runInputSchema } from "../src/shared/domain";
fs.mkdirSync("docs/amazon", { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto("http://127.0.0.1:5173");
  await page.getByRole("button", { name: "New test run" }).click();
  await page.getByLabel("Scenario", { exact: true }).selectOption("custom");
  assert.equal(
    await page.getByLabel("Execution mode", { exact: true }).inputValue(),
    "ai",
  );
  await page
    .getByLabel("Target URL", { exact: true })
    .fill("https://www.amazon.in/");
  await page
    .getByLabel("What should we test?", { exact: true })
    .fill(
      "Search for wireless mouse and verify that results retain the query.",
    );
  await page
    .getByLabel("Expected behavior", { exact: true })
    .fill("Search field on /s retains wireless mouse.");
  await page
    .getByRole("button", { name: "Add page check", exact: true })
    .click();
  await page
    .getByLabel("Check 1 requirement", { exact: true })
    .fill("Search retains the submitted query.");
  await page
    .getByLabel("Element name or ID", { exact: true })
    .fill("twotabsearchtextbox");
  await page.getByLabel("Assertion", { exact: true }).selectOption("value");
  await page.getByLabel("On page path (optional)", { exact: true }).fill("/s");
  await page
    .getByLabel("Expected result", { exact: true })
    .fill("wireless mouse");
  await page.screenshot({
    path: "docs/amazon/external-check-form.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  // Inspect the submission without launching another request against Amazon.
  let payload: unknown;
  await page.route("**/api/runs", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    payload = route.request().postDataJSON();
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "UI validation captured the request; no run started.",
      }),
    });
  });
  await page
    .getByRole("button", { name: "Start test run", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "UI validation captured" })
    .waitFor();
  const parsed = runInputSchema.parse(payload);
  assert.equal(parsed.customChecks?.[0].locator.value, "twotabsearchtextbox");
  assert.equal(parsed.customChecks?.[0].expected, "wireless mouse");
  assert.equal(parsed.customChecks?.[0].pagePath, "/s");
  assert.equal(parsed.mode, "ai");
  fs.writeFileSync(
    "docs/amazon/ui-validation.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        submissionAcceptedBySchema: true,
        externalRunStarted: false,
        mobileOverflow: false,
      },
      null,
      2,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (fs.existsSync("docs/amazon/automated-run.json")) {
    const run = JSON.parse(
      fs.readFileSync("docs/amazon/automated-run.json", "utf8"),
    );
    await page.goto("http://127.0.0.1:5173/#run/" + run.id);
    await page.locator("p").filter({ hasText: run.explanation }).waitFor();
    await page.locator(".browser-stage img").waitFor();
    await page.screenshot({
      path: "docs/amazon/tracepilot-report.png",
      fullPage: true,
    });
  }
  console.log(
    "PASS external check editor, schema-valid submission, mobile width (Amazon report preview only when locally available).",
  );
} finally {
  await browser.close();
}
