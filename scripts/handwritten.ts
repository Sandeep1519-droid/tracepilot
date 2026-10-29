import { chromium, expect } from "@playwright/test";
import { controlToken } from "../src/server/secrets";
import { demoOrigin } from "../src/server/config";
export async function handwritten() {
  const browser = await chromium.launch();
  const rows: {
    scenario: string;
    variant: string;
    detectedFailure: boolean;
    expectedFailure: boolean;
    matched: boolean;
    runtimeMs: number;
  }[] = [];
  try {
    for (const scenario of ["expired", "quantity", "removal", "checkout"])
      for (const broken of [false, true]) {
        const variant = broken
          ? (
              {
                expired: "expired-coupon",
                quantity: "stale-quantity",
                removal: "sticky-discount",
                checkout: "missing-required",
              } as Record<string, string>
            )[scenario]
          : "correct";
        const started = Date.now();
        let failed = false;
        const ctx = await browser.newContext();
        try {
          const reset = await fetch(`${demoOrigin}/__fixtures`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-tracepilot-control": controlToken,
            },
            body: JSON.stringify({ variant }),
          });
          const { session } = (await reset.json()) as { session: string };
          await ctx.addCookies([
            {
              name: "tp_session",
              value: session,
              url: demoOrigin,
              httpOnly: true,
              sameSite: "Strict",
            },
          ]);
          const p = await ctx.newPage();
          await p.goto(demoOrigin);
          await p.getByTestId("cart-link").click();
          const initial = await p.getByTestId("cart-total").innerText();
          if (scenario === "expired") {
            await p.getByTestId("coupon-input").fill("EXPIRED20");
            await p.getByTestId("apply-coupon").click();
            await expect(p.getByTestId("coupon-message")).toContainText(
              "This coupon has expired.",
              { timeout: 1000 },
            );
            await expect(p.getByTestId("cart-total")).toHaveText(initial, {
              timeout: 1000,
            });
          }
          if (scenario === "quantity") {
            await p.getByTestId("quantity").fill("3");
            await p.getByTestId("quantity").press("Tab");
            await expect(p.getByTestId("quantity")).toHaveValue("3");
            await expect(p.getByTestId("cart-subtotal")).toHaveText("$192.00", {
              timeout: 1000,
            });
            await expect(p.getByTestId("cart-total")).toHaveText("$200.00", {
              timeout: 1000,
            });
          }
          if (scenario === "removal") {
            await p.getByTestId("coupon-input").fill("WELCOME10");
            await p.getByTestId("apply-coupon").click();
            await expect(p.getByTestId("cart-total")).toHaveText("$65.60", {
              timeout: 1000,
            });
            await p.getByTestId("remove-coupon").click();
            await expect(p.getByTestId("cart-total")).toHaveText(initial, {
              timeout: 1000,
            });
          }
          if (scenario === "checkout") {
            await p.getByTestId("checkout-link").click();
            await p.getByTestId("checkout-email").fill("buyer@example.test");
            await p.getByTestId("checkout-address").fill("42 Test Street");
            await p.getByTestId("place-order").click();
            await expect(p.getByTestId("name-error")).toContainText(
              "Full name is required.",
              { timeout: 1000 },
            );
            await expect(p.getByTestId("order-confirmation")).not.toBeVisible();
          }
        } catch (e) {
          if (!(e as any).matcherResult) throw e;
          failed = true;
        } finally {
          await ctx.close();
        }
        rows.push({
          scenario,
          variant,
          detectedFailure: failed,
          expectedFailure: broken,
          matched: failed === broken,
          runtimeMs: Date.now() - started,
        });
      }
  } finally {
    await browser.close();
  }
  return rows;
}
