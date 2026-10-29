import test from "node:test";
import assert from "node:assert/strict";
import { replaySequence } from "../src/server/replay";
import { generateExport } from "../src/server/export";
import { scenarios, type Event, type Run } from "../src/shared/domain";
const event = (id: string, extra: Partial<Event> = {}): Event => ({
  id,
  at: new Date().toISOString(),
  attempt: 1,
  action: { type: "click_element", elementId: "e1", observationId: 1 },
  target: "Apply",
  url: "http://127.0.0.1:4311",
  result: "Completed",
  durationMs: 1,
  checks: [],
  locator: { kind: "testId", value: "apply-coupon" },
  ...extra,
});
const input = {
  targetUrl: "http://127.0.0.1:4311",
  goal: scenarios.expired.goal,
  expected: scenarios.expired.expected,
};
test("replay skips only recorded pre-execution rejections and preserves successful action order", () => {
  const rejected = event("rejected", {
    error: true,
    execution: "rejected",
    result: "Capture initial-total before applying a coupon.",
  });
  const successful = event("applied", { execution: "succeeded" });
  const partial = event("partial", { error: true, execution: "failed" });
  const unknown = event("legacy", { error: true });
  const plan = replaySequence([rejected, successful, partial, unknown]);
  assert.deepEqual(
    plan.omitted.map((e) => e.id),
    ["rejected"],
  );
  assert.deepEqual(
    plan.events.map((e) => e.id),
    ["applied", "partial", "legacy"],
  );
  assert.equal(rejected.error, true);
});
test("exports retain original assertions while documenting rejected-action omissions", () => {
  const rejected = event("rejected-before-apply", {
    error: true,
    execution: "rejected",
  });
  const baseline = event("baseline", {
    action: { type: "check_condition", checkId: "initial-total" },
    checks: [
      {
        id: "initial-total",
        testId: "cart-total",
        operator: "baseline",
        requirement: scenarios.expired.expected,
        actual: 7200,
        passed: true,
        eventId: "baseline",
      },
    ],
  });
  const applied = event("applied", { execution: "succeeded" });
  const check = event("assertion", {
    action: { type: "check_condition", checkId: "total-unchanged" },
    checks: [
      {
        id: "total-unchanged",
        testId: "cart-total",
        operator: "unchanged",
        requirement: scenarios.expired.expected,
        expected: 7200,
        actual: 5920,
        passed: false,
        eventId: "assertion",
      },
    ],
  });
  const source = generateExport({
    input,
    events: [rejected, baseline, applied, check],
  } as unknown as Run);
  assert.ok(
    source.includes(
      'Original event "rejected-before-apply" was rejected before execution',
    ),
  );
  assert.equal((source.match(/\.click\(\)/g) || []).length, 1);
  assert.ok(source.indexOf("const initialTotal") < source.indexOf(".click()"));
  assert.ok(source.includes(".toBe(initialTotal)"));
  assert.ok(!source.includes(".toBe(5920)"));
});
test("exports refuse unknown or partially executed failures rather than silently dropping them", () => {
  for (const execution of [undefined, "failed"] as const)
    assert.throws(
      () =>
        generateExport({
          input,
          events: [event("uncertain", { error: true, execution })],
        } as unknown as Run),
      /reliable successful interaction/,
    );
});
