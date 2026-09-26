import { normalizeBreakdown } from "../engine/breakdown.js";
import { PlanSchema, SizingSchema, planPrompt, sizingPrompt, SIZING_LENSES } from "./prompts.js";

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function vote(values, tieBreak) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const best = Math.max(...counts.values());
  return counts.get(tieBreak) === best ? tieBreak : [...counts].find(([, count]) => count === best)[0];
}

/**
 * Combine independent estimates of the same task list, forecasting-crowd style:
 * the median of each quantile, widened to cover every estimator's most-likely
 * value, with the spread between estimators kept as a disagreement signal.
 */
export function aggregateEstimates(plan, sizings) {
  const byId = new Map(plan.tasks.map((task) => [task.id, [{ hours: task.hours, agentFit: task.agentFit }]]));
  for (const sizing of sizings) {
    for (const estimate of sizing.estimates) byId.get(estimate.id)?.push(estimate);
  }

  return {
    ...plan,
    tasks: plan.tasks.map((task) => {
      const estimates = byId.get(task.id).filter((estimate) => estimate.hours.likely > 0);
      const likelies = estimates.map((estimate) => estimate.hours.likely);
      return {
        ...task,
        hours: {
          low: Math.min(median(estimates.map((estimate) => estimate.hours.low)), ...likelies),
          likely: median(likelies),
          high: Math.max(median(estimates.map((estimate) => estimate.hours.high)), ...likelies)
        },
        agentFit: vote(estimates.map((estimate) => estimate.agentFit), task.agentFit),
        disagreement: Math.max(...likelies) / Math.min(...likelies),
        estimators: estimates.length
      };
    })
  };
}

// One planner lays out the work (with a pre-mortem for hidden tasks), then
// independent estimators with different lenses re-size the same list in parallel.
export async function ensembleBreakdown(provider, project) {
  const plan = normalizeBreakdown(await provider.generate({ prompt: planPrompt(project), schema: PlanSchema, effort: "medium" }));
  if (plan.tasks.length === 0) throw new Error("The planner returned no tasks.");

  const results = await Promise.allSettled(
    Object.keys(SIZING_LENSES).map((lens) =>
      provider.generate({ prompt: sizingPrompt(project, plan.tasks, lens), schema: SizingSchema, effort: "low" })
    )
  );
  const sizings = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length) console.error("Sizing estimators failed:", failed.map((result) => result.reason?.message));

  return {
    breakdown: normalizeBreakdown(aggregateEstimates(plan, sizings)),
    estimators: 1 + sizings.length
  };
}
