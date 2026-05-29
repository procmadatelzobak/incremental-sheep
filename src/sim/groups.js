// ===========================================================================
//  Skupiny: porážkové výnosy (maso/části), automatická pravidla, CRUD.
// ===========================================================================
import { seedGroupGenes } from './genetics.js';
import { emptyCounts } from './cohort.js';

const STAGE_MEAT = { adult: 1.0, old: 0.6, child: 0.25 };

function addInto(dst, src) { for (const k in src) dst[k] = (dst[k] || 0) + src[k]; }

// Výnosy z porážky n ovcí daného stádia (maso vždy; části od fáze 5).
export function slaughterYields(group, n, stage, ctx, state) {
  const env = ctx.env || {};
  const sizeMu = group.genes.size.mu;
  const out = { meat: n * sizeMu * STAGE_MEAT[stage] * ctx.meatMult * (env.meatMult || 1) };
  if (state.phase >= 5) {
    out.bones = n * sizeMu * 0.4;
    out.skin = n * sizeMu * 0.3;
    out.brain = n * group.genes.intelligence.mu * 0.2;
  }
  return out;
}

// Efektivní strop dospělých samců (Jatka #33): z poměru samic/samec, nebo starý ruční limit.
export function maleCapOf(group) {
  const pol = group.policy;
  if (pol.autoMales) return Math.max(1, Math.ceil(group.counts.F.adult / Math.max(1, pol.femalesPerMale || 8)));
  return pol.maxMales || 0;     // 0 = bez limitu
}

// Automatická pravidla (každý tik): poraž staré (před zestárnutím) / samce-děti / přebytek samců.
export function applyPolicyKills(group, ctx, state) {
  const c = group.counts, pol = group.policy, y = {};
  // Staré ovce: „porážka před zestárnutím" dává plný (dospělý) výnos masa; starý
  // killOld (legacy) jen výnos starého. Nová volba má přednost.
  if (pol.slaughterBeforeOld) {
    const n = c.M.old + c.F.old;
    if (n > 0) { c.M.old = 0; c.F.old = 0; addInto(y, slaughterYields(group, n, 'adult', ctx, state)); state.stats.culled += n; }
  } else if (pol.killOld) {
    const n = c.M.old + c.F.old;
    if (n > 0) { c.M.old = 0; c.F.old = 0; addInto(y, slaughterYields(group, n, 'old', ctx, state)); state.stats.culled += n; }
  }
  if (pol.killMaleChildren) {
    const n = c.M.child;
    if (n > 0) { c.M.child = 0; addInto(y, slaughterYields(group, n, 'child', ctx, state)); state.stats.culled += n; }
  }
  const cap = maleCapOf(group);
  if (cap > 0 && c.M.adult > cap) {
    const n = c.M.adult - cap;
    c.M.adult = cap; addInto(y, slaughterYields(group, n, 'adult', ctx, state)); state.stats.culled += n;
  }
  return y;
}

// --- CRUD skupin (fáze 9 manažer) -----------------------------------------
export function createGroup(state, name) {
  const g = {
    id: state.nextGroupId++, name: name || ('Stádo ' + String.fromCharCode(64 + state.nextGroupId)),
    species: 'base',
    genes: seedGroupGenes(0, 1), counts: emptyCounts(), bredFracF: 0,
    policy: { killOld: false, killMaleChildren: false, maxMales: 0, autoMales: false, femalesPerMale: 8, slaughterBeforeOld: false, cull: { enabled: false, gene: 'woolRate', cutFrac: 0.2, min: null, max: null } },
  };
  state.groups.push(g);
  return g;
}

// Rozděl skupinu na dvě (polovina počtů, stejné rozložení genů).
export function splitGroup(state, groupId) {
  const src = state.groups.find(g => g.id === groupId);
  if (!src) return null;
  const dst = createGroup(state, src.name + '′');
  dst.genes = JSON.parse(JSON.stringify(src.genes));
  dst.bredFracF = src.bredFracF;
  for (const s of ['M', 'F']) for (const st of ['child', 'adult', 'old']) {
    const half = src.counts[s][st] / 2;
    src.counts[s][st] = half; dst.counts[s][st] = half;
  }
  return dst;
}
