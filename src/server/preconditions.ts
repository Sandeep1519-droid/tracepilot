import type { Event, CheckSpec } from "../shared/domain";
export function assertCheckReady(check: CheckSpec, events: Event[]) {
  const valid = events.filter((e) => !e.error);
  const changes = valid.filter(
    (e) =>
      [
        "navigate",
        "click_element",
        "fill_field",
        "fill_credential",
        "press_key",
        "select_option",
      ].includes(e.action.type) &&
      (e.action.type !== "press_key" ||
        e.action.key !== "Tab" ||
        e.locator?.value === "quantity"),
  );
  const last = changes.at(-1);
  const clickedLast = (id: string) =>
    (last?.action.type === "click_element" ||
      (last?.action.type === "press_key" && last.action.key === "Enter")) &&
    last.locator?.value === id;
  const verified = (id: string) =>
    valid.some((e) => e.checks.some((c) => c.id === id && c.passed));
  const lastFill = (id: string) =>
    valid.findLast(
      (e) => e.action.type === "fill_field" && e.locator?.value === id,
    );
  const applied = (code: string) =>
    clickedLast("apply-coupon") &&
    lastFill("coupon-input")?.action.type === "fill_field" &&
    (lastFill("coupon-input")!.action as { value: string }).value === code;
  if (
    ["coupon-rejected", "total-unchanged"].includes(check.id) &&
    (!verified("initial-total") || !applied("EXPIRED20"))
  )
    throw new Error(
      "Check requires original total capture, EXPIRED20, and Apply as the latest business action.",
    );
  if (
    check.id === "discount-applied" &&
    (!verified("initial-total") || !applied("WELCOME10"))
  )
    throw new Error(
      "Check requires initial total capture and applying WELCOME10 as the latest business action.",
    );
  if (
    check.id === "total-restored" &&
    (!verified("discount-applied") || !clickedLast("remove-coupon"))
  )
    throw new Error(
      "Check requires verified discount application and removing that coupon as the latest business action.",
    );
  if (["quantity", "subtotal", "total"].includes(check.id)) {
    const fill = lastFill("quantity");
    if (
      !fill ||
      fill.action.type !== "fill_field" ||
      fill.action.value !== "3" ||
      last?.action.type !== "press_key" ||
      last.action.key !== "Tab" ||
      last.locator?.value !== "quantity" ||
      valid.indexOf(last) < valid.indexOf(fill)
    )
      throw new Error(
        "Quantity checks require filling 3 and committing that update with Tab as the latest business action.",
      );
  }
  if (
    ["name-required", "no-order"].includes(check.id) &&
    !clickedLast("place-order")
  )
    throw new Error(
      "Checkout validation requires an actual submission as the latest business action.",
    );
  if (
    check.id === "login-success" &&
    (!clickedLast("login-submit") ||
      !valid.some(
        (e) =>
          e.action.type === "fill_credential" && e.action.field === "password",
      ) ||
      !valid.some(
        (e) =>
          e.action.type === "fill_credential" && e.action.field === "email",
      ))
  )
    throw new Error(
      "Login success requires configured account fills and sign-in submission.",
    );
}
