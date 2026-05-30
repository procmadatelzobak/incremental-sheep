// ===========================================================================
//  Sklad + autotrade + prodej. Strop je PRO KAŽDOU SUROVINU ZVLÁŠŤ (#38).
//  Sklad funguje OD ZAČÁTKU hry (strop = base0 + úroveň × capInc). Výchozí
//  chování: surovina se UKLÁDÁ do stropu a PŘEBYTEK se prodá; uživatel může
//  u suroviny nastavit, kolik % prodat rovnou (autotrade). Nákup NEVYPRAZDŇUJE
//  sklad (zrušené pravidlo §9) — upgrade skladu tedy nikdy neztratí suroviny.
// ===========================================================================
import { RESOURCES, BALANCE } from '../config.js';
import { unlocked } from '../io/state.js';

// Obchodovatelné zboží (jde skladovat i prodat).
export const TRADEABLE = Object.keys(RESOURCES).filter(k => RESOURCES[k].sell && RESOURCES[k].store);

// Strop na surovinu = základ + úroveň × přírůstek (sklad je k dispozici od začátku).
export function resourceCap(state) {
  return BALANCE.warehouse.base0 + state.storage.warehouseLevel * BALANCE.warehouse.capInc;
}
export const storageEnabled = (state) => true;   // sklad běží od začátku hry

// Zmenšení stropu jen ořízne přebytek (#38) — uložené suroviny nikdy „nezbytní" navíc.
export function clampStorage(state) {
  const cap = resourceCap(state);
  for (const k of TRADEABLE) if ((state.resources[k] || 0) > cap) state.resources[k] = cap;
}

function sell(state, key, amt, mults) {
  const v = (RESOURCES[key].value || 0) * mults.priceMult;
  const gain = amt * v;
  state.resources.credits = (state.resources.credits || 0) + gain;
  state.stats.credLifetime += gain;
  return gain;
}

// Aplikuj vyrobené suroviny: ulož do stropu, přebytek prodej (nebo do černé díry).
// Výchozí autotrade = 0 (ulož vše; přebytek nad strop se prodá). >0 = část prodat rovnou.
export function applyProduced(state, produced, mults) {
  clampStorage(state);
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
      const frac = state.storage.autotrade[k] ?? 0;     // kolik prodat rovnou (default 0 = ukládat)
      const toSell = amt * frac;
      const toStore = amt - toSell;
      if (toSell > 0) sell(state, k, toSell, mults);
      if (toStore > 0) {
        const room = Math.max(0, resourceCap(state) - (state.resources[k] || 0));  // strop per surovina (#38)
        const stored = Math.min(toStore, room);
        state.resources[k] = (state.resources[k] || 0) + stored;
        const overflow = toStore - stored;
        if (overflow > 0) sell(state, k, overflow, mults);   // přebytek nad strop se prodá (kredity tečou dál)
      }
      if (k === 'wool') state.stats.woolLifetime += amt;
      if (k === 'milk') state.stats.milkLifetime += amt;
      if (k === 'meat') state.stats.meatLifetime += amt;
    } else {
      // funkční suroviny (výpočet/energie/bobky) jen akumulují
      state.resources[k] = (state.resources[k] || 0) + amt;
    }
  }
}
