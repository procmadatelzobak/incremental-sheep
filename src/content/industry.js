// Structural projects: work is supplied by a local, specialised herd and by
// physical materials.  There are deliberately no income or production buffs.
import { GENES, WORLDS } from '../config.js';
import { INDUSTRY, projectMemory } from './industry-config.js';
import { consumeRecipe } from './behemot.js';
import { worldCapacity, worldEnv, worldPopulation } from './locations.js';

const WORLDS_IN_ORDER = ['earth', 'moon', 'mars', 'jupiter', 'sphere'];
const BASE_COMPLETED = ['breeding', 'commerce', 'elixir', 'research', 'moon', 'mars', 'jupiter', 'judges'];

export function defaultIndustry() {
  const worlds = Object.fromEntries(WORLDS_IN_ORDER.map(key => [key, { level: 0, work: 0, pending: false }]));
  return { enabled: false, share: INDUSTRY.defaultShare, completed: Object.fromEntries(BASE_COMPLETED.map(key => [key, false])),
    work: {}, worlds, spent: {}, last: null };
}

function industry(state) { return state.industry; }
function adults(group) { return (group.counts?.M?.adult || 0) + (group.counts?.F?.adult || 0); }
function hasParcel(state, key) {
  const counts = state.land?.worlds?.[key]?.counts;
  return !!counts && Object.values(counts).some(n => Number(n) > 0);
}
function ownsWorld(state, key) { return !!WORLDS[key] && WORLDS[key].phase <= state.phase && hasParcel(state, key); }
function groupsAt(state, key) { return state.groups.filter(g => (g.worldId || 'earth') === key); }

function quality(group, profile) {
  const g = group.genes || {}, ratio = (key) => Math.max(0, (g[key]?.mu ?? GENES[key].base) / GENES[key].base);
  if (profile === 'textile') return Math.sqrt(ratio('woolRate') * ratio('woolQuality')) * Math.sqrt(Math.max(.1, GENES.maturity.base / (g.maturity?.mu ?? GENES.maturity.base)));
  if (profile === 'materials') return Math.sqrt(ratio('size') * ratio('lifespan'));
  if (profile === 'compute') return ratio('intelligence');
  if (profile === 'growth') return ratio('fertility') * Math.max(.1, GENES.gestation.base / (g.gestation?.mu ?? GENES.gestation.base));
  return 1;
}

// Capacity shortfall throttles workers on a world.  It does not kill sheep,
// which keeps a newly upgraded habitat smooth during offline catch-up.
export function getLaborRate(state, worldId, profile, phase = state.phase) {
  const groups = groupsAt(state, worldId);
  let n = 0, weighted = 0;
  for (const group of groups) { const count = adults(group); n += count; weighted += count * quality(group, profile); }
  if (!(n > 0)) return 0;
  const env = worldEnv(state, worldId);
  const environment = profile === 'textile' ? env.textileMult : profile === 'compute' ? env.computeMult : 1;
  const utilization = Math.min(1, n / INDUSTRY.staffThreshold);
  const support = worldPopulation(state, worldId) > 0 ? Math.min(1, worldCapacity(state, worldId) / worldPopulation(state, worldId)) : 1;
  const q = weighted / n;
  const memory = projectMemory(state);
  const builders = (phase === 7 || phase === 8) ? 1 + Math.log2(1 + (state.projects.dyson.builders || 0)) / INDUSTRY.construction.builderDivisor : 1;
  const laser = phase === 8 ? 1 + INDUSTRY.construction.laserScale * Math.log2(1 + state.projects.laser.level) : 1;
  return memory * builders * laser * utilization * (INDUSTRY.labor.qualityFloor + INDUSTRY.labor.qualityScale * Math.log2(1 + q)) * environment * support;
}

function bestRate(state, profile, phase) { return Math.max(...WORLDS_IN_ORDER.map(key => getLaborRate(state, key, profile, phase))); }
function judgesRate(state, phase) {
  const occupied = WORLDS_IN_ORDER.filter(key => adultsAt(state, key) > 0);
  if (occupied.length < INDUSTRY.jobs.judges.minOccupiedWorlds) return 0;
  const table = Object.fromEntries(occupied.map(w => [w, INDUSTRY.jobs.judges.distinctProfiles.map(p => getLaborRate(state, w, p, phase))]));
  let best = 0;
  for (const compute of occupied) for (const textile of occupied) for (const materials of occupied) {
    if (compute === textile || compute === materials || textile === materials) continue;
    const rates = [table[compute][0], table[textile][1], table[materials][2]];
    if (rates.every(rate => rate > 0)) best = Math.max(best, 3 / rates.reduce((sum, rate) => sum + 1 / rate, 0));
  }
  return best;
}
function adultsAt(state, key) { return groupsAt(state, key).reduce((sum, group) => sum + adults(group), 0); }

