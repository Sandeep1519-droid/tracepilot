import type { Action, Run } from "../shared/domain";
import { BrowserTools, observedAction } from "./browser";
export type ScriptStep =
  | {
      type: "click_element" | "fill_field" | "press_key" | "fill_credential";
      testId: string;
      extra?: Record<string, string>;
    }
  | { type: "check_condition"; checkId: string };
export function scriptFor(run: Run): ScriptStep[] {
  const click = (testId: string): ScriptStep => ({
    type: "click_element",
    testId,
  });
  const fill = (testId: string, value: string): ScriptStep => ({
    type: "fill_field",
    testId,
    extra: { value },
  });
  const check = (checkId: string): ScriptStep => ({
    type: "check_condition",
    checkId,
  });
  switch (run.input.scenario) {
    case "expired":
      return [
        click("cart-link"),
        check("initial-total"),
        fill("coupon-input", "EXPIRED20"),
        click("apply-coupon"),
        check("coupon-rejected"),
        check("total-unchanged"),
      ];
    case "quantity":
      return [
        click("cart-link"),
        fill("quantity", "3"),
        { type: "press_key", testId: "quantity", extra: { key: "Tab" } },
        check("quantity"),
        check("subtotal"),
        check("total"),
      ];
    case "removal":
      return [
        click("cart-link"),
        check("initial-total"),
        fill("coupon-input", "WELCOME10"),
        click("apply-coupon"),
        check("discount-applied"),
        click("remove-coupon"),
        check("total-restored"),
      ];
    case "checkout":
      return [
        click("cart-link"),
        click("checkout-link"),
        fill("checkout-email", "buyer@example.test"),
        fill("checkout-address", "42 Test Street"),
        click("place-order"),
        check("name-required"),
        check("no-order"),
      ];
    case "login":
      return [
        click("login-link"),
        {
          type: "fill_credential",
          testId: "login-email",
          extra: {
            field: "email",
            reference: run.input.credentialRef || "demo",
          },
        },
        {
          type: "fill_credential",
          testId: "login-password",
          extra: {
            field: "password",
            reference: run.input.credentialRef || "demo",
          },
        },
        click("login-submit"),
        check("login-success"),
      ];
    default:
      return [];
  }
}
export function nextScriptAction(
  tools: BrowserTools,
  step: ScriptStep,
): Action {
  return step.type === "check_condition"
    ? step
    : observedAction(tools, step.type, step.testId, step.extra);
}
