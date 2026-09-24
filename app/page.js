"use client";

import { useEffect, useState } from "react";
import "./page.css";

const scopeData = {
  small: { weeks: 1.5, note: "Leave room for a final polish pass", estimate: "1–2 wks" },
  medium: { weeks: 5, note: "Keep a discovery week open", estimate: "3–6 wks" },
  large: { weeks: 12, note: "Break this into smaller milestones", estimate: "2–4 mos" }
};
const teamMultiplier = { solo: 1.35, small: 1, larger: 0.82 };
const riskBuffer = { low: 0.1, medium: 0.2, high: 0.35 };

function dateAtMidnight(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + Math.round(days));
  return result;
}

function formatDate(date, options) {
  return new Intl.DateTimeFormat("en-US", options).format(date);
}

function baselineEstimate({ scope, team, risk, startDate }, aiReview) {
  const baseWeeks = scopeData[scope].weeks * teamMultiplier[team];
  const buffer = riskBuffer[risk];
  const additionalWeeks = Number.isFinite(aiReview?.additionalWeeks) ? aiReview.additionalWeeks : 0;
  const totalDays = baseWeeks * 7 * (1 + buffer) + additionalWeeks * 7;
  const shipDate = addDays(dateAtMidnight(startDate), totalDays);
  const rangePadding = Math.max(4, Math.round(totalDays * 0.22));

  return {
    shipDate,
    lowerDate: addDays(shipDate, -rangePadding),
    upperDate: addDays(shipDate, rangePadding),
    totalWeeks: Math.round(totalDays / 7),
    buffer,
    note: aiReview?.planningNote || scopeData[scope].note
  };
}

function ChoiceCard({ name, value, selected, title, description, estimate, onChange }) {
  return (
    <label className={`choice-card ${selected ? "is-selected" : ""}`}>
      <input type="radio" name={name} value={value} checked={selected} onChange={onChange} />
      <span className="choice-content"><strong>{title}</strong><small>{description}</small></span>
      {estimate && <span className="choice-estimate">{estimate}</span>}
    </label>
  );
}