export const supportTarget = level => INDUSTRY.support.targetBase * Math.pow(INDUSTRY.support.targetGrowth, Math.max(0, level || 0));
export const maxSupportLevel = phase => Math.min(INDUSTRY.support.maxLevel, INDUSTRY.support.maxLimitBase + Math.max(0, (phase || 1) - INDUSTRY.support.maxLimitPhaseOffset) * INDUSTRY.support.maxLimitPhaseScale);
export function supportCost(state, key) {
  const level = industry(state)?.worlds?.[key]?.level || 0;
  return INDUSTRY.support.baseCost * Math.pow(INDUSTRY.support.costGrowth, level) * (INDUSTRY.support.worldPremiums[key] || 1);
}
export function upgradeSupport(state, key) {
  const ind = industry(state), rec = ind?.worlds?.[key];
  if (!rec || rec.pending || state.phase < 6 || !ownsWorld(state, key) || rec.level >= maxSupportLevel(state.phase)) return false;
  const cost = supportCost(state, key);
  if (!Number.isFinite(cost) || (state.resources?.credits || 0) < cost) return false;
  state.resources.credits -= cost;
  const spent = state.stats?.spent;
  if (spent) spent.support = (spent.support || 0) + cost;
  rec.pending = true; return true;
}

function simpleJob(ind, config) { return ind.completed[config.id] ? null : { ...config, progress: ind.work[config.id] || 0 }; }
export function phaseJob(state) {
  const ind = industry(state); if (!ind || state.phase < 2) return null;
  if (state.phase >= 2 && state.phase <= 5) return simpleJob(ind, INDUSTRY.jobs[['', '', 'breeding', 'commerce', 'elixir', 'research'][state.phase]]);
  if (state.phase === 6) {
    for (const key of INDUSTRY.jobs.colonization.sequence) if (!ind.completed[key]) return { id: key, label: INDUSTRY.jobs.colonization.labels[key], target: INDUSTRY.jobs.colonization.target, progress: ind.work[key] || 0, recipe: INDUSTRY.jobs.colonization.recipe, profile: INDUSTRY.jobs.colonization.profile, worldId: key };
    return null;
  }
  if (state.phase === 7 || state.phase === 8) {
    const d = state.projects.dyson, cfg = INDUSTRY.jobs.sphere; if (d.count >= cfg.maxCount) return null;
    const target = d.count ? cfg.subsequentBaseTarget * (1 + cfg.targetGrowth * d.count) : cfg.firstTarget;
    return { id: 'sphere', label: cfg.label, target, progress: d.progress || 0, recipe: d.count ? cfg.subsequentRecipe : cfg.firstRecipe, profile: cfg.profile, worldId: 'aggregate' };
  }
  if (state.phase === 9 && !ind.completed.judges) { const c = INDUSTRY.jobs.judges; return { ...c, progress: ind.work.judges || 0, profile: 'judges', worldId: 'multi' }; }
  if (state.phase === 10) return { id: 'blackhole', label: INDUSTRY.jobs.blackhole.label, target: state.prestige.threshold, progress: state.prestige.centralWarehouse || 0, recipe: { rawSell: 1 }, profile: 'materials', worldId: 'aggregate' };
  return null;
}

export function projectStatus(state) {
  const ind = industry(state), job = phaseJob(state), last = ind?.last || {};
  if (job) return { label: job.label, progress: job.progress, target: job.target, rate: last.id === job.id ? last.rate || 0 : 0, bottleneck: last.id === job.id ? last.bottleneck || 'none' : 'none', recipe: job.recipe };
  const pending = WORLDS_IN_ORDER.find(key => ind?.worlds?.[key]?.pending);
  if (pending) { const rec = ind.worlds[pending]; return { label: `Podpora: ${pending}`, progress: rec.work, target: supportTarget(rec.level), rate: last.supportWk === pending ? last.rate || 0 : 0, bottleneck: last.supportWk === pending ? last.bottleneck || 'none' : 'none', recipe: INDUSTRY.support.recipe }; }
  return { label: 'Žádný projekt', progress: 0, target: 0, rate: 0, bottleneck: 'none', recipe: {} };
}

