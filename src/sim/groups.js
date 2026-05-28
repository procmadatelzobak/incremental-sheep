// ===========================================================================
//  Skupiny: porážkové výnosy, automatická pravidla, selekční cyklus, CRUD.
// ===========================================================================
import { BALANCE } from '../config.js';
import { locEnv } from '../content/locations.js';
import { selectGene, selectScore, seedGroupGenes } from './genetics.js';
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
// Chrání chovné jádro (min. dospělých samic/samců) a zaznamená výsledek do _lastSel.
export function applySelectionCull(group, ctx, state) {
  const pol = group.policy.cull;
  if (!pol || !pol.enabled || pol.cutFrac <= 0) return {};
  let p = Math.min(BALANCE.maxCutFrac, pol.cutFrac);
  const stage = pol.stage || 'adult';
  const c = group.counts;
  const pr = group.policy.protect;
  if (stage === 'adult' && pr && pr.enabled) {     // bezpečnostní brzda
    const allowF = c.F.adult > 0 ? Math.max(0, 1 - (pr.minF || 0) / c.F.adult) : 0;
    const allowM = c.M.adult > 0 ? Math.max(0, 1 - (pr.minM || 0) / c.M.adult) : 0;
    p = Math.min(p, allowF, allowM);
  }
  const gk = pol.gene === 'breedingScore' ? null : pol.gene;
  const before = gk ? { mu: group.genes[gk].mu, sigma: group.genes[gk].sigma } : null;
  const n = (c.M[stage] + c.F[stage]) * p;
  let y = {};
  if (p > 0 && n > 0) {
    c.M[stage] *= (1 - p);
    c.F[stage] *= (1 - p);
    if (pol.gene === 'breedingScore') selectScore(group, p, ctx.ceilingMult);
    else selectGene(group, pol.gene, p, ctx.ceilingMult);
    state.stats.culled += n;
    y = slaughterYields(group, n, stage, ctx, state);
  }
  group._lastSel = {
    n, meat: y.meat || 0, gene: pol.gene, stage,
    muBefore: before ? before.mu : null, muAfter: gk ? group.genes[gk].mu : null,
    sigBefore: before ? before.sigma : null, sigAfter: gk ? group.genes[gk].sigma : null,
  };
  return y;
}

// --- CRUD skupin (fáze 9 manažer) -----------------------------------------
export function createGroup(state, locationId, name) {
  const g = {
    id: state.nextGroupId++, name: name || ('Stádo ' + String.fromCharCode(64 + state.nextGroupId)),
    species: 'base', locationId: locationId || state.activeLocationId,
    genes: seedGroupGenes(0, 1), counts: emptyCounts(), bredFracF: 0,
    policy: { killOld: false, killMaleChildren: false, maxMales: 0, cull: { enabled: false, gene: 'woolRate', cutFrac: 0.2, stage: 'adult' }, protect: { enabled: true, minF: 8, minM: 2 } },
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
