// ===========================================================================
//  Bobky a hnojení (#63). Každá ovce dělá bobky (dítě poloviční, dospělá/stará
//  plné). Část se v reálném čase použije na hnojení pastviny → roste KVALITA
//  PŮDY (saturace 0..1), a ta zvedá kapacitu pastvin (víc ovcí). Přebytek bobků
//  se ukládá do zásoby; při nedostatku se z ní bere. Kvalita má setrvačnost
//  (pomalu klesá při výpadku, zase stoupá při návratu). Kvalita je PRO KAŽDÉ
//  STÁDO ZVLÁŠŤ. Umělé hnojivo doplňuje půdu za kredity (klesající výnos).
//
//  Saturace = saturující funkce poměru nabídka/poptávka (Hill): supply/(supply+
//  demand). Poptávka roste s rozlohou půdy (metry), nabídka s počtem ovcí, takže
//  100 % se blíží až s pokročilou hustotou (vícepatrové farmy a výš).
// ===========================================================================
import { SOIL } from '../config.js';
import { totalCount } from './cohort.js';
import { totalArea } from '../content/locations.js';

export function defaultSoil() {
  return { q: 0, input: SOIL.defaultInput, convert: true, useStock: true, fertMode: 'off', fertValue: 0 };
}

// Vážený počet ovcí pro produkci bobků (dítě 0,5; dospělá/stará 1).
function weightedSheep(group) {
  const c = group.counts, w = SOIL.stageManure;
  return (c.M.child + c.F.child) * w.child + (c.M.adult + c.F.adult) * w.adult + (c.M.old + c.F.old) * w.old;
}

// Produkce bobků skupiny (bobky/s).
export const manureRate = (group) => SOIL.manurePerSheep * weightedSheep(group);

// Podíl půdy připadající na skupinu = podíl na celkové rozloze dle populace
// (jedno stádo = celá rozloha). Saturace tak souvisí s množstvím půdy v metrech.
function soilAreaOf(group, state) {
  const area = totalArea(state);
  let pop = 0; for (const g of state.groups) pop += totalCount(g);
  if (pop <= 0) return area / Math.max(1, state.groups.length);
  return area * (totalCount(group) / pop);
}

// Referenční tok bobků (bobky/s) pro saturaci půdy skupiny (Hill: nabídka = tento
// tok → q = 0,5). Roste s rozlohou půdy připadající na stádo.
export const soilDemand = (group, state) => SOIL.demandPerArea * soilAreaOf(group, state);

// Kapacitní násobič z kvality půdy jedné skupiny (1 = bez bonusu).
export const soilMultOf = (group) => 1 + SOIL.maxBonus * ((group.soil && group.soil.q) || 0);

// Čistý náhled pro UI (bez mutace stavu): co se právě děje s bobky a půdou.
export function soilSnapshot(group, state) {
  const s = group.soil || defaultSoil();
  const prod = manureRate(group);
  const demand = soilDemand(group, state);
  const inputRate = s.convert ? prod * s.input : 0;
  const toSoil = Math.min(inputRate, demand);     // bobky z produkce reálně spotřebované půdou
  const stored = prod - toSoil;                   // přebytek do zásoby (bobky/s)
  const r = demand > 0 ? inputRate / demand : (inputRate > 0 ? Infinity : 0);
  const target = r === Infinity ? 1 : r / (r + 1);
  return { prod, demand, inputRate, toSoil, stored, q: s.q, target, bonus: SOIL.maxBonus * s.q };
}

// Spotřeba kreditů → bobky z umělého hnojiva (klesající výnos, do nekonečna).
// Vrací { manure (bobky/s), spend (kredity utracené tento tik) }.
function fertilizer(group, dt, state) {
  const s = group.soil;
  if (s.fertMode !== 'percent' && s.fertMode !== 'fixed') return { manure: 0, spend: 0 };
  const income = (state.rates && state.rates._income) || 0;
  const budget = s.fertMode === 'percent'
    ? Math.max(0, s.fertValue) * Math.max(0, income)     // % z příjmu /s
    : Math.max(0, s.fertValue);                          // pevně /s
  const spend = Math.min(state.resources.credits || 0, budget * dt);
  if (!(spend > 0)) return { manure: 0, spend: 0 };
  const manure = SOIL.fert.k * Math.pow(spend / dt, SOIL.fert.exp);   // křivka se zplošťuje
  return { manure, spend };
}

// Posun půdy o jeden tik. Mutuje group.soil.q, případně state.resources.bobky
// (braní ze zásoby) a state.resources.credits (umělé hnojivo). Vrací množství
// bobků k uložení do produkce (přebytek → zásoba).
export function stepSoil(group, dt, state) {
  if (state.phase < SOIL.unlockPhase || !(dt > 0)) return 0;
  if (!group.soil) group.soil = defaultSoil();
  const s = group.soil;
  const prod = manureRate(group);                 // bobky/s vyrobené
  const demand = soilDemand(group, state);        // referenční tok pro saturaci

  // 1) bobky z produkce do půdy (podíl výnosu, jen pokud je konverze zapnutá)
  const inputRate = s.convert ? prod * s.input : 0;
  const consumedFromProd = Math.min(inputRate, demand);   // půda spotřebuje max referenční tok
  let leftover = prod - consumedFromProd;                 // zbytek produkce → zásoba
  let supply = inputRate;                                  // tok pro saturaci (může přesáhnout demand)

  // 2) při nedostatku z produkce vezmi ze zásoby (lze vypnout)
  if (s.convert && s.useStock && inputRate < demand) {
    const stock = state.resources.bobky || 0;
    const draw = Math.min(stock, (demand - inputRate) * dt);   // dorovnej k referenčnímu toku
    if (draw > 0) { state.resources.bobky = stock - draw; supply += draw / dt; }
  }

  // 3) umělé hnojivo (kredity → bobky, klesající výnos)
  const fert = fertilizer(group, dt, state);
  if (fert.spend > 0) { state.resources.credits -= fert.spend; supply += fert.manure; }

  // 4) cílová saturace (Hill) + setrvačnost (q se plynule blíží k cíli)
  const r = demand > 0 ? supply / demand : (supply > 0 ? Infinity : 0);
  const target = r === Infinity ? 1 : r / (r + 1);
  const alpha = 1 - Math.exp(-dt / SOIL.tau);
  s.q = Math.max(0, Math.min(1, s.q + (target - s.q) * alpha));
  group._soilTarget = target;                     // transientní (trend v UI; nesaveuje se)

  return leftover * dt;                            // bobky → produkce (uloží se do zásoby)
}
