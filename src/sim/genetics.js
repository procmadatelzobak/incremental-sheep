// ===========================================================================
//  Genetika na úrovni skupiny (populace s rozložením {mu, sigma} na gen).
// ===========================================================================
import { GENES, BALANCE } from '../config.js';
import { clamp } from '../rng.js';
import { selectTruncate, probit, phi } from './distribution.js';

// Efektivní strop genu (extrémní geny rostou s ceilingMult: fáze 5 + perky).
export function geneMax(key, ceilingMult = 1) {
  const spec = GENES[key];
  return spec.extreme ? spec.max * ceilingMult : spec.max;
}
export function geneMin(key, ceilingMult = 1) {
  const spec = GENES[key];
  // u "nižší je lepší" (gestation) povol klesat pod min se stoupajícím stropem
  return spec.lowerBetter ? spec.min / ceilingMult : spec.min;
}
export function clampGene(key, mu, ceilingMult = 1) {
  return clamp(mu, geneMin(key, ceilingMult), geneMax(key, ceilingMult));
}

// Startovní rozložení genů. quality 0..1 posune průměr k dobrému konci.
export function seedGroupGenes(quality = 0, ceilingMult = 1) {
  const g = {};
  for (const k in GENES) {
    const spec = GENES[k];
    let mu = spec.base;
    if (quality) {
      if (spec.lowerBetter) mu = spec.base - (spec.base - spec.min) * 0.6 * quality;
      else mu = spec.base + (spec.max - spec.base) * 0.6 * quality;
    }
    g[k] = { mu: clampGene(k, mu, ceilingMult), sigma: spec.sd };
  }
  return g;
}

// Normalizovaný breeding score 0..1 (1 = ideál ve všech genech).
export function breedingScore(genes, ceilingMult = 1) {
  let sum = 0, n = 0;
  for (const k in genes) {
    const spec = GENES[k];
    if (!spec) continue;             // přeskoč osiřelé geny ze starých savů
    const lo = geneMin(k, ceilingMult), hi = geneMax(k, ceilingMult);
    let norm = (genes[k].mu - lo) / (hi - lo || 1);
    if (spec.lowerBetter) norm = 1 - norm;
    sum += clamp(norm, 0, 1); n++;
  }
  return n ? sum / n : 0;
}

const sigmaFloor = (key) => GENES[key].mut * BALANCE.sigmaFloorMut;

// Selekce na jednom genu: usekni spodní (resp. horní) podíl p → posun μ, σ.
export function selectGene(group, key, p, ceilingMult = 1) {
  const spec = GENES[key];
  const d = group.genes[key];
  const r = selectTruncate(d.mu, d.sigma, p, !!spec.lowerBetter, sigmaFloor(key));
  d.mu = clampGene(key, r.mu, ceilingMult);
  d.sigma = r.sigma;
}

// Selekce na kompozitní skóre: posuň každý gen breeder's equation Δμ_k = w·σ·λ.
export function selectScore(group, p, ceilingMult = 1) {
  p = Math.max(0, Math.min(BALANCE.maxCutFrac, p));
  if (p <= 0) return;
  const keys = Object.keys(group.genes);
  const w = 1 / Math.sqrt(keys.length);
  const alpha = probit(p);
  const lambda = phi(alpha) / (1 - p);
  const sq = Math.sqrt(Math.max(0, 1 - w * w * lambda * (lambda - alpha)));
  for (const k of keys) {
    const spec = GENES[k];
    const d = group.genes[k];
    const dir = spec.lowerBetter ? -1 : 1;
    d.mu = clampGene(k, d.mu + dir * w * d.sigma * lambda, ceilingMult);
    d.sigma = Math.max(sigmaFloor(k), d.sigma * sq);
  }
}
