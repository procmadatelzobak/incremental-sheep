// ===========================================================================
//  Hráčské akce — jediné API, které volá UI. Každá vrací true/false (úspěch).
//  Nákupy za kredity vyprázdní obchodovatelný sklad (pravidlo lore §9).
// ===========================================================================
import { BALANCE, UPGRADES, upgradeName, PERKS, WORLDS, WORLD_ORDER, AREA_MODS } from '../config.js';
import { fmt } from '../format.js';
import { costOf, upgradeCost, perkCost } from './economy.js';
import { emptyStorage } from './storage.js';
import { groupById } from '../io/state.js';
import { createGroup, splitGroup } from '../sim/groups.js';
import { seedGroupGenes } from '../sim/genetics.js';
import { mixNormal } from '../sim/distribution.js';
import { totalCount } from '../sim/cohort.js';
import { claimSphere, sphereReady } from '../content/projects.js';
import { igniteBlackHole, triggerSingularity, canIgnite, singularityAvailable } from '../content/prestige.js';
import { landParcelCost, tierUnlockCost, canUnlockTier, densityCost, areaModCost, densityPhaseCap, worldsColonized } from '../content/locations.js';
import { barter, toggleItem, useItem, setBarterFrac } from '../content/behemot.js';

const credits = (s) => s.resources.credits || 0;
function spend(state, amount) {
  if (credits(state) < amount) return false;
  state.resources.credits -= amount;
  emptyStorage(state);
  return true;
}

// --- ceny pro UI (jednoduché úrovňové; rozloha/hustota mají vlastní fce) ----
export function costFor(state, kind) {
  const voyage = Math.max(0.3, 1 - 0.15 * ((state.prestige.perks && state.prestige.perks.voyage) || 0));
  switch (kind) {
    case 'addSheep':   return costOf(BALANCE.cost.addSheep, state.buys.addSheep);
    case 'warehouse':  return costOf(BALANCE.cost.warehouse, state.buys.warehouse);
    case 'builder':    return Math.floor(costOf(BALANCE.cost.builder, state.projects.dyson.builders) * voyage);
    case 'laser':      return costOf(BALANCE.cost.laser, state.projects.laser.level);
    case 'immortality':return BALANCE.immortalityCost;
    default: return Infinity;
  }
}

// --- stáda: nákup ovcí s volbou pohlaví (M/F/mix) a množství (#7) ----------
export function addSheepCost(state, qty) {
  qty = Math.max(1, (qty || (state.settings.buy && state.settings.buy.qty) || 1) | 0);
  let cost = 0;
  for (let i = 0; i < qty; i++) cost += costOf(BALANCE.cost.addSheep, state.buys.addSheep + i);
  return Math.floor(cost);
}
export function buyAddSheep(state, sex, qty) {
  sex = sex || (state.settings.buy && state.settings.buy.sex) || 'mix';
  qty = Math.max(1, (qty || (state.settings.buy && state.settings.buy.qty) || 1) | 0);
  if (!spend(state, addSheepCost(state, qty))) return false;
  const g = groupById(state, state.activeGroupId) || state.groups[0];
  const total = qty * BALANCE.sheepPerUnit;
  // Tržní ovce mají běžné (bazální) geny s přirozeným rozptylem. Přimícháme je do
  // rozložení stáda vážené počty (#40) — tím se po 99% cullingu obnoví σ ("ředění
  // krve"): mu se zředí k základu, sigma se rozšíří. U velkého stáda je dopad malý.
  const existing = totalCount(g);
  const market = seedGroupGenes(0, state.world.ceilingMult || 1);
  for (const k in g.genes) {
    if (!market[k]) continue;
    g.genes[k] = mixNormal(existing, g.genes[k].mu, g.genes[k].sigma, total, market[k].mu, market[k].sigma);
  }
  if (sex === 'M') g.counts.M.adult += total;
  else if (sex === 'F') g.counts.F.adult += total;
  else { g.counts.M.adult += total / 2; g.counts.F.adult += total / 2; }
  state.buys.addSheep += qty;
  return true;
}
export function setBuy(state, patch) {
  if (!state.settings.buy) state.settings.buy = { sex: 'mix', qty: 1 };
  Object.assign(state.settings.buy, patch);
  return true;
}

