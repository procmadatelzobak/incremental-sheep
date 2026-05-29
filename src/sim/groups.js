// ===========================================================================
//  Skupiny: porážkové výnosy, automatická pravidla, selekční cyklus, CRUD.
// ===========================================================================
import { BALANCE, GENES } from '../config.js';
import { locEnv } from '../content/locations.js';
import { selectGene, selectScore, seedGroupGenes, clampGene } from './genetics.js';
import { selectTruncate, selectStabilizing } from './distribution.js';
import { emptyCounts } from './cohort.js';

const STAGE_MEAT = { adult: 1.0, old: 0.6, child: 0.25 };

function addInto(dst, src) { for (const k in src) dst[k] = (dst[k] || 0) + src[k]; }

// Výnosy z porážky n ovcí daného stádia (maso vždy; části od fáze 5).
export function slaughterYields(group, n, stage, ctx, state) {
  const env = locEnv(locOf(group, state));
  const sizeMu = group.genes.size.mu;
  const out = { meat: n * sizeMu * STAGE_MEAT[stage] * ctx.meatMult * (env.meatMult || 1) };
  if (state.phase >= 5) {
    out.bones = n * sizeMu * 0.4;
    out.skin = n * sizeMu * 0.3;
    out.brain = n * group.genes.intelligence.mu * 0.2;
  }
  return out;
}
function locOf(group, state) { return state.locations.find(l => l.id === group.locationId) || state.locations[0]; }

// Automatická pravidla (každý tik): poraž staré / samce-děti / přebytek samců.
export function applyPolicyKills(group, ctx, state) {
  const c = group.counts, pol = group.policy, y = {};
  if (pol.killOld) {
    const n = c.M.old + c.F.old;
    if (n > 0) { c.M.old = 0; c.F.old = 0; addInto(y, slaughterYields(group, n, 'old', ctx, state)); state.stats.culled += n; }
  }
  if (pol.killMaleChildren) {
    const n = c.M.child;
    if (n > 0) { c.M.child = 0; addInto(y, slaughterYields(group, n, 'child', ctx, state)); state.stats.culled += n; }
  }
  if (pol.maxMales > 0 && c.M.adult > pol.maxMales) {
    const n = c.M.adult - pol.maxMales;
    c.M.adult = pol.maxMales; addInto(y, slaughterYields(group, n, 'adult', ctx, state)); state.stats.culled += n;
  }
  return y;
}

// Selekční cyklus (každých cullPeriod s): usekni spodní podíl → posuň rozložení + maso/části.
export function applySelectionCull(group, ctx, state) {
  const pol = group.policy.cull;
  if (!pol || !pol.enabled || pol.cutFrac <= 0) return {};
  const p = Math.min(BALANCE.maxCutFrac, pol.cutFrac);
  const stage = pol.stage || 'adult';
  const n = (group.counts.M[stage] + group.counts.F[stage]) * p;
  if (n <= 0) return {};
  group.counts.M[stage] *= (1 - p);
  group.counts.F[stage] *= (1 - p);

  const hasMin = pol.min != null;
  const hasMax = pol.max != null;

  if ((hasMin || hasMax) && pol.gene !== 'breedingScore' && group.genes[pol.gene]) {
    const d = group.genes[pol.gene];
    const spec = GENES[pol.gene];
    const floor = spec.mut * BALANCE.sigmaFloorMut;
    if (hasMin && d.mu < pol.min) {
      const r = selectTruncate(d.mu, d.sigma, p, false, floor);
      d.mu = clampGene(pol.gene, r.mu, ctx.ceilingMult);
      d.sigma = r.sigma;
    } else if (hasMax && d.mu > pol.max) {
      const r = selectTruncate(d.mu, d.sigma, p, true, floor);
      d.mu = clampGene(pol.gene, r.mu, ctx.ceilingMult);
      d.sigma = r.sigma;
    } else {
      const r = selectStabilizing(d.mu, d.sigma, p, floor);
      d.mu = r.mu;
      d.sigma = r.sigma;
    }
  } else if (pol.gene === 'breedingScore') {
    selectScore(group, p, ctx.ceilingMult);
  } else {
    selectGene(group, pol.gene, p, ctx.ceilingMult);
  }

  state.stats.culled += n;
  return slaughterYields(group, n, stage, ctx, state);
}

// --- CRUD skupin (fáze 9 manažer) -----------------------------------------
export function createGroup(state, locationId, name) {
  const g = {
    id: state.nextGroupId++, name: name || ('Stádo ' + String.fromCharCode(64 + state.nextGroupId)),
    species: 'base', locationId: locationId || state.activeLocationId,
    genes: seedGroupGenes(0, 1), counts: emptyCounts(), bredFracF: 0,
    policy: { killOld: false, killMaleChildren: false, maxMales: 0, cull: { enabled: false, gene: 'woolRate', cutFrac: 0.2, stage: 'adult', min: null, max: null } },
  };
  state.groups.push(g);
  return g;
}

// Rozděl skupinu na dvě (polovina počtů, stejné rozložení genů).
export function splitGroup(state, groupId) {
  const src = state.groups.find(g => g.id === groupId);
  if (!src) return null;
  const dst = createGroup(state, src.locationId, src.name + '′');
  dst.genes = JSON.parse(JSON.stringify(src.genes));
  dst.bredFracF = src.bredFracF;
  for (const s of ['M', 'F']) for (const st of ['child', 'adult', 'old']) {
    const half = src.counts[s][st] / 2;
    src.counts[s][st] = half; dst.counts[s][st] = half;
  }
  return dst;
}
