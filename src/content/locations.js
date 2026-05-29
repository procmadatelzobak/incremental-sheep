// ===========================================================================
//  Pozemky = dvě globální osy: ROZLOHA (per-svět žebříček tierů) a HUSTOTA
//  (globální track) + MODIFIKÁTORY ROZLOHY. Kapacita = rozloha × hustota ×
//  modifikátory × baseCap. Produkční prostředí = vážený průměr dle podílu rozlohy.
// ===========================================================================
import { WORLDS, WORLD_ORDER, DENSITY_TIERS, AREA_MODS, BALANCE } from '../config.js';

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
export const densityMult = (state) => (DENSITY_TIERS[state.land.density] || DENSITY_TIERS[0]).mult;
export function areaModMult(state) {
  let m = 1; for (const mod of AREA_MODS) if (state.land.mods[mod.key]) m += mod.bonus; return m;
}

export function herdCapacity(state) {
  const flock = 1 + 0.10 * ((state.prestige && state.prestige.perks && state.prestige.perks.flock) || 0);
  return totalArea(state) * BALANCE.baseCap * densityMult(state) * areaModMult(state) * flock;
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
// cena parcely roste s VELIKOSTÍ tieru (větší území = dražší) i s počtem parcel.
export const landParcelCost = (state, wk) => {
  const t = state.land.worlds[wk];
  const area = WORLDS[wk].tiers[t.tier].area;
  return Math.floor(BALANCE.cost.land.base * WORLDS[wk].costMult * Math.pow(area, 0.55) * Math.pow(BALANCE.cost.land.growth, t.counts[t.tier] || 0));
};
export function canUnlockTier(state, wk) {
  const w = state.land.worlds[wk];
  return (w.counts[w.tier] || 0) >= BALANCE.landUnlockReq && w.tier < WORLDS[wk].tiers.length - 1;
}
export const tierUnlockCost = (state, wk) => Math.floor(landParcelCost(state, wk) * BALANCE.tierUnlockMult);
export const densityCost = (state) => Math.floor(BALANCE.cost.density.base * Math.pow(BALANCE.cost.density.growth, state.land.density));
export const areaModCost = (state, key) => {
  const idx = AREA_MODS.findIndex(m => m.key === key);
  return Math.floor(BALANCE.cost.areaMod.base * Math.pow(BALANCE.cost.areaMod.growth, Math.max(0, idx)));
};
