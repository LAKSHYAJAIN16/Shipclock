import { createRng, hashString, quantile, Z90 } from "./random.js";
import {
  CAPACITY, COMMITMENT, DISCOVERY, DOLLARS_PER_MTOK, EXPERIENCE, HORIZON_WEEKS, INFRA_MONTHLY,
  OVERSIGHT_SIGMA, PERSONAL_FACTOR, TEAM, TOKENS_SIGMA, WORKFLOWS
} from "./reference.js";

const DAY_MS = 86_400_000;

export function parseDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addWeeks(start, weeks) {
  return new Date(start.getTime() + Math.round(weeks * 7) * DAY_MS);
}

function sigmaFor(hours) {
  return Math.max(0.15, Math.log(hours.high / hours.low) / (2 * Z90));
}

export function weeklyHazard({ commitment, team, hoursPerWeek }) {
  const base = (COMMITMENT[commitment] || COMMITMENT.serious).weeklyHazard;
  const teamMultiplier = (TEAM[team] || TEAM.solo).hazardMultiplier;
  // Projects that only get an hour or two a week lose momentum faster.
  const lowCapacityMultiplier = hoursPerWeek < 4 ? 1.3 : 1;
  return base * teamMultiplier * lowCapacityMultiplier;
}

/**
 * Monte Carlo forecast. Each trial samples:
 *  - one shared personal factor (overruns are correlated across tasks),
 *  - every task's by-hand effort from a log-normal fitted to its p10/likely/p90,
 *  - how much of it an agent does and what that costs the human in oversight (ACEM's HITL term),
 *  - unlisted work discovered mid-build,
 *  - realised hours per calendar week,
 *  - and a week at which the builder walks away.
 * The project ships in a trial only if the work finishes before the walk-away week.
 */
