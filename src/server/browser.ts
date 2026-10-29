import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Locator,
} from "@playwright/test";
import crypto from "node:crypto";
import path from "node:path";
import {
  actionSchema,
  type Run,
  type Action,
  type Observation,
  type ElementInfo,
  type LocatorSpec,
  type CheckSpec,
  type CheckResult,
  type Event,
} from "../shared/domain";
import { allowedOrigins, demoOrigin } from "./config";
import { validateNetwork, validateUrl } from "./security";
import { controlToken, credential, redact } from "./secrets";
import { artifactDir, saveRun, getRun } from "./store";
import { moneyMinor } from "./verification";
import { pageBlocker } from "./page-blocker";
import { assertCheckReady } from "./preconditions";
export function locatorFor(page: Page, spec: LocatorSpec): Locator {
  return spec.kind === "testId"
    ? page.getByTestId(spec.value)
    : spec.kind === "id"
      ? page.locator(`[id=${JSON.stringify(spec.value)}]`)
      : spec.kind === "label"
        ? page.getByLabel(spec.value, { exact: true })
        : page.getByRole(spec.role as any, { name: spec.value, exact: true });
}
export class BrowserTools {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  observation!: Observation;
  sequence = 0;
  baseline?: number;
  closed = false;
  tracing = false;
  active?: Action;
  documentStatus?: number;
  documentBlocker?: string;
  constructor(
    public run: Run,
    public attempt: number,
    public specs: CheckSpec[],
    public onEvent?: (e: Event) => void,
  ) {}
  async start() {
    this.browser = await chromium.launch({
      headless: true,
      args: ["--disable-background-networking", "--disable-component-update"],
    });
    this.assertActive();
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 820 },
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    await this.context.route("**/*", async (route) => {
      try {
        await validateNetwork(route.request().url(), allowedOrigins);
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });
    await this.context.routeWebSocket("**/*", (ws) => ws.close());
    this.context.on("page", (p) => {
      if (this.page && p !== this.page) void p.close();
    });
    if (new URL(this.run.input.targetUrl).origin === demoOrigin) {
      const response = await fetch(`${demoOrigin}/__fixtures`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tracepilot-control": controlToken,
        },
        body: JSON.stringify({
          variant: this.run.input.variant,
          wording: this.run.input.wording,
        }),
      });
      if (!response.ok) throw new Error("Demo fixture reset failed");
      const { session } = (await response.json()) as { session: string };
      await this.context.addCookies([
        {
          name: "tp_session",
          value: session,
          url: demoOrigin,
          httpOnly: true,
          sameSite: "Strict",
        },
      ]);
    }
    // Credential runs deliberately disable traces and screenshots: password masking alone cannot sanitize a trace.
    if (!this.run.input.credentialRef && this.run.input.scenario !== "login") {
      await this.context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: false,
      });
      this.tracing = true;
    }
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(4500);
    this.page.setDefaultNavigationTimeout(10000);
    this.page.on("dialog", async (dialog) => {
      this.error("dialog", dialog.message());
      await dialog.dismiss();
    });
    this.page.on("pageerror", (e) => this.error("page", e.message));
    this.page.on("console", (m) => {
      if (m.type() === "error") this.error("console", m.text());
    });
    this.page.on("requestfailed", (r) =>
      this.error(
        "network",
        `${r.method()} ${new URL(r.url()).origin}${new URL(r.url()).pathname}: ${r.failure()?.errorText}`,
      ),
    );
    this.page.on("response", (r) => {
      if (
        r.request().isNavigationRequest() &&
        r.frame() === this.page.mainFrame()
      ) {
        this.documentStatus = r.status();
        this.documentBlocker = ["challenge", "captcha"].includes(
          r.headers()["x-amzn-waf-action"] || "",
        )
          ? "Website access check blocked this browser session (AWS WAF challenge). Testing stopped without solving or clicking through the challenge; the requested behavior remains unverified."
          : undefined;
      }
      if (r.status() >= 400)
        this.error(
          "http",
          `${r.status()} ${new URL(r.url()).origin}${new URL(r.url()).pathname}`,
        );
    });
  }
  error(kind: string, message: string) {
    if (this.run.errors.length < 100)
      this.run.errors.push({
        at: new Date().toISOString(),
        attempt: this.attempt,
        kind,
        message: redact(message).slice(0, 1000),
      });
  }
  assertActive() {
    if (
      this.closed ||
      getRun(this.run.id)?.cancelRequested ||
      getRun(this.run.id)?.interruptRequested
    )
      throw new Error("Run cancelled");
    if (
      Date.now() - Date.parse(this.run.startedAt!) >
      this.run.input.maxDuration * 1000
    )
      throw new Error("Duration budget exhausted");
  }
  async observe(): Promise<Observation> {
    this.assertActive();
    await this.page
      .locator("body")
      .waitFor({ state: this.documentBlocker ? "attached" : "visible" });
    const id = ++this.sequence;
    const raw = await this.page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll(
          'a,button,input,textarea,select,[role="button"],[role="checkbox"]',
        ),
      )
        .filter((n) => {
          const r = n.getBoundingClientRect();
          const s = getComputedStyle(n);
          return (
            r.width > 0 &&
            r.height > 0 &&
            s.visibility !== "hidden" &&
            s.display !== "none"
          );
        })
        .slice(0, 90);
      const elements = nodes.map((node, index) => {
        const el = node as HTMLInputElement;
        const ref = "e" + index;
        el.setAttribute("data-tp-ref", ref);
        const label = el.labels?.[0]?.textContent?.trim();
        const labelledBy = el
          .getAttribute("aria-labelledby")
          ?.split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() || "")
          .join(" ");
        const name =
          labelledBy ||
          el.getAttribute("aria-label") ||
          label ||
          (["submit", "button", "reset"].includes(el.type) ? el.value : "") ||
          el.textContent?.trim() ||
          el.querySelector("img[alt]")?.getAttribute("alt") ||
          el.getAttribute("placeholder") ||
          el.name ||
          el.tagName;
        const testId = el.getAttribute("data-testid") || undefined;
        const tag = el.tagName.toLowerCase();
        const role =
          el.getAttribute("role") ||
          (tag === "button" ||
          (tag === "input" &&
            ["submit", "button", "reset", "image"].includes(el.type))
            ? "button"
            : tag === "a"
              ? "link"
              : tag === "select"
                ? "combobox"
                : el.type === "search"
                  ? "searchbox"
                  : el.type === "checkbox"
                    ? "checkbox"
                    : el.type === "radio"
                      ? "radio"
                      : el.type === "number"
                        ? "spinbutton"
                        : "textbox");
        return {
          id: ref,
          tag,
          role,
          name: name.slice(0, 100),
          testId,
          type: el.type,
          value: el.type === "password" ? undefined : el.value?.slice(0, 150),
          disabled: !!el.disabled,
          locator: testId
            ? { kind: "testId", value: testId }
            : el.id
              ? { kind: "id", value: el.id }
              : label
                ? { kind: "label", value: label }
                : { kind: "role", value: name, role },
        };
      });
      return {
        title: document.title,
        text: document.body.innerText.slice(0, 11000),
        elements,
      };
    });
    const checkTargets = await Promise.all(
      this.specs.map(async (spec) => ({
        checkId: spec.id,
        visible:
          (!spec.pagePath ||
            new URL(this.page.url()).pathname === spec.pagePath) &&
          (await locatorFor(
            this.page,
            spec.locator || { kind: "testId", value: spec.testId! },
          )
            .isVisible()
            .catch(() => false)),
      })),
    );
    this.observation = JSON.parse(
      redact(
        JSON.stringify({
          id,
          url: this.page.url(),
          checkTargets,
          ...raw,
          documentStatus: this.documentStatus,
          blocker:
            this.documentBlocker ||
            pageBlocker(raw.title, raw.text, this.documentStatus),
        }),
      ),
    ) as Observation;
    return this.observation;
  }
  resolve(action: Action) {
    if (!("elementId" in action)) throw new Error("Element action required");
    if (!this.observation || action.observationId !== this.observation.id)
      throw new Error("Stale observation: observe again.");
    const element = this.observation.elements.find(
      (e) => e.id === action.elementId,
    );
    if (!element)
      throw new Error("Element was not present in the observation.");
    if (element.disabled) throw new Error("Element is disabled.");
    return element;
  }
  async screenshot(eventId: string) {
    if (
      this.closed ||
      this.run.input.credentialRef ||
      this.run.input.scenario === "login"
    )
      return;
    const filename = `attempt-${this.attempt}-${eventId}.png`;
    await this.page.screenshot({
      path: path.join(artifactDir(this.run.id), filename),
      fullPage: false,
      mask: [this.page.locator('input[type="password"], input[type="email"]')],
    });
    return filename;
  }
  async check(spec: CheckSpec, eventId: string): Promise<CheckResult> {
    assertCheckReady(
      spec,
      this.run.events.filter((e) => e.attempt === this.attempt),
    );
    if (spec.pagePath && new URL(this.page.url()).pathname !== spec.pagePath)
      throw new Error("Check requires page path: " + spec.pagePath);
    const locator = locatorFor(
      this.page,
      spec.locator || { kind: "testId", value: spec.testId! },
    );
    if (spec.operator === "contains" && (await locator.count()) === 1)
      await locator
        .waitFor({ state: "visible", timeout: 1800 })
        .catch(() => {});
    let actual: string | number = "[not visible]",
      passed = false;
    if (spec.operator === "absent") {
      actual = (await locator.isVisible()) ? "visible" : "absent";
      passed = actual === "absent";
    } else if (await locator.isVisible()) {
      if (spec.operator === "visible") {
        actual = "visible";
        passed = true;
      } else if (spec.operator === "value") {
        actual = await locator.inputValue();
        passed = actual === spec.expected;
      } else {
        actual = (await locator.innerText()).trim();
        if (["money", "baseline", "unchanged"].includes(spec.operator)) {
          actual = moneyMinor(actual);
          if (spec.operator === "baseline") {
            if (this.baseline === undefined) this.baseline = actual;
            passed = actual === this.baseline;
          } else
            passed =
              actual ===
              (spec.operator === "unchanged" ? this.baseline : spec.expected);
        } else
          passed =
            spec.operator === "contains"
              ? actual.includes(String(spec.expected))
              : actual === spec.expected;
      }
    }
    if (
      spec.id === "name-required" &&
      actual === "[not visible]" &&
      (await this.page.getByTestId("order-confirmation").isVisible())
    )
      return {
        ...spec,
        actual: "Order was confirmed without the required validation",
        passed: false,
        eventId,
      };
    if (spec.operator !== "absent" && actual === "[not visible]")
      throw new Error(
        "Required assertion target is unavailable: " +
          (spec.locator?.value || spec.testId),
      );
    return {
      ...spec,
      expected: spec.operator === "unchanged" ? this.baseline : spec.expected,
      actual,
      passed,
      eventId,
    };
  }
  async execute(raw: unknown): Promise<Event> {
    this.assertActive();
    const action = actionSchema.parse(raw);
    this.active = action;
    const start = Date.now();
    const id = crypto.randomUUID();
    let target: string = action.type;
    let locator: LocatorSpec | undefined;
    let checks: CheckResult[] = [];
    let result = "Completed";
    let error = false;
    let executionStarted = false;
    const perform = async <T>(operation: () => Promise<T>) => {
      executionStarted = true;
      return operation();
    };
    try {
      if (this.observation?.blocker) throw new Error(this.observation.blocker);
      if ("elementId" in action) {
        const el = this.resolve(action);
        target = el.name;
        locator = el.locator;
        const loc = locatorFor(this.page, locator);
        if ((await loc.count()) !== 1)
          throw new Error(
            "Observed element is missing or ambiguous; observe again.",
          );
        const ref = await loc.getAttribute("data-tp-ref");
        if (ref !== action.elementId)
          throw new Error("Stale element; observe again.");
        if (
          action.type === "click_element" ||
          (action.type === "press_key" &&
            action.key === "Enter" &&
            el.role === "button")
        ) {
          if (
            el.testId === "apply-coupon" &&
            this.specs.some((s) => s.operator === "baseline") &&
            this.baseline === undefined
          )
            throw new Error("Capture initial-total before applying a coupon.");
          if (
            el.testId === "place-order" &&
            this.specs.some((s) => s.id === "name-required")
          ) {
            if (
              (
                await this.page.getByTestId("checkout-name").inputValue()
              ).trim() ||
              !(
                await this.page.getByTestId("checkout-email").inputValue()
              ).includes("@") ||
              !(
                await this.page.getByTestId("checkout-address").inputValue()
              ).trim()
            )
              throw new Error(
                "This contract requires an empty full name and valid email/address before submission.",
              );
          }
          if (action.type === "click_element") await perform(() => loc.click());
        }
        if (action.type === "fill_field") {
          if (el.type === "password")
            throw new Error(
              "Passwords require a configured credential reference.",
            );
          await perform(() => loc.fill(action.value));
        }
        if (action.type === "fill_credential") {
          if (this.run.input.credentialRef !== action.reference)
            throw new Error(
              "Credential reference was not authorized for this run.",
            );
          if (action.field === "password" && el.type !== "password")
            throw new Error(
              "Password references can only fill password fields.",
            );
          await perform(() =>
            loc.fill(credential(action.reference, action.field)),
          );
        }
        if (action.type === "select_option")
          await perform(() => loc.selectOption(action.value));
        if (action.type === "press_key")
          await perform(() => loc.press(action.key));
      } else if (action.type === "navigate") {
        await validateNetwork(action.url, allowedOrigins);
        await perform(() =>
          this.page.goto(action.url, { waitUntil: "domcontentloaded" }),
        );
      } else if (action.type === "scroll_page")
        await perform(() =>
          this.page.mouse.wheel(0, action.direction === "down" ? 550 : -550),
        );
      else if (action.type === "check_condition") {
        const spec = this.specs.find((s) => s.id === action.checkId);
        if (!spec)
          throw new Error(
            "Check is not part of the original verification contract.",
          );
        assertCheckReady(
          spec,
          this.run.events.filter((e) => e.attempt === this.attempt),
        );
        if (
          spec.pagePath &&
          new URL(this.page.url()).pathname !== spec.pagePath
        )
          throw new Error("Check requires page path: " + spec.pagePath);
        checks = [await perform(() => this.check(spec, id))];
        result = checks[0].passed ? "Assertion passed" : "Assertion failed";
      } else if (action.type === "finish_run") result = action.summary;
      if (
        ["observe_page", "capture_screenshot", "finish_run"].includes(
          action.type,
        )
      )
        executionStarted = true;
      if (this.page.url() !== "about:blank")
        validateUrl(this.page.url(), allowedOrigins);
      if (action.type === "click_element" || action.type === "press_key")
        await this.page.waitForLoadState("domcontentloaded");
    } catch (e) {
      error = true;
      result = redact((e as Error).message).slice(0, 1000);
    }
    let observation: Observation | undefined;
    let screenshot: string | undefined;
    if (!this.closed) {
      try {
        observation = await this.observe();
      } catch (e) {
        if (!error) {
          error = true;
          result = redact((e as Error).message);
        }
      }
      // Preserve visual evidence even if DOM observation itself failed.
      try {
        screenshot = await this.screenshot(id);
      } catch (e) {
        this.error("screenshot", (e as Error).message);
      }
    }
    const event: Event = {
      id,
      at: new Date().toISOString(),
      attempt: this.attempt,
      action: JSON.parse(redact(JSON.stringify(action))),
      target: redact(target),
      url: redact(this.page.url()),
      result: redact(result),
      durationMs: Date.now() - start,
      observation,
      screenshot,
      checks,
      locator,
      error,
      execution: error
        ? executionStarted
          ? "failed"
          : "rejected"
        : "succeeded",
    };
    this.run.events.push(event);
    this.run.cancelRequested = !!getRun(this.run.id)?.cancelRequested;
    saveRun(this.run);
    this.onEvent?.(event);
    return event;
  }
  async close() {
    this.closed = true;
    if (this.tracing) {
      await this.context?.tracing
        .stop({
          path: path.join(
            artifactDir(this.run.id),
            `attempt-${this.attempt}-trace.zip`,
          ),
        })
        .catch(() => {});
      this.tracing = false;
    }
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
  }
}
export function observedAction(
  tools: BrowserTools,
  type: "click_element" | "fill_field" | "press_key" | "fill_credential",
  testId: string,
  extra: Record<string, string> = {},
): Action {
  const el = tools.observation.elements.find((e) => e.testId === testId);
  if (!el)
    throw new Error(`Required observed control is unavailable: ${testId}`);
  return actionSchema.parse({
    type,
    elementId: el.id,
    observationId: tools.observation.id,
    ...extra,
  });
}
