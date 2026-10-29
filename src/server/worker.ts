import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  takeLease,
  heartbeat,
  releaseLease,
  claimRun,
  interruptRun,
} from "./store";
import { executeRun } from "./runner";
const owner = crypto.randomUUID();
let stopped = false;
let active: string | undefined;
for (let retry = 0; ; retry++) {
  try {
    takeLease(owner);
    break;
  } catch (error) {
    if (retry >= 24 || !(error as Error).message.includes("Another worker"))
      throw error;
    if (retry === 0)
      console.log("Waiting for the previous worker lease to expire…");
    await delay(500);
  }
}
console.log("TracePilot browser worker ready.");
const beat = setInterval(() => {
  if (!heartbeat(owner)) {
    console.error("Worker lease lost.");
    stopped = true;
    if (active) interruptRun(active);
  }
}, 2000);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    stopped = true;
    if (active) interruptRun(active);
  });
try {
  while (!stopped) {
    const run = claimRun();
    if (run) {
      active = run.id;
      await executeRun(run);
      active = undefined;
    } else await delay(300);
  }
} finally {
  clearInterval(beat);
  releaseLease(owner);
}
