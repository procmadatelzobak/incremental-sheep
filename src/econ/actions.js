// ===========================================================================
//  Hráčské akce — jediné API, které volá UI. Každá vrací true/false (úspěch).
//  Nákupy za kredity vyprázdní obchodovatelný sklad (pravidlo lore §9).
// ===========================================================================
import { BALANCE, LOCATION_KINDS, PLANET_ORDER, UPGRADES, PERKS } from '../config.js';
import { fmt } from '../format.js';
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
    case 'immortality':return 1e9;
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

// --- autobuyer -------------------------------------------------------------
export function setAutobuy(state, key, on) {
  if (!state.settings.autobuy) state.settings.autobuy = { sheep: false, land: false, upgrades: false, sphere: false };
  state.settings.autobuy[key] = !!on;
  return true;
}

// Kupuje nejlevnější dostupnou věc v zapnutých kategoriích, dokud je z čeho.
// Pozastaveno při nasávání do černé díry (ať jde střádat).
export function runAutobuy(state) {
  const ab = state.settings.autobuy;
  if (!ab || state.prestige.armed) return;
  let guard = 0;
  while (guard++ < 80) {
    const opts = [];
    if (ab.sheep) opts.push([costFor(state, 'addSheep'), () => buyAddSheep(state)]);
    if (ab.land) {
      for (const loc of state.locations) {
        opts.push([costFor(state, 'expand', loc), () => buyExpand(state, loc.id)]);
        if (loc.density < BALANCE.density.max) opts.push([costFor(state, 'density', loc), () => buyDensity(state, loc.id)]);
      }
      if (state.phase >= 2) opts.push([costFor(state, 'newPasture'), () => buyNewPasture(state)]);
      if (state.phase >= 6) {
        opts.push([costFor(state, 'station'), () => buyStation(state)]);
        opts.push([costFor(state, 'warehouse'), () => buyWarehouse(state)]);
        opts.push([costFor(state, 'oxygen'), () => buyOxygen(state)]);
      }
    }
    if (ab.upgrades) for (const k in UPGRADES) if (UPGRADES[k].phase <= state.phase) opts.push([upgradeCost(state, k), () => buyUpgrade(state, k)]);
    if (ab.sphere && state.phase >= 7) opts.push([costFor(state, 'builder'), () => buyBuilder(state)]);

    let best = null;
    const cr = credits(state);
    for (const o of opts) if (o[0] <= cr && (!best || o[0] < best[0])) best = o;
    if (!best || best[1]() === false) break;
  }
  if (ab.sphere && state.phase >= 7) doClaimSphere(state);
}

// --- doporučený další krok (pro HUD) --------------------------------------
function cheapestUseful(s) {
  const opts = [];
  for (const k in UPGRADES) if (UPGRADES[k].phase <= s.phase) opts.push({ label: UPGRADES[k].label, cost: upgradeCost(s, k) });
  for (const loc of s.locations) {
    opts.push({ label: 'Rozšířit ' + loc.name, cost: costFor(s, 'expand', loc) });
    if (loc.density < BALANCE.density.max) opts.push({ label: 'Hustota ' + loc.name, cost: costFor(s, 'density', loc) });
  }
  opts.push({ label: 'Ovce', cost: costFor(s, 'addSheep') });
  if (s.phase >= 2) opts.push({ label: 'Pastvina', cost: costFor(s, 'newPasture') });
  let best = null;
  for (const o of opts) if (!best || o.cost < best.cost) best = o;
  return best;
}

export function suggestStep(s) {
  const cr = credits(s);
  if (singularityAvailable(s)) return '★ Dosáhni singularity! (záložka Prestiž)';
  if (s.phase >= 10) {
    if (canIgnite(s)) return 'Zažehni černou díru! (Prestiž)';
    if (s.prestige.armed) return 'Sklad se plní k černé díře… vyčkej';
    return 'Zapni „Nasávat produkci" (Prestiž) a střádej';
  }
  if (s.phase === 4 && !s.flags.immortal) {
    const c = costFor(s, 'immortality');
    return cr >= c ? 'Vyrob nápoj nesmrtelnosti (Stáda)' : `Našetři ${fmt(c)} na nesmrtelnost`;
  }
  if (s.phase === 6 && s.buys.station < 3) {
    const c = costFor(s, 'station');
    return cr >= c ? `Postav stanici (zbývají ${3 - s.buys.station})` : `Našetři ${fmt(c)} na stanici (Stanice)`;
  }
  if (s.phase === 7 && s.projects.dyson.count < 1) return sphereReady(s) ? 'Dokonči Dysonovu sféru! (Stanice)' : 'Kupuj stavitele sféry (Stanice)';
  if (s.phase === 8 && s.projects.dyson.count < 5) return sphereReady(s) ? 'Dokonči další sféru! (Stanice)' : 'Stav další sféry — stavitelé/laser (Stanice)';
  const best = cheapestUseful(s);
  if (!best) return 'Nech stádo růst a šlechti (Stáda)';
  return cr >= best.cost ? `Kup: ${best.label} (${fmt(best.cost)})` : `Našetři na ${best.label} (${fmt(best.cost)})`;
}

export { canIgnite, singularityAvailable, sphereReady };
