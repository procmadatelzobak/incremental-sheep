// ===========================================================================
//  Hráčské akce — jediné API, které volá UI. Každá vrací true/false (úspěch).
//  Nákupy za kredity vyprázdní obchodovatelný sklad (pravidlo lore §9).
// ===========================================================================
import { BALANCE, LOCATION_KINDS, PLANET_ORDER, UPGRADES, PERKS } from '../config.js';
import { costOf, upgradeCost, perkCost } from './economy.js';
import { emptyStorage } from './storage.js';
import { locationById, groupById, activeLocation } from '../io/state.js';
import { createGroup, splitGroup } from '../sim/groups.js';
import { claimSphere, sphereReady } from '../content/projects.js';
import { igniteBlackHole, triggerSingularity, canIgnite, singularityAvailable } from '../content/prestige.js';

const credits = (s) => s.resources.credits || 0;
function spend(state, amount) {
  if (credits(state) < amount) return false;
  state.resources.credits -= amount;
  emptyStorage(state);
  return true;
}

// --- ceny pro UI -----------------------------------------------------------
export function costFor(state, kind, ref) {
  switch (kind) {
    case 'addSheep':   return costOf(BALANCE.cost.addSheep, state.buys.addSheep);
    case 'expand':     return costOf(BALANCE.cost.expand, ref ? ref.level : 0);
    case 'density':    return costOf(BALANCE.cost.density, ref ? ref.density : 0);
    case 'newPasture': return costOf(BALANCE.cost.newPasture, state.buys.newPasture);
    case 'station':    return costOf(BALANCE.cost.station, state.buys.station);
    case 'warehouse':  return costOf(BALANCE.cost.warehouse, state.buys.warehouse);
    case 'oxygen':     return costOf(BALANCE.cost.oxygen, state.buys.oxygen);
    case 'builder':    return costOf(BALANCE.cost.builder, state.projects.dyson.builders);
    case 'laser':      return costOf(BALANCE.cost.laser, state.projects.laser.level);
    case 'immortality':return 1e7;
    default: return Infinity;
  }
}

// --- stáda / lokace --------------------------------------------------------
export function buyAddSheep(state) {
  const cost = costFor(state, 'addSheep');
  if (!spend(state, cost)) return false;
  const g = groupById(state, state.activeGroupId) || state.groups[0];
  g.counts.M.adult += 3; g.counts.F.adult += 3;
  state.buys.addSheep++;
  return true;
}
export function buyExpand(state, locId) {
  const loc = locationById(state, locId) || activeLocation(state);
  if (!spend(state, costFor(state, 'expand', loc))) return false;
  loc.level++;
  return true;
}
export function buyDensity(state, locId) {
  const loc = locationById(state, locId) || activeLocation(state);
  if (loc.density >= BALANCE.density.max) return false;
  if (!spend(state, costFor(state, 'density', loc))) return false;
  loc.density++;
  return true;
}
export function buyNewPasture(state) {
  if (state.phase < 2) return false;
  if (!spend(state, costFor(state, 'newPasture'))) return false;
  state.locations.push({ id: state.nextLocationId++, kind: 'pasture', name: 'Pastvina ' + (state.buys.newPasture + 1), level: 0, density: 0 });
  state.buys.newPasture++;
  return true;
}
export function buyStation(state) {
  if (state.phase < 6) return false;
  const kind = PLANET_ORDER[state.buys.station % PLANET_ORDER.length];
  if (!spend(state, costFor(state, 'station'))) return false;
  state.locations.push({ id: state.nextLocationId++, kind, name: LOCATION_KINDS[kind].label + ' ' + (state.buys.station + 1), level: 0, density: 0 });
  state.buys.station++;
  return true;
}

// --- vylepšení / perky -----------------------------------------------------
export function buyUpgrade(state, key) {
  const u = UPGRADES[key];
  if (!u || u.phase > state.phase) return false;
  if (!spend(state, upgradeCost(state, key))) return false;
  state.upgrades[key] = (state.upgrades[key] || 0) + 1;
  return true;
}
export function buyPerk(state, key) {
  const p = PERKS[key];
  if (!p) return false;
  const cost = perkCost(state, key);
  if ((state.prestige.knowledge || 0) < cost) return false;
  state.prestige.knowledge -= cost;
  state.prestige.perks[key] = (state.prestige.perks[key] || 0) + 1;
  return true;
}

// --- fáze 6+: sklad, kyslík; fáze 7+: stavitelé; fáze 8+: laser; sféra ------
export function buyWarehouse(state) {
  if (state.phase < 6) return false;
  if (!spend(state, costFor(state, 'warehouse'))) return false;
  state.storage.warehouseLevel++; state.buys.warehouse++;
  return true;
}
export function buyOxygen(state) {
  if (state.phase < 6) return false;
  if (!spend(state, costFor(state, 'oxygen'))) return false;
  state.buys.oxygen++;
  return true;
}
export function buyBuilder(state) {
  if (state.phase < 7) return false;
  if (!spend(state, costFor(state, 'builder'))) return false;
  state.projects.dyson.builders++;
  return true;
}
export function buyLaser(state) {
  if (state.phase < 8) return false;
  if (!spend(state, costFor(state, 'laser'))) return false;
  state.projects.laser.level++;
  return true;
}
export function doClaimSphere(state) { return claimSphere(state); }

// --- fáze 4: nápoj nesmrtelnosti ------------------------------------------
export function craftImmortality(state) {
  if (state.phase < 4 || state.flags.immortal) return false;
  if (!spend(state, costFor(state, 'immortality'))) return false;
  state.flags.immortal = true;
  return true;
}

// --- fáze 9: manažer skupin ------------------------------------------------
export function addGroup(state) {
  if (state.phase < 9) return false;
  return !!createGroup(state, state.activeLocationId);
}
export function doSplitGroup(state, groupId) {
  if (state.phase < 9) return false;
  return !!splitGroup(state, groupId);
}

// --- selekce / pravidla ----------------------------------------------------
export function setCull(state, groupId, patch) {
  const g = groupById(state, groupId); if (!g) return false;
  Object.assign(g.policy.cull, patch);
  return true;
}
export function togglePolicy(state, groupId, key) {
  const g = groupById(state, groupId); if (!g) return false;
  g.policy[key] = !g.policy[key];
  return true;
}
export function setMaxMales(state, groupId, n) {
  const g = groupById(state, groupId); if (!g) return false;
  g.policy.maxMales = Math.max(0, n | 0);
  return true;
}
export function setAutotrade(state, res, frac) {
  state.storage.autotrade[res] = Math.max(0, Math.min(1, frac));
  return true;
}

// --- prestiž ---------------------------------------------------------------
export function armBlackHole(state) {
  if (state.phase < 10) return false;
  state.prestige.armed = !state.prestige.armed;
  return true;
}
export function doIgnite(state) { return igniteBlackHole(state) > 0; }
export function doSingularity(state) { return triggerSingularity(state); }

export { canIgnite, singularityAvailable, sphereReady };
