// ===========================================================================
//  Behemot Emporio (Etapa 1): barterový obchod souseda-kutila. Behemot odmítá
//  kredity ("svítící čísílka") a bere JEN fyzické suroviny (vlna, maso, mléko,
//  kosti…). Hráč si část produkce odkládá do "beden" (state.behemot.stock) a tou
//  platí. Předměty se NEspotřebují při koupi — vlastníš je v inventáři:
//   • pasivní (once): efekt platí jen když je položka aktivní (zap/vyp),
//   • spotřební (buff): drží se v množství, "Použít" spustí časovaný buff.
//  Veškerá logika Behemota žije tady; ostatní soubory mají jen tenké napojení.
//  Čísla jsou ilustrativní (lore/katalog = inspirace) a doladí se v balancingu.
// ===========================================================================
import { RESOURCES, BALANCE } from '../config.js';
import { unlocked } from '../io/state.js';
import { clamp } from '../rng.js';

// --- KATALOG ---------------------------------------------------------------
// Položka: { id, name, cat, flavor, cost:{res:amt}, once, minPhase?,
//   effect: { type:'mult', mults:{...} }                                  // trvalý pasivní bonus (jen když active)
//          | { type:'buff', mults:{...}, dur, side?:{ mults, dur }, roll? } // spotřební časovaný buff (+volitelný postih)
// }
// Dostupnost se gateuje surovinami v `cost` přes unlocked(): položka placená
// mlékem se objeví až ve fázi 2, kostmi/mozky až ve fázi 5 — nabídka tak roste
// s tím, co hráč zrovna produkuje (přesně dle zadání).
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

  // --- spotřební (buffy s množstvím; část s postihem = "sajrajt") ---
  { id: 'radioaktivni_krmivo', name: 'Radioaktivní krmivo', cat: 'Krmivo', once: false,
    cost: { wool: 800, meat: 150 },
    effect: { type: 'buff', mults: { global: 0.6 }, dur: 60, side: { mults: { global: -0.3 }, dur: 30 } },
    flavor: 'krmivo, co svítí. produkce nahoru, pak chvilku dolů. normálně.' },
  { id: 'uranove_pelety', name: 'Uranové pelety', cat: 'Krmivo', once: false,
    cost: { meat: 500 },
    effect: { type: 'buff', mults: { birth: 0.5 }, dur: 45, side: { mults: { birth: -0.25 }, dur: 20 } },
    flavor: 'uranový pelety. porody nahoru. potom se nediv.' },
  { id: 'zitrejsi_vlna', name: 'Zítřejší vlna (kapsle)', cat: 'Čas', once: false,
    cost: { wool: 6000, milk: 1200 },
    effect: { type: 'buff', mults: { wool: 1.0 }, dur: 30 },
    flavor: 'vlna ze zejtřka. dneska ji máš dneska. neptej se.' },
  { id: 'sajrajt_z_bedny', name: 'Sajrajt z bedny', cat: 'Černý trh', once: false,
    cost: { bones: 800, brain: 400 },
    effect: { type: 'buff', dur: 40,
      roll: () => (Math.random() < 0.6 ? { mults: { global: 0.8 } } : { mults: { global: -0.25 } }) },
    flavor: 'bedna. nevim co v ní je. ty to teda zjistíš.' },
];

const ITEM_BY_ID = {};
for (const it of CATALOG) ITEM_BY_ID[it.id] = it;
export const itemById = (id) => ITEM_BY_ID[id];

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
  for (const k in item.cost) if ((b.stock[k] || 0) < item.cost[k]) return false;
  return true;
}

// --- hráčské akce (volané přes wrappery v actions.js) ----------------------
// POZN: barter NEVOLÁ emptyStorage — pravidlo §9 ("nákup vyprázdní sklad") je
// vázané na nákup za KREDITY (viz spend() v actions.js). Behemot kredity odmítá,
// je tedy kanonická výjimka. Neopravovat na emptyStorage!
export function barter(state, id) {
  const item = ITEM_BY_ID[id];
  if (!item || !canBarter(state, item)) return false;
  const b = state.behemot;
  for (const k in item.cost) b.stock[k] = (b.stock[k] || 0) - item.cost[k];
  const e = b.inv[id] || (b.inv[id] = { qty: 0, active: item.effect.type === 'mult' });
  e.qty++;
  if (item.once) { b.soldOut[id] = true; e.active = true; }
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

// Expirace buffů; na konci buffu s `side` nasadí krátký postih (negativní buff).
export function stepBehemot(state, dt) {
  const b = state.behemot;
  if (!b || !b.buffs || !b.buffs.length) return;
  const kept = [];
  for (const buff of b.buffs) {
    buff.remaining -= dt;
    if (buff.remaining > 0) { kept.push(buff); continue; }
    if (buff.side) kept.push({ id: buff.id, mults: Object.assign({}, buff.side.mults), remaining: buff.side.dur, side: null });
  }
  b.buffs = kept;
}

// --- hlášky (Etapa 1: malá vestavěná sada; plný dialog je Etapa 2) ----------
const FLAVOR = {
  open: [
    'no co je. dyž už si tady, ber. ale platí se věcma, ne svítícíma čísílkama.',
    'vitej v garáži. nešahej na to, na co nemáš suroviny.',
    'kredity si strč do cloudu. tady beru vlnu, maso, kosti — fyzickou jistotu.',
  ],
};
export function behemotFlavor(state, key) {
  const arr = FLAVOR[key] || FLAVOR.open;
  const i = (Object.keys(state.behemot.inv).length + state.phase) % arr.length;
  return arr[i];
}
