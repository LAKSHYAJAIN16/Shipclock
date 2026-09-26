// Every assumption the forecast rests on lives in this file, so the model can be
// argued with (and later re-fit from real check-in data) in one place.

export const CATEGORIES = [
  "setup", "frontend", "backend", "data", "auth", "payments", "integration",
  "ai", "realtime", "mobile", "infra", "design", "testing", "content", "other"
];

// Reference tasks with known sizes. The LLM sizes new work *relative to these*
// (comparative estimation beats asking for raw hours cold), and the offline
// heuristic uses the same numbers. Hours are for a competent developer working
// by hand in a stack they know: [p10, likely, p90].
export const ANCHORS = [
  { name: "Scaffold a Next.js app and deploy a hello-world to Vercel", category: "setup", hours: [1, 2, 5] },
  { name: "Email + OAuth login with a hosted auth provider (Clerk, Supabase Auth)", category: "auth", hours: [2, 5, 12] },
  { name: "CRUD screens for one resource backed by a hosted Postgres", category: "data", hours: [4, 8, 18] },
  { name: "Stripe Checkout for one plan, with a webhook that unlocks access", category: "payments", hours: [5, 10, 24] },
  { name: "Call a third-party REST API with OAuth and handle rate limits", category: "integration", hours: [4, 9, 24] },
  { name: "LLM feature with a prompt, structured output and basic error handling", category: "ai", hours: [3, 8, 20] },
  { name: "Realtime updates between two browsers (websockets or a hosted service)", category: "realtime", hours: [6, 14, 36] },
  { name: "Responsive landing page from an existing design", category: "frontend", hours: [3, 6, 14] },
  { name: "Ship a React Native screen to TestFlight for the first time", category: "mobile", hours: [8, 18, 45] },
  { name: "Bug bash and polish pass before sharing publicly", category: "testing", hours: [4, 10, 24] }
];

// How much of each task an AI agent can carry, by workflow. Agents take the
// well-specified, verifiable work; people keep judgment calls, taste, flaky
// integrations and anything that needs accounts, keys or approvals.
export const WORKFLOWS = {
  manual: { label: "By hand", agentShare: { high: 0, medium: 0, low: 0 }, oversight: 0, tokensPerAgentHour: 0 },
  assisted: { label: "AI-assisted", agentShare: { high: 0.45, medium: 0.3, low: 0.1 }, oversight: 0.4, tokensPerAgentHour: 250_000 },
  agentic: { label: "Agentic", agentShare: { high: 0.85, medium: 0.6, low: 0.25 }, oversight: 0.3, tokensPerAgentHour: 1_200_000 }
};

// Human-in-the-loop cost: for every hour of work an agent does, the builder
// still spends `oversight` hours specifying, reviewing and correcting it
// (ACEM's HITL dimension). It is sampled with a wide spread because METR's
// 2025 RCT found developers' own read of their AI speed-up was badly off
// (19% slower measured vs ~20% faster perceived), so we never take it on faith.
export const OVERSIGHT_SIGMA = 0.5;

// API-equivalent price per million tokens for agent work: mostly cache reads
// with some fresh input and output (roughly 90/7/3 at Opus-class prices).
export const DOLLARS_PER_MTOK = 1.55;
export const TOKENS_SIGMA = 0.6;

export const EXPERIENCE = {
  new: { label: "New to me", multiplier: 1.5 },
  some: { label: "Used it before", multiplier: 1.15 },
  expert: { label: "Know it cold", multiplier: 0.9 }
};

// Weekly probability of abandoning the project. Only ~11–21% of hackathon
// projects see any commit after the event (Nolte et al., CSCW 2020), so the
// default for hobby work is steep. These are priors until check-in data exists.
export const COMMITMENT = {
  fun: { label: "Just for fun", weeklyHazard: 0.06 },
  serious: { label: "Serious side project", weeklyHazard: 0.03 },
  deadline: { label: "Hard deadline", weeklyHazard: 0.01 }
};

export const TEAM = {
  solo: { label: "Solo", hazardMultiplier: 1.2 },
  small: { label: "2–4 people", hazardMultiplier: 0.85 },
  larger: { label: "5+ people", hazardMultiplier: 0.75 }
};

// Shared "this is you" factor applied to every task in a trial. Overruns are
// correlated (same person, same codebase), and treating tasks as independent
// makes the total look falsely certain. Median >1 encodes the planning fallacy;
// the tail reflects Flyvbjerg's finding that ~1 in 6 IT projects blows up.
export const PERSONAL_FACTOR = { median: 1.2, sigma: 0.3 };

// Unknown unknowns: work nobody listed, discovered mid-build.
export const DISCOVERY = { tasksPerListedTask: 0.12, medianHours: 4, sigma: 0.8 };

// Planned hours per week versus hours that actually happen.
export const CAPACITY = { realisedMedian: 0.85, sigma: 0.35 };

// Rough monthly running cost for the stack each category implies (ACEM's
// infrastructure dimension), assuming free tiers where they exist.
export const INFRA_MONTHLY = { data: 0, ai: 10, realtime: 5, mobile: 8, infra: 5, integration: 0, payments: 0 };

export const HORIZON_WEEKS = 104;
