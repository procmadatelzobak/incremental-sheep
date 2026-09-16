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

// These profiles are selection goals, not generic production upgrades.  Their
// weights are normalised below so adding a gene does not make selection magic.
// A negative direction is expressed by the gene's lowerBetter flag; textile
// deliberately values slower maturation because it improves wool quality.
export const CULL_PROFILES = {
  growth: { fertility: 1.2, gestation: 1.2, maturity: 0.7, lifespan: 0.35 },
  textile: { woolRate: 1.1, woolQuality: 1.3, maturity: -0.7 },
  materials: { size: 1.25, lifespan: 0.45, fertility: 0.3 },
  compute: { intelligence: 1.5, lifespan: 0.35, maturity: 0.25 },
};

const profileWeightCache = new Map();

export function cullProfileWeights(geneId, phase = Infinity) {
  const id = String(geneId || '');
  const cacheKey = `${id}:${phase}`;
  if (profileWeightCache.has(cacheKey)) return profileWeightCache.get(cacheKey);
  const raw = id.startsWith('profile:') ? CULL_PROFILES[id.slice(8)] : null;
  if (!raw) return null;
  const unlocked = Object.entries(raw).filter(([key]) => GENES[key] && GENES[key].phase <= phase);
  const magnitude = Math.sqrt(unlocked.reduce((sum, [, weight]) => sum + weight * weight, 0));
  const weights = !(magnitude > 0) ? {} : Object.fromEntries(unlocked.map(([key, weight]) => [key, weight / magnitude]));
  const frozen = Object.freeze(weights);
  profileWeightCache.set(cacheKey, frozen);
  return frozen;
}

const scoreWeightCache = new Map();
function scoreWeights(cull, phase) {
  if (!cull) return null;
  const profile = cullProfileWeights(cull.gene, phase);
  if (profile) return profile;
  if (cull.gene !== 'breedingScore') return null;
  const cacheKey = `breedingScore:${phase}`;
  if (scoreWeightCache.has(cacheKey)) return scoreWeightCache.get(cacheKey);
  const unlocked = Object.keys(GENES).filter(key => GENES[key].phase <= phase);
  const weight = unlocked.length ? 1 / Math.sqrt(unlocked.length) : 0;
  const weights = Object.freeze(Object.fromEntries(unlocked.map(key => [key, weight])));
  scoreWeightCache.set(cacheKey, weights);
  return weights;
}

// Výběr při narození (#18): rozložení vybraných jehňat pro gen `key`.
// Z novorozeneckého N(muNb, sigNb) usekne spodní podíl p (resp. horní u lowerBetter)
// → vybraná jehňata mají vyšší μ a nižší σ. breedingScore posune všechny geny mírně.
// Nahrazuje cyklický culling: posun se děje spojitě, jak se rodí jehňata.
export function selectedNewbornDist(key, muNb, sigNb, cull, ceilingMult = 1, nGenes = 1, phase = Infinity) {
  if (!cull || !cull.enabled || !(cull.cutFrac > 0)) return { mu: muNb, sigma: sigNb };
  const spec = GENES[key];
  if (!spec) return { mu: muNb, sigma: sigNb };
  const p = Math.max(0, Math.min(BALANCE.maxCutFrac, cull.cutFrac));
  const floor = sigmaFloor(key);
  const weights = scoreWeights(cull, phase);
  if (weights) {
    // A profile can intentionally request the low end of a high-is-better gene
    // (textile's slow maturation).  lowerBetter remains the default direction.
    const signedWeight = weights[key] || 0;
    if (!(signedWeight !== 0)) return { mu: muNb, sigma: sigNb };
    const w = Math.abs(signedWeight);
    const alpha = probit(p);
    const lambda = phi(alpha) / (1 - p);
    const sq = Math.sqrt(Math.max(0, 1 - w * w * lambda * (lambda - alpha)));
    const dir = signedWeight < 0 ? -1 : (spec.lowerBetter ? -1 : 1);
    return { mu: clampGene(key, muNb + dir * w * sigNb * lambda, ceilingMult), sigma: Math.max(floor, sigNb * sq) };
  }
  if (key === cull.gene) {
    if (spec.phase > phase) return { mu: muNb, sigma: sigNb };
    const r = selectTruncate(muNb, sigNb, p, !!spec.lowerBetter, floor);
    return { mu: clampGene(key, r.mu, ceilingMult), sigma: r.sigma };
  }
  return { mu: muNb, sigma: sigNb };
}
