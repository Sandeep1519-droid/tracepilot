import express from "express";
import path from "node:path";
import fs from "node:fs";
import { config, demoOrigin, allowedOrigins } from "./config";
import { runInputSchema, scenarios } from "../shared/domain";
import {
  db,
  createRun,
  listRuns,
  getRun,
  cancelRun,
  artifactDir,
} from "./store";
import { validateNetwork } from "./security";
import { controlToken, demoAccount, redact } from "./secrets";
import { demoApp, mountDemoLogin } from "./demo";
import { evaluationMode, readEvaluation } from "./evaluations";
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (
    ["POST", "DELETE", "PATCH", "PUT"].includes(req.method) &&
    req.headers.origin &&
    !["http://127.0.0.1:5173", `http://127.0.0.1:${config.port}`].includes(
      req.headers.origin,
    )
  )
    return void res
      .status(403)
      .json({ error: "Cross-origin mutation blocked." });
  next();
});
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/settings", (_req, res) => {
  const w = db.prepare("SELECT heartbeat FROM worker WHERE id=1").get() as
    { heartbeat: number } | undefined;
  res.json({
    demoOrigin,
    allowedOrigins,
    provider: config.provider,
    model: config.model,
    workerOnline: !!w && Date.now() - w.heartbeat < 10000,
    hostedConfigured: !!process.env.OPENAI_API_KEY,
    scenarios,
  });
});
app.get("/api/evaluations", (_req, res) => {
  try {
    const mode = evaluationMode(_req.query.mode);
    res.json({ results: readEvaluation(config.dataDir, mode) });
  } catch (error) {
    res.status(400).json({ error: redact((error as Error).message) });
  }
});
app.get("/api/runs", (_req, res) =>
  res.json(
    listRuns().map((r) => ({
      ...r,
      events: undefined,
      errors: undefined,
      eventCount: r.events.length,
      checks: r.events
        .filter((e) => e.attempt === 1)
        .flatMap((e) => e.checks)
        .map((c) => ({ id: c.id, passed: c.passed })),
      lastScreenshot: r.events.findLast((e) => e.screenshot)?.screenshot,
    })),
  ),
);
app.get("/api/runs/:id", (req, res) => {
  const run = getRun(req.params.id);
  if (!run) return void res.status(404).json({ error: "Run not found." });
  res.json(run);
});
app.post("/api/runs", async (req, res) => {
  try {
    const input = runInputSchema.parse(req.body);
    await validateNetwork(input.targetUrl, allowedOrigins);
    if (input.scenario === "login" && !input.credentialRef)
      input.credentialRef = "demo";
    const run = createRun(input);
    res.status(201).json(run);
  } catch (e) {
    res
      .status((e as Error).message.includes("already active") ? 409 : 400)
      .json({ error: redact((e as Error).message) });
  }
});
app.post("/api/runs/:id/cancel", (req, res) => {
  const r = cancelRun(req.params.id);
  if (!r) return void res.status(404).json({ error: "Run not found." });
  res.json(r);
});
app.get("/artifacts/:id/:file", (req, res) => {
  try {
    const { id, file } = req.params;
    if (
      !/^(?:attempt-[12]-[\da-f-]{36}\.png|attempt-[12]-trace\.zip|regression\.spec\.ts|report\.json|export-validation\.json)$/.test(
        file,
      )
    )
      return void res.sendStatus(404);
    const run = getRun(id);
    if (!run) return void res.sendStatus(404);
    if (file === "report.json") {
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="report.json"',
      );
      return void res.json(run);
    }
    const target = path.join(artifactDir(id), file);
    if (!fs.existsSync(target)) return void res.sendStatus(404);
    if (!file.endsWith(".png"))
      res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
    res.sendFile(target);
  } catch {
    res.sendStatus(404);
  }
});
app.use("/artifacts", (_req, res) => res.sendStatus(404));
app.use((req, res, next) => {
  if (req.path.split("/").some((p) => p.startsWith(".")))
    return void res.sendStatus(404);
  next();
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
if (fs.existsSync(path.resolve("dist"))) {
  app.use(express.static(path.resolve("dist")));
  app.get("*", (_req, res) => res.sendFile(path.resolve("dist/index.html")));
}
app.use(
  (
    error: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(400).json({ error: redact(error.message) }),
);
const demo = demoApp(controlToken);
mountDemoLogin(demo, demoAccount.email, demoAccount.password);
const apiServer = app.listen(config.port, "127.0.0.1", () =>
  console.log(`TracePilot API: http://127.0.0.1:${config.port}`),
);
const demoServer = demo.listen(config.demoPort, "127.0.0.1", () =>
  console.log(`Fieldwork demo: ${demoOrigin}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    apiServer.close();
    demoServer.close();
  });
