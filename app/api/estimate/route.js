import { NextResponse } from "next/server";
import { ensembleBreakdown } from "../../../lib/llm/ensemble.js";
import { configuredProvider } from "../../../lib/llm/providers.js";

export const maxDuration = 60;

// Best-effort per-IP limit: each request runs three model calls. It lives in
// one server instance's memory, so treat it as a speed bump, not a quota.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 10;
const recent = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((time) => now - time < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5000) recent.clear();
  return hits.length > MAX_REQUESTS;
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const projectName = typeof body?.projectName === "string" ? body.projectName.trim().slice(0, 80) : "";
  if (description.length < 12) {
    return NextResponse.json({ error: "A project description of at least 12 characters is required." }, { status: 400 });
  }
  if (description.length > 3000) {
    return NextResponse.json({ error: "Keep the description under 3,000 characters." }, { status: 400 });
  }

  const provider = configuredProvider();
  if (!provider) {
    return NextResponse.json({ error: "No LLM is configured. Set ANTHROPIC_API_KEY to enable the AI breakdown." }, { status: 503 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many forecasts in a short time. Try again in a few minutes." }, { status: 429 });
  }

  try {
    const { breakdown, estimators } = await ensembleBreakdown(provider, { projectName, description });
    return NextResponse.json({ ...breakdown, source: { provider: provider.name, model: provider.model, estimators } });
  } catch (error) {
    console.error("AI breakdown failed:", error);
    return NextResponse.json({ error: "The AI breakdown failed. Showing the offline estimate instead." }, { status: 502 });
  }
}
