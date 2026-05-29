// ===========================================================================
//  Genetika na úrovni skupiny (populace s rozložením {mu, sigma} na gen).
// ===========================================================================
import { GENES, BALANCE } from '../config.js';
import { clamp } from '../rng.js';
import { selectTruncate, selectStabilizing, probit, phi } from './distribution.js';

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

// Výběr při narození (#18): rozložení vybraných jehňat pro gen `key`.
// Z novorozeneckého N(muNb, sigNb) usekne spodní podíl p (resp. horní u lowerBetter)
// → vybraná jehňata mají vyšší μ a nižší σ. breedingScore posune všechny geny mírně.
// Nahrazuje cyklický culling: posun se děje spojitě, jak se rodí jehňata.
export function selectedNewbornDist(key, muNb, sigNb, cull, ceilingMult = 1, nGenes = 1) {
  if (!cull || !cull.enabled || !(cull.cutFrac > 0)) return { mu: muNb, sigma: sigNb };
  const spec = GENES[key];
  if (!spec) return { mu: muNb, sigma: sigNb };
  const p = Math.max(0, Math.min(BALANCE.maxCutFrac, cull.cutFrac));
  const floor = sigmaFloor(key);
  if (cull.gene === 'breedingScore') {
    const w = 1 / Math.sqrt(Math.max(1, nGenes));
    const alpha = probit(p);
    const lambda = phi(alpha) / (1 - p);
    const sq = Math.sqrt(Math.max(0, 1 - w * w * lambda * (lambda - alpha)));
    const dir = spec.lowerBetter ? -1 : 1;
    return { mu: clampGene(key, muNb + dir * w * sigNb * lambda, ceilingMult), sigma: Math.max(floor, sigNb * sq) };
  }
  if (key === cull.gene) {
    // Stabilizační koridor (#40): drž μ stáda v [min, max].
    // Mimo koridor → řízená selekce zpět dovnitř; uvnitř → stabilizace (μ drží, σ se utahuje).
    // Koridor přebíjí přirozený směr genu (lowerBetter).
    const hasMin = cull.min != null, hasMax = cull.max != null;
    if (hasMin && muNb < cull.min) {
      const r = selectTruncate(muNb, sigNb, p, false, floor);   // tlač μ nahoru k min
      return { mu: clampGene(key, r.mu, ceilingMult), sigma: r.sigma };
    }
    if (hasMax && muNb > cull.max) {
      const r = selectTruncate(muNb, sigNb, p, true, floor);    // tlač μ dolů k max
      return { mu: clampGene(key, r.mu, ceilingMult), sigma: r.sigma };
    }
    if (hasMin || hasMax) {
      const r = selectStabilizing(muNb, sigNb, p, floor);       // uvnitř koridoru → jen utáhni σ
      return { mu: muNb, sigma: r.sigma };
    }
    const r = selectTruncate(muNb, sigNb, p, !!spec.lowerBetter, floor);
    return { mu: clampGene(key, r.mu, ceilingMult), sigma: r.sigma };
  }
  return { mu: muNb, sigma: sigNb };
}
