// ===========================================================================
//  Skupiny: porážkové výnosy (maso/části), automatická pravidla, CRUD.
// ===========================================================================
import { seedGroupGenes } from './genetics.js';
import { emptyCounts, totalCount } from './cohort.js';
import { mixNormal } from './distribution.js';
import { defaultSoil } from './soil.js';
import { WORLDS } from '../config.js';
import { HABITATS } from '../content/habitats.js';

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
  if (!state || !state.groups || state.groups.length >= HABITATS.maxGroups) return null;
  const g = {
    id: state.nextGroupId++, name: name || ('Stádo ' + String.fromCharCode(64 + state.nextGroupId)),
    species: 'base',
    genes: seedGroupGenes(0, 1), counts: emptyCounts(), bredFracF: 0,
    worldId: 'earth',
    policy: { killOld: false, killMaleChildren: false, maxMales: 0, autoMales: false, femalesPerMale: 8, slaughterBeforeOld: false, cull: { enabled: false, gene: 'woolRate', cutFrac: 0.2 } },
    soil: defaultSoil(),
  };
  state.groups.push(g);
  return g;
}

// Rozděl skupinu na dvě (polovina počtů, stejné rozložení genů).
export function splitGroup(state, groupId) {
  const src = state.groups.find(g => g.id === groupId);
  if (!src) return null;
  const dst = createGroup(state, src.name + '′');
  if (!dst) return null;
  dst.genes = JSON.parse(JSON.stringify(src.genes));
  dst.bredFracF = src.bredFracF;
  dst.worldId = src.worldId || 'earth';
  dst.policy = JSON.parse(JSON.stringify(src.policy));
  dst.soil = Object.assign(defaultSoil(), src.soil);   // odštěpek dědí kvalitu i nastavení půdy
  for (const s of ['M', 'F']) for (const st of ['child', 'adult', 'old']) {
    const half = src.counts[s][st] / 2;
    src.counts[s][st] = half; dst.counts[s][st] = half;
  }
  return dst;
}

function copyGroupFraction(state, src, fraction, name) {
  const dst = createGroup(state, name || (src.name + '′'));
  if (!dst) return null;
  dst.genes = JSON.parse(JSON.stringify(src.genes));
  dst.bredFracF = src.bredFracF;
  dst.policy = JSON.parse(JSON.stringify(src.policy));
  dst.soil = Object.assign(defaultSoil(), src.soil);
  dst.worldId = src.worldId || 'earth';
  for (const sex of ['M', 'F']) for (const stage of ['child', 'adult', 'old']) {
    const moved = src.counts[sex][stage] * fraction;
    src.counts[sex][stage] -= moved;
    dst.counts[sex][stage] = moved;
  }
  return dst;
}

// Move all or part of a herd after Exodus.  A partial move becomes a real
// group so every newborn still has exactly one local capacity and environment.
export function moveGroup(state, groupId, worldId, fraction = 1) {
  if (!state || state.phase < 6 || !state.land || !state.land.worlds || !state.land.worlds[worldId] || !WORLDS[worldId] || WORLDS[worldId].phase > state.phase) return null;
  const src = state.groups.find(g => g.id === groupId);
  if (!src) return null;
  if ((src.worldId || 'earth') === worldId) return null;
  const part = Number(fraction);
  if (!Number.isFinite(part) || !(part > 0) || part > 1) return null;
  // A colony must exist before a herd can be assigned to it.  This prevents a
  // zero-cost group split from standing in for a real Exodus decision.
  let area = 0;
  const target = state.land.worlds[worldId];
  for (const tier in target.counts || {}) area += (target.counts[tier] || 0) * ((WORLDS[worldId].tiers[tier] || {}).area || 0);
  if (!(area > 0)) return null;
  if (totalCount(src) * part < 1) return null;
  if (part >= 1) { src.worldId = worldId; return src; }
  const dst = copyGroupFraction(state, src, part, src.name + ' → ' + worldId);
  if (!dst) return null;
  dst.worldId = worldId;
  return dst;
}

// Merge only co-located herds.  Mixing normals preserves both population and
// the within/between-herd variance, rather than silently averaging sigma.
export function mergeGroups(state, fromId, toId) {
  if (!state || state.phase < 6 || fromId === toId) return null;
  const from = state.groups.find(g => g.id === fromId);
  const to = state.groups.find(g => g.id === toId);
  if (!from || !to || (from.worldId || 'earth') !== (to.worldId || 'earth')) return null;
  const nFrom = totalCount(from), nTo = totalCount(to);
  for (const key of Object.keys(to.genes)) {
    if (!from.genes[key]) continue;
    const mixed = mixNormal(nTo, to.genes[key].mu, to.genes[key].sigma, nFrom, from.genes[key].mu, from.genes[key].sigma);
    to.genes[key] = { mu: mixed.mu, sigma: mixed.sigma };
  }
  for (const sex of ['M', 'F']) for (const stage of ['child', 'adult', 'old']) to.counts[sex][stage] += from.counts[sex][stage];
  const fertileTo = to.counts.F.adult - from.counts.F.adult; // counts have already been combined
  const fertileFrom = from.counts.F.adult;
  to.bredFracF = fertileTo + fertileFrom > 0
    ? (to.bredFracF * fertileTo + from.bredFracF * fertileFrom) / (fertileTo + fertileFrom) : 0;
  const toSoil = Object.assign(defaultSoil(), to.soil);
  const fromSoil = Object.assign(defaultSoil(), from.soil);
  to.soil = Object.assign(toSoil, { q: nTo + nFrom > 0 ? (toSoil.q * nTo + fromSoil.q * nFrom) / (nTo + nFrom) : 0 });
  state.groups.splice(state.groups.indexOf(from), 1);
  if (state.activeGroupId === fromId) state.activeGroupId = toId;
  return to;
}
