# Shipclock

Shipclock forecasts when, and whether, a side project ships.

Most estimators give you a date. For side projects, the date is rarely the problem: most never ship because they stall. Shipclock gives you the chance of shipping by every date, counting the odds that you walk away, and shows where your hours go when AI agents do part of the work.

## How it works

1. **Plan (LLM).** Claude breaks the project into tasks. It sizes each one as p10 / likely / p90 hours relative to reference tasks with known durations (`lib/engine/reference.js`), and runs a pre-mortem to surface forgotten work.
2. **Ensemble (LLM).** Two more estimators, a skeptic and a reference-class lens, re-size the same task list independently. Shipclock takes the median of each quantile, widens ranges to cover every estimator, and keeps their disagreement as a visible signal (`lib/llm/ensemble.js`).
3. **Agentic cost (ACEM-style).** Each task is tagged by how well an agent can carry it. Depending on how you build (by hand, AI-assisted, agentic), effort splits into agent work, costed in API tokens, and human work: the human-only part plus reviewing and fixing agent output.
4. **Simulate (your own algorithm).** `lib/engine/simulate.js` runs 4,000 seeded Monte Carlo trials. Each samples:
   - every task from a log-normal fitted to its range;
   - one shared "this is you" overrun factor, because overruns are correlated;
   - unlisted work discovered mid-build;
   - the hours you actually get each week;
   - a week you might abandon the project.

   The output is two curves ("if you keep going" and "counting the odds you quit"), deadline odds, hours, AI spend, each task's share of the uncertainty, and how much cutting each optional task helps.

Without an LLM, a keyword-based breakdown (`lib/engine/heuristic.js`) keeps the whole app working offline. It also gives an instant first forecast while Claude plans.

Every assumption lives in `lib/engine/reference.js`: workflow agent shares, oversight ratios, the planning-fallacy factor, and abandonment hazards seeded from hackathon follow-up studies. They are priors, meant to be re-fit once real outcome data exists.

## Run locally

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # engine and ensemble tests
```

## Configure the AI breakdown

Set these on your host (for example in Vercel project settings), never in client code:

- `ANTHROPIC_API_KEY`: enables the Claude ensemble (three calls per forecast).
- `SHIPCLOCK_MODEL`: optional, defaults to `claude-opus-5`.

The Claude calls use structured outputs, adaptive thinking, and server-side refusal fallbacks (`fallbacks: "default"`).

Alternatively, point it at any OpenAI-compatible endpoint with `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL`. Claude is used when both are set.

`POST /api/estimate` has a best-effort per-IP limit of 10 forecasts per 10 minutes. It is held in memory, so on serverless it is a speed bump rather than a quota; add a durable limiter before promoting the URL widely.
