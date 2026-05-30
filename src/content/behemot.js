// ===========================================================================
//  Behemot Emporio: barterový obchod souseda-kutila. Behemot odmítá kredity
//  ("svítící čísílka") a bere JEN fyzické suroviny (vlna, maso, mléko, kosti…).
//  Hráč si část produkce odkládá do "beden" (state.behemot.stock) a tou platí.
//  Předměty se NEspotřebují při koupi — vlastníš je v inventáři:
//   • pasivní (once): efekt platí jen když je položka aktivní (zap/vyp),
//   • spotřební (buff): drží se v množství, "Použít" spustí časovaný buff.
//
//  Etapa 2 — živý katalog + reaktivní hlášky (sklad/restock, behemotSay).
//  Etapa 3 — vztahové osy: Důvěra/Respekt/Kontrola/Autonomie/Přetížení (state.behemot.rel)
//   se hýbou chováním hráče (barter, spam, používání rizik) a ovlivňují CENY,
//   rychlost restocku, RIZIKO ("sajrajt") a NÁLADU/hlášky. Přetížení časem chladne.
//   (Kontrola/Autonomie zůstávají z větší části pro pozdější etapu zotročení.)
//  Veškerá logika Behemota žije tady; ostatní soubory mají jen tenké napojení.
//  Čísla jsou ilustrativní (lore/katalog = inspirace) a doladí se v balancingu.
// ===========================================================================
import { RESOURCES, BALANCE } from '../config.js';
import { unlocked } from '../io/state.js';
import { clamp } from '../rng.js';
import { LINES } from './behemot-lines.js';

