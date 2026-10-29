import { EvaluationLedger } from "./EvaluationLedger";
import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  Check,
  CheckCircle2,
  XCircle,
  TriangleAlert,
  CircleDashed,
  Clock3,
  Layers,
  PanelLeft,
  Play,
  Square,
  Settings,
  FileCode2,
  Download,
  ExternalLink,
  Globe,
  Command,
  Activity,
  FolderOpen,
  FlaskConical,
  Terminal,
  X,
  MousePointer2,
  Camera,
  RefreshCw,
  ShieldCheck,
  Zap,
  BookOpen,
  Link as LinkIcon,
  MoreHorizontal,
} from "lucide-react";
import {
  scenarios,
  type Run,
  type RunInput,
  type Scenario,
  type Event,
} from "../shared/domain";
import "./style.css";
type SettingsData = {
  demoOrigin: string;
  allowedOrigins: string[];
  provider: string;
  model: string;
  workerOnline: boolean;
  hostedConfigured: boolean;
};
type RunSummary = Omit<Run, "events" | "errors"> & {
  eventCount: number;
  checks: { id: string; passed: boolean }[];
  lastScreenshot?: string;
};
const api = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};
const post = <T,>(url: string, body?: unknown) =>
  api<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
const asset = (id: string, file: string) => `/artifacts/${id}/${file}`;
const time = (s?: string) =>
  s
    ? new Date(s).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";
const elapsed = (r: { startedAt?: string; finishedAt?: string }) =>
  r.startedAt
    ? `${Math.max(0, Math.round(((r.finishedAt ? Date.parse(r.finishedAt) : Date.now()) - Date.parse(r.startedAt)) / 1000))}s`
    : "—";
const shortDate = (s: string) =>
  new Date(s).toLocaleDateString([], { month: "short", day: "numeric" }) +
  " · " +
  new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const labels: Record<string, string> = {
  passed: "Passed",
  product_failure: "Product failure",
  agent_failure: "Agent failure",
  inconclusive: "Inconclusive",
  running: "Running",
  queued: "Queued",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};
