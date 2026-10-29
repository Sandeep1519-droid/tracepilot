import test from "node:test";
import assert from "node:assert/strict";
import {
  actionSchema,
  runInputSchema,
  scenarios,
  type CheckResult,
  type Run,
} from "../src/shared/domain";
import {
  validateUrl,
  isPrivateIp,
  validateNetwork,
} from "../src/server/security";
import {
  classify,
  requirements,
  moneyMinor,
  reportEvidence,
} from "../src/server/verification";
import { generateExport, quote } from "../src/server/export";
const input = runInputSchema.parse({
  targetUrl: "http://127.0.0.1:4311",
  goal: scenarios.expired.goal,
  expected: scenarios.expired.expected,
  fixture: scenarios.expired.fixture,
});
const specs = requirements(input).checks;
const result = (id: string, passed = true): CheckResult => ({
  ...specs.find((c) => c.id === id)!,
  passed,
  actual: 7200,
  eventId: "event-1",
});
test("tool schema excludes code, shell, unobserved selectors and unexpected arguments", () => {
  for (const action of [
    { type: "eval", code: "alert(1)" },
    { type: "click_element", selector: "button" },
    {
      type: "click_element",
      elementId: "e1",
      observationId: 1,
      code: "danger",
    },
    { type: "press_key", elementId: "e0", observationId: 1, key: "Control+L" },
  ])
    assert.equal(actionSchema.safeParse(action).success, false);
  assert.equal(
    actionSchema.safeParse({
      type: "click_element",
      elementId: "e0",
      observationId: 1,
    }).success,
    true,
  );
});
test("navigation allowlist is exact; credential, metadata and internal endpoints rejected", async () => {
  const origins = ["http://127.0.0.1:4311", "https://example.test"];
  for (const url of [
    "http://127.0.0.1:4310",
    "http://169.254.169.254/latest/meta-data",
    "file:///etc/passwd",
    "https://user:password@example.test",
    "https://example.test.evil.com",
    "http://127.0.0.1:4311/__fixtures",
  ])
    assert.throws(() => validateUrl(url, origins));
  assert.equal(
    validateUrl("https://example.test/cart", origins).pathname,
    "/cart",
  );
  assert.equal(
    (await validateNetwork("http://127.0.0.1:4311", origins)).port,
    "4311",
  );
  for (const ip of [
    "127.0.0.1",
    "10.0.0.2",
    "172.16.0.1",
    "192.168.4.2",
    "169.254.169.254",
    "::1",
    "fd00::1",
    "::ffff:127.0.0.1",
  ])
    assert.equal(isPrivateIp(ip), true);
  assert.equal(isPrivateIp("8.8.8.8"), false);
});
test("a click sequence never establishes a pass; every original check is required", () => {
  assert.equal(classify(specs, []), "inconclusive");
  assert.equal(classify(specs, [result("coupon-rejected")]), "inconclusive");
  assert.equal(
    classify(
      specs,
      specs.map((c) => result(c.id)),
    ),
    "passed",
  );
  assert.equal(
    classify(
      specs,
      specs.map((c) => result(c.id, c.id !== "total-unchanged")),
    ),
    "product_failure",
  );
  assert.equal(classify(specs, [], "Browser timed out"), "agent_failure");
  assert.equal(classify([], []), "inconclusive");
});
test("missing or edited expectations are not silently rewritten", () => {
  assert.equal(requirements({ ...input, expected: "" }).checks.length, 0);
  assert.equal(
    requirements({ ...input, expected: "Accept any total" }).checks.length,
    0,
  );
  assert.equal(requirements({ ...input, fixture: "" }).checks.length, 0);
  assert.equal(requirements(input).checks.length, 3);
  assert.equal(specs[2].operator, "unchanged");
});
test("currency comparisons use exact integer minor units", () => {
  assert.equal(moneyMinor("$1,234.56"), 123456);
  assert.equal(moneyMinor("$72.00"), 7200);
  for (const text of ["$72", "NaN", "$1.234", "1e5", "-$1.00"])
    assert.throws(() => moneyMinor(text));
});
test("export uses escaped strings and original requirements, never observed bug values", () => {
  const payload = '"; process.exit(1); //\n` ${danger}';
  assert.equal(JSON.parse(quote(payload)), payload);
  const run = {
    input: { ...input, goal: payload },
    events: [
      {
        attempt: 1,
        action: { type: "navigate", url: input.targetUrl },
        checks: [],
      },
      {
        attempt: 1,
        action: { type: "fill_field", value: payload },
        locator: { kind: "testId", value: "coupon-input" },
        checks: [],
      },
      {
        attempt: 1,
        action: { type: "check_condition", checkId: "initial-total" },
        checks: [result("initial-total")],
      },
      {
        attempt: 1,
        action: { type: "check_condition", checkId: "total-unchanged" },
        checks: [{ ...result("total-unchanged", false), actual: 5920 }],
      },
    ],
  } as unknown as Run;
  const code = generateExport(run);
  assert.ok(code.includes(quote(payload)));
  assert.ok(code.includes(".toBe(initialTotal)"));
  assert.ok(!code.includes(".toBe(5920)"));
  assert.ok(!code.includes("waitForTimeout"));
  assert.ok(code.includes("TRACEPILOT_FIXTURE_TOKEN"));
});
test("reported assertion evidence must point to a real event", () => {
  const c = result("initial-total");
  assert.equal(
    reportEvidence({ events: [{ id: "event-1", checks: [c] }] }),
    true,
  );
  assert.equal(
    reportEvidence({ events: [{ id: "other", checks: [c] }] }),
    false,
  );
});

