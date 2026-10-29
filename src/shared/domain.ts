import { z } from "zod";
export const variants = [
  "correct",
  "expired-coupon",
  "stale-quantity",
  "sticky-discount",
  "missing-required",
] as const;
export const scenarios = {
  expired: {
    title: "Expired coupon",
    goal: "Verify that an expired coupon is rejected and the cart total stays unchanged.",
    expected: "Show “This coupon has expired.” and keep the total unchanged.",
    fixture:
      "Expired coupon: EXPIRED20. Cart: one Everyday Backpack, $64.00 plus $8.00 shipping.",
    plan: [
      "Open the cart and record its total",
      "Apply the known expired coupon",
      "Verify rejection and an unchanged total",
    ],
  },
  quantity: {
    title: "Cart quantity",
    goal: "Verify that changing the backpack quantity to 3 recalculates the cart.",
    expected: "Quantity is 3, subtotal is $192.00, and total is $200.00.",
    fixture: "Everyday Backpack: $64.00 each. Shipping: $8.00.",
    plan: [
      "Open the cart",
      "Change quantity to 3",
      "Verify quantity, subtotal and total",
    ],
  },
  removal: {
    title: "Remove coupon",
    goal: "Verify that removing a valid coupon restores the original total.",
    expected:
      "WELCOME10 applies a 10% item discount; removing it restores the $72.00 total.",
    fixture: "Valid coupon: WELCOME10. Original total: $72.00.",
    plan: [
      "Record the cart total",
      "Apply WELCOME10 and check the discount",
      "Remove the coupon and verify the original total",
    ],
  },
  checkout: {
    title: "Required checkout field",
    goal: "Verify checkout rejects an empty full name.",
    expected: "Show “Full name is required.” and do not place an order.",
    fixture:
      "Use buyer@example.test and 42 Test Street. Leave Full name empty.",
    plan: [
      "Open checkout",
      "Fill email and address; leave full name empty",
      "Submit and verify validation without an order",
    ],
  },
  login: {
    title: "Test account login",
    goal: "Verify the configured test account can sign in.",
    expected:
      "Show “Signed in successfully.” after submitting the configured test account.",
    fixture: "Use the configured demo credential reference.",
    plan: [
      "Open sign in",
      "Fill the configured credential reference",
      "Submit and verify the success message",
    ],
  },
  custom: {
    title: "External website / custom checks",
    goal: "",
    expected: "",
    fixture: "",
    plan: [
      "Observe the target",
      "Explore within the execution budget",
      "Report evidence and any missing verification contract",
    ],
  },
} as const;
export type Scenario = keyof typeof scenarios;
export const locatorSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("testId"), value: z.string().min(1).max(500) })
    .strict(),
  z
    .object({ kind: z.literal("id"), value: z.string().min(1).max(500) })
    .strict(),
  z
    .object({ kind: z.literal("label"), value: z.string().min(1).max(500) })
    .strict(),
  z
    .object({
      kind: z.literal("role"),
      value: z.string().min(1).max(500),
      role: z.enum([
        "button",
        "link",
        "textbox",
        "searchbox",
        "heading",
        "combobox",
        "checkbox",
        "radio",
        "spinbutton",
        "status",
        "main",
      ]),
    })
    .strict(),
]);
export const externalCheckSchema = z
  .object({
    id: z.string().regex(/^external-[a-z0-9-]{1,60}$/),
    requirement: z.string().min(5).max(1000),
    locator: locatorSchema,
    operator: z.enum(["visible", "contains", "equals", "value"]),
    expected: z.string().max(1000).optional(),
    pagePath: z.string().regex(/^\//).max(1000).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.operator !== "visible" && !c.expected?.trim())
      ctx.addIssue({
        code: "custom",
        message: "Text/value checks require a nonempty expected value.",
      });
  });
export const runInputSchema = z
  .object({
    targetUrl: z.string().url().max(2048),
    goal: z.string().min(5).max(2000),
    expected: z.string().max(2000).default(""),
    fixture: z.string().max(2000).default(""),
    scenario: z
      .enum(["expired", "quantity", "removal", "checkout", "login", "custom"])
      .default("expired"),
    variant: z.enum(variants).default("correct"),
    wording: z.enum(["standard", "alternate"]).default("standard"),
    mode: z.enum(["scripted", "ai"]).default("scripted"),
    customChecks: z.array(externalCheckSchema).min(1).max(12).optional(),
    credentialRef: z.enum(["demo", "configured"]).optional(),
    maxSteps: z.number().int().min(3).max(80).default(30),
    maxDuration: z.number().int().min(5).max(300).default(90),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.customChecks) {
      if (input.scenario !== "custom" || input.mode !== "ai")
        ctx.addIssue({
          code: "custom",
          message: "External checks require the custom scenario and AI mode.",
        });
      if (
        new Set(input.customChecks.map((c) => c.id)).size !==
        input.customChecks.length
      )
        ctx.addIssue({ code: "custom", message: "Check IDs must be unique." });
    }
  });