// --- KATALOG ---------------------------------------------------------------
// Položka: { id, name, cat, flavor, cost:{res:amt}, once, minPhase?,
//   shopCap?, restockEvery?,   // jen spotřební: Behemotův sklad + doplňování (s)
//   effect: { type:'mult', mults:{...} }                                  // trvalý pasivní bonus (jen když active)
//          | { type:'buff', mults:{...}, dur, side?:{ mults, dur }, roll? } // spotřební časovaný buff (+volitelný postih)
// }
// Dostupnost se gateuje surovinami v `cost` přes unlocked(): položka placená
// mlékem se objeví až ve fázi 2, kostmi/mozky až ve fázi 5 — nabídka tak roste
// s tím, co hráč zrovna produkuje.
// Klíče násobičů (aditivní %): wool, milk, meat, compute, price, birth, ceiling, global.
export const CATALOG = [
  // --- pasivní (trvalá vylepšení, zap/vyp) ---
  { id: 'samostrihaci_rameno', name: 'Samostříhací rameno', cat: 'Vlna', once: true,
    cost: { wool: 400 }, effect: { type: 'mult', mults: { wool: 0.12 } },
    flavor: 'todle si připevníš a vono to stříhá samo. skoro. nešahej na to za chodu.' },
  { id: 'vlnocesaci_kombajn', name: 'Vlnočesací kombajn', cat: 'Vlna', once: true,
    cost: { wool: 2500, meat: 200 }, effect: { type: 'mult', mults: { wool: 0.20, birth: -0.08 } },
    flavor: 'kombajn. dává víc vlny, ovce z toho nejsou nadšený. no jistě.' },
  { id: 'behemotuv_stos', name: 'Behemotův štos papírů', cat: 'Administrativa', once: true,
    cost: { wool: 1200 }, effect: { type: 'mult', mults: { price: 0.05 } },
    flavor: 'papíry. dyž to ukážeš úřadu, prodáš dráž. nečti to, viděl bys, co porušuješ.' },
  { id: 'romanticka_klec', name: 'Romantická klec', cat: 'Šlechtění', once: true,
    cost: { meat: 600 }, effect: { type: 'mult', mults: { birth: 0.15 } },
    flavor: 'klec na romantiku. množí se rychlejc. neptej se jak.' },
  { id: 'skladaci_pastvina', name: 'Skládací pastvina', cat: 'Pozemky', once: true,
    cost: { wool: 5000, milk: 800 }, effect: { type: 'mult', mults: { ceiling: 0.10 } },
    flavor: 'pastvina do kapsy. rozbalíš, je větší. fyzika mlčí, tak mlč taky.' },
  { id: 'mlekoturbina', name: 'Mlékoturbína', cat: 'Mléko', once: true,
    cost: { milk: 1500 }, effect: { type: 'mult', mults: { milk: 0.18 } },
    flavor: 'turbína na mlíko. dyž to bučí, tak to funguje.' },
  { id: 'paterni_zesilovac', name: 'Páteřní zesilovač', cat: 'Implantáty', once: true,
    cost: { meat: 8000, bones: 1500 }, effect: { type: 'mult', mults: { meat: 0.25 } },
    flavor: 'implantát do páteře. masa víc, otázek míň.' },
  { id: 'chytra_pajka', name: 'Chytrá pájka', cat: 'Automatizace', once: true,
    cost: { brain: 2000 }, effect: { type: 'mult', mults: { compute: 0.20 } },
    flavor: 'pájka, co myslí za tebe. počítá líp než ty, to neni těžký.' },

  // --- spotřební (buffy s množstvím; mají Behemotův sklad + restock) ---
  { id: 'radioaktivni_krmivo', name: 'Radioaktivní krmivo', cat: 'Krmivo', once: false, shopCap: 5, restockEvery: 25,
    cost: { wool: 800, meat: 150 },
    effect: { type: 'buff', mults: { global: 0.6 }, dur: 60, side: { mults: { global: -0.3 }, dur: 30 } },
    flavor: 'krmivo, co svítí. produkce nahoru, pak chvilku dolů. normálně.' },
  { id: 'uranove_pelety', name: 'Uranové pelety', cat: 'Krmivo', once: false, shopCap: 5, restockEvery: 20,
    cost: { meat: 500 },
    effect: { type: 'buff', mults: { birth: 0.5 }, dur: 45, side: { mults: { birth: -0.25 }, dur: 20 } },
    flavor: 'uranový pelety. porody nahoru. potom se nediv.' },
  { id: 'zitrejsi_vlna', name: 'Zítřejší vlna (kapsle)', cat: 'Čas', once: false, shopCap: 2, restockEvery: 60,
    cost: { wool: 6000, milk: 1200 },
    effect: { type: 'buff', mults: { wool: 1.0 }, dur: 30 },
    flavor: 'vlna ze zejtřka. dneska ji máš dneska. neptej se.' },
  { id: 'sajrajt_z_bedny', name: 'Sajrajt z bedny', cat: 'Černý trh', once: false, shopCap: 3, restockEvery: 45,
    cost: { bones: 800, brain: 400 },
    // šance na dobrý výsledek klesá s Přetížením (Etapa 3) — nasraný Behemot prodává horší bedny
    effect: { type: 'buff', dur: 40,
      roll: (state) => (Math.random() < goodSajrajtChance(state) ? { mults: { global: 0.8 } } : { mults: { global: -0.25 } }) },
    flavor: 'bedna. nevim co v ní je. ty to teda zjistíš.' },

  // --- pozdní katalog (Etapa 4): dražší suroviny, vyšší fáze, silnější efekty --
  { id: 'sukno_izolace', name: 'Sukno-izolace serverů', cat: 'Chlazení', once: true, minPhase: 3,
    cost: { cloth: 600 }, effect: { type: 'mult', mults: { global: 0.05 } },
    flavor: 'sukno na servery. izolace, ne móda. drží teplo tam, kde nemá hořet.' },
  { id: 'syrovy_algoritmus', name: 'Sýrový algoritmus', cat: 'Administrativa', once: true, minPhase: 3,
    cost: { cheese: 400 }, effect: { type: 'mult', mults: { price: 0.08 } },
    flavor: 'algoritmus zráním. dyž to dost smrdí, prodává se to dráž.' },
  { id: 'kozeny_chladic', name: 'Kožený měch chladiče', cat: 'Chlazení', once: true,
    cost: { skin: 2500 }, effect: { type: 'mult', mults: { global: 0.04 } },
    flavor: 'kožený měch na chlazení. organickej, smradlavej, funkční.' },
  { id: 'kostni_vyztuz', name: 'Kostní výztuž pastvin', cat: 'Pozemky', once: true,
    cost: { bones: 3000 }, effect: { type: 'mult', mults: { ceiling: 0.12 } },
    flavor: 'kosti do základů. pastvina unese víc. čí kosti neřeš.' },
  { id: 'nervova_pajka', name: 'Nervová pájka', cat: 'Implantáty', once: true,
    cost: { brain: 4000 }, effect: { type: 'mult', mults: { compute: 0.25 } },
    flavor: 'pájka přímo do nervů. počítá, i dyž spíš. hlavně dyž spíš.' },
  { id: 'mozkovy_cluster', name: 'Ovčí výpočetní cluster', cat: 'Automatizace', once: true, minPhase: 5,
    cost: { brain: 9000, skin: 2000 }, effect: { type: 'mult', mults: { compute: 0.3, global: 0.05 } },
    flavor: 'stádo, co počítá. cluster z chlupů a nervů. neptej se na licence.' },
  { id: 'skladaci_svetadil', name: 'Skládací světadíl', cat: 'Dimenze', once: true, minPhase: 8,
    cost: { bones: 50000, brain: 30000 }, effect: { type: 'mult', mults: { ceiling: 0.4 } },
    flavor: 'světadíl do kapsy. rozbalíš, fyzika brečí. ber, dokud máš na to kosti.' },
  { id: 'dimenzionalni_bedna', name: 'Dimenzionální bedna', cat: 'Dimenze', once: false, minPhase: 8, shopCap: 2, restockEvery: 90,
    cost: { brain: 12000, bones: 8000 },
    effect: { type: 'buff', dur: 40,
      roll: (state) => (Math.random() < goodSajrajtChance(state) ? { mults: { global: 1.5 } } : { mults: { global: -0.4 } }) },
    flavor: 'bedna z jinýho vesmíru. možná. za realitu neručím.' },
];

