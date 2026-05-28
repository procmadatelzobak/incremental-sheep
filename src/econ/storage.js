// ===========================================================================
//  Sklad + autotrade + prodej. Kombinovaný strop, nákup vyprázdní sklad.
// ===========================================================================
import { RESOURCES, BALANCE } from '../config.js';
import { unlocked } from '../io/state.js';

// Obchodovatelné zboží (jde skladovat i prodat) — počítá se do společného stropu.
export const TRADEABLE = Object.keys(RESOURCES).filter(k => RESOURCES[k].sell && RESOURCES[k].store);

export function combinedCap(state) {
  return state.storage.warehouseLevel * BALANCE.warehouse.capInc;
}
export function storedTradeTotal(state) {
  let t = 0;
  for (const k of TRADEABLE) t += state.resources[k] || 0;
  return t;
}
export const storageEnabled = (state) => state.phase >= 6 && state.storage.warehouseLevel > 0;

function sell(state, key, amt, mults) {
  const v = (RESOURCES[key].value || 0) * mults.priceMult;
  const gain = amt * v;
  state.resources.credits = (state.resources.credits || 0) + gain;
  state.stats.credLifetime += gain;
  return gain;
}

// Aplikuj vyrobené suroviny: rozděl na prodej/sklad, případně do černé díry.
export function applyProduced(state, produced, mults) {
  for (const k in produced) {
    let amt = produced[k];
    if (amt <= 0 || !unlocked(state, k)) continue;
    const def = RESOURCES[k];
    if (def.sell) {
      // černá díra (fáze 10): pokud nasává, surovou hodnotu sype do centrálního skladu
      if (state.prestige.armed) {
        state.prestige.centralWarehouse += amt * (def.value || 1);
        continue;
      }
      let frac = 1;
      if (storageEnabled(state)) frac = state.storage.autotrade[k] ?? 1;
      const toSell = amt * frac;
      let toStore = amt - toSell;
      if (toSell > 0) sell(state, k, toSell, mults);
      if (toStore > 0) {
        const room = Math.max(0, combinedCap(state) - storedTradeTotal(state));
        const stored = Math.min(toStore, room);
        state.resources[k] = (state.resources[k] || 0) + stored;
        const overflow = toStore - stored;
        if (overflow > 0) sell(state, k, overflow, mults); // přetečení se prodá (anti-softlock)
      }
      if (k === 'wool') state.stats.woolLifetime += amt;
      if (k === 'milk') state.stats.milkLifetime += amt;
      if (k === 'meat') state.stats.meatLifetime += amt;
    } else {
      // funkční suroviny (výpočet/kyslík/energie) jen akumulují
      state.resources[k] = (state.resources[k] || 0) + amt;
    }
  }
}

// Nákup čehokoli vyprázdní obchodovatelný sklad (tvrdé pravidlo lore §9).
export function emptyStorage(state) {
  for (const k of TRADEABLE) state.resources[k] = 0;
}
