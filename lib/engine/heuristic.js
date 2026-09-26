import { normalizeBreakdown } from "./breakdown.js";

// Offline task breakdown from keywords. It is deliberately simple: it gives an
// instant first forecast and a fallback when no LLM is configured, and uses the
// same sizes as the anchor tasks the LLM is calibrated against.
const RULES = [
  {
    pattern: /\b(log ?in|sign ?up|auth|accounts?|users? profiles?|oauth)\b/i,
    task: { name: "User accounts and login", category: "auth", hours: { low: 2, likely: 5, high: 12 }, agentFit: "high" }
  },
  {
    pattern: /\b(stripe|payments?|checkout|subscriptions?|billing)\b/i,
    task: { name: "Payments and webhook handling", category: "payments", hours: { low: 5, likely: 10, high: 24 }, agentFit: "medium" }
  },
  {
    pattern: /\b(database|store|save|persist|postgres|supabase|firebase|history|records?)\b/i,
    task: { name: "Data model and persistence", category: "data", hours: { low: 4, likely: 8, high: 18 }, agentFit: "high" }
  },
  {
    pattern: /\b(api|integrat\w*|spotify|google|github|twitter|slack|discord|notion|calendar|maps?)\b/i,
    task: { name: "Third-party API integration", category: "integration", hours: { low: 4, likely: 9, high: 24 }, agentFit: "medium" }
  },
  {
    pattern: /\b(ai|llm|gpt|claude|chat ?bot|openai|anthropic|summari[sz]\w*)\b/i,
    task: { name: "LLM feature with prompt and output handling", category: "ai", hours: { low: 3, likely: 8, high: 20 }, agentFit: "medium" }
  },
  {
    pattern: /\b(real-?time|multiplayer|chat|websockets?|collaborat\w*|sync)\b/i,
    task: { name: "Realtime sync between clients", category: "realtime", hours: { low: 6, likely: 14, high: 36 }, agentFit: "low" }
  },
  {
    pattern: /\b(mobile|ios|android|app store|react native|expo|flutter)\b/i,
    task: { name: "Mobile build and store submission", category: "mobile", hours: { low: 8, likely: 18, high: 45 }, agentFit: "low" }
  },
  {
    pattern: /\b(upload|images?|photos?|videos?|files?|audio)\b/i,
    task: { name: "File uploads and media handling", category: "backend", hours: { low: 3, likely: 7, high: 16 }, agentFit: "high" }
  },
  {
    pattern: /\b(email|notifications?|reminders?|sms|push)\b/i,
    task: { name: "Notifications (email or push)", category: "integration", hours: { low: 2, likely: 5, high: 12 }, agentFit: "high" }
  },
  {
    pattern: /\b(search|filter|recommend\w*|feed)\b/i,
    task: { name: "Search, filtering or recommendations", category: "backend", hours: { low: 3, likely: 8, high: 20 }, agentFit: "medium" }
  },
  {
    pattern: /\b(admin|dashboard|analytics|charts?|reports?)\b/i,
    task: { name: "Dashboard or admin views", category: "frontend", hours: { low: 4, likely: 8, high: 18 }, agentFit: "high", optional: true }
  }
];

export function heuristicBreakdown(description = "") {
  const text = String(description);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  // Longer descriptions usually mean more screens; cap it so a paragraph of prose doesn't explode the estimate.
  const uiScale = Math.min(2.2, 1 + words / 80);

  const tasks = [
    { name: "Project setup and first deploy", category: "setup", hours: { low: 1, likely: 2, high: 5 }, agentFit: "high" },
    {
      name: "Core screens and main user flow",
      category: "frontend",
      hours: { low: 4 * uiScale, likely: 10 * uiScale, high: 26 * uiScale },
      agentFit: "high"
    },
    ...RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.task),
    { name: "Design polish and responsive layout", category: "design", hours: { low: 2, likely: 6, high: 14 }, agentFit: "medium", optional: true },
    { name: "Bug bash and edge cases", category: "testing", hours: { low: 3, likely: 8, high: 20 }, agentFit: "medium" },
    { name: "README, demo video and launch post", category: "content", hours: { low: 1, likely: 3, high: 6 }, agentFit: "medium", optional: true }
  ];

  return normalizeBreakdown({
    summary: "Keyword-based breakdown. Add an Anthropic API key for a model-driven plan with hidden work and risks.",
    tasks
  });
}
