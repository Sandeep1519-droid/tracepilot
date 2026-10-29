import fs from "node:fs";
import path from "node:path";
import { type Run, type Action, type Event } from "../shared/domain";
import { BrowserTools, observedAction } from "./browser";
import { scriptFor, nextScriptAction } from "./scripted";
import { CompatibleProvider } from "./provider";
import { requirements, classify } from "./verification";
import { validateExport } from "./export";
import { saveRun, getRun, artifactDir } from "./store";
import { demoOrigin } from "./config";
import { redact } from "./secrets";
import { replaySequence } from "./replay";
class SiteBlockedError extends Error {}
export async function executeRun(run: Run) {
  const contract = requirements(run.input);
  let tools: BrowserTools | undefined;
  const controller = new AbortController();
  let cancelled = false,
    interrupted = false,
    expired = false;
  const remaining =
    run.input.maxDuration * 1000 - (Date.now() - Date.parse(run.startedAt!));
  const deadline = setTimeout(
    () => {
      expired = true;
      controller.abort();
      void tools?.close();
    },
    Math.max(1, remaining),
  );
  const watch = setInterval(() => {
    const stored = getRun(run.id);
    if (stored?.interruptRequested) {
      interrupted = true;
      controller.abort();
      void tools?.close();
    }
    if (stored?.cancelRequested) {
      cancelled = true;
      controller.abort();
      void tools?.close();
    }
  }, 100);
  const budget = () => {
    if (interrupted) throw new Error("Worker interrupted");
    if (cancelled) throw new Error("Run cancelled");
    if (expired) throw new Error("Duration budget exhausted");
    if (run.events.length >= run.input.maxSteps)
      throw new Error("Action budget exhausted");
  };
  const step = async (a: Action) => {
    budget();
    run.currentAction = "Executing " + a.type.replaceAll("_", " ");
    saveRun(run);
    const e = await tools!.execute(a);
    if (e.observation?.blocker)
      throw new SiteBlockedError(e.observation.blocker);
    if (e.error) throw new Error(e.result);
    return e;
  };
  try {
    tools = new BrowserTools(run, 1, contract.checks);
    await tools.start();
    await step({ type: "navigate", url: run.input.targetUrl });
    if (contract.missing) {
      run.verdict = "inconclusive";
      run.explanation = contract.missing;
    } else {
      if (run.input.mode === "scripted") {
        if (new URL(run.input.targetUrl).origin !== demoOrigin)
          throw new Error(
            "Scripted policies support the bundled demo origin only. Use AI for another configured origin.",
          );
        for (const s of scriptFor(run)) await step(nextScriptAction(tools, s));
      } else {
        const provider = new CompatibleProvider();
        let retries = 0,
          repeated = 0,
          previous = "";
        while (true) {
          budget();
          let action: Action;
          try {
            run.currentAction =
              "Choosing the next browser action with the configured model";
            saveRun(run);
            action = await provider.next(
              run,
              tools.observation,
              contract.checks,
              run.input.maxSteps - run.events.length,
              controller.signal,
            );
          } catch (e) {
            if (controller.signal.aborted) throw e;
            run.errors.push({
              at: new Date().toISOString(),
              attempt: 1,
              kind: "model-retry",
              message: redact((e as Error).message).slice(0, 500),
            });
            saveRun(run);
            if (++retries > 2)
              throw new Error(
                "Model output or service failed after 3 bounded attempts.",
              );
            continue;
          }
          const signature = JSON.stringify({
            ...action,
            ...("observationId" in action ? { observationId: 0 } : {}),
          });
          repeated = signature === previous ? repeated + 1 : 0;
          previous = signature;
          if (repeated >= 3)
            throw new Error(
              "Agent made no progress: repeated the same action.",
            );
          run.currentAction = "Executing " + action.type.replaceAll("_", " ");
          saveRun(run);
          const e = await tools.execute(action);
          if (e.observation?.blocker)
            throw new SiteBlockedError(e.observation.blocker);
          if (e.error) {
            if (++retries > 2)
              throw new Error("Browser action failed after bounded recovery.");
            await step({ type: "observe_page" });
            continue;
          }
          if (action.type === "finish_run") break;
          const done = contract.checks.every((c) =>
            run.events.some(
              (e) => e.attempt === 1 && e.checks.some((r) => r.id === c.id),
            ),
          );
          if (done) break;
        }
      }
      run.verdict = classify(
        contract.checks,
        run.events.filter((e) => e.attempt === 1).flatMap((e) => e.checks),
      );
      run.explanation =
        run.verdict === "passed"
          ? "Every required deterministic check completed and passed."
          : run.verdict === "product_failure"
            ? "Recorded browser evidence contradicts the original expected behavior."
            : "The agent did not complete every required check. No pass is inferred from interactions alone.";
    }
    await tools.close();
    if (run.verdict === "product_failure") {
      budget();
      run.currentAction =
        new URL(run.input.targetUrl).origin === demoOrigin
          ? "Resetting fixtures for clean-session reproduction"
          : "Opening a clean browser session for reproduction";
      const sequence = replaySequence(
        run.events.filter((e) => e.attempt === 1),
      );
      const original = sequence.events;
      for (const event of sequence.omitted)
        run.errors.push({
          at: new Date().toISOString(),
          attempt: 2,
          kind: "replay-omission",
          message: `Original event ${event.id} was rejected before execution and is omitted from replay; its record is preserved.`,
        });
      run.reproduction = "incomplete";
      saveRun(run);
      tools = new BrowserTools(run, 2, contract.checks);
      await tools.start();
      try {
        for (const e of original) {
          let a = e.action;
          if (a.type === "finish_run") continue;
          if ("elementId" in a) {
            const element = tools.observation.elements.find(
              (el) => JSON.stringify(el.locator) === JSON.stringify(e.locator),
            );
            if (!element)
              throw new Error(
                "Original reproduction target is not present; replay cannot substitute another action.",
              );
            a = {
              ...a,
              elementId: element.id,
              observationId: tools.observation.id,
            };
          }
          await step(a);
        }
        const verdict = classify(
          contract.checks,
          run.events.filter((e) => e.attempt === 2).flatMap((e) => e.checks),
        );
        run.reproduction =
          verdict === "product_failure"
            ? "confirmed"
            : verdict === "passed"
              ? "not_reproduced"
              : "incomplete";
      } catch (e) {
        if (cancelled || interrupted || expired) throw e;
        run.reproduction = "incomplete";
        run.errors.push({
          at: new Date().toISOString(),
          attempt: 2,
          kind: "reproduction",
          message: redact((e as Error).message),
        });
      }
      await tools.close();
      run.explanation +=
        run.reproduction === "confirmed"
          ? " The failure reproduced in a clean browser session."
          : run.reproduction === "not_reproduced"
            ? " The clean-session replay passed; this finding is unconfirmed or intermittent."
            : " Clean-session reproduction could not be completed.";
    }
    if (["passed", "product_failure"].includes(run.verdict!)) {
      budget();
      run.currentAction =
        new URL(run.input.targetUrl).origin === demoOrigin
          ? "Validating the exported regression against correct and broken fixtures"
          : "Generating regression from the recorded external checks";
      saveRun(run);
      try {
        await validateExport(run, controller.signal);
      } catch (e) {
        if (cancelled || interrupted || expired) throw e;
        run.exportStatus = "unverified";
        run.exportExplanation = redact((e as Error).message);
      }
    } else {
      run.exportStatus = "unsupported";
      run.exportExplanation =
        "A complete deterministic verification record is required for regression export.";
    }
    budget();
    run.lifecycle = "completed";
  } catch (e) {
    if (cancelled || getRun(run.id)?.cancelRequested) {
      run.lifecycle = "cancelled";
      run.verdict = undefined;
      run.explanation =
        "Stopped by the user. Browser context closed; partial evidence is preserved.";
      run.exportStatus = "unverified";
    } else {
      run.lifecycle = "completed";
      run.verdict =
        e instanceof SiteBlockedError ? "inconclusive" : "agent_failure";
      run.explanation = redact((e as Error).message);
      if (e instanceof SiteBlockedError) {
        run.exportStatus = "unsupported";
        run.exportExplanation =
          "The site blocked access; no behavior verdict or passing regression can be established.";
        run.errors.push({
          at: new Date().toISOString(),
          attempt: tools?.attempt || 1,
          kind: "site-blocked",
          message: run.explanation,
        });
      }
      if (expired) run.explanation = "Maximum run duration exhausted.";
    }
  } finally {
    clearTimeout(deadline);
    clearInterval(watch);
    controller.abort();
    await tools?.close();
    run.cancelRequested = cancelled || !!getRun(run.id)?.cancelRequested;
    if (run.cancelRequested) {
      run.lifecycle = "cancelled";
      run.verdict = undefined;
      run.explanation =
        "Stopped by the user. Browser context closed; partial evidence is preserved.";
    }
    if (interrupted || getRun(run.id)?.interruptRequested) {
      run.lifecycle = "interrupted";
      run.verdict = undefined;
      run.explanation =
        "Worker stopped during execution. Browser context closed; partial evidence is preserved.";
    }
    run.finishedAt = new Date().toISOString();
    saveRun(run);
    fs.writeFileSync(
      path.join(artifactDir(run.id), "report.json"),
      JSON.stringify(run, null, 2),
    );
  }
  return run;
}
