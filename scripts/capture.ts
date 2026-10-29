import { chromium, expect } from "@playwright/test";
import { request } from "./helpers";
import type { Run } from "../src/shared/domain";
const runs = await request<Run[]>("/api/runs");
const finding = runs.find(
  (r) =>
    r.input.mode === "ai" &&
    r.verdict === "product_failure" &&
    r.reproduction === "confirmed" &&
    r.exportStatus === "verified",
);
if (!finding)
  throw new Error("Capture requires an actual confirmed AI finding.");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const root = process.env.WEB_URL || "http://127.0.0.1:5173";
  await page.goto(root + "/#run/" + finding.id);
  await page
    .getByText(
      "This exact exported file passed on the correct fixture and failed an original assertion on the broken fixture.",
    )
    .waitFor();
  await page.locator(".browser-stage img").waitFor();
  await page.screenshot({ path: "docs/ai-run.png", fullPage: true });
  await page.getByRole("button", { name: "All test runs" }).click();
  await page
    .getByRole("heading", { name: "Ship with a little more certainty." })
    .waitFor();
  await page.screenshot({ path: "docs/dashboard.png", fullPage: true });
  await page.getByRole("button", { name: "Evaluations", exact: true }).click();
  await page
    .getByRole("button", { name: "Scripted infrastructure", exact: true })
    .click();
  await page.getByText("SCRIPTED INFRASTRUCTURE", { exact: true }).waitFor();
  await page.screenshot({ path: "docs/evaluations.png", fullPage: true });
  await page.getByRole("button", { name: "Test runs", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({ path: "docs/workspace-mobile.png", fullPage: true });
  console.log(
    "Captured real dashboard, AI finding, evaluation ledger and mobile layout.",
  );
} finally {
  await browser.close();
}