// --- pozemky: rozloha (per svět), hustota (globální), modifikátory ----------
export function buyLand(state, wk) {
  const w = WORLDS[wk];
  if (!w || w.phase > state.phase || w.fromProject) return false;
  if (!spend(state, landParcelCost(state, wk))) return false;
  const t = state.land.worlds[wk];
  t.counts[t.tier] = (t.counts[t.tier] || 0) + 1;
  return true;
}
export function unlockTier(state, wk) {
  const w = WORLDS[wk];
  if (!w || w.fromProject || !canUnlockTier(state, wk)) return false;
  if (!spend(state, tierUnlockCost(state, wk))) return false;
  const t = state.land.worlds[wk];
  t.tier++;
  t.counts[t.tier] = (t.counts[t.tier] || 0) + 1;   // první parcela nového tieru
  return true;
}
export function buyDensity(state) {
  if (state.land.density >= densityPhaseCap(state)) return false;   // fázová brána hustoty
  if (!spend(state, densityCost(state))) return false;
  state.land.density++;
  return true;
}
export function buyAreaMod(state, key) {
  const mod = AREA_MODS.find(m => m.key === key);
  if (!mod || mod.phase > state.phase || state.land.mods[key]) return false;
  if (!spend(state, areaModCost(state, key))) return false;
  state.land.mods[key] = true;
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

// --- fáze 6+: sklad; fáze 7+: stavitelé; fáze 8+: laser; sféra -------------
export function buyWarehouse(state) {
  if (state.phase < 6) return false;
  if (!spend(state, costFor(state, 'warehouse'))) return false;
  state.storage.warehouseLevel++; state.buys.warehouse++;
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
  return !!createGroup(state);
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
export function setFemalesPerMale(state, groupId, n) {
  const g = groupById(state, groupId); if (!g) return false;
  g.policy.femalesPerMale = Math.max(1, n | 0);
  return true;
}
export function setAutotrade(state, res, frac) {
  state.storage.autotrade[res] = Math.max(0, Math.min(1, frac));
  return true;
}

// --- Behemot Emporio: barter za suroviny (NE kredity → NEvyprázdní sklad, §9 výjimka) ---
export function behemotBarter(state, id) { return barter(state, id); }
export function behemotToggle(state, id) { return toggleItem(state, id); }
export function behemotUse(state, id) { return useItem(state, id); }
export function behemotSetFrac(state, res, frac) { return setBarterFrac(state, res, frac); }
export { behemotSpam, behemotSetContainment, behemotReconcile } from '../content/behemot.js';   // spam (E3) + okov/usmíření (E6)

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
    if (ab.sheep) opts.push([costFor(state, 'addSheep'), () => buyAddSheep(state, 'mix', 1)]);
    if (ab.land) {
      for (const wk of WORLD_ORDER) {
        if (WORLDS[wk].phase <= state.phase && !WORLDS[wk].fromProject) {
          opts.push([landParcelCost(state, wk), () => buyLand(state, wk)]);
          if (canUnlockTier(state, wk)) opts.push([tierUnlockCost(state, wk), () => unlockTier(state, wk)]);
        }
      }
      if (state.land.density < densityPhaseCap(state)) opts.push([densityCost(state), () => buyDensity(state)]);
      for (const m of AREA_MODS) if (m.phase <= state.phase && !state.land.mods[m.key]) opts.push([areaModCost(state, m.key), () => buyAreaMod(state, m.key)]);
      if (state.phase >= 6) opts.push([costFor(state, 'warehouse'), () => buyWarehouse(state)]);
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
  for (const k in UPGRADES) if (UPGRADES[k].phase <= s.phase) opts.push({ kind: 'upgrade', key: k, label: upgradeName(UPGRADES[k], s.upgrades[k] || 0), cost: upgradeCost(s, k) });
  for (const wk of WORLD_ORDER) if (WORLDS[wk].phase <= s.phase && !WORLDS[wk].fromProject) opts.push({ kind: 'land', key: wk, label: 'Rozloha: ' + WORLDS[wk].label, cost: landParcelCost(s, wk) });
  if (s.land.density < densityPhaseCap(s)) opts.push({ kind: 'density', key: null, label: 'Hustota pastvy', cost: densityCost(s) });
  opts.push({ kind: 'addSheep', key: null, label: 'Ovce', cost: costFor(s, 'addSheep') });
  let best = null;
  for (const o of opts) if (!best || o.cost < best.cost) best = o;
  return best;
}

// Identifikace doporučené akce pro vizuální zvýraznění tlačítek (#10).
// Vrací { kind, key, cost } nebo null, jen pokud doporučení míří na konkrétní nákup.
export function suggestedAction(s) {
  if (singularityAvailable(s) || s.phase >= 10) return null;
  if (s.phase === 4 && !s.flags.immortal) return { kind: 'immortality', key: null };
  if (s.phase === 6 && worldsColonized(s) < 3) return null;
  if ((s.phase === 7 || s.phase === 8) && (s.phase === 7 ? s.projects.dyson.count < 1 : s.projects.dyson.count < 5)) return null;
  return cheapestUseful(s);
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
  if (s.phase === 6 && worldsColonized(s) < 3) return 'Kolonizuj Měsíc, Mars a Jupiter (Pozemky)';
  if (s.phase === 7 && s.projects.dyson.count < 1) return sphereReady(s) ? 'Dokonči Dysonovu sféru! (Pozemky)' : 'Kupuj stavitele sféry (Pozemky)';
  if (s.phase === 8 && s.projects.dyson.count < 5) return sphereReady(s) ? 'Dokonči další sféru! (Pozemky)' : 'Stav další sféry — stavitelé/laser (Pozemky)';
  const best = cheapestUseful(s);
  if (!best) return 'Nech stádo růst a šlechti (Stáda)';
  return cr >= best.cost ? `Kup: ${best.label} (${fmt(best.cost)})` : `Našetři na ${best.label} (${fmt(best.cost)})`;
}

export { canIgnite, singularityAvailable, sphereReady };