const ITEM_BY_ID = {};
for (const it of CATALOG) ITEM_BY_ID[it.id] = it;
export const itemById = (id) => ITEM_BY_ID[id];

// --- fázová evoluce Emporia (Etapa 4): garáž → servrovna → uzel → singularita
export const EMPORIO_STAGES = [
  { from: 1, name: 'Garážový bazar', desc: 'Rezavá garáž, Felicia v koutě, bordel po zemi. Behemot prodává, co spadlo z náklaďáku.' },
  { from: 3, name: 'Servrový terminál', desc: 'Racky bzučí, kabely všude, terminál bliká. „Zenovej bordel", co chápe jen Behemot.' },
  { from: 6, name: 'Distribuovaný uzel', desc: 'Emporio už není jen garáž — kusy se objevují v kontejnerech a uzlech mezi světy.' },
  { from: 9, name: 'Uzel před singularitou', desc: 'Poslední servisní bod před koncem. Zenová zahrádka pořád stojí, akorát z prachu časoprostoru.' },
];
export function emporioStageIndex(state) {
  let idx = 0;
  for (let i = 0; i < EMPORIO_STAGES.length; i++) if (state.phase >= EMPORIO_STAGES[i].from) idx = i;
  return idx;
}
export const emporioStage = (state) => EMPORIO_STAGES[emporioStageIndex(state)];

