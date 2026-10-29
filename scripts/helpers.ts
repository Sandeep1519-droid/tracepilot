import { setTimeout as delay } from "node:timers/promises";
import {
  runInputSchema,
  scenarios,
  type Run,
  type RunInput,
  type Scenario,
} from "../src/shared/domain";
export const apiBase = process.env.API_URL || "http://127.0.0.1:4310";
export async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(
    apiBase + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}
export function scenarioInput(
  scenario: Scenario,
  override: Partial<RunInput> = {},
): RunInput {
  return runInputSchema.parse({
    targetUrl: process.env.DEMO_URL || "http://127.0.0.1:4311",
    scenario,
    goal: scenarios[scenario].goal,
    expected: scenarios[scenario].expected,
    fixture: scenarios[scenario].fixture,
    maxSteps: 45,
    maxDuration: 120,
    ...override,
  });
}
export async function waitRun(id: string) {
  const end = Date.now() + 330000;
  while (Date.now() < end) {
    const r = await request<Run>("/api/runs/" + id);
    if (!["queued", "running"].includes(r.lifecycle)) return r;
    await delay(250);
  }
  throw new Error("Run completion timeout");
}
export async function runCase(
  scenario: Scenario,
  override: Partial<RunInput> = {},
) {
  const r = await request<Run>("/api/runs", scenarioInput(scenario, override));
  return waitRun(r.id);
}