export function simulate(input) {
  const {
    tasks, workflow = "assisted", experience = "some", commitment = "serious", team = "solo",
    hoursPerWeek = 8, startDate, deadline, trials = 4000, seed = 1
  } = input;

  const start = parseDate(startDate) || parseDate(isoDate(new Date()));
  const deadlineDate = deadline ? parseDate(deadline) : null;
  const deadlineWeeks = deadlineDate ? (deadlineDate - start) / (7 * DAY_MS) : null;
  const mode = WORKFLOWS[workflow] || WORKFLOWS.assisted;
  const experienceMultiplier = (EXPERIENCE[experience] || EXPERIENCE.some).multiplier;
  const capacity = Math.max(0.5, Number(hoursPerWeek) || 8);
  const hazard = weeklyHazard({ commitment, team, hoursPerWeek: capacity });

  // Each task gets its own random stream, so including or cutting one task never reshuffles the others.
  const taskStreams = tasks.map((task) => createRng(hashString(`${seed}:${task.id}`)));
  const taskSigmas = tasks.map((task) => sigmaFor(task.hours));
  // Fixed draws per trial, so the personal factor and walk-away week line up across plan edits.
  const person = createRng(hashString(`${seed}:person`));
  const discovery = createRng(hashString(`${seed}:discovery`));
  const calendar = createRng(hashString(`${seed}:calendar`));

  const finishWeeks = new Float64Array(trials);
  const shippedWeeks = new Float64Array(trials);
  const humanHours = new Float64Array(trials);
  const byHandHours = new Float64Array(trials);
  const agentHours = new Float64Array(trials);
  const oversightHours = new Float64Array(trials);
  const tokens = new Float64Array(trials);
  const taskHuman = tasks.map(() => new Float64Array(trials));

  for (let trial = 0; trial < trials; trial += 1) {
    const personal = person.lognormal(PERSONAL_FACTOR.median, PERSONAL_FACTOR.sigma);
    const abandonWeek = person.exponential(hazard);
    let human = 0;
    let byHand = 0;
    let agent = 0;
    let oversight = 0;
    let trialTokens = 0;

    const addWork = (effort, fit, rng) => {
      const share = mode.agentShare[fit] ?? 0;
      const oversightRatio = mode.oversight > 0 ? rng.lognormal(mode.oversight, OVERSIGHT_SIGMA) : 0;
      const agentPart = effort * share;
      const humanPart = effort * (1 - share) + agentPart * oversightRatio;
      byHand += effort;
      agent += agentPart;
      oversight += agentPart * oversightRatio;
      human += humanPart;
      if (agentPart > 0) trialTokens += agentPart * rng.lognormal(mode.tokensPerAgentHour, TOKENS_SIGMA);
      return humanPart;
    };

    tasks.forEach((task, index) => {
      const rng = taskStreams[index];
      const effort = rng.lognormal(task.hours.likely * experienceMultiplier, taskSigmas[index]) * personal;
      taskHuman[index][trial] = addWork(effort, task.agentFit, rng);
    });

    const discovered = discovery.poisson(DISCOVERY.tasksPerListedTask * tasks.length);
    for (let i = 0; i < discovered; i += 1) {
      addWork(discovery.lognormal(DISCOVERY.medianHours * experienceMultiplier, DISCOVERY.sigma) * personal, "medium", discovery);
    }

    let remaining = human;
    let finish = Infinity;
    for (let week = 0; week < HORIZON_WEEKS; week += 1) {
      const realised = capacity * calendar.lognormal(CAPACITY.realisedMedian, CAPACITY.sigma);
      if (realised >= remaining) {
        finish = week + remaining / realised;
        break;
      }
      remaining -= realised;
    }

    finishWeeks[trial] = finish;
    shippedWeeks[trial] = finish <= abandonWeek ? finish : Infinity;
    humanHours[trial] = human;
    byHandHours[trial] = byHand;
    agentHours[trial] = agent;
    oversightHours[trial] = oversight;
    tokens[trial] = trialTokens;
  }

  const sortedFinish = Float64Array.from(finishWeeks).sort();
  const sortedShipped = Float64Array.from(shippedWeeks).sort();
  const sorted = (values) => Float64Array.from(values).sort();
  const share = (values, limit) => countAtMost(values, limit) / trials;
  const toDate = (weeks) => (Number.isFinite(weeks) ? isoDate(addWeeks(start, weeks)) : null);

  const finishP95 = quantile(sortedFinish, 0.95);
  const lastWeek = Math.min(
    HORIZON_WEEKS,
    Math.max(4, Math.ceil((Number.isFinite(finishP95) ? finishP95 : HORIZON_WEEKS) * 1.15) + 1, deadlineWeeks ? Math.ceil(deadlineWeeks) + 2 : 0)
  );
  const curve = [];
  for (let week = 0; week <= lastWeek; week += 1) {
    curve.push({
      week,
      date: toDate(week),
      shipped: countAtMost(sortedShipped, week) / trials,
      persist: countAtMost(sortedFinish, week) / trials
    });
  }

  const totalHumanVariance = taskHuman.reduce((sum, values) => sum + variance(values), 0) || 1;
  const sortedTokens = sorted(tokens);
  const categories = new Set(tasks.map((task) => task.category));
  const infraMonthly = [...categories].reduce((sum, category) => sum + (INFRA_MONTHLY[category] || 0), 0);

  return {
    trials,
    startDate: isoDate(start),
    hazard,
    shipProbability: countAtMost(sortedShipped, HORIZON_WEEKS) / trials,
    persist: {
      p50: toDate(quantile(sortedFinish, 0.5)),
      p80: toDate(quantile(sortedFinish, 0.8)),
      p95: toDate(finishP95),
      weeksP50: quantile(sortedFinish, 0.5),
      weeksP80: quantile(sortedFinish, 0.8)
    },
    shipped: {
      p50: toDate(firstWeekReaching(sortedShipped, trials, 0.5)),
      p80: toDate(firstWeekReaching(sortedShipped, trials, 0.8))
    },
    deadline: deadlineDate
      ? { date: isoDate(deadlineDate), weeks: deadlineWeeks, shipped: share(sortedShipped, deadlineWeeks), persist: share(sortedFinish, deadlineWeeks) }
      : null,
    hours: {
      human: percentiles(sorted(humanHours)),
      byHand: percentiles(sorted(byHandHours)),
      agent: percentiles(sorted(agentHours)),
      oversight: percentiles(sorted(oversightHours))
    },
    cost: {
      tokens: percentiles(sortedTokens),
      dollars: { p50: (quantile(sortedTokens, 0.5) / 1e6) * DOLLARS_PER_MTOK, p90: (quantile(sortedTokens, 0.9) / 1e6) * DOLLARS_PER_MTOK },
      infraMonthly
    },
    tasks: tasks.map((task, index) => ({
      id: task.id,
      humanP50: quantile(sorted(taskHuman[index]), 0.5),
      uncertaintyShare: variance(taskHuman[index]) / totalHumanVariance
    })),
    curve
  };
}

// For each optional task still in the plan: how much sooner (or more likely) you ship without it.
export function cutImpacts(input) {
  const base = simulate({ ...input, trials: 1500 });
  return input.tasks.filter((task) => task.optional).map((task) => {
    const without = simulate({ ...input, trials: 1500, tasks: input.tasks.filter((other) => other.id !== task.id) });
    return {
      id: task.id,
      weeksSaved: base.persist.weeksP80 - without.persist.weeksP80,
      deadlineGain: base.deadline ? without.deadline.shipped - base.deadline.shipped : null
    };
  });
}

function countAtMost(sortedValues, limit) {
  let low = 0;
  let high = sortedValues.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sortedValues[mid] <= limit) low = mid + 1;
    else high = mid;
  }
  return low;
}

function firstWeekReaching(sortedShipped, trials, probability) {
  const index = Math.ceil(probability * trials) - 1;
  return index < sortedShipped.length ? sortedShipped[index] : Infinity;
}

function percentiles(sortedValues) {
  return { p10: quantile(sortedValues, 0.1), p50: quantile(sortedValues, 0.5), p90: quantile(sortedValues, 0.9) };
}

function variance(values) {
  let mean = 0;
  for (const value of values) mean += value;
  mean /= values.length;
  let total = 0;
  for (const value of values) total += (value - mean) ** 2;
  return total / values.length;
}