// --- popisky pro UI --------------------------------------------------------
const MULT_LABEL = { wool: 'vlna', milk: 'mléko', meat: 'maso', compute: 'výpočet', price: 'cena', birth: 'porody', ceiling: 'kapacita', global: 'veškerá produkce' };
const pct = (v) => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)} %`;
const multStr = (m) => Object.keys(m).map(k => `${pct(m[k])} ${MULT_LABEL[k] || k}`).join(', ');

export function effectText(item) {
  const e = item.effect;
  if (e.type === 'mult') return multStr(e.mults);
  if (e.type === 'buff') {
    if (e.roll) return `náhodný efekt (risk) na ${e.dur} s`;
    let s = `${multStr(e.mults)} na ${e.dur} s`;
    if (e.side) s += ` · pak ${multStr(e.side.mults)} na ${e.side.dur} s`;
    return s;
  }
  return '';
}

// --- vztahové osy (Etapa 3) ------------------------------------------------
// rel = { trust, respect, control, autonomy, overload }, vše 0..100.
function relNudge(state, axis, delta) {
  const r = state.behemot.rel;
  r[axis] = clamp((r[axis] || 0) + delta, 0, 100);
  if (axis === 'control') r.autonomy = clamp(100 - r.control, 0, 100);   // autonomie = doplněk kontroly
  return r[axis];
}
// Pojmenované události hýbou osami. (Kontrola/Autonomie čekají na etapu zotročení.)
export function relEvent(state, kind, risky) {
  if (!state.behemot) return;
  if (kind === 'barter') { relNudge(state, 'trust', 1.2); relNudge(state, 'respect', 0.4); relNudge(state, 'overload', -0.5); }
  else if (kind === 'use') { relNudge(state, 'overload', risky ? 3 : 1.5); }
  else if (kind === 'spam') { relNudge(state, 'overload', 5); relNudge(state, 'trust', -3); }
}
// Násobič cen: Důvěra zlevňuje, Přetížení zdražuje.
export function relPriceMult(state) {
  const r = (state.behemot && state.behemot.rel) || {};
  return clamp(1 - (r.trust || 0) * 0.0025 + (r.overload || 0) * 0.0035, 0.7, 1.6);
}
// Efektivní cena položky v surovinách (po vlivu vztahu).
export function barterCost(state, item) {
  const m = relPriceMult(state);
  const out = {};
  for (const k in item.cost) out[k] = Math.ceil(item.cost[k] * m);
  return out;
}
// Efektivní doba restocku: Přetížení zpomaluje, Respekt zrychluje.
function effRestockEvery(state, item) {
  const r = (state.behemot && state.behemot.rel) || {};
  return (item.restockEvery || 30) * (1 + (r.overload || 0) * 0.01) / (1 + (r.respect || 0) * 0.005);
}
// Šance, že "sajrajt z bedny" dopadne dobře (klesá s Přetížením).
function goodSajrajtChance(state) {
  const r = (state.behemot && state.behemot.rel) || {};
  return Math.max(0.25, 0.6 - (r.overload || 0) * 0.003);
}
// Nálada pro hlášky/UI.
export function behemotMood(state) {
  const r = (state.behemot && state.behemot.rel) || {};
  if ((r.overload || 0) >= 55) return 'tense';
  if ((r.trust || 0) >= 55) return 'warm';
  return 'neutral';
}

// --- Behemotův sklad (živý katalog): vyprodává se, po čase doplňuje ---------
function shopEntry(state, item) {
  if (item.shopCap == null) return null;
  let e = state.behemot.shop[item.id];
  if (!e) e = state.behemot.shop[item.id] = { n: item.shopCap, t: 0 };
  return e;
}
// kolik kusů má Behemot teď skladem (neomezené pro položky bez shopCap)
export function shopCount(state, item) {
  if (item.shopCap == null) return Infinity;
  const e = state.behemot.shop[item.id];
  return e ? e.n : item.shopCap;            // neotevřená položka = plný sklad
}
// za kolik sekund přibude další kus (0 = plno / neomezené)
export function restockEta(state, item) {
  if (item.shopCap == null) return 0;
  const e = state.behemot.shop[item.id];
  if (!e || e.n >= item.shopCap) return 0;
  return Math.max(0, effRestockEvery(state, item) - e.t);
}

// --- dostupnost / koupěschopnost ------------------------------------------
export function itemAvailable(state, item) {
  if (item.minPhase && state.phase < item.minPhase) return false;
  for (const k in item.cost) if (!unlocked(state, k)) return false;   // gate dle produkovaných surovin
  return true;
}
export function canBarter(state, item) {
  const b = state.behemot;
  if (!b) return false;
  if (item.once && b.soldOut[item.id]) return false;
  if (!itemAvailable(state, item)) return false;
  if (item.shopCap != null && shopCount(state, item) <= 0) return false;
  const cost = barterCost(state, item);
  for (const k in cost) if ((b.stock[k] || 0) < cost[k]) return false;
  return true;
}

// --- hlášky (Etapa 2): reaktivní, klíč = herní událost ---------------------
export function behemotSay(state, key) {
  const b = state.behemot;
  const arr = LINES[key] || LINES.openShop;
  b.lineN = (b.lineN || 0) + 1;
  const text = arr[b.lineN % arr.length];
  b.line = { key, text };
  return text;
}
// Spamování klikání: rýpne + zvedne Přetížení / ubere Důvěru (volá UI).
export function behemotSpam(state) {
  relEvent(state, 'spam');
  return behemotSay(state, 'spamClicking');
}

// --- hráčské akce (volané přes wrappery v actions.js) ----------------------
// POZN: barter NEVOLÁ emptyStorage — pravidlo §9 ("nákup vyprázdní sklad") je
// vázané na nákup za KREDITY (viz spend() v actions.js). Behemot kredity odmítá,
// je tedy kanonická výjimka. Neopravovat na emptyStorage!
export function barter(state, id) {
  const item = ITEM_BY_ID[id];
  if (!item) return false;
  const b = state.behemot;
  if (item.once && b.soldOut[item.id]) { behemotSay(state, 'soldOut'); return false; }
  if (!itemAvailable(state, item)) { behemotSay(state, 'impossibleAction'); return false; }
  if (item.shopCap != null && shopCount(state, item) <= 0) { behemotSay(state, 'soldOut'); return false; }
  const cost = barterCost(state, item);
  for (const k in cost) if ((b.stock[k] || 0) < cost[k]) { behemotSay(state, 'notEnoughResources'); return false; }
  // úspěch: zaplať surovinami, přidej do inventáře, uber z Behemotova skladu
  for (const k in cost) b.stock[k] = (b.stock[k] || 0) - cost[k];
  const e = b.inv[id] || (b.inv[id] = { qty: 0, active: item.effect.type === 'mult' });
  e.qty++;
  if (item.once) { b.soldOut[id] = true; e.active = true; }
  if (item.shopCap != null) { const se = shopEntry(state, item); if (se) se.n = Math.max(0, se.n - 1); }
  relEvent(state, 'barter');                                          // férový obchod buduje Důvěru
  behemotSay(state, (item.effect.side || item.effect.roll) ? 'suspiciousPurchase' : 'purchaseSuccess');
  return true;
}
// zap/vyp pasivní položky (jen ty s efektem 'mult')
export function toggleItem(state, id) {
  const e = state.behemot.inv[id];
  const item = ITEM_BY_ID[id];
  if (!e || !item || item.effect.type !== 'mult') return false;
  e.active = !e.active;
  return true;
}
// použít spotřební položku: spotřebuje 1 kus a spustí časovaný buff
export function useItem(state, id) {
  const b = state.behemot;
  const e = b.inv[id];
  const item = ITEM_BY_ID[id];
  if (!e || e.qty <= 0 || !item || item.effect.type !== 'buff') return false;
  e.qty--;
  const eff = item.effect;
  let mults = eff.mults || {}, side = eff.side || null;
  if (eff.roll) { const r = eff.roll(state); mults = r.mults || {}; side = r.side || null; }   // RNG "sajrajt"
  b.buffs.push({ id, mults: Object.assign({}, mults), remaining: eff.dur, side });
  relEvent(state, 'use', !!(eff.side || eff.roll));                   // používání rizik zvedá Přetížení
  return true;
}
// kolik produkce dané suroviny posílat Behemotovi do beden (0..1)
export function setBarterFrac(state, res, frac) {
  state.behemot.barterFrac[res] = clamp(frac, 0, 1);
  return true;
}

// --- napojení na simulaci --------------------------------------------------
// Aktivní násobiče Behemota (aktivní pasivní položky + běžící buffy). Aditivní %.
export function behemotMults(state) {
  const out = {};
  const b = state.behemot;
  if (!b) return out;
  const add = (m) => { for (const k in m) out[k] = (out[k] || 0) + m[k]; };
  for (const id in (b.inv || {})) {
    const e = b.inv[id];
    if (!e || !e.active) continue;
    const item = ITEM_BY_ID[id];
    if (item && item.effect.type === 'mult') add(item.effect.mults);
  }
  for (const buff of (b.buffs || [])) if (buff.mults) add(buff.mults);
  return out;
}

// Odkroj barterFrac z vyrobených surovin do beden (volá se v step() PŘED prodejem).
export function skimBarter(state, produced) {
  const b = state.behemot;
  if (!b || state.prestige.armed) return;            // při nasávání do černé díry neodkládáme
  const cap = (BALANCE.behemot && BALANCE.behemot.stockCap) || 0;
  for (const k in produced) {
    const frac = b.barterFrac[k] || 0;
    if (frac <= 0) continue;
    const def = RESOURCES[k];
    if (!def || !def.sell || !unlocked(state, k)) continue;
    const amt = produced[k];
    if (amt <= 0) continue;
    const take = amt * frac;
    b.stock[k] = (b.stock[k] || 0) + take;
    produced[k] = amt - take;
    if (cap > 0 && b.stock[k] > cap) b.stock[k] = cap;
  }
}

// Každý tik: expirace buffů (+ postih), chladnutí Přetížení a doplňování skladu.
export function stepBehemot(state, dt) {
  const b = state.behemot;
  if (!b) return;
  // 1) buffy
  if (b.buffs && b.buffs.length) {
    const kept = [];
    for (const buff of b.buffs) {
      buff.remaining -= dt;
      if (buff.remaining > 0) { kept.push(buff); continue; }
      if (buff.side) kept.push({ id: buff.id, mults: Object.assign({}, buff.side.mults), remaining: buff.side.dur, side: null });
    }
    b.buffs = kept;
  }
  // 2) Přetížení časem chladne (Behemot se uklidní, když ho necháš být)
  if (b.rel && b.rel.overload > 0) b.rel.overload = Math.max(0, b.rel.overload - 0.25 * dt);
  // 3) restock Behemotova skladu (jen u položek, které už byly otevřené)
  if (b.shop) {
    for (const id in b.shop) {
      const item = ITEM_BY_ID[id];
      if (!item || item.shopCap == null) continue;
      const e = b.shop[id];
      if (e.n >= item.shopCap) { e.t = 0; continue; }
      e.t += dt;
      const every = effRestockEvery(state, item);
      while (e.t >= every && e.n < item.shopCap) { e.t -= every; e.n++; }
    }
  }
}