function addJobWork(state, job, work) {
  const ind = industry(state), remaining = Math.max(0, job.target - job.progress), actual = Math.min(remaining, work);
  if (job.id === 'sphere') { state.projects.dyson.progress = Math.min(job.target, state.projects.dyson.progress + actual); ind.work.sphere = state.projects.dyson.progress; }
  else { ind.work[job.id] = Math.min(job.target, (ind.work[job.id] || 0) + actual); if (ind.work[job.id] >= job.target) ind.completed[job.id] = true; }
  return actual;
}
function jobRate(state, job) {
  if (job.id === 'sphere') return bestRate(state, job.profile, state.phase);
  if (job.id === 'judges') return judgesRate(state, state.phase);
  if (state.phase === 6 && (!ownsWorld(state, job.worldId) || adultsAt(state, job.worldId) < 1)) return 0;
  return getLaborRate(state, job.worldId, job.profile, state.phase);
}
function workJob(state, job, dt, produced, fraction) {
  const rate = jobRate(state, job);
  const desired = Math.min(Math.max(0, job.target - job.progress), rate * dt * fraction);
  const actual = desired > 0 ? consumeRecipe(state, produced, job.recipe, desired, 1) : 0;
  const done = addJobWork(state, job, actual);
  const bottleneck = !rate ? (state.phase === 6 ? (hasParcel(state, job.worldId) ? 'seed_required' : 'parcel_required') : job.id === 'judges' ? 'need_3_worlds' : 'no_workers') : actual < desired ? 'supply' : 'none';
  industry(state).last = { id: job.id, label: job.label, rate: done / dt, actualWork: done, bottleneck, recipe: job.recipe };
}
function workSupport(state, key, dt, produced, fraction) {
  const rec = industry(state).worlds[key], target = supportTarget(rec.level), rate = getLaborRate(state, key, 'materials', state.phase);
  const desired = Math.min(Math.max(0, target - rec.work), rate * dt * fraction);
  const actual = desired > 0 ? consumeRecipe(state, produced, INDUSTRY.support.recipe, desired, 1) : 0;
  rec.work += actual;
  if (rec.work >= target) { rec.level++; rec.work = 0; rec.pending = false; }
  if (!phaseJob(state)) industry(state).last = { id: `support_${key}`, supportWk: key, rate: actual / dt, actualWork: actual, bottleneck: !rate ? 'no_workers' : actual < desired ? 'supply' : 'none', recipe: INDUSTRY.support.recipe };
}
function stepBlackhole(state, dt, produced) {
  const target = state.prestige.threshold, current = state.prestige.centralWarehouse || 0, remaining = Math.max(0, target - current);
  const desired = Math.min(remaining, bestRate(state, 'materials', state.phase) * target / INDUSTRY.jobs.blackhole.timeDivisor * dt);
  let need = desired, actual = 0, share = Math.max(0, Math.min(1, Number(industry(state).share) || 0));
  for (const { key, value } of INDUSTRY.sellResources) {
    const prod = Math.max(0, (produced[key] || 0) * share), stock = Math.max(0, state.resources[key] || 0), take = Math.min(need / value, prod + stock);
    const fromProd = Math.min(take, prod); produced[key] = (produced[key] || 0) - fromProd; state.resources[key] = (state.resources[key] || 0) - (take - fromProd);
    industry(state).spent[key] = (industry(state).spent[key] || 0) + take;
    actual += take * value; need -= take * value; if (need <= 1e-12) break;
  }
  state.prestige.centralWarehouse = Math.min(target, current + actual);
  industry(state).last = { id: 'blackhole', rate: actual / dt, actualWork: actual, bottleneck: actual < desired ? 'supply' : 'transport', recipe: { rawSell: 1 } };
}

export function stepIndustry(state, dt, produced = {}, ctx = {}) {
  if (!(dt > 0) || !state.industry || state.phase === 11) return;
  if (state.phase === 10) {
    if (state.prestige?.armed) stepBlackhole(state, dt, produced);
    else state.industry.last = null;
    return;
  }
  const ind = industry(state); if (!ind.enabled) { ind.last = null; return; }
  // Reserve once, then share that budget between jobs. A second job must not
  // reserve another fraction of what the first job left behind.
  const share = Math.max(0, Math.min(1, ind.share));
  const pool = Object.fromEntries(Object.entries(produced).map(([key, amount]) => [key, amount * share]));
  const before = { ...pool };
  const job = phaseJob(state), pending = WORLDS_IN_ORDER.find(key => ind.worlds[key]?.pending);
  if (job) workJob(state, job, dt, pool, pending ? INDUSTRY.support.mainLaborFraction : 1);
  if (pending) workSupport(state, pending, dt, pool, job ? INDUSTRY.support.spareLaborFraction : 1);
  for (const key in before) produced[key] -= before[key] - (pool[key] || 0);
}
