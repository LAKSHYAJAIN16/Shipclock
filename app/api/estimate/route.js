import { NextResponse } from "next/server";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  return JSON.parse(fenced ? fenced[1] : text);
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const { projectName = "", description, scope, team, risk } = body || {};
  if (typeof description !== "string" || description.trim().length < 12) {
    return NextResponse.json({ error: "A project description of at least 12 characters is required." }, { status: 400 });
  }

  const endpoint = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  if (!endpoint || !apiKey) {
    return NextResponse.json({ error: "LLM_BASE_URL and LLM_API_KEY are not configured." }, { status: 503 });
  }

  const prompt = [
    "You are a project planning reviewer. The deterministic estimator already calculated a baseline.",
    "Analyze the project description for hidden work, dependencies, unknowns, and delivery risks.",
    'Return ONLY valid JSON with exactly these keys: {"additionalWeeks": number, "planningNote": string, "explanation": string}',
    "additionalWeeks must be between 0 and 8. Use 0 when the description adds no credible work.",
    "planningNote must be one concise action-oriented sentence. explanation must be 1-2 sentences.",
    `Project name: ${projectName || "Unnamed project"}`,
    `Scope: ${scope}; team: ${team}; stated risk: ${risk}`,
    `Description: ${description.trim()}`
  ].join("\n");

  try {
    const llmResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: "system", content: "You produce conservative, practical project estimates. Never invent precise commitments." }, { role: "user", content: prompt }] })
    });
    if (!llmResponse.ok) return NextResponse.json({ error: `LLM provider returned ${llmResponse.status}.` }, { status: 502 });
    const payload = await llmResponse.json();
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Provider response did not contain message content.");
    const review = extractJson(content);
    return NextResponse.json({
      additionalWeeks: clamp(review.additionalWeeks, 0, 8),
      planningNote: String(review.planningNote || "Validate the unknowns before committing to the date."),
      explanation: String(review.explanation || "The AI found additional work worth accounting for.")
    });
  } catch (error) {
    console.error("LLM estimate failed:", error);
    return NextResponse.json({ error: "The AI planning review failed." }, { status: 502 });
  }
}
