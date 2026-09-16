// ===========================================================================
//  Herní tik. Jediná cesta, O(skupiny). Stáda sdílejí kapacitu svého světa.
// ===========================================================================
import { BALANCE, WORLD_ORDER } from '../config.js';
import { getMults } from '../econ/economy.js';
import { applyProduced } from '../econ/storage.js';
import { applyProcessing } from '../econ/processing.js';
import { aging, births, totalCount } from './cohort.js';
import { produce } from './production.js';
import { stepSoil } from './soil.js';
import { applyPolicyKills, slaughterYields } from './groups.js';
import { herdCapacity, worldEnv, worldCapacity, worldPopulation } from '../content/locations.js';
import { stepProjects } from '../content/projects.js';
import { checkPhase } from '../content/phases.js';
import { updateRecords, checkAchievements } from '../content/achievements.js';
import { stepBehemot } from '../content/behemot.js';
import { stepIndustry } from '../content/industry.js';
import { updateStory } from '../content/story.js';

function addInto(dst, src) { for (const k in src) dst[k] = (dst[k] || 0) + src[k]; }

export function step(state, dt) {
  if (!(dt > 0)) return;
  state.meta.gameTime += dt;
  state.meta.totalGameTime += dt;
  const ctx = getMults(state);
  ctx.phase = state.phase;
  const produced = {};


  // Po vypití elixíru nesmrtelnosti se simulace násobně zrychlí (#7).
  const sp = state.flags.immortal ? (BALANCE.immortalSpeed + BALANCE.immortalSpeedPerPhase * Math.max(0, state.phase - 4)) : 1;
  const edt = dt * sp;                   // zrychlený čas pro stárnutí/porody/produkci/selekci

  let popStart = 0;
  for (const g of state.groups) popStart += totalCount(g);

  // 1) stárnutí všech stád
  for (const g of state.groups) state.stats.died += aging(g, edt);

  // Birth headroom is allocated proportionally to reproductive demand.  Herd
  // iteration order therefore cannot steal a world's remaining capacity.
  const local = new Map();
  for (const wk of WORLD_ORDER) {
    const population = worldPopulation(state, wk);
    const capacity = worldCapacity(state, wk);
    local.set(wk, { headroom: Math.max(0, capacity - population),
      support: population > 0 ? Math.min(1, capacity / population) : 1, demand: 0 });
  }
  const requests = state.groups.map(g => {
    const wk = g.worldId || 'earth', env = worldEnv(state, wk), place = local.get(wk);
    const context = { ...ctx, env, birthMult: ctx.birthMult * env.birthMult };
    const mated = Math.min(g.counts.F.adult, g.counts.M.adult * Math.max(0, g.genes.fertility.mu + ctx.fertBonus));
    const demand = mated / Math.max(1, g.genes.gestation.mu * ctx.breedMult) * edt * context.birthMult;
    place.demand += demand;
    return { g, context, place, demand };
  });
  for (const { g, context, place, demand } of requests) {
    const allocated = place.demand > 0 ? Math.min(demand, place.headroom * demand / place.demand) : 0;
    const r = births(g, allocated, edt, context);
    state.stats.born += r.born;
    if (r.killed > 1e-12) {
      state.stats.culled += r.killed;
      state.stats.selected = (state.stats.selected || 0) + r.killed;
      addInto(produced, slaughterYields(g, r.killed, 'child', context, state));
    }
  }

  for (const { g, context, place } of requests) {
    addInto(produced, applyPolicyKills(g, context, state));
    addInto(produced, produce(g, edt * place.support, context, state));
    const leftBobky = stepSoil(g, edt, state);
    if (leftBobky > 0) produced.bobky = (produced.bobky || 0) + leftBobky;
  }
  applyProcessing(produced, state);     // vlna→sukno, mléko→sýr (fáze 3+, dle Tkalcoven)

  const credBefore = state.resources.credits || 0;
  stepProjects(state, dt, ctx);
  stepBehemot(state, dt, produced);
  stepIndustry(state, dt, produced, ctx);
  applyProduced(state, produced, ctx);

  let total = 0;
  for (const g of state.groups) total += totalCount(g);
  if (total > state.stats.peakPop) state.stats.peakPop = total;

  const prevPhase = state.phase;
  checkPhase(state);
  if (state.phase > prevPhase) {
    state._phaseUp = state._phaseUp || [];
    for (let p = prevPhase + 1; p <= state.phase; p++) state._phaseUp.push(p);
  }

  updateStory(state);
  updateRecords(state);
  const newAch = checkAchievements(state);
  if (newAch.length) { state._achUp = (state._achUp || []).concat(newAch.map(a => a.id)); }

  state.rates = {};
  for (const k in produced) state.rates[k] = produced[k] / dt;
  state.rates._pop = total;
  const inst = (total - popStart) / dt;
  state.rates._popGrowth = inst;                              // čistá změna stáda /s (trend #11)
  // Vyhlazený růst (EMA, ~3 s): surový růst kmitá kolem nuly u kapacity i při
  // přesýpání kohort, takže UI hlášky podle něj přerušovaně poskakovaly (#36).
  // Drží se mimo rates (to se každý tik maže) a strip _* ho nesaveuje.
  const aSmooth = 1 - Math.exp(-dt / 3);
  state._popGrowthAvg = (state._popGrowthAvg == null) ? inst : state._popGrowthAvg + aSmooth * (inst - state._popGrowthAvg);
  state.rates._popGrowthAvg = state._popGrowthAvg;
  state.rates._income = ((state.resources.credits || 0) - credBefore) / dt;  // příjem kreditů /s (#11)
  state.rates._speed = sp;
}
