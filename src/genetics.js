import { GENES } from './config.js';

let _idCounter = 1;
export function nextId() { return _idCounter++; }
export function seedIdCounter(n) { if (n >= _idCounter) _idCounter = n + 1; }

export function gaussian(mean = 0, sd = 1) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function randomGenes(quality = 0) {
  const g = {};
  for (const k in GENES) {
    const spec = GENES[k];
    let mean = spec.base;
    if (quality) {
      if (spec.lowerBetter) mean = spec.base - (spec.base - spec.min) * 0.6 * quality;
      else mean = spec.base + (spec.max - spec.base) * 0.6 * quality;
    }
    g[k] = clamp(gaussian(mean, spec.sd), spec.min, spec.max);
  }
  return g;
}

export function inherit(a, b) {
  const g = {};
  for (const k in GENES) {
    const spec = GENES[k];
    g[k] = clamp((a[k] + b[k]) / 2 + gaussian(0, spec.mut), spec.min, spec.max);
  }
  return g;
}

// Aggregate breeding value: average of normalized genes (0 = worst, 1 = best).
// Lower-is-better genes are inverted so higher score always means "better sheep".
export function breedingScore(genes) {
  let total = 0, n = 0;
  for (const k in GENES) {
    const spec = GENES[k];
    const norm = (genes[k] - spec.min) / (spec.max - spec.min);
    total += spec.lowerBetter ? (1 - norm) : norm;
    n++;
  }
  return total / n;
}