export default function Home() {
  const [form, setForm] = useState({
    projectName: "",
    description: "",
    scope: "medium",
    team: "small",
    startDate: new Date().toISOString().slice(0, 10),
    risk: "medium"
  });
  const [review, setReview] = useState(null);
  const [aiStatus, setAiStatus] = useState("Baseline only");
  const [isLoading, setIsLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [estimate, setEstimate] = useState(null);

  useEffect(() => setEstimate(baselineEstimate(form, null)), []);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function calculate(event) {
    event.preventDefault();
    setCopyStatus("");
    setReview(null);
    setAiStatus("Baseline only");
    setEstimate(baselineEstimate(form, null));

    if (!form.description.trim()) return;
    setIsLoading(true);
    setAiStatus("Analyzing");
    try {
      const response = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (!response.ok) throw new Error("AI endpoint unavailable");
      const nextReview = await response.json();
      setReview(nextReview);
      setEstimate(baselineEstimate(form, nextReview));
      setAiStatus("AI reviewed");
    } catch {
      setAiStatus("Unavailable");
      setReview({ explanation: "The hardcoded estimate is ready. Configure the serverless AI endpoint to add a project review." });
    } finally {
      setIsLoading(false);
    }
  }

  async function copyForecast() {
    if (!estimate) return;
    const title = form.projectName.trim() || "Project";
    const forecast = `${title}: likely ship date ${formatDate(estimate.shipDate, { month: "long", day: "2-digit", year: "numeric" })} (${formatDate(estimate.lowerDate, { month: "long", day: "numeric" })} – ${formatDate(estimate.upperDate, { month: "long", day: "numeric" })}).`;
    try {
      await navigator.clipboard.writeText(forecast);
      setCopyStatus("Forecast copied to clipboard");
    } catch {
      setCopyStatus("Clipboard unavailable");
    }
  }

  const confidence = form.risk === "low" ? "High confidence" : form.risk === "high" ? "Low confidence" : "Medium confidence";
  const shipDate = estimate?.shipDate || new Date();
  const range = estimate ? `${formatDate(estimate.lowerDate, { month: "long", day: "numeric" })} – ${formatDate(estimate.upperDate, { month: "long", day: "numeric" })}` : "";

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark" aria-hidden="true">↗</span><span>shipclock</span></a>
        <div className="topbar-note"><span className="status-dot" /> Estimator v0.2</div>
      </header>
      <section className="intro">
        <p className="eyebrow">Project timeline estimator</p>
        <h1>Know when it can <em>ship.</em></h1>
        <p className="intro-copy">Turn a rough project shape into a useful finish date. Hardcoded logic gives you a baseline; AI helps find what the baseline misses.</p>
      </section>
      <section className="workspace" aria-label="Project timeline estimator">
        <form className="input-panel" onSubmit={calculate}>
          <div className="panel-heading"><div><p className="section-kicker">01 — Shape the work</p><h2>Tell us about the project</h2></div><span className="step-count">5 inputs</span></div>
          <label className="field"><span className="field-label">Project name <span className="optional">optional</span></span><input name="projectName" type="text" value={form.projectName} onChange={updateField} placeholder="e.g. Customer portal" /></label>
          <label className="field project-description"><span className="field-label">What are you building? <span className="optional">the AI uses this</span></span><textarea name="description" value={form.description} onChange={updateField} rows="3" placeholder="Describe the outcome, key features, integrations, or constraints in plain language." /></label>
          <fieldset className="field-group"><legend className="field-label">How much work is there?</legend><div className="choice-grid">
            <ChoiceCard name="scope" value="small" selected={form.scope === "small"} title="Small" description="A focused feature or fix" estimate="1–2 wks" onChange={updateField} />
            <ChoiceCard name="scope" value="medium" selected={form.scope === "medium"} title="Medium" description="A meaningful product slice" estimate="3–6 wks" onChange={updateField} />
            <ChoiceCard name="scope" value="large" selected={form.scope === "large"} title="Large" description="Several connected workstreams" estimate="2–4 mos" onChange={updateField} />
          </div></fieldset>
          <fieldset className="field-group"><legend className="field-label">Who is building it?</legend><div className="choice-grid compact">
            <ChoiceCard name="team" value="solo" selected={form.team === "solo"} title="Solo" description="One person, part-time or full-time" onChange={updateField} />
            <ChoiceCard name="team" value="small" selected={form.team === "small"} title="Small team" description="2–4 people collaborating" onChange={updateField} />
            <ChoiceCard name="team" value="larger" selected={form.team === "larger"} title="Larger team" description="5+ people or multiple teams" onChange={updateField} />
          </div></fieldset>
          <div className="field-row"><label className="field"><span className="field-label">Start date</span><input name="startDate" type="date" value={form.startDate} onChange={updateField} /></label><label className="field"><span className="field-label">Risk &amp; unknowns</span><select name="risk" value={form.risk} onChange={updateField}><option value="low">Low — familiar territory</option><option value="medium">Medium — a few unknowns</option><option value="high">High — lots to discover</option></select></label></div>
          <button className="primary-button" type="submit" disabled={isLoading}><span>{isLoading ? "Reviewing with AI…" : "Calculate my timeline"}</span><span aria-hidden="true">→</span></button>
          <p className="form-note"><span aria-hidden="true">✦</span> Hardcoded baseline + AI risk review. No false precision.</p>
        </form>
        <aside className="result-panel" aria-live="polite">
          <div className="result-topline"><p className="section-kicker">02 — Your forecast</p><span className="confidence"><span className="confidence-dot" />{confidence}</span></div>
          <div className="result-main"><p className="result-label">Likely ship date</p><h2>{formatDate(shipDate, { month: "long", day: "2-digit", year: "numeric" })}</h2><p className="result-range">A realistic window of <strong>{range}</strong></p></div>
          <div className="timeline"><div className="timeline-line"><span className="timeline-progress" /><span className="timeline-marker marker-start" /><span className="timeline-marker marker-end" /></div><div className="timeline-labels"><span>{formatDate(new Date(`${form.startDate}T00:00:00`), { month: "long", day: "numeric" })}</span><span>{estimate?.totalWeeks || 0} weeks</span></div></div>
          <div className="result-details"><div className="detail-row"><span>Estimated effort</span><strong>{estimate?.totalWeeks || 0} weeks</strong></div><div className="detail-row"><span>Built-in buffer</span><strong>{Math.round((estimate?.buffer || 0) * 100)}%</strong></div><div className="detail-row"><span>Planning note</span><strong>{estimate?.note || "Add project details"}</strong></div></div>
          <div className="ai-insight"><div className="ai-insight-heading"><span className="ai-spark">✦</span><span>AI planning review</span><span>{aiStatus}</span></div><p>{review?.explanation || "Add a project description to have the AI look for hidden work, dependencies, and delivery risks."}</p></div>
          <button className="secondary-button" type="button" onClick={copyForecast}><span>Copy forecast</span><span aria-hidden="true">⌘ C</span></button><p className="copy-status" role="status">{copyStatus}</p>
        </aside>
      </section>
      <footer className="footer"><span>Made for the space between “let’s do it” and “it shipped.”</span><span className="footer-mono">SHIP / 002</span></footer>
    </main>
  );
}