function Status({ value }: { value: string }) {
  const Icon =
    value === "passed"
      ? CheckCircle2
      : value === "product_failure"
        ? XCircle
        : value === "agent_failure" || value === "interrupted"
          ? TriangleAlert
          : value === "running" || value === "queued"
            ? CircleDashed
            : CircleDashed;
  return (
    <span className={"status " + value}>
      <Icon size={13} />
      {labels[value] || value}
    </span>
  );
}
function Logo() {
  return (
    <span className="logo-mark">
      <MousePointer2 size={23} strokeWidth={2.5} />
    </span>
  );
}
function App() {
  const [settings, setSettings] = useState<SettingsData>();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selected, setSelected] = useState<string | undefined>(
    location.hash.startsWith("#run/") ? location.hash.slice(5) : undefined,
  );
  const [run, setRun] = useState<Run>();
  const [page, setPage] = useState(() =>
    ["evaluations", "artifacts"].includes(location.hash.slice(1))
      ? location.hash.slice(1)
      : "runs",
  );
  const [form, setForm] = useState<Scenario | false>(false);
  const [dialog, setDialog] = useState<"settings" | "help" | false>(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const refresh = () =>
    Promise.all([
      api<SettingsData>("/api/settings").then(setSettings),
      api<RunSummary[]>("/api/runs").then(setRuns),
    ])
      .then(() => setError(""))
      .catch((e) => setError(e.message));
  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 2500);
    const hash = () => {
      setSelected(
        location.hash.startsWith("#run/") ? location.hash.slice(5) : undefined,
      );
      const destination = location.hash.slice(1);
      if (["evaluations", "artifacts"].includes(destination))
        setPage(destination);
      else if (!destination) setPage("runs");
    };
    addEventListener("hashchange", hash);
    return () => {
      clearInterval(timer);
      removeEventListener("hashchange", hash);
    };
  }, []);
  useEffect(() => {
    if (!selected) {
      setRun(undefined);
      return;
    }
    let active = true;
    const load = () =>
      api<Run>("/api/runs/" + selected)
        .then((r) => {
          if (active) setRun(r);
        })
        .catch((e) => setError(e.message));
    void load();
    const t = setInterval(load, 850);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [selected]);
  const open = (id: string) => {
    location.hash = "run/" + id;
  };
  const home = (p = "runs") => {
    location.hash = p === "runs" ? "" : p;
    setSelected(undefined);
    setPage(p);
  };
  const active = runs.find((r) => ["queued", "running"].includes(r.lifecycle));
  const complete = runs.filter((r) => r.lifecycle === "completed");
  const passed = complete.filter((r) => r.verdict === "passed").length;
  const findings = complete.filter(
    (r) => r.verdict === "product_failure",
  ).length;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === "n" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !active &&
        !form &&
        !dialog &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      ) {
        e.preventDefault();
        setForm("expired");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, form, dialog]);
  useEffect(() => setHistoryPage(1), [filter, search]);
  const filtered = runs.filter(
    (r) =>
      (filter === "all" || r.verdict === filter || r.lifecycle === filter) &&
      `${r.input.goal} ${r.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => home()}>
          <Logo />
          <span>
            TracePilot<span className="brand-dot">.</span>
          </span>
        </a>
        <button className="workspace" onClick={() => setDialog("settings")}>
          <span className="workspace-icon">L</span>
          <span>
            Local workspace<small>Developer environment</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <button
            className={page === "runs" ? "selected" : ""}
            aria-label="Test runs"
            onClick={() => home("runs")}
          >
            <Layers size={17} />
            Test runs<span className="nav-count">{runs.length}</span>
          </button>
          <button
            className={page === "artifacts" ? "selected" : ""}
            aria-label="Evidence library"
            onClick={() => home("artifacts")}
          >
            <FolderOpen size={17} />
            Evidence library
          </button>
          <button
            className={page === "evaluations" ? "selected" : ""}
            aria-label="Evaluations"
            onClick={() => home("evaluations")}
          >
            <FlaskConical size={17} />
            Evaluations
          </button>
        </nav>
        <div className="nav-label nav-second">ENVIRONMENT</div>
        <nav>
          <a
            href={settings?.demoOrigin || "http://127.0.0.1:4311"}
            target="_blank"
            rel="noreferrer"
          >
            <Globe size={17} />
            Demo storefront
            <ArrowUpRight size={13} />
          </a>
          <button onClick={() => setDialog("settings")}>
            <Settings size={17} />
            Configuration
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="tiny-orbit" />
            <div>
              Built for your local loop.
              <p>
                Real browsers. Recorded evidence.
                <br />
                Your machine, your artifacts.
              </p>
            </div>
          </div>
          <button className="help-link" onClick={() => setDialog("help")}>
            <BookOpen size={16} />
            Quick start
            <ArrowUpRight size={14} />
          </button>
          <div className="user">
            <span className="avatar">D</span>
            <div>
              Developer<small>Local installation</small>
            </div>
            <span className="version">v1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <PanelLeft size={16} />
            <span className="crumb">Workspace</span>
            <ChevronRight size={13} />
            <span>
              {selected
                ? "Run report"
                : page === "artifacts"
                  ? "Evidence library"
                  : page === "evaluations"
                    ? "Evaluations"
                    : "Test runs"}
            </span>
          </div>
          <div>
            <span
              className={
                "worker-status " + (settings?.workerOnline ? "online" : "")
              }
            >
              <i />
              {settings?.workerOnline ? "Worker online" : "Worker offline"}
            </span>
            <span className="local-chip">
              <Terminal size={12} />
              LOCAL
            </span>
          </div>
        </header>
        <main>
          {error && (
            <div className="error-banner" role="alert">
              <TriangleAlert size={16} />
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={15} />
              </button>
            </div>
          )}
          {selected ? (
            run ? (
              <RunDetail
                run={run}
                back={() => home()}
                cancel={async () => {
                  try {
                    await post("/api/runs/" + run.id + "/cancel");
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
            ) : (
              <div className="loading">
                <CircleDashed className="spin" />
                Loading recorded evidence…
              </div>
            )
          ) : page === "runs" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span /> YOUR TESTING WORKSPACE
                  </div>
                  <h1>Ship with a little more certainty.</h1>
                  <p>Describe the behavior. Run the browser. Keep the proof.</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setForm("expired")}
                  disabled={!!active}
                >
                  <Plus size={17} />
                  New test run<kbd>N</kbd>
                </button>
              </div>
              <div className="stats">
                <Stat
                  label="Total runs"
                  value={runs.length}
                  icon={<Layers size={17} />}
                  foot="Recorded in this workspace"
                />
                <Stat
                  label="Passed runs"
                  value={passed}
                  icon={<CheckCircle2 size={17} />}
                  foot={`${complete.length} completed ${complete.length === 1 ? "run" : "runs"}`}
                />
                <Stat
                  label="Product findings"
                  value={findings}
                  icon={<TriangleAlert size={17} />}
                  foot="Supported by browser evidence"
                />
                <Stat
                  label="Execution engine"
                  value="Chromium"
                  icon={<Globe size={17} />}
                  foot="Isolated context for every attempt"
                  text
                />
              </div>
              {active && (
                <button
                  className="active-banner"
                  onClick={() => open(active.id)}
                >
                  <span className="pulse" />
                  <div>
                    <strong>
                      {active.lifecycle === "queued"
                        ? "A test is queued"
                        : "A test is in progress"}
                    </strong>
                    <span>{active.input.goal}</span>
                  </div>
                  <span>
                    Open workspace <ArrowRight size={16} />
                  </span>
                </button>
              )}
              <section className="launch-card">
                <div className="launch-content">
                  <div className="section-kicker">
                    <span className="lime-dot" /> FROM INTENT TO EVIDENCE
                  </div>
                  <h2>
                    Your next regression test
                    <br />
                    starts with a sentence.
                  </h2>
                  <p>
                    Put the agent through a real storefront. Every click,
                    <br className="desktop" /> assertion, and finding comes with
                    a paper trail.
                  </p>
                  <button
                    className="button light"
                    onClick={() => setForm("expired")}
                    disabled={!!active}
                  >
                    Try the coupon scenario
                    <ArrowUpRight size={16} />
                  </button>
                  <div className="launch-note">
                    <ShieldCheck size={13} />
                    No API key needed for the scripted demo
                  </div>
                </div>
                <div className="launch-visual" aria-hidden="true">
                  <div className="mini-browser">
                    <div className="mini-bar">
                      <span />
                      <span />
                      <span />
                      <div>
                        <LinkIcon size={9} /> fieldwork.local / cart
                      </div>
                    </div>
                    <div className="mini-body">
                      <div className="mini-tag">YOUR TEST IN PLAIN ENGLISH</div>
                      <div className="mini-prompt">
                        “Verify an expired coupon is rejected
                        <br />
                        and the cart total stays unchanged.”
                        <span className="cursor" />
                      </div>
                      <div className="mini-flow">
                        <span>
                          <MousePointer2 size={12} />
                          Interact
                        </span>
                        <i />
                        <span>
                          <ShieldCheck size={12} />
                          Verify
                        </span>
                        <i />
                        <span>
                          <Camera size={12} />
                          Record
                        </span>
                      </div>
                      <div className="mini-code">
                        <span>01</span> expect(total).toBe(initialTotal)
                        <br />
                        <span>02</span> <b>// Keep the intended assertion.</b>
                      </div>
                    </div>
                  </div>
                  <div className="floating-label">
                    <span className="green-square">
                      <Check size={12} />
                    </span>
                    Evidence at every step
                    <span className="floating-dots">•••</span>
                  </div>
                </div>
              </section>
              <div className="scenario-header">
                <h3>
                  Start with a scenario <span>BUNDLED DEMO</span>
                </h3>
                <span>Real browser. Resettable fixtures.</span>
              </div>
              <div className="scenario-grid">
                {(
                  ["expired", "quantity", "removal", "checkout"] as Scenario[]
                ).map((key, i) => (
                  <button
                    key={key}
                    className="scenario"
                    onClick={() => setForm(key)}
                    disabled={!!active}
                  >
                    <div className={"scenario-icon sc-" + i}>
                      {i === 0 ? (
                        <Zap size={18} />
                      ) : i === 1 ? (
                        <Layers size={18} />
                      ) : i === 2 ? (
                        <RefreshCw size={18} />
                      ) : (
                        <ShieldCheck size={18} />
                      )}
                    </div>
                    <div>
                      <strong>{scenarios[key].title}</strong>
                      <small>
                        {
                          [
                            "Reject a code. Preserve the total.",
                            "Make every item count.",
                            "Restore the original amount.",
                            "Catch a missing required field.",
                          ][i]
                        }
                      </small>
                    </div>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </div>
              <section className="history">
                <div className="history-title">
                  <h2>
                    Recent runs <span>{runs.length}</span>
                  </h2>
                  <div className="history-tools">
                    <label className="search">
                      <Search size={14} />
                      <input
                        aria-label="Search runs"
                        placeholder="Search runs…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filter runs by outcome"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">All outcomes</option>
                      {Object.entries(labels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>TEST / REQUIREMENT</th>
                        <th>OUTCOME</th>
                        <th>MODE</th>
                        <th>DURATION</th>
                        <th>CREATED</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered
                        .slice((historyPage - 1) * 8, historyPage * 8)
                        .map((r) => (
                          <tr key={r.id} onClick={() => open(r.id)}>
                            <td>
                              <button
                                className="run-name"
                                onClick={() => open(r.id)}
                              >
                                <span className="run-icon">
                                  <FileCode2 size={17} />
                                </span>
                                <span>
                                  {r.input.goal}
                                  <small>
                                    {r.id.slice(0, 8)} <span>·</span>{" "}
                                    {new URL(r.input.targetUrl).host}
                                  </small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <Status
                                value={
                                  ["queued", "running"].includes(r.lifecycle)
                                    ? r.lifecycle
                                    : r.verdict || r.lifecycle
                                }
                              />
                            </td>
                            <td>
                              <span className="mode">
                                {r.input.mode === "scripted"
                                  ? "Scripted demo"
                                  : "AI model"}
                              </span>
                            </td>
                            <td className="mono">{elapsed(r)}</td>
                            <td className="date">{shortDate(r.createdAt)}</td>
                            <td>
                              <ArrowUpRight size={15} />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!filtered.length && (
                  <div className="empty-state">
                    <CircleDashed size={27} />
                    <strong>
                      {runs.length
                        ? "No matching runs"
                        : "A clean slate. Your first run is next."}
                    </strong>
                    <p>
                      {runs.length
                        ? "Try a different search or outcome."
                        : "Start a scenario above to create real, evidence-backed results."}
                    </p>
                  </div>
                )}
                {filtered.length > 0 && (
                  <div className="pagination">
                    <span>
                      Showing {(historyPage - 1) * 8 + 1}–
                      {Math.min(historyPage * 8, filtered.length)} of{" "}
                      {filtered.length} runs
                    </span>
                    <button
                      disabled={historyPage === 1}
                      onClick={() => setHistoryPage((p) => p - 1)}
                    >
                      <ArrowLeft size={12} />
                      Previous
                    </button>
                    <button
                      disabled={historyPage * 8 >= filtered.length}
                      onClick={() => setHistoryPage((p) => p + 1)}
                    >
                      Next
                      <ArrowRight size={12} />
                    </button>
                  </div>
                )}
              </section>
              <div className="bottom-note">
                <span>
                  <ShieldCheck size={13} />
                  Runs stay local. Outcomes come from assertions.
                </span>
                <span>TRACEPILOT / V1</span>
              </div>
            </>
          ) : page === "artifacts" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">THE PAPER TRAIL</div>
                  <h1>Every finding has a source.</h1>
                  <p>
                    Browse the latest screenshots and reports from recorded
                    runs.
                  </p>
                </div>
              </div>
              <div className="artifact-grid">
                {runs
                  .filter((r) => r.lastScreenshot)
                  .map((r) => (
                    <button
                      className="artifact-card"
                      onClick={() => open(r.id)}
                      key={r.id}
                    >
                      <img
                        src={asset(r.id, r.lastScreenshot!)}
                        alt={"Browser evidence for " + r.input.goal}
                      />
                      <div>
                        <Status
                          value={
                            ["queued", "running"].includes(r.lifecycle)
                              ? r.lifecycle
                              : r.verdict || r.lifecycle
                          }
                        />
                        <strong>{r.input.goal}</strong>
                        <small>{shortDate(r.createdAt)}</small>
                      </div>
                    </button>
                  ))}
              </div>
              {!runs.some((r) => r.lastScreenshot) && (
                <div className="empty-state">
                  <FolderOpen />
                  <strong>No screenshots yet</strong>
                  <p>Completed browser actions will appear here.</p>
                </div>
              )}
            </>
          ) : (
            <EvaluationLedger open={open} />
          )}
        </main>
      </div>
      {form !== false && settings && (
        <NewRun
          initial={form}
          settings={settings}
          close={() => setForm(false)}
          submit={async (input) => {
            const r = await post<Run>("/api/runs", input);
            setForm(false);
            await refresh();
            open(r.id);
          }}
        />
      )}
      {dialog && (
        <Modal
          title={
            dialog === "settings"
              ? "Local configuration"
              : "Your first evidence-backed run"
          }
          close={() => setDialog(false)}
        >
          <div className="info-dialog">
            {dialog === "settings" ? (
              <>
                <p>
                  All execution and artifacts live on this machine. Edit{" "}
                  <code>.env.local</code> and restart to change configuration.
                </p>
                <dl>
                  <dt>Browser worker</dt>
                  <dd>
                    {settings?.workerOnline
                      ? "Online"
                      : "Offline — npm run worker"}
                  </dd>
                  <dt>Demo origin</dt>
                  <dd>{settings?.demoOrigin}</dd>
                  <dt>Model provider</dt>
                  <dd>
                    {settings?.provider} / {settings?.model}
                  </dd>
                  <dt>Hosted credential</dt>
                  <dd>
                    {settings?.hostedConfigured
                      ? "Configured"
                      : "Not configured (optional)"}
                  </dd>
                  <dt>Allowed origins</dt>
                  <dd>{settings?.allowedOrigins.join(", ")}</dd>
                </dl>
                <div className="callout">
                  <Zap size={17} />
                  <span>
                    Scripted demo is free and runs real browser actions. AI mode
                    needs a running local Ollama model or a configured hosted
                    provider.
                  </span>
                </div>
              </>
            ) : (
              <>
                <ol>
                  <li>
                    Choose <strong>Expired coupon</strong> on the dashboard.
                  </li>
                  <li>
                    Keep <strong>Scripted demo</strong> to run without an API.
                  </li>
                  <li>Select the expired-coupon defect fixture.</li>
                  <li>
                    Start the run and watch screenshots update after each
                    action.
                  </li>
                  <li>
                    Review the two assertions, clean-session reproduction, and
                    verified regression export.
                  </li>
                </ol>
                <p>
                  To test the same requirement against correct behavior, repeat
                  with the baseline fixture.
                </p>
                <code>npm run dev</code>
                <p>
                  Architecture, fixture setup, credentials and evaluation
                  definitions are documented in the project README.
                </p>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  icon,
  foot,
  text,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  foot: string;
  text?: boolean;
}) {
  return (
    <div className="stat">
      <div>
        {label}
        {icon}
      </div>
      <strong className={text ? "text-value" : ""}>{value}</strong>
      <small>{foot}</small>
    </div>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    const root = ref.current;
    root?.querySelector<HTMLElement>("button,input,select,textarea")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const items = Array.from(
          root?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input,textarea,select,a[href]",
          ) || [],
        );
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={ref}
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button aria-label="Close dialog" onClick={close}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function NewRun({
  initial,
  settings,
  close,
  submit,
}: {
  initial: Scenario;
  settings: SettingsData;
  close: () => void;
  submit: (input: RunInput) => Promise<void>;
}) {
  const make = (scenario: Scenario): RunInput => ({
    scenario,
    targetUrl: settings.demoOrigin,
    goal: scenarios[scenario].goal,
    expected: scenarios[scenario].expected,
    fixture: scenarios[scenario].fixture,
    variant: "correct",
    wording: "standard",
    mode: scenario === "custom" ? "ai" : "scripted",
    maxSteps: 35,
    maxDuration: 90,
    ...(scenario === "login" ? { credentialRef: "demo" as const } : {}),
  });
  const [input, setInput] = useState(make(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = <K extends keyof RunInput>(key: K, value: RunInput[K]) =>
    setInput((v) => ({ ...v, [key]: value }));
  return (
    <Modal title="New test run" close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await submit(input);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <div className="form-body">
          <p className="form-intro">
            Define the behavior. TracePilot will keep the execution record.
          </p>
          <div className="form-row">
            <label>
              Scenario
              <select
                aria-label="Scenario"
                value={input.scenario}
                onChange={(e) => setInput(make(e.target.value as Scenario))}
              >
                {Object.entries(scenarios).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Execution mode
              <select
                aria-label="Execution mode"
                value={input.mode}
                onChange={(e) => update("mode", e.target.value as any)}
              >
                <option value="scripted">Scripted demo · no API needed</option>
                <option value="ai">AI model · {settings.provider}</option>
              </select>
            </label>
          </div>
          <label>
            Target URL
            <div className="input-with-icon">
              <Globe size={15} />
              <input
                required
                type="url"
                value={input.targetUrl}
                onChange={(e) => update("targetUrl", e.target.value)}
              />
            </div>
          </label>
          <label>
            What should we test?
            <textarea
              required
              minLength={5}
              rows={2}
              value={input.goal}
              onChange={(e) => update("goal", e.target.value)}
              placeholder="Describe the behavior to verify…"
            />
          </label>
          <label>
            Expected behavior
            <textarea
              rows={2}
              value={input.expected}
              onChange={(e) => update("expected", e.target.value)}
              placeholder="State the original requirement explicitly"
            />
          </label>
          <p className="field-note">
            Preset checks preserve their original expectations. For external
            websites, add explicit page checks below. Text alone cannot
            establish a pass.
          </p>
          {input.scenario === "custom" && (
            <fieldset className="external-checks">
              <legend>Page checks</legend>
              <p className="field-note">
                Choose a known element and the result it must show. Each check
                is preserved in the report and regression export.
              </p>
              {(input.customChecks || []).map((check, index) => {
                const change = (patch: Partial<typeof check>) =>
                  update(
                    "customChecks",
                    input.customChecks!.map((c, i) =>
                      i === index ? { ...c, ...patch } : c,
                    ),
                  );
                return (
                  <div className="external-check" key={check.id}>
                    <label>
                      Check {index + 1} requirement
                      <input
                        required
                        minLength={5}
                        value={check.requirement}
                        onChange={(e) =>
                          change({ requirement: e.target.value })
                        }
                      />
                    </label>
                    <div className="form-row">
                      <label>
                        Find element by
                        <select
                          aria-label="Find element by"
                          value={check.locator.kind}
                          onChange={(e) =>
                            change({
                              locator:
                                e.target.value === "role"
                                  ? {
                                      kind: "role",
                                      role: "heading",
                                      value: check.locator.value,
                                    }
                                  : {
                                      kind: e.target.value as
                                        "id" | "label" | "testId",
                                      value: check.locator.value,
                                    },
                            })
                          }
                        >
                          <option value="id">HTML ID</option>
                          <option value="label">Label</option>
                          <option value="role">Role and name</option>
                          <option value="testId">Test ID</option>
                        </select>
                      </label>
                      <label>
                        Element name or ID
                        <input
                          required
                          value={check.locator.value}
                          onChange={(e) =>
                            change({
                              locator: {
                                ...check.locator,
                                value: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    </div>
                    {check.locator.kind === "role" && (
                      <label>
                        Element role
                        <select
                          aria-label="Element role"
                          value={check.locator.role}
                          onChange={(e) =>
                            change({
                              locator: {
                                kind: "role",
                                value: check.locator.value,
                                role: e.target.value as any,
                              },
                            })
                          }
                        >
                          {[
                            "heading",
                            "button",
                            "link",
                            "textbox",
                            "searchbox",
                            "combobox",
                            "checkbox",
                            "radio",
                            "spinbutton",
                            "status",
                            "main",
                          ].map((role) => (
                            <option key={role}>{role}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="form-row">
                      <label>
                        Assertion
                        <select
                          aria-label="Assertion"
                          value={check.operator}
                          onChange={(e) =>
                            change({
                              operator: e.target.value as typeof check.operator,
                            })
                          }
                        >
                          <option value="visible">Is visible</option>
                          <option value="contains">Contains text</option>
                          <option value="equals">Text equals</option>
                          <option value="value">Field value equals</option>
                        </select>
                      </label>
                      <label>
                        On page path (optional)
                        <input
                          placeholder="/s"
                          value={check.pagePath || ""}
                          onChange={(e) =>
                            change({ pagePath: e.target.value || undefined })
                          }
                        />
                      </label>
                    </div>
                    {check.operator !== "visible" && (
                      <label>
                        Expected result
                        <input
                          required
                          value={check.expected || ""}
                          onChange={(e) => change({ expected: e.target.value })}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() =>
                        update(
                          "customChecks",
                          input.customChecks!.length === 1
                            ? undefined
                            : input.customChecks!.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove check {index + 1}
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="button secondary"
                disabled={(input.customChecks?.length || 0) >= 12}
                onClick={() =>
                  update("customChecks", [
                    ...(input.customChecks || []),
                    {
                      id: `external-${crypto.randomUUID()}`,
                      requirement: "",
                      locator: { kind: "id", value: "" },
                      operator: "visible",
                    },
                  ])
                }
              >
                Add page check
              </button>
            </fieldset>
          )}
          <label>
            Fixture information
            <textarea
              rows={2}
              value={input.fixture}
              onChange={(e) => update("fixture", e.target.value)}
            />
          </label>
          <div className="form-row">
            <label>
              Demo fixture
              <select
                value={input.variant}
                onChange={(e) => update("variant", e.target.value as any)}
              >
                <option value="correct">Correct baseline</option>
                <option value="expired-coupon">
                  Defect: expired coupon discounts total
                </option>
                <option value="stale-quantity">
                  Defect: stale quantity subtotal
                </option>
                <option value="sticky-discount">
                  Defect: discount remains after removal
                </option>
                <option value="missing-required">
                  Defect: empty name accepted
                </option>
              </select>
            </label>
            <label>
              Account reference
              <select
                value={input.credentialRef || ""}
                onChange={(e) =>
                  update("credentialRef", (e.target.value || undefined) as any)
                }
              >
                <option value="">None</option>
                <option value="demo">Demo account (local secret)</option>
                <option value="configured">Configured test account</option>
              </select>
            </label>
          </div>
          <div className="form-row thirds">
            <label>
              Maximum steps
              <input
                type="number"
                min={3}
                max={80}
                value={input.maxSteps}
                onChange={(e) => update("maxSteps", Number(e.target.value))}
              />
            </label>
            <label>
              Duration (seconds)
              <input
                type="number"
                min={5}
                max={300}
                value={input.maxDuration}
                onChange={(e) => update("maxDuration", Number(e.target.value))}
              />
            </label>
            <label>
              Store wording
              <select
                value={input.wording}
                onChange={(e) => update("wording", e.target.value as any)}
              >
                <option value="standard">Standard</option>
                <option value="alternate">Alternate</option>
              </select>
            </label>
          </div>
          <div className="callout">
            <ShieldCheck size={16} />
            <span>
              {input.scenario === "custom"
                ? "External sites must be configured in Allowed origins. Each run uses an isolated browser; access challenges stop the test as inconclusive."
                : "Fixture selection stays outside agent observations. Each attempt starts with an isolated browser and reset demo state."}
            </span>
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <span>
            <Globe size={14} />
            Chromium · local execution
          </span>
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !settings.workerOnline}
            type="submit"
          >
            <Play size={14} />
            {busy
              ? "Queuing…"
              : settings.workerOnline
                ? "Start test run"
                : "Worker offline"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function RunDetail({
  run,
  back,
  cancel,
}: {
  run: Run;
  back: () => void;
  cancel: () => void;
}) {
  const [tab, setTab] = useState("timeline");
  const [attempt, setAttempt] = useState(1);
  const [focus, setFocus] = useState<string>();
  const events = run.events.filter((e) => e.attempt === attempt);
  const last = events.findLast((e) => e.screenshot);
  const focused = events.find((e) => e.id === focus) || last;
  const active = ["queued", "running"].includes(run.lifecycle);
  const checks = events.flatMap((e) => e.checks);
  const value = active ? run.lifecycle : run.verdict || run.lifecycle;
  return (
    <>
      <button className="back" onClick={back}>
        <ArrowLeft size={14} />
        All test runs
      </button>
      <div className="run-heading">
        <div>
          <div className="run-meta">
            <span className="mono">RUN / {run.id.slice(0, 8)}</span>
            <span>·</span>
            <span>{shortDate(run.createdAt)}</span>
            <span className="mode">
              {run.input.mode === "scripted" ? "Scripted demo" : "AI model"}
            </span>
          </div>
          <h1>{run.input.goal}</h1>
          <div className="run-sub">
            <Status value={value} />
            <span>
              <Globe size={13} />
              {new URL(run.input.targetUrl).host}
            </span>
            <span>
              <Clock3 size={13} />
              {elapsed(run)}
            </span>
            <span>
              <MousePointer2 size={13} />
              {run.events.length} actions
            </span>
          </div>
        </div>
        {active ? (
          <button className="button stop" onClick={cancel}>
            <Square size={13} />
            Stop run
          </button>
        ) : (
          <a className="button secondary" href={asset(run.id, "report.json")}>
            <Download size={14} />
            JSON report
          </a>
        )}
      </div>
      {active && (
        <div className="current-action">
          <span className="pulse" />
          <span>{run.currentAction || "Waiting for the browser worker…"}</span>
          <span>
            {run.events.length} / {run.input.maxSteps} actions
          </span>
        </div>
      )}
      {run.explanation && !active && (
        <div className={"result-banner " + value}>
          {value === "passed" ? (
            <CheckCircle2 size={20} />
          ) : value === "product_failure" ? (
            <TriangleAlert size={20} />
          ) : (
            <CircleDashed size={20} />
          )}
          <div>
            <strong>
              {labels[value] || value}
              {run.reproduction === "confirmed"
                ? " · reproduced in a clean session"
                : ""}
            </strong>
            <p>{run.explanation}</p>
          </div>
        </div>
      )}
      <div className="execution-grid">
        <section className="evidence-panel panel">
          <div className="panel-bar">
            <span>
              <Globe size={15} />
              Browser evidence
            </span>
            <div>
              <span className="subtle">Chromium</span>
              <span className="viewport-label">1280 × 820</span>
            </div>
          </div>
          <div className="browser-url">
            <span className="browser-dots">
              <i />
              <i />
              <i />
            </span>
            <span>
              <ShieldCheck size={12} />
              {run.input.targetUrl}
            </span>
            <ExternalLink size={13} />
          </div>
          <div className="browser-stage">
            {focused?.screenshot ? (
              <a
                href={asset(run.id, focused.screenshot)}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={asset(run.id, focused.screenshot)}
                  alt={`Browser screenshot after ${focused.target}`}
                />
              </a>
            ) : (
              <div className="browser-empty">
                <Camera size={31} />
                <strong>
                  {run.input.credentialRef
                    ? "Visual artifacts disabled for credential safety"
                    : active
                      ? "Preparing a clean browser…"
                      : "No screenshot captured"}
                </strong>
                <p>
                  {run.input.credentialRef
                    ? "The execution record preserves redacted actions and assertion results."
                    : "Screenshots appear after real browser actions."}
                </p>
                {active && <span className="loading-track" />}
              </div>
            )}
          </div>
          <div className="evidence-caption">
            <span>
              <Camera size={13} />
              Screenshot after action · {focused ? time(focused.at) : "waiting"}
            </span>
            <span>Checkpoint image, not live video</span>
          </div>
          <div className="filmstrip">
            {events
              .filter((e) => e.screenshot)
              .map((e, i) => (
                <button
                  key={e.id}
                  className={focused?.id === e.id ? "chosen" : ""}
                  onClick={() => setFocus(e.id)}
                  aria-label={"View screenshot " + (i + 1)}
                >
                  <img src={asset(run.id, e.screenshot!)} alt="" />
                  <span>{String(i + 1).padStart(2, "0")}</span>
                </button>
              ))}
          </div>
        </section>
        <section className="timeline-panel panel">
          <div className="detail-tabs">
            <button
              className={tab === "timeline" ? "current" : ""}
              onClick={() => setTab("timeline")}
            >
              <Activity size={14} />
              Timeline <span>{events.length}</span>
            </button>
            <button
              className={tab === "plan" ? "current" : ""}
              onClick={() => setTab("plan")}
            >
              <Layers size={14} />
              Test plan
            </button>
          </div>
          <div className="attempt-tabs">
            <button
              className={attempt === 1 ? "current" : ""}
              onClick={() => {
                setAttempt(1);
                setFocus(undefined);
              }}
            >
              Initial attempt
            </button>
            <button
              disabled={!run.events.some((e) => e.attempt === 2)}
              className={attempt === 2 ? "current" : ""}
              onClick={() => {
                setAttempt(2);
                setFocus(undefined);
              }}
            >
              Clean replay{" "}
              {run.reproduction === "confirmed" && <Check size={12} />}
            </button>
          </div>
          <div className="timeline-scroll">
            {tab === "timeline" ? (
              events.length ? (
                events.map((e, i) => (
                  <button
                    onClick={() => setFocus(e.id)}
                    className={
                      "timeline-event " +
                      (e.error
                        ? "event-error"
                        : e.checks.some((c) => !c.passed)
                          ? "event-failed"
                          : "")
                    }
                    key={e.id}
                  >
                    <span className="timeline-node">
                      {e.error ? (
                        <X size={12} />
                      ) : e.checks.length ? (
                        e.checks.every((c) => c.passed) ? (
                          <Check size={12} />
                        ) : (
                          <X size={12} />
                        )
                      ) : (
                        <span>{i + 1}</span>
                      )}
                    </span>
                    <div>
                      <div className="event-header">
                        <strong>{actionLabel(e)}</strong>
                        <time>{time(e.at)}</time>
                      </div>
                      <p>{e.target}</p>
                      {e.checks.length > 0 ? (
                        <span
                          className={
                            "assert-result " +
                            (e.checks[0].passed ? "good" : "bad")
                          }
                        >
                          {e.checks[0].passed ? "Check passed" : "Check failed"}{" "}
                          · {e.checks[0].id}
                        </span>
                      ) : (
                        <small>
                          {e.error
                            ? e.result
                            : e.action.type === "navigate"
                              ? e.url
                              : e.result}{" "}
                          <span>· {e.durationMs}ms</span>
                        </small>
                      )}
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty-timeline">
                  <CircleDashed className={active ? "spin" : ""} />
                  <p>
                    {active
                      ? "Waiting for the worker…"
                      : "No actions were recorded."}
                  </p>
                </div>
              )
            ) : (
              <div className="plan">
                <div className="section-kicker">ORIGINAL TEST PLAN</div>
                {run.plan.map((p, i) => (
                  <div key={p}>
                    <span>{i + 1}</span>
                    <p>{p}</p>
                  </div>
                ))}
                <h4>Expected behavior</h4>
                <p>
                  {run.input.expected ||
                    "Not specified — cannot establish a pass."}
                </p>
                <h4>Fixture information</h4>
                <p>{run.input.fixture || "Not supplied."}</p>
                <h4>Execution limits</h4>
                <p>
                  {run.input.maxSteps} total actions · {run.input.maxDuration}s
                  including replay and export verification
                </p>
              </div>
            )}
          </div>
          <div className="timeline-footer">
            <span className={active ? "pulse" : "tiny-orbit"} />
            {active
              ? "Recording browser actions and evidence"
              : "Execution record preserved"}
          </div>
        </section>
      </div>
      <section className="panel assertions">
        <div className="section-title">
          <h2>
            <ShieldCheck size={17} />
            Requirement checks
          </h2>
          <span>
            {checks.filter((c) => c.passed).length} / {checks.length} passed ·
            attempt {attempt}
          </span>
        </div>
        <div className="requirement">
          <span>ORIGINAL EXPECTATION</span>
          <p>{run.input.expected || "No expected behavior was provided."}</p>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>CHECK</th>
                <th>EXPECTED</th>
                <th>OBSERVED</th>
                <th>RESULT</th>
                <th>EVIDENCE</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c, i) => (
                <tr key={c.eventId + c.id + i}>
                  <td className="check-name">{c.id}</td>
                  <td className="mono">
                    {c.operator === "baseline"
                      ? "Record initial total"
                      : c.operator === "absent"
                        ? "absent"
                        : c.operator === "money" || c.operator === "unchanged"
                          ? "$" + (Number(c.expected) / 100).toFixed(2)
                          : String(c.expected ?? "—")}
                  </td>
                  <td className="mono">
                    {typeof c.actual === "number" &&
                    ["money", "baseline", "unchanged"].includes(c.operator)
                      ? "$" + (c.actual / 100).toFixed(2)
                      : String(c.actual)}
                  </td>
                  <td>
                    <span
                      className={"assert-result " + (c.passed ? "good" : "bad")}
                    >
                      {c.passed ? <Check size={12} /> : <X size={12} />}{" "}
                      {c.passed ? "Passed" : "Failed"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => {
                        setFocus(c.eventId);
                        window.scrollTo({ top: 150, behavior: "smooth" });
                      }}
                    >
                      View checkpoint
                      <ArrowUpRight size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!checks.length && (
          <p className="no-checks">
            {active
              ? "Assertions will appear when the browser reaches a verification checkpoint."
              : "No completed checks. This run cannot be labeled passed."}
          </p>
        )}
      </section>
      <div className="report-bottom">
        <section className="panel report-info">
          <h3>
            <FileCode2 size={17} />
            Regression export
          </h3>
          <p>
            {run.exportExplanation ||
              (active
                ? "The recorded actions and original checks will form the regression test."
                : "No export was produced for this run.")}
          </p>
          {run.exportStatus && run.exportStatus !== "unsupported" && (
            <a
              className="button secondary"
              href={asset(run.id, "regression.spec.ts")}
            >
              <Download size={14} />
              Download Playwright test
              <span className={"export-tag " + run.exportStatus}>
                {run.exportStatus}
              </span>
            </a>
          )}
        </section>
        <section className="panel report-info">
          <h3>
            <FolderOpen size={17} />
            Run artifacts
          </h3>
          <p>
            Reproduction:{" "}
            <strong>
              {run.reproduction ||
                "Not requested; only product findings trigger replay."}
            </strong>
            <br />
            Model usage:{" "}
            {run.usage
              ? `${run.usage.inputTokens} input / ${run.usage.outputTokens} output tokens`
              : "Not used or unavailable"}
            <br />
            Estimated model cost:{" "}
            {run.usage?.estimatedCost != null
              ? "$" + run.usage.estimatedCost.toFixed(5)
              : "unknown"}
          </p>
          <div className="artifact-links">
            {[1, 2]
              .filter(
                (a) =>
                  run.events.some((e) => e.attempt === a) &&
                  !run.input.credentialRef,
              )
              .map((a) => (
                <a key={a} href={asset(run.id, `attempt-${a}-trace.zip`)}>
                  <Download size={13} />
                  Attempt {a} trace
                </a>
              ))}
          </div>
        </section>
      </div>
      <details className="panel console reproduction-steps">
        <summary>
          <MousePointer2 size={15} />
          Recorded reproduction steps
          <span>
            {
              run.events.filter(
                (e) =>
                  e.attempt === 1 &&
                  ![
                    "observe_page",
                    "capture_screenshot",
                    "finish_run",
                  ].includes(e.action.type),
              ).length
            }
          </span>
        </summary>
        <ol>
          {run.events
            .filter(
              (e) =>
                e.attempt === 1 &&
                !["observe_page", "capture_screenshot", "finish_run"].includes(
                  e.action.type,
                ),
            )
            .map((e) => (
              <li key={e.id}>
                <strong>{actionLabel(e)}</strong> · {e.target}
                {e.action.type === "fill_field" && (
                  <code> {e.action.value}</code>
                )}
                {e.action.type === "fill_credential" &&
                  " (configured reference; secret redacted)"}
                {e.checks.map((c) => (
                  <span key={c.id}>
                    {" "}
                    — {c.id}: {c.passed ? "passed" : "failed"}
                  </span>
                ))}
              </li>
            ))}
        </ol>
      </details>
      {run.errors.length > 0 && (
        <details className="panel console">
          <summary>
            <Terminal size={15} />
            Browser & execution diagnostics <span>{run.errors.length}</span>
          </summary>
          {run.errors.map((e, i) => (
            <div key={i}>
              <time>{time(e.at)}</time>
              <span>{e.kind}</span>
              <code>{e.message}</code>
            </div>
          ))}
        </details>
      )}
    </>
  );
}
function actionLabel(e: Event) {
  const map: Record<string, string> = {
    navigate: "Navigate to target",
    click_element: "Click control",
    fill_field: "Fill field",
    fill_credential: "Fill credential · redacted",
    press_key: "Press key",
    check_condition: "Verify requirement",
    capture_screenshot: "Capture evidence",
    observe_page: "Observe page",
    finish_run: "Finish test",
    select_option: "Select option",
    scroll_page: "Scroll page",
  };
  return map[e.action.type] || e.action.type;
}
createRoot(document.getElementById("root")!).render(<App />);
