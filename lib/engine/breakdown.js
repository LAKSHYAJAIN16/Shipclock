import { CATEGORIES } from "./reference.js";

const AGENT_FITS = ["high", "medium", "low"];
const MAX_TASKS = 30;

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function cleanText(value, maxLength, fallback = "") {
  if (typeof value !== "string") return fallback;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : fallback;
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "task";
}

export function normalizeHours(hours) {
  const likely = clampNumber(hours?.likely, 0.25, 400, 4);
  let low = clampNumber(hours?.low, 0.25, 400, likely * 0.6);
  let high = clampNumber(hours?.high, 0.25, 600, likely * 2);
  low = Math.min(low, likely);
  high = Math.max(high, likely * 1.1);
  return { low: round(low), likely: round(likely), high: round(high) };
}

function round(value) {
  return Math.round(value * 4) / 4;
}

// Model output and client payloads are untrusted: everything that reaches the
// simulator goes through here, so the maths never sees a NaN or a 10,000-hour task.
export function normalizeBreakdown(raw) {
  const seen = new Set();
  const tasks = (Array.isArray(raw?.tasks) ? raw.tasks : []).slice(0, MAX_TASKS).map((task, index) => {
    const name = cleanText(task?.name, 90, `Task ${index + 1}`);
    let id = cleanText(task?.id, 48) || slug(name);
    while (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);
    const category = String(task?.category).trim().toLowerCase();
    const agentFit = String(task?.agentFit).trim().toLowerCase();
    return {
      id,
      name,
      category: CATEGORIES.includes(category) ? category : "other",
      hours: normalizeHours(task?.hours),
      agentFit: AGENT_FITS.includes(agentFit) ? agentFit : "medium",
      optional: Boolean(task?.optional),
      why: cleanText(task?.why, 240),
      disagreement: clampNumber(task?.disagreement, 1, 20, 1)
    };
  });

  return {
    summary: cleanText(raw?.summary, 400),
    tasks,
    risks: (Array.isArray(raw?.risks) ? raw.risks : []).slice(0, 8).map((risk) => ({
      risk: cleanText(risk?.risk, 200, "Unspecified risk"),
      mitigation: cleanText(risk?.mitigation, 200)
    })),
    premortem: (Array.isArray(raw?.premortem) ? raw.premortem : [])
      .map((reason) => cleanText(reason, 200))
      .filter(Boolean)
      .slice(0, 5)
  };
}
