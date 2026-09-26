"use client";

import { useEffect, useMemo, useState } from "react";
import SurvivalChart from "./components/SurvivalChart";
import { heuristicBreakdown } from "../lib/engine/heuristic.js";
import { hashString } from "../lib/engine/random.js";
import { COMMITMENT, EXPERIENCE, TEAM, WORKFLOWS } from "../lib/engine/reference.js";
import { cutImpacts, simulate } from "../lib/engine/simulate.js";
import "./page.css";

const longDate = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const formatDate = (iso, format = longDate) => (iso ? format.format(new Date(`${iso}T00:00:00Z`)) : "beyond two years");
const percent = (value) => `${Math.round(value * 100)}%`;
const hours = (value) => `${Math.round(value)} h`;
const dollars = (value) => (value < 1 ? "<$1" : `$${Math.round(value).toLocaleString("en-US")}`);

const WORKFLOW_COPY = {
  manual: "No AI, or only occasional questions",
  assisted: "Copilot, Cursor tab, chat for snippets",
  agentic: "Claude Code, Codex, agents write most code"
};
const FIT_LABEL = { high: "Agent-ready", medium: "Agent-assisted", low: "Human-bound" };

function ChoiceCard({ name, value, selected, title, description, onChange }) {
  return (
    <label className={`choice-card ${selected ? "is-selected" : ""}`}>
      <input type="radio" name={name} value={value} checked={selected} onChange={onChange} />
      <span className="choice-content"><strong>{title}</strong><small>{description}</small></span>
    </label>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Home() {
  const [form, setForm] = useState({
    projectName: "",
    description: "",
    workflow: "assisted",
    experience: "some",
    hoursPerWeek: 8,
    team: "solo",
    commitment: "serious",
    startDate: "",
    deadline: ""
  });
  const [breakdown, setBreakdown] = useState(null);
  const [excluded, setExcluded] = useState(() => new Set());
  const [aiStatus, setAiStatus] = useState({ state: "idle", message: "" });
  const [copyStatus, setCopyStatus] = useState("");

  // Set on the client so the server render and first client render agree.
  useEffect(() => setForm((current) => ({ ...current, startDate: current.startDate || today() })), []);

  const includedTasks = useMemo(
    () => (breakdown ? breakdown.tasks.filter((task) => !excluded.has(task.id)) : []),
    [breakdown, excluded]
  );

  const simulationInput = useMemo(() => {
    if (!breakdown) return null;
    return {
      tasks: includedTasks,
      workflow: form.workflow,
      experience: form.experience,
      commitment: form.commitment,
      team: form.team,
      hoursPerWeek: Number(form.hoursPerWeek) || 1,
      startDate: form.startDate || today(),
      deadline: form.deadline && form.deadline > (form.startDate || today()) ? form.deadline : "",
      seed: hashString(`${form.projectName}\n${form.description}`)
    };
  }, [breakdown, includedTasks, form]);

  const forecast = useMemo(() => (simulationInput && includedTasks.length ? simulate(simulationInput) : null), [simulationInput, includedTasks]);
  const cuts = useMemo(() => {
    if (!simulationInput || !includedTasks.some((task) => task.optional)) return new Map();
    return new Map(cutImpacts(simulationInput).map((cut) => [cut.id, cut]));
  }, [simulationInput, includedTasks]);
  const taskStats = useMemo(() => new Map((forecast?.tasks || []).map((task) => [task.id, task])), [forecast]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function toggleTask(id) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function forecastProject(event) {
    event.preventDefault();
    setCopyStatus("");
    setExcluded(new Set());
    // Instant offline forecast first; the AI plan replaces it when it lands.
    setBreakdown({ ...heuristicBreakdown(form.description), source: { provider: "heuristic" } });
    if (form.description.trim().length < 12) {
      setAiStatus({ state: "offline", message: "Describe the project in a sentence or two for an AI breakdown." });
      return;
    }

    setAiStatus({ state: "thinking", message: "Claude is planning the work and three estimators are sizing it…" });
    try {
      const response = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: form.projectName, description: form.description })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The AI breakdown is unavailable.");
      setBreakdown(payload);
      setAiStatus({ state: "ai", message: "" });
    } catch (error) {
      setAiStatus({ state: "offline", message: `${error.message} Using the offline keyword breakdown.` });
    }
  }

  async function copyForecast() {
    if (!forecast) return;
    const title = form.projectName.trim() || "My project";
    const lines = [
      `${title} — Shipclock forecast`,
      `If I keep at it: 50% by ${formatDate(forecast.persist.p50)}, 80% by ${formatDate(forecast.persist.p80)}.`,
      `Chance it ships at all: ${percent(forecast.shipProbability)}.`,
      forecast.deadline ? `Chance of shipping by ${formatDate(forecast.deadline.date)}: ${percent(forecast.deadline.shipped)}.` : null,
      `My hours: ~${hours(forecast.hours.human.p50)} (${hours(forecast.hours.human.p10)}–${hours(forecast.hours.human.p90)}).`
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyStatus("Forecast copied to clipboard");
    } catch {
      setCopyStatus("Clipboard unavailable");
    }
  }

  const sourceLabel = breakdown?.source?.provider === "claude"
    ? `Claude · ${breakdown.source.estimators} estimators`
    : breakdown?.source?.provider === "openai-compatible"
      ? `${breakdown.source.model} · ${breakdown.source.estimators} estimators`
      : "Offline estimate";

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark" aria-hidden="true">↗</span><span>shipclock</span></a>
        <div className="topbar-note"><span className="status-dot" /> Estimator v0.3</div>
      </header>

      <section className="intro">
        <p className="eyebrow">Side-project forecaster</p>
        <h1>Will it <em>ship?</em></h1>
        <p className="intro-copy">
          Most estimators tell you when. Shipclock also tells you whether: Claude breaks your project into tasks,
          a Monte Carlo simulation runs it 4,000 times against your real weekly hours, and the forecast counts
          the odds you stall out along the way.
        </p>
      </section>

      <section className="workspace" aria-label="Project forecaster">
        <form className="input-panel" onSubmit={forecastProject}>
          <div className="panel-heading"><div><p className="section-kicker">01 — Shape the work</p><h2>Tell us about the project</h2></div></div>

          <label className="field"><span className="field-label">Project name <span className="optional">optional</span></span>
            <input name="projectName" type="text" value={form.projectName} onChange={updateField} placeholder="e.g. Playlist Roulette" maxLength={80} />
          </label>
          <label className="field project-description"><span className="field-label">What are you building? <span className="optional">Claude plans from this</span></span>
            <textarea name="description" value={form.description} onChange={updateField} rows="4" maxLength={3000}
              placeholder="Features, integrations, platforms, and what 'shipped' means to you. e.g. A web app where friends log in with Spotify, pool their playlists, and an AI writes a group vibe summary." />
          </label>

          <fieldset className="field-group"><legend className="field-label">How will you build it?</legend>
            <div className="choice-grid compact">
              {Object.entries(WORKFLOWS).map(([value, workflow]) => (
                <ChoiceCard key={value} name="workflow" value={value} selected={form.workflow === value} title={workflow.label} description={WORKFLOW_COPY[value]} onChange={updateField} />
              ))}
            </div>
          </fieldset>

          <div className="field-row">
            <label className="field"><span className="field-label">Hours per week <span className="optional">combined, realistic</span></span>
              <div className="hours-input">
                <input name="hoursPerWeek" type="range" min="1" max="40" value={form.hoursPerWeek} onChange={updateField} aria-label="Hours per week" />
                <output>{form.hoursPerWeek} h</output>
              </div>
            </label>
            <label className="field"><span className="field-label">The stack is…</span>
              <select name="experience" value={form.experience} onChange={updateField}>
                {Object.entries(EXPERIENCE).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <div className="field-row">
            <label className="field"><span className="field-label">Who&apos;s building</span>
              <select name="team" value={form.team} onChange={updateField}>
                {Object.entries(TEAM).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">What&apos;s riding on it</span>
              <select name="commitment" value={form.commitment} onChange={updateField}>
                {Object.entries(COMMITMENT).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <div className="field-row">
            <label className="field"><span className="field-label">Start date</span>
              <input name="startDate" type="date" value={form.startDate} onChange={updateField} required />
            </label>
            <label className="field"><span className="field-label">Deadline <span className="optional">optional</span></span>
              <input name="deadline" type="date" value={form.deadline} min={form.startDate} onChange={updateField} />
            </label>
          </div>

          <button className="primary-button" type="submit" disabled={aiStatus.state === "thinking"}>
            <span>{aiStatus.state === "thinking" ? "Claude is planning…" : "Forecast my ship date"}</span><span aria-hidden="true">→</span>
          </button>
          <p className="form-note"><span aria-hidden="true">✦</span> LLM ensemble for the plan · your own simulation for the odds</p>
        </form>

        <aside className="result-panel" aria-live="polite">
          <div className="result-topline">
            <p className="section-kicker">02 — Your forecast</p>
            {breakdown && <span className="confidence"><span className="confidence-dot" />{sourceLabel}</span>}
          </div>

          {!forecast && (
            <div className="result-empty">
              <p className="result-label">Waiting on a project</p>
              <p>Describe what you&apos;re building and how you&apos;ll build it. You&apos;ll get the odds of shipping by every date, where your hours go, and what to cut.</p>
            </div>
          )}

          {forecast && (
            <>
              <div className="result-main">
                {forecast.deadline ? (
                  <>
                    <p className="result-label">Chance you ship by {formatDate(forecast.deadline.date, shortDate)}</p>
                    <h2>{percent(forecast.deadline.shipped)}</h2>
                    <p className="result-range">
                      {percent(forecast.deadline.persist)} if you never lose steam. Median finish if you keep going: <strong>{formatDate(forecast.persist.p50)}</strong>.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="result-label">Likely finish if you keep going</p>
                    <h2>{formatDate(forecast.persist.p50)}</h2>
                    <p className="result-range">80% chance by <strong>{formatDate(forecast.persist.p80)}</strong>. 95% by {formatDate(forecast.persist.p95, shortDate)}.</p>
                  </>
                )}
                <p className="result-ceiling">
                  <strong>{percent(forecast.shipProbability)}</strong> chance it ships at all within two years. Side projects rarely miss a date; they stall.
                </p>
              </div>

              <SurvivalChart curve={forecast.curve} deadline={forecast.deadline} />

              <div className="result-details">
                <div className="detail-row"><span>Your hours</span><strong>{hours(forecast.hours.human.p50)} <em>({hours(forecast.hours.human.p10)}–{hours(forecast.hours.human.p90)})</em></strong></div>
                {form.workflow !== "manual" && (
                  <>
                    <div className="detail-row"><span>Work agents carry</span><strong>{hours(forecast.hours.agent.p50)} <em>of {hours(forecast.hours.byHand.p50)} by hand</em></strong></div>
                    <div className="detail-row"><span>Your review and fixes</span><strong>{hours(forecast.hours.oversight.p50)}</strong></div>
                    <div className="detail-row"><span>AI spend at API prices</span><strong>{dollars(forecast.cost.dollars.p50)} <em>(up to {dollars(forecast.cost.dollars.p90)})</em></strong></div>
                  </>
                )}
                <div className="detail-row"><span>Running costs after launch</span><strong>~${forecast.cost.infraMonthly}/mo</strong></div>
              </div>

              <div className="ai-insight">
                <div className="ai-insight-heading"><span className="ai-spark">✦</span><span>Plan source</span><span>{aiStatus.state === "thinking" ? "Refining" : sourceLabel}</span></div>
                <p>{aiStatus.message || breakdown.summary}</p>
              </div>

              <button className="secondary-button" type="button" onClick={copyForecast}><span>Copy forecast</span><span aria-hidden="true">⌘ C</span></button>
              <p className="copy-status" role="status">{copyStatus}</p>
            </>
          )}
        </aside>
      </section>

      {breakdown && forecast && (
        <section className="plan" aria-label="Task plan">
          <div className="plan-heading">
            <div><p className="section-kicker">03 — The plan</p><h2>Where the time goes</h2></div>
            <p className="plan-note">Untick a task to cut it. The forecast updates instantly. &ldquo;Uncertainty&rdquo; is each task&apos;s share of the spread in your total hours: shrink the big ones first.</p>
          </div>
          <div className="task-table-wrap">
            <table className="task-table">
              <thead>
                <tr><th scope="col"><span className="visually-hidden">Include</span></th><th scope="col">Task</th><th scope="col">By hand</th><th scope="col">AI fit</th><th scope="col">Your hours</th><th scope="col">Uncertainty</th></tr>
              </thead>
              <tbody>
                {breakdown.tasks.map((task) => {
                  const stats = taskStats.get(task.id);
                  const cut = cuts.get(task.id);
                  const included = !excluded.has(task.id);
                  return (
                    <tr key={task.id} className={included ? "" : "is-cut"}>
                      <td><input type="checkbox" checked={included} onChange={() => toggleTask(task.id)} aria-label={`Include ${task.name}`} /></td>
                      <td>
                        <div className="task-name">{task.name}{task.optional && <span className="tag">optional</span>}</div>
                        {task.why && <div className="task-why">{task.why}</div>}
                        {included && cut && cut.weeksSaved > 0.2 && (
                          <div className="task-cut">Cut it: ~{cut.weeksSaved.toFixed(1)} weeks sooner at 80% confidence{cut.deadlineGain > 0.005 ? `, +${percent(cut.deadlineGain)} on your deadline` : ""}</div>
                        )}
                      </td>
                      <td className="mono">{task.hours.likely} h<div className="task-why">{task.hours.low}–{task.hours.high}{task.disagreement >= 1.6 ? ` · estimators split ×${task.disagreement.toFixed(1)}` : ""}</div></td>
                      <td><span className={`fit fit-${task.agentFit}`}>{FIT_LABEL[task.agentFit]}</span></td>
                      <td className="mono">{stats ? hours(stats.humanP50) : "—"}</td>
                      <td>
                        {stats ? (
                          <div className="share" title={`${percent(stats.uncertaintyShare)} of the spread in your total hours`}>
                            <span className="share-bar"><span style={{ width: `${Math.max(2, stats.uncertaintyShare * 100)}%` }} /></span>
                            <span className="mono">{percent(stats.uncertaintyShare)}</span>
                          </div>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(breakdown.premortem.length > 0 || breakdown.risks.length > 0) && (
            <div className="plan-columns">
              {breakdown.premortem.length > 0 && (
                <div className="plan-card">
                  <h3>Pre-mortem: why this might never ship</h3>
                  <ol>{breakdown.premortem.map((reason) => <li key={reason}>{reason}</li>)}</ol>
                </div>
              )}
              {breakdown.risks.length > 0 && (
                <div className="plan-card">
                  <h3>Risks and how to defuse them</h3>
                  <ul>{breakdown.risks.map((item) => <li key={item.risk}><strong>{item.risk}</strong>{item.mitigation && <span> {item.mitigation}</span>}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="method" aria-label="How the forecast works">
        <p className="section-kicker">How it works</p>
        <ol>
          <li><strong>Plan.</strong> Claude breaks the project into tasks, sizing each against reference tasks with known durations, and runs a pre-mortem to surface forgotten work.</li>
          <li><strong>Ensemble.</strong> Two more estimators, a skeptic and a reference-class lens, re-size the plan independently. Shipclock takes the median and keeps their disagreement as uncertainty.</li>
          <li><strong>Agentic cost.</strong> Following ACEM, effort splits into what an agent does (costed in tokens) and what stays human: the human-only work plus reviewing and fixing agent output.</li>
          <li><strong>Simulate.</strong> 4,000 runs sample every task, a shared &ldquo;this is you&rdquo; overrun factor, unlisted work, the hours you actually get each week, and a week you might walk away. Abandonment rates start from hackathon follow-up studies.</li>
        </ol>
      </section>

      <footer className="footer"><span>Made for the space between &ldquo;let&rsquo;s do it&rdquo; and &ldquo;it shipped.&rdquo;</span><span className="footer-mono">SHIP / 003</span></footer>
    </main>
  );
}
