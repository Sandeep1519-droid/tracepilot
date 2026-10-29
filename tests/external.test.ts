import test from "node:test";
import assert from "node:assert/strict";
import { runInputSchema } from "../src/shared/domain";
import { pageBlocker } from "../src/server/page-blocker";
const check = {
  id: "external-query",
  requirement: "Search retains the submitted query.",
  locator: { kind: "id", value: "search" },
  operator: "value",
  expected: "wireless mouse",
  pagePath: "/s",
};
const input = {
  targetUrl: "https://www.amazon.in/",
  goal: "Search for wireless mouse",
  scenario: "custom",
  mode: "ai",
  customChecks: [check],
};
test("external contracts are explicit, bounded, unique, and cannot overwrite preset checks", () => {
  assert.equal(runInputSchema.safeParse(input).success, true);
  for (const invalid of [
    { ...input, scenario: "expired" },
    { ...input, mode: "scripted" },
    { ...input, customChecks: [check, check] },
    { ...input, customChecks: [{ ...check, expected: undefined }] },
    { ...input, customChecks: [{ ...check, id: "total-unchanged" }] },
    {
      ...input,
      customChecks: [{ ...check, locator: { kind: "css", value: "body" } }],
    },
  ])
    assert.equal(runInputSchema.safeParse(invalid).success, false);
});
test("challenge gates and HTTP outages do not become product assertions", () => {
  assert.match(
    pageBlocker(
      "Amazon.in",
      "Click the button below to continue shopping\nContinue shopping",
      202,
    )!,
    /access check/,
  );
  assert.match(
    pageBlocker("Robot Check", "Enter the characters you see below", 200)!,
    /access check/,
  );
  assert.match(pageBlocker("Service unavailable", "", 503)!, /HTTP 503/);
  assert.equal(
    pageBlocker("Search results", "A book about CAPTCHA programming", 200),
    undefined,
  );
  assert.equal(
    pageBlocker("Amazon.in", "Shop our deals. Continue shopping", 200),
    undefined,
  );
});
