// ===========================================================================
//  Herní tik. Jediná cesta, O(skupiny). Bez RNG v hot path.
// ===========================================================================
import { BALANCE, LOCATION_KINDS } from '../config.js';
import { getMults } from '../econ/economy.js';
import { applyProduced } from '../econ/storage.js';
import { aging, births, totalCount } from './cohort.js';
import { produce } from './production.js';
import { applyPolicyKills, applySelectionCull } from './groups.js';
import { locationCap, locEnv } from '../content/locations.js';
import { stepProjects } from '../content/projects.js';
import { checkPhase } from '../content/phases.js';
import { locationById } from '../io/state.js';

function addInto(dst, src) { for (const k in src) dst[k] = (dst[k] || 0) + src[k]; }

export function step(state, dt) {
  if (!(dt > 0)) return;
  state.meta.gameTime += dt;
  state.meta.totalGameTime += dt;
  const ctx = getMults(state);
  const produced = {};

  // kyslíková kapacita (fáze 6): podporovaný počet ovcí na lokacích bez vzduchu
  let o2Remaining = state.buys.oxygen * BALANCE.oxygenPerLevel;

  for (const g of state.groups) {
    const loc = locationById(state, g.locationId);
    if (!loc) continue;
    const env = locEnv(loc);
    let cap = locationCap(loc);
    if (env.oxygenRequired) {
      cap = Math.min(cap, o2Remaining);
      o2Remaining = Math.max(0, o2Remaining - totalCount(g));
    }
    aging(g, dt);
    const bctx = env.birthMult ? Object.assign({}, ctx, { birthMult: ctx.birthMult * env.birthMult }) : ctx;
    births(g, cap, dt, bctx);
    addInto(produced, applyPolicyKills(g, ctx, state));
    addInto(produced, produce(g, loc, dt, ctx, state));
  }

  // selekční cyklus (každých cullPeriod s)
  state._cullAcc += dt;
  let guard = 0;
  while (state._cullAcc >= BALANCE.cullPeriod && guard++ < 50) {
    state._cullAcc -= BALANCE.cullPeriod;
    for (const g of state.groups) addInto(produced, applySelectionCull(g, ctx, state));
  }

  applyProduced(state, produced, ctx);
  stepProjects(state, dt, ctx);

  let pop = 0;
  for (const g of state.groups) pop += totalCount(g);
  if (pop > state.stats.peakPop) state.stats.peakPop = pop;

  checkPhase(state);

  state.rates = {};
  for (const k in produced) state.rates[k] = produced[k] / dt;
  state.rates._pop = pop;
}
