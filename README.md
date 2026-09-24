# Shipclock

Shipclock is a Next.js project timeline estimator. It combines a deterministic baseline with an optional LLM planning review that looks for hidden work, dependencies, and delivery risks.

## Run locally

Install dependencies and start the Next.js development server:

```bash
npm install
npm run dev
```

Then visit `http://localhost:3000`.

## Configure the AI review

The frontend calls the Next.js route `POST /api/estimate`. Deploy the project to a serverless host such as Vercel and configure these environment variables:

- `LLM_BASE_URL`: an OpenAI-compatible chat completions endpoint
- `LLM_API_KEY`: the provider key, kept server-side
- `LLM_MODEL`: the model name (defaults to `gpt-4o-mini`)

Without these variables, the hardcoded calculator still works and clearly labels the forecast as baseline-only.
