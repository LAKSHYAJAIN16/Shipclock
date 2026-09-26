import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBreakdown } from "../lib/engine/breakdown.js";
import { heuristicBreakdown } from "../lib/engine/heuristic.js";
import { simulate } from "../lib/engine/simulate.js";

const tasks = heuristicBreakdown("Friends log in, connect Spotify, and an AI summarizes their taste. Stripe for premium.").tasks;
const base = { tasks, hoursPerWeek: 8, startDate: "2026-09-26", workflow: "assisted", trials: 2000 };

test("heuristic picks up the features named in the description", () => {
  const categories = tasks.map((task) => task.category);
  for (const expected of ["auth", "payments", "integration", "ai"]) assert.ok(categories.includes(expected), expected);
  assert.ok(!categories.includes("mobile"));
});

test("normalizeBreakdown clamps hostile model output", () => {
  const { tasks: [task] } = normalizeBreakdown({
    tasks: [{ name: "  x ", category: "rocket", agentFit: "always", hours: { low: 900, likely: -5, high: "lots" } }]
  });
  assert.equal(task.category, "other");
  assert.equal(task.agentFit, "medium");
  assert.ok(task.hours.low <= task.hours.likely && task.hours.likely < task.hours.high);
  assert.ok(task.hours.high <= 600);
});

test("same inputs give the same forecast", () => {
  assert.deepEqual(simulate(base).curve, simulate(base).curve);
});

test("curves are monotone and quitting never beats persisting", () => {
  const { curve, shipProbability } = simulate(base);
  for (let i = 1; i < curve.length; i += 1) {
    assert.ok(curve[i].shipped >= curve[i - 1].shipped);
    assert.ok(curve[i].persist >= curve[i - 1].persist);
    assert.ok(curve[i].shipped <= curve[i].persist);
  }
  assert.ok(shipProbability < 1, "abandonment should cap the ceiling below 100%");
});

test("more weekly hours ship sooner", () => {
  const slow = simulate({ ...base, hoursPerWeek: 4 });
  const fast = simulate({ ...base, hoursPerWeek: 16 });
  assert.ok(fast.persist.weeksP50 < slow.persist.weeksP50);
});

test("agentic workflows cut human hours but cost tokens; manual costs none", () => {
  const manual = simulate({ ...base, workflow: "manual" });
  const agentic = simulate({ ...base, workflow: "agentic" });
  assert.ok(agentic.hours.human.p50 < manual.hours.human.p50);
  assert.equal(manual.cost.tokens.p50, 0);
  assert.ok(agentic.cost.dollars.p50 > 0);
});

test("a hard deadline commitment ships more often than a hobby", () => {
  const hobby = simulate({ ...base, commitment: "fun" });
  const committed = simulate({ ...base, commitment: "deadline" });
  assert.ok(committed.shipProbability > hobby.shipProbability);
});

test("cutting a task leaves the other tasks' samples untouched", () => {
  const full = simulate(base);
  const cut = simulate({ ...base, tasks: tasks.slice(1) });
  assert.equal(cut.tasks[0].humanP50, full.tasks[1].humanP50);
});

test("uncertainty shares sum to one", () => {
  const total = simulate(base).tasks.reduce((sum, task) => sum + task.uncertaintyShare, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});
