import { demoOrigin } from "./config";
import {
  scenarios,
  type RunInput,
  type CheckSpec,
  type CheckResult,
  type Verdict,
} from "../shared/domain";
export function requirements(input: RunInput): {
  checks: CheckSpec[];
  missing?: string;
} {
  if (input.scenario === "custom" && input.customChecks?.length) {
    return { checks: input.customChecks };
  }
  if (
    input.scenario !== "custom" &&
    new URL(input.targetUrl).origin !== demoOrigin
  )
    return {
      checks: [],
      missing:
        "Bundled-store expectations cannot verify an external website. Select External website / custom checks and supply explicit page checks.",
    };
  const scenario = scenarios[input.scenario];
  if (
    input.scenario === "custom" ||
    input.expected.trim() !== scenario.expected
  )
    return {
      checks: [],
      missing:
        "An explicit supported verification contract is required. Supply explicit external checks, or select a preset and preserve its expected behavior. Custom expectations are retained, but are not automatically reinterpreted.",
    };
  if (input.scenario === "expired" && !input.fixture.includes("EXPIRED20"))
    return {
      checks: [],
      missing: "A known expired EXPIRED20 coupon fixture is required.",
    };
  const c = (
    id: string,
    testId: string,
    operator: CheckSpec["operator"],
    expected?: string | number,
  ): CheckSpec => ({
    id,
    testId,
    operator,
    expected,
    requirement: input.expected,
  });
  switch (input.scenario) {
    case "expired":
      return {
        checks: [
          c("initial-total", "cart-total", "baseline"),
          c(
            "coupon-rejected",
            "coupon-message",
            "contains",
            "This coupon has expired.",
          ),
          c("total-unchanged", "cart-total", "unchanged"),
        ],
      };
    case "quantity":
      return {
        checks: [
          c("quantity", "quantity", "value", "3"),
          c("subtotal", "cart-subtotal", "money", 19200),
          c("total", "cart-total", "money", 20000),
        ],
      };
    case "removal":
      return {
        checks: [
          c("initial-total", "cart-total", "baseline"),
          c("discount-applied", "cart-total", "money", 6560),
          c("total-restored", "cart-total", "unchanged"),
        ],
      };
    case "checkout":
      return {
        checks: [
          c(
            "name-required",
            "name-error",
            "contains",
            "Full name is required.",
          ),
          c("no-order", "order-confirmation", "absent"),
        ],
      };
    case "login":
      return {
        checks: [
          c(
            "login-success",
            "login-message",
            "contains",
            "Signed in successfully.",
          ),
        ],
      };
    default:
      return { checks: [] };
  }
}
export function moneyMinor(text: string) {
  if (!/^\s*\$?\s*\d[\d,]*\.\d{2}\s*$/.test(text))
    throw new Error("Expected an exact USD amount");
  return Number(text.replace(/[^\d]/g, ""));
}
export function classify(
  checks: CheckSpec[],
  results: CheckResult[],
  executionError?: string,
): Verdict {
  if (executionError) return "agent_failure";
  if (!checks.length) return "inconclusive";
  const latest = checks.map((c) => results.findLast((r) => r.id === c.id));
  if (latest.some((c) => !c)) return "inconclusive";
  return latest.some((c) => !c!.passed) ? "product_failure" : "passed";
}
export function reportEvidence(run: {
  events: { id: string; checks: CheckResult[] }[];
}) {
  return run.events
    .flatMap((e) => e.checks)
    .every((c) =>
      run.events.some((e) => e.id === c.eventId && e.checks.includes(c)),
    );
}
