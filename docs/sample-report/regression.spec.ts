// Recorded by TracePilot. Verification status is in report.json.
// Run: BASE_URL=http://127.0.0.1:4311 TRACEPILOT_DEMO=1 npx playwright test regression.spec.ts
// Demo fixture reset needs TRACEPILOT_FIXTURE_TOKEN from your local data/local-control.json.
// Use DEMO_VARIANT=correct or the intended broken fixture. Never commit secrets.
import { test, expect } from '@playwright/test';
const baseURL = process.env.BASE_URL || "http://127.0.0.1:4311";
function requiredEnv(name: string) { const value = process.env[name]; if (!value) throw new Error('Missing environment variable: ' + name); return value; }
function minor(value: string) { if (!/^\s*\$?\s*\d[\d,]*\.\d{2}\s*$/.test(value)) throw new Error('Invalid USD amount'); return Number(value.replace(/[^\d]/g, '')); }
test("Verify that an expired coupon is rejected and the cart total stays unchanged.", async ({ page, context, request }) => {
  if (process.env.TRACEPILOT_DEMO === '1') {
    const reset = await request.post(new URL('/__fixtures', baseURL).href, { headers: { 'x-tracepilot-control': requiredEnv('TRACEPILOT_FIXTURE_TOKEN') }, data: { variant: process.env.DEMO_VARIANT || 'correct', wording: process.env.DEMO_WORDING || 'standard' } });
    expect(reset.ok()).toBeTruthy();
    const { session } = await reset.json();
    await context.addCookies([{ name: 'tp_session', value: session, url: baseURL, httpOnly: true, sameSite: 'Strict' }]);
  }
  await page.goto(new URL("/", baseURL).href);
  await page.getByTestId("cart-link").click();
  // Original requirement: Show “This coupon has expired.” and keep the total unchanged.
  const initialTotal = minor(await page.getByTestId("cart-total").innerText());
  await page.getByTestId("coupon-input").fill("EXPIRED20");
  await page.getByTestId("apply-coupon").click();
  // Original requirement: Show “This coupon has expired.” and keep the total unchanged.
  await expect(page.getByTestId("coupon-message")).toContainText("This coupon has expired.");
  // Original requirement: Show “This coupon has expired.” and keep the total unchanged.
  await expect.poll(async () => minor(await page.getByTestId("cart-total").innerText())).toBe(initialTotal);
});