export type RunInput = z.infer<typeof runInputSchema>;
export type Lifecycle =
  "queued" | "running" | "completed" | "cancelled" | "interrupted";
export type Verdict =
  "passed" | "product_failure" | "agent_failure" | "inconclusive";
const target = {
  elementId: z.string().regex(/^e\d+$/),
  observationId: z.number().int().nonnegative(),
};
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("observe_page") }).strict(),
  z.object({ type: z.literal("navigate"), url: z.string().url() }).strict(),
  z.object({ type: z.literal("click_element"), ...target }).strict(),
  z
    .object({
      type: z.literal("fill_field"),
      ...target,
      value: z.string().max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal("fill_credential"),
      ...target,
      field: z.enum(["email", "password"]),
      reference: z.enum(["demo", "configured"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("select_option"),
      ...target,
      value: z.string().max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal("press_key"),
      ...target,
      key: z.enum(["Enter", "Tab", "Escape", "ArrowDown", "ArrowUp"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("scroll_page"),
      direction: z.enum(["up", "down"]),
    })
    .strict(),
  z
    .object({ type: z.literal("check_condition"), checkId: z.string().max(80) })
    .strict(),
  z.object({ type: z.literal("capture_screenshot") }).strict(),
  z
    .object({ type: z.literal("finish_run"), summary: z.string().max(500) })
    .strict(),
]);
export type Action = z.infer<typeof actionSchema>;
export type ElementInfo = {
  id: string;
  tag: string;
  role: string;
  name: string;
  testId?: string;
  type?: string;
  value?: string;
  disabled: boolean;
  locator: LocatorSpec;
};
export type LocatorSpec = {
  kind: "testId" | "id" | "label" | "role";
  value: string;
  role?: string;
};
export type Observation = {
  blocker?: string;
  documentStatus?: number;
  checkTargets?: { checkId: string; visible: boolean }[];
  id: number;
  url: string;
  text: string;
  elements: ElementInfo[];
};
export type CheckSpec = {
  id: string;
  requirement: string;
  testId?: string;
  locator?: LocatorSpec;
  pagePath?: string;
  operator:
    | "visible"
    | "equals"
    | "contains"
    | "money"
    | "value"
    | "absent"
    | "baseline"
    | "unchanged";
  expected?: string | number;
};
export type CheckResult = CheckSpec & {
  actual: string | number;
  passed: boolean;
  eventId: string;
};
export type Event = {
  id: string;
  at: string;
  attempt: number;
  action: Action;
  target: string;
  url: string;
  result: string;
  durationMs: number;
  observation?: Observation;
  screenshot?: string;
  checks: CheckResult[];
  locator?: LocatorSpec;
  error?: boolean;
  execution?: "rejected" | "succeeded" | "failed";
};
export type Run = {
  id: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  lifecycle: Lifecycle;
  verdict?: Verdict;
  input: RunInput;
  plan: string[];
  explanation?: string;
  cancelRequested: boolean;
  interruptRequested?: boolean;
  currentAction?: string;
  reproduction?: "confirmed" | "not_reproduced" | "incomplete";
  exportStatus?: "verified" | "unverified" | "unsupported";
  exportExplanation?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number | null;
  };
  events: Event[];
  errors: { at: string; attempt: number; kind: string; message: string }[];
};
