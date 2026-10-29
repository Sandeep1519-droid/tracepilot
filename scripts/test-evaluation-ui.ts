import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, expect } from "@playwright/test";
import { apiBase } from "./helpers";
const fetchReport = async (mode: string) => {
  const response = await fetch(`${apiBase}/api/evaluations?mode=${mode}`);
  assert.equal(response.status, 200);
  return (await response.json()).results;
};
const ai = await fetchReport("ai");
const scripted = await fetchReport("scripted");
assert.equal(ai?.mode, "ai");
assert.equal(scripted?.mode, "scripted");
assert.equal(ai.records.length, 13);
assert.equal(
  (await fetch(`${apiBase}/api/evaluations?mode=../../.env`)).status,
  400,
);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const root = process.env.WEB_URL || "http://127.0.0.1:5173";
  await page.goto(root + "/#evaluations");
  await page.getByText("MODEL-BACKED BENCHMARK", { exact: true }).waitFor();
  await expect(page.locator(".benchmark-record tbody tr")).toHaveCount(
    ai.records.length,
  );
  await expect(
    page.getByRole("button", { name: "AI model benchmark", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".eval-metrics>div")).toHaveCount(8);
  for (const row of ai.records) {
    const rendered = page
      .locator(".benchmark-record tbody tr")
      .filter({ has: page.getByRole("cell", { name: row.id, exact: true }) });
    await expect(rendered).toContainText(row.correct ? "Matched" : "Mismatch");
  }
  await page.screenshot({ path: "docs/evaluations-ai.png", fullPage: true });
  await page
    .getByRole("button", { name: "Scripted infrastructure", exact: true })
    .click();
  await page.getByText("SCRIPTED INFRASTRUCTURE", { exact: true }).waitFor();
  await expect(page.locator(".benchmark-record tbody tr")).toHaveCount(
    scripted.records.length,
  );
  await page.screenshot({
    path: "docs/evaluations-scripted.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "AI model benchmark", exact: true })
    .click();
  await page.getByText("MODEL-BACKED BENCHMARK", { exact: true }).waitFor();
  const first = ai.records[0];
  await page
    .locator(".benchmark-record tbody tr")
    .filter({ has: page.getByRole("cell", { name: first.id, exact: true }) })
    .getByRole("button", { name: "Open run" })
    .click();
  await expect(page).toHaveURL(new RegExp(`#run/${first.runId}$`));
  await expect(page.locator(".run-meta .mode")).toHaveText("AI model");
  await page.getByRole("button", { name: "All test runs" }).click();
  await page.getByRole("button", { name: "Evaluations", exact: true }).click();
  await page.getByText("MODEL-BACKED BENCHMARK", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "docs/evaluations-ai-mobile.png",
    fullPage: true,
  });
  fs.writeFileSync(
    "docs/evaluation-ui-verification.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        aiCases: ai.records.length,
        scriptedCases: scripted.records.length,
        modesSeparated: true,
        rowsMatchRecordedOutcomes: true,
        evidenceLinkOpened: first.runId,
        mobileOverflow: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS evaluation API modes, recorded AI rows, scripted/AI switching, evidence links and mobile layout.",
  );
} finally {
  await browser.close();
}