test("check prerequisites prevent out-of-order assertions from establishing a false pass", async () => {
  const { assertCheckReady } = await import("../src/server/preconditions");
  const restored = requirements({
    ...input,
    scenario: "removal",
    expected: scenarios.removal.expected,
  }).checks.find((c) => c.id === "total-restored")!;
  assert.throws(() => assertCheckReady(restored, []), /removing/);
  assert.throws(
    () =>
      assertCheckReady(
        specs.find((c) => c.id === "total-unchanged")!,
        [],
      ),
    /Apply/,
  );
});

test("model schemas bind current observation IDs and exclude stale or non-interactive targets", async () => {
  const { observationSchema } = await import("../src/server/provider");
  const observation = {
    id: 9,
    url: input.targetUrl,
    text: "Cart",
    checkTargets: [{ checkId: "initial-total", visible: true }],
    elements: [
      {
        id: "e3",
        tag: "button",
        role: "button",
        name: "Apply",
        testId: "apply-coupon",
        disabled: false,
        locator: { kind: "testId" as const, value: "apply-coupon" },
      },
      {
        id: "e4",
        tag: "input",
        role: "textbox",
        name: "Coupon",
        type: "text",
        disabled: false,
        locator: { kind: "label" as const, value: "Coupon" },
      },
    ],
  };
  const schema = observationSchema(observation, specs, {
    events: [],
  } as unknown as Run) as any;
  const branches =
    schema.properties.action.anyOf || schema.properties.action.oneOf;
  const click = branches.find(
    (b: any) => b.properties.type.const === "click_element",
  );
  assert.equal(click.properties.observationId.const, 9);
  assert.deepEqual(click.properties.elementId.enum, ["e3"]);
  const check = branches.find(
    (b: any) => b.properties.type.const === "check_condition",
  );
  assert.deepEqual(check.properties.checkId.enum, ["initial-total"]);
});

test("provider receives expectations and visible observations without fixture variants, evaluator labels or credentials", async () => {
  const { CompatibleProvider } = await import("../src/server/provider");
  const previousFetch = globalThis.fetch,
    previousPassword = process.env.TEST_ACCOUNT_PASSWORD;
  process.env.TEST_ACCOUNT_PASSWORD = "unit-only-sensitive-password";
  let captured = "";
  globalThis.fetch = (async (_url: unknown, options?: RequestInit) => {
    captured = String(options?.body);
    return new Response(
      JSON.stringify({
        message: {
          content: JSON.stringify({ action: { type: "observe_page" } }),
        },
        prompt_eval_count: 10,
        eval_count: 5,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const run = {
      input: {
        ...input,
        variant: "expired-coupon",
        fixture: input.fixture + " unit-only-sensitive-password",
      },
      events: [],
      plan: ["Open cart"],
      errors: [],
      verdict: "product_failure",
    } as unknown as Run;
    const action = await new CompatibleProvider().next(
      run,
      { id: 1, url: input.targetUrl, text: "Storefront", elements: [] },
      specs,
      20,
      new AbortController().signal,
    );
    assert.equal(action.type, "observe_page");
    assert.ok(captured.includes("total unchanged"));
    assert.ok(!captured.includes("expired-coupon"));
    assert.ok(!captured.includes("product_failure"));
    assert.ok(!captured.includes("unit-only-sensitive-password"));
    assert.equal(run.usage?.inputTokens, 10);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousPassword === undefined)
      delete process.env.TEST_ACCOUNT_PASSWORD;
    else process.env.TEST_ACCOUNT_PASSWORD = previousPassword;
  }
});

test("keyboard button activation preserves the same business assertion prerequisites", async () => {
  const { assertCheckReady } = await import("../src/server/preconditions");
  const events = [
    {
      action: { type: "check_condition", checkId: "initial-total" },
      checks: [result("initial-total")],
      locator: undefined,
    },
    {
      action: { type: "fill_field", value: "EXPIRED20" },
      checks: [],
      locator: { kind: "testId", value: "coupon-input" },
    },
    {
      action: { type: "press_key", key: "Enter" },
      checks: [],
      locator: { kind: "testId", value: "apply-coupon" },
    },
  ] as unknown as Run["events"];
  assert.doesNotThrow(() =>
    assertCheckReady(
      specs.find((c) => c.id === "total-unchanged")!,
      events,
    ),
  );
  assert.throws(
    () =>
      assertCheckReady(
        specs.find((c) => c.id === "total-unchanged")!,
        [
          ...events,
          {
            action: { type: "navigate", url: input.targetUrl },
            checks: [],
          } as unknown as Run["events"][number],
        ],
      ),
    /Apply/,
  );
});
