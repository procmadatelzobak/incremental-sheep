import { GENES } from './config.js';

let _idCounter = 1;
export function nextId() { return _idCounter++; }
export function seedIdCounter(n) { if (n >= _idCounter) _idCounter = n + 1; }

// Box-Muller normal sample.
export function gaussian(mean = 0, sd = 1) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Fresh sheep genes. quality 0 = baseline; quality>0 shifts each mean toward its "good" end.
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

// Offspring = parent average + gaussian mutation that can exceed both parents,
// so player selection (who breeds / who is culled) keeps pushing the frontier.
export function inherit(a, b) {
  const g = {};
  for (const k in GENES) {
    const spec = GENES[k];
    g[k] = clamp((a[k] + b[k]) / 2 + gaussian(0, spec.mut), spec.min, spec.max);
  }
  return g;
}
