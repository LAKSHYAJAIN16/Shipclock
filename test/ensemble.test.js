import test from "node:test";
import assert from "node:assert/strict";
import { aggregateEstimates, ensembleBreakdown } from "../lib/llm/ensemble.js";

const plan = {
  summary: "",
  risks: [],
  premortem: [],
  tasks: [{ id: "auth", name: "Auth", category: "auth", hours: { low: 2, likely: 4, high: 10 }, agentFit: "high", optional: false, why: "" }]
};

test("aggregate takes medians and widens the range to every estimator's likely value", () => {
  const [task] = aggregateEstimates(plan, [
    { estimates: [{ id: "auth", hours: { low: 3, likely: 8, high: 16 }, agentFit: "medium" }] },
    { estimates: [{ id: "auth", hours: { low: 1, likely: 5, high: 9 }, agentFit: "medium" }, { id: "ghost", hours: { low: 1, likely: 1, high: 1 }, agentFit: "low" }] }
  ]).tasks;
  assert.equal(task.hours.likely, 5);
  assert.equal(task.hours.low, 2);
  assert.equal(task.hours.high, 10);
  assert.equal(task.agentFit, "medium");
  assert.equal(task.disagreement, 2);
});

test("ensemble survives a failed estimator and sanitises the result", async () => {
  let call = 0;
  const provider = {
    async generate() {
      call += 1;
      if (call === 1) return { ...plan, tasks: [{ ...plan.tasks[0], hours: { low: 2, likely: 4, high: 9999 } }] };
      if (call === 2) throw new Error("timeout");
      return { estimates: [{ id: "auth", hours: { low: 2, likely: 6, high: 12 }, agentFit: "high" }] };
    }
  };
  const { breakdown, estimators } = await ensembleBreakdown(provider, { description: "an app with login" });
  assert.equal(estimators, 2);
  assert.equal(breakdown.tasks[0].hours.likely, 5);
  assert.ok(breakdown.tasks[0].hours.high <= 600);
});
