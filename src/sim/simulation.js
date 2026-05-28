// ===========================================================================
//  Herní tik. Jediná cesta, O(skupiny). Kapacita je sdílená přes všechny pozemky.
// ===========================================================================
import { BALANCE } from '../config.js';
import { getMults } from '../econ/economy.js';
import { applyProduced } from '../econ/storage.js';
import { aging, births, totalCount } from './cohort.js';
import { produce } from './production.js';
import { applyPolicyKills, applySelectionCull } from './groups.js';
import { herdCapacity, locEnv } from '../content/locations.js';
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
  const cap = herdCapacity(state);

  // 1) stárnutí všech stád
  for (const g of state.groups) aging(g, dt);

  // 2) porody ze SDÍLENÉ kapacity (víc pozemků = víc místa)
  let pop = 0;
  for (const g of state.groups) pop += totalCount(g);
  for (const g of state.groups) {
    const loc = locationById(state, g.locationId);
    const env = loc ? locEnv(loc) : {};
    const bctx = env.birthMult ? Object.assign({}, ctx, { birthMult: ctx.birthMult * env.birthMult }) : ctx;
    const headroom = Math.max(0, cap - pop);
    pop += births(g, headroom, dt, bctx);
  }

  // 3) automatika (porážky) + produkce
  for (const g of state.groups) {
    const loc = locationById(state, g.locationId);
    addInto(produced, applyPolicyKills(g, ctx, state));
    addInto(produced, produce(g, loc, dt, ctx, state));
  }

  // 4) selekční cyklus (každých cullPeriod s)
  state._cullAcc += dt;
  let guard = 0;
  while (state._cullAcc >= BALANCE.cullPeriod && guard++ < 50) {
    state._cullAcc -= BALANCE.cullPeriod;
    for (const g of state.groups) addInto(produced, applySelectionCull(g, ctx, state));
  }

  applyProduced(state, produced, ctx);
  stepProjects(state, dt, ctx);

  let total = 0;
  for (const g of state.groups) total += totalCount(g);
  if (total > state.stats.peakPop) state.stats.peakPop = total;

  checkPhase(state);

  state.rates = {};
  for (const k in produced) state.rates[k] = produced[k] / dt;
  state.rates._pop = total;
}
