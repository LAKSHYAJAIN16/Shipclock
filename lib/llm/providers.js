import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { SYSTEM_PROMPT } from "./prompts.js";

const CLAUDE_MODEL = process.env.SHIPCLOCK_MODEL || "claude-opus-5";

export class ProviderError extends Error {}

// Claude through the Anthropic SDK: schema-constrained output, adaptive thinking
// (on by default for this model), and server-side fallback if a request is refused.
function claudeProvider() {
  const client = new Anthropic({ timeout: 50_000, maxRetries: 1 });
  return {
    name: "claude",
    model: CLAUDE_MODEL,
    async generate({ prompt, schema, effort }) {
      const message = await client.beta.messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM_PROMPT,
        output_config: { effort, format: betaZodOutputFormat(schema) },
        messages: [{ role: "user", content: prompt }]
      });
      if (message.stop_reason === "refusal") throw new ProviderError("The model declined this request.");
      if (message.stop_reason === "max_tokens") throw new ProviderError("The model ran out of output tokens.");
      if (!message.parsed_output) throw new ProviderError("The model returned no parseable plan.");
      return message.parsed_output;
    }
  };
}

// Any OpenAI-compatible chat completions endpoint, kept for deployments that already use one.
function openAiCompatibleProvider() {
  const endpoint = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  return {
    name: "openai-compatible",
    model,
    async generate({ prompt, schema }) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `${prompt}\n\nReturn ONLY JSON matching this JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}` }
          ]
        }),
        signal: AbortSignal.timeout(50_000)
      });
      if (!response.ok) throw new ProviderError(`LLM provider returned ${response.status}.`);
      const content = (await response.json()).choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new ProviderError("Provider response had no message content.");
      const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      const parsed = schema.safeParse(JSON.parse(fenced ? fenced[1] : content));
      if (!parsed.success) throw new ProviderError("Provider response did not match the schema.");
      return parsed.data;
    }
  };
}

export function configuredProvider() {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return claudeProvider();
  if (process.env.LLM_BASE_URL && process.env.LLM_API_KEY) return openAiCompatibleProvider();
  return null;
}
