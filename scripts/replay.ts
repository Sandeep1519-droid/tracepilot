import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { controlToken } from "../src/server/secrets";
import { artifactDir } from "../src/server/store";
import { demoOrigin } from "../src/server/config";
const args = process.argv.slice(2),
  id = args[args.indexOf("--run") + 1],
  variant = args.includes("--variant")
    ? args[args.indexOf("--variant") + 1]
    : "correct";
if (!args.includes("--run") || !id)
  throw new Error("Usage: npm run replay -- --run RUN_UUID --variant correct");
const dir = artifactDir(id),
  config = path.join(dir, "validation.config.ts");
if (!fs.existsSync(config))
  throw new Error("This run has no runnable validation configuration.");
const child = spawn(
  process.execPath,
  [
    path.resolve("node_modules/@playwright/test/cli.js"),
    "test",
    "--config",
    config,
  ],
  {
    env: {
      ...process.env,
      BASE_URL: demoOrigin,
      TRACEPILOT_DEMO: "1",
      TRACEPILOT_FIXTURE_TOKEN: controlToken,
      DEMO_VARIANT: variant,
    },
    stdio: "inherit",
  },
);
child.on("close", (code) => (process.exitCode = code ?? 1));
