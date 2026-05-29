// ===========================================================================
//  Herní tik. Jediná cesta, O(skupiny). Kapacita je sdílená přes všechny pozemky.
// ===========================================================================
import { BALANCE } from '../config.js';
import { getMults } from '../econ/economy.js';
import { applyProduced } from '../econ/storage.js';
import { applyProcessing } from '../econ/processing.js';
import { aging, births, totalCount } from './cohort.js';
import { produce } from './production.js';
import { applyPolicyKills, slaughterYields } from './groups.js';
import { herdCapacity, worldEnv } from '../content/locations.js';
import { stepProjects } from '../content/projects.js';
import { checkPhase } from '../content/phases.js';
import { updateRecords, checkAchievements } from '../content/achievements.js';

function addInto(dst, src) { for (const k in src) dst[k] = (dst[k] || 0) + src[k]; }

export function step(state, dt) {
  if (!(dt > 0)) return;
  state.meta.gameTime += dt;
  state.meta.totalGameTime += dt;
  const ctx = getMults(state);
  ctx.env = worldEnv(state);            // produkční prostředí (vážený průměr světů)
  const produced = {};
  const cap = herdCapacity(state);

  // Po vypití elixíru nesmrtelnosti se simulace násobně zrychlí (#7).
  const sp = state.flags.immortal ? (BALANCE.immortalSpeed + BALANCE.immortalSpeedPerPhase * Math.max(0, state.phase - 4)) : 1;
  const edt = dt * sp;                   // zrychlený čas pro stárnutí/porody/produkci/selekci

  let popStart = 0;
  for (const g of state.groups) popStart += totalCount(g);

  // 1) stárnutí všech stád
  for (const g of state.groups) state.stats.died += aging(g, edt);

  // 2) porody ze SDÍLENÉ kapacity (rozloha × hustota × modifikátory)
  let pop = 0;
  for (const g of state.groups) pop += totalCount(g);
  const bctx = (ctx.env.birthMult && ctx.env.birthMult !== 1) ? Object.assign({}, ctx, { birthMult: ctx.birthMult * ctx.env.birthMult }) : ctx;
  for (const g of state.groups) {
    const headroom = Math.max(0, cap - pop);
    const r = births(g, headroom, edt, bctx);
    pop += r.born;
    state.stats.born += r.born;
    // výběr při narození: vyřazená jehňata jdou rovnou na maso/části (#18)
    if (r.killed > 1e-12) {
      state.stats.culled += r.killed;
      addInto(produced, slaughterYields(g, r.killed, 'child', ctx, state));
    }
  }

  // 3) automatika (porážky) + produkce
  for (const g of state.groups) {
    addInto(produced, applyPolicyKills(g, ctx, state));
    addInto(produced, produce(g, edt, ctx, state));
  }
  applyProcessing(produced, state);     // vlna→sukno, mléko→sýr (fáze 3+, dle Tkalcoven)

  const credBefore = state.resources.credits || 0;
  applyProduced(state, produced, ctx);
  stepProjects(state, edt, ctx);

  let total = 0;
  for (const g of state.groups) total += totalCount(g);
  if (total > state.stats.peakPop) state.stats.peakPop = total;

  const prevPhase = state.phase;
  checkPhase(state);
  if (state.phase > prevPhase) {
    state._phaseUp = state._phaseUp || [];
    for (let p = prevPhase + 1; p <= state.phase; p++) state._phaseUp.push(p);
  }

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
