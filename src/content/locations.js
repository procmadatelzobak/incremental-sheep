// ===========================================================================
//  Pozemky = dvě globální osy: ROZLOHA (per-svět žebříček tierů) a HUSTOTA
//  (globální track) + MODIFIKÁTORY ROZLOHY. Kapacita = rozloha × hustota ×
//  modifikátory × baseCap. Produkční prostředí = vážený průměr dle podílu rozlohy.
// ===========================================================================
import { WORLDS, WORLD_ORDER, DENSITY_TIERS, AREA_MODS, BALANCE, SOIL } from '../config.js';
import { totalCount } from '../sim/cohort.js';

export function parcelsInWorld(state, wk) {
  const w = state.land.worlds[wk]; if (!w) return 0;
  let n = 0; for (const i in w.counts) n += w.counts[i] || 0; return n;
}
export function worldArea(state, wk) {
  const w = state.land.worlds[wk]; if (!w) return 0;
  const tiers = WORLDS[wk].tiers; let a = 0;
  for (const i in w.counts) a += (w.counts[i] || 0) * (tiers[i] ? tiers[i].area : 0);
  return a;
}
export const effectiveWorldArea = (state, wk) => worldArea(state, wk);
export function totalArea(state) {
  let t = 0; for (const wk of WORLD_ORDER) t += effectiveWorldArea(state, wk); return t;
}
export const densityMaxLevel = () => DENSITY_TIERS.length - 1;
// Nejvyšší stupeň hustoty dostupný v aktuální fázi (fázové brány, viz DENSITY_TIERS).
export const densityPhaseCap = (state) => {
  let cap = 0;
  for (let i = 0; i < DENSITY_TIERS.length; i++) if ((DENSITY_TIERS[i].phase || 1) <= state.phase) cap = i;
  return cap;
};
export const densityMult = (state) => (DENSITY_TIERS[state.land.density] || DENSITY_TIERS[0]).mult;
export function areaModMult(state) {
  let m = 1; for (const mod of AREA_MODS) if (state.land.mods[mod.key]) m += mod.bonus; return m;
}
export const flockMult = (state) => 1 + 0.10 * ((state.prestige && state.prestige.perks && state.prestige.perks.flock) || 0);

// Kapacitní násobič z kvality půdy (#63). Půda je per stádo, kapacita je sdílená,
// takže bereme vážený průměr (dle populace) přes stáda. Bez ovcí = průměr stád.
// Bonus se neprojeví do cen pozemků (ty mají vlastní addedCap) — je to bonus navíc.
export function soilCapMult(state) {
  if (!state || state.phase < SOIL.unlockPhase || !state.groups) return 1;
  let pop = 0, weighted = 0, sum = 0, n = 0;
  for (const g of state.groups) {
    const m = 1 + SOIL.maxBonus * ((g.soil && g.soil.q) || 0);
    const p = totalCount(g);
    pop += p; weighted += p * m; sum += m; n++;
  }
  if (pop > 0) return weighted / pop;
  return n > 0 ? sum / n : 1;
}

export function herdCapacity(state) {
  return totalArea(state) * BALANCE.baseCap * densityMult(state) * areaModMult(state) * flockMult(state) * soilCapMult(state);
}

// Produkční prostředí = vážený průměr env světů podle podílu efektivní rozlohy.
export function worldEnv(state) {
  const keys = ['woolMult', 'milkMult', 'meatMult', 'birthMult'];
  const out = { woolMult: 0, milkMult: 0, meatMult: 0, birthMult: 0 };
  let total = 0; const shares = [];
  for (const wk of WORLD_ORDER) { const a = effectiveWorldArea(state, wk); if (a > 0) { shares.push([wk, a]); total += a; } }
  if (total <= 0) return { woolMult: 1, milkMult: 1, meatMult: 1, birthMult: 1 };
  for (const [wk, a] of shares) {
    const env = WORLDS[wk].env, sh = a / total;
    for (const k of keys) out[k] += sh * (env[k] != null ? env[k] : 1);
  }
  return out;
}

export const worldsColonized = (state) => WORLD_ORDER.filter(wk => wk !== 'earth' && parcelsInWorld(state, wk) > 0).length;

// --- ceny ------------------------------------------------------------------
// Vše per KAPACITU: cena = perCap × přidaná kapacita (× případný růst/prémie).
// Tím je jedno, jakou cestou kapacitu kupuješ — nelze žádný násobič „obejít".

// Parcela: přidá area × baseCap × hustota × modifikátory × stádo kapacity.
// growth^count v rámci tieru tlačí k odemykání vyšších tierů (= reset počtu).
export const landParcelCost = (state, wk) => {
  const t = state.land.worlds[wk];
  const area = WORLDS[wk].tiers[t.tier].area;
  const addedCap = area * BALANCE.baseCap * densityMult(state) * areaModMult(state) * flockMult(state);
  const c = BALANCE.cost.land;
  const price = WORLDS[wk].costMult * c.perCap * addedCap * Math.pow(c.growth, t.counts[t.tier] || 0);
  return Math.max(c.base, Math.floor(price));
};
export function canUnlockTier(state, wk) {
  const w = state.land.worlds[wk];
  return (w.counts[w.tier] || 0) >= BALANCE.landUnlockReq && w.tier < WORLDS[wk].tiers.length - 1;
}
export const tierUnlockCost = (state, wk) => Math.floor(landParcelCost(state, wk) * BALANCE.tierUnlockMult);

// Hustota: globální násobič → přidaná kapacita = (zbytek kapacity) × Δmult.
// Scale-aware: čím větší rozloha/modifikátory, tím dražší další stupeň hustoty.
export const densityCost = (state) => {
  const lvl = state.land.density;
  if (lvl >= densityPhaseCap(state)) return Infinity;   // další stupeň zamčen fází (nebo absolutní strop)
  const cur = DENSITY_TIERS[lvl].mult, next = DENSITY_TIERS[lvl + 1].mult;
  const addedCap = totalArea(state) * BALANCE.baseCap * areaModMult(state) * flockMult(state) * (next - cur);
  const c = BALANCE.cost.density;
  return Math.max(c.base, Math.floor(c.perCap * addedCap));
};

// Modifikátor rozlohy: globální % bonus → přidaná kapacita = (zbytek) × bonus.
export const areaModCost = (state, key) => {
  const mod = AREA_MODS.find(m => m.key === key);
  if (!mod) return Infinity;
  const addedCap = totalArea(state) * BALANCE.baseCap * densityMult(state) * flockMult(state) * mod.bonus;
  const c = BALANCE.cost.areaMod;
  return Math.max(c.base, Math.floor(c.perCap * addedCap));
};
