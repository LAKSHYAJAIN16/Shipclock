// Seeded randomness so a forecast is reproducible: the same inputs always give
// the same curve, and toggling one task changes only that task's contribution.

export function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed) {
  let state = seed >>> 0;
  const uniform = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let spare = null;
  const normal = () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    while (u === 0) u = uniform();
    const v = uniform();
    const radius = Math.sqrt(-2 * Math.log(u));
    spare = radius * Math.sin(2 * Math.PI * v);
    return radius * Math.cos(2 * Math.PI * v);
  };

  return {
    uniform,
    normal,
    // Log-normal parameterised by its median, which is how people and models state estimates.
    lognormal: (median, sigma) => median * Math.exp(sigma * normal()),
    exponential: (rate) => -Math.log(1 - uniform()) / rate,
    poisson: (lambda) => {
      const limit = Math.exp(-lambda);
      let count = 0;
      let product = uniform();
      while (product > limit) {
        count += 1;
        product *= uniform();
      }
      return count;
    }
  };
}

// z-score of the 90th percentile: a p10–p90 range spans 2 × 1.2816 standard deviations.
export const Z90 = 1.2815515655446004;

export function quantile(sorted, q) {
  if (sorted.length === 0) return NaN;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}
