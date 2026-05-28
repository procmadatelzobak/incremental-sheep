// ===========================================================================
//  Herní tik. Jediná cesta, O(skupiny). Kapacita je sdílená přes všechny pozemky.
// ===========================================================================
import { BALANCE } from '../config.js';
import { getMults } from '../econ/economy.js';
import { applyProduced } from '../econ/storage.js';
import { aging, births, totalCount } from './cohort.js';
import { produce } from './production.js';
import { applyPolicyKills, applySelectionCull } from './groups.js';
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
  for (const g of state.groups) aging(g, edt);

  // 2) porody ze SDÍLENÉ kapacity (rozloha × hustota × modifikátory)
  let pop = 0;
  for (const g of state.groups) pop += totalCount(g);
  const bctx = (ctx.env.birthMult && ctx.env.birthMult !== 1) ? Object.assign({}, ctx, { birthMult: ctx.birthMult * ctx.env.birthMult }) : ctx;
  for (const g of state.groups) {
    const headroom = Math.max(0, cap - pop);
    pop += births(g, headroom, edt, bctx);
  }

  // 3) automatika (porážky) + produkce
  for (const g of state.groups) {
    addInto(produced, applyPolicyKills(g, ctx, state));
    addInto(produced, produce(g, edt, ctx, state));
  }

  // 4) selekční cyklus (zrychluje se po elixíru spolu s časem)
  state._cullAcc += edt;
  let guard = 0;
  while (state._cullAcc >= BALANCE.cullPeriod && guard++ < 50) {
    state._cullAcc -= BALANCE.cullPeriod;
    for (const g of state.groups) addInto(produced, applySelectionCull(g, ctx, state));
  }

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
  state.rates._popGrowth = (total - popStart) / dt;          // čistá změna stáda /s (trend #11)
  state.rates._income = ((state.resources.credits || 0) - credBefore) / dt;  // příjem kreditů /s (#11)
  state.rates._speed = sp;
}
