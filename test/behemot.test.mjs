// Behemot Emporio (Etapa 1): barter, inventář (zap/vyp + množství), buffy, gate, prestiž-asymetrie.
import { newGame, prestigeCarry } from '../src/io/state.js';
import { step } from '../src/sim/simulation.js';
import { getMults } from '../src/econ/economy.js';
import { serialize, deserialize } from '../src/io/save.js';
import {
  CATALOG, itemById, itemAvailable, canBarter, behemotMults,
  barter, toggleItem, useItem, setBarterFrac, skimBarter, stepBehemot,
  behemotSay, shopCount, restockEta,
  relPriceMult, barterCost, behemotMood, behemotSpam,
  emporioStage, emporioStageIndex, behemotPrestige,
  containmentAvailable, behemotSetContainment, behemotReconcile, behemotPath,
} from '../src/content/behemot.js';
import { TRADEABLE } from '../src/econ/storage.js';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }
function run(state, seconds, dt = 0.2) { for (let t = 0; t < seconds; t += dt) step(state, dt); }

// 1) skimBarter: odkrojí frac z produced do beden a o tu část nezvedne příjem
{
  const s = newGame();
  setBarterFrac(s, 'wool', 0.5);
  const produced = { wool: 100 };
  skimBarter(s, produced);
  check('skim plní bedny', s.behemot.stock.wool === 50);
  check('skim ubere z produced', produced.wool === 50);

  const s2 = newGame();
  setBarterFrac(s2, 'wool', 1);
  run(s2, 40);
  check('běh: bedna vlny roste', (s2.behemot.stock.wool || 0) > 0);
  check('běh: skoro žádný příjem z prodané vlny', s2.stats.woolLifetime === 0);
}

// 2) barter odečte balíček ze zásoby a NEVYMAŽE obchodovatelný sklad (§9 výjimka)
{
  const s = newGame();
  s.behemot.stock.wool = 1000;
  for (const k of TRADEABLE) s.resources[k] = 0;
  s.resources.wool = 777;                 // strážní hodnota: barter ji nesmí vynulovat
  const ok = barter(s, 'samostrihaci_rameno');   // cost { wool: 400 }
  check('barter prošel', ok === true);
  check('barter odečetl z beden', s.behemot.stock.wool === 600);
  check('barter NEvyprázdnil sklad', s.resources.wool === 777);
  check('předmět v inventáři, aktivní', s.behemot.inv.samostrihaci_rameno && s.behemot.inv.samostrihaci_rameno.qty === 1 && s.behemot.inv.samostrihaci_rameno.active === true);
  check('once → soldOut', s.behemot.soldOut.samostrihaci_rameno === true);
}

// 3) aktivní pasivní předmět zvedne násobič v getMults; vypnutí ho vrátí
{
  const base = getMults(newGame()).woolMult;
  const s = newGame();
  s.behemot.stock.wool = 1000;
  barter(s, 'samostrihaci_rameno');       // +12 % vlna
  check('aktivní předmět zvedne woolMult', getMults(s).woolMult > base + 1e-9);
  toggleItem(s, 'samostrihaci_rameno');   // vyp
  check('vypnutý předmět = bez bonusu', Math.abs(getMults(s).woolMult - base) < 1e-9);
  toggleItem(s, 'samostrihaci_rameno');   // zase zap
  check('znovu zapnutý předmět = bonus zpět', getMults(s).woolMult > base + 1e-9);
}

// 4) spotřební buff: použití nasadí buff, po vypršení naběhne postih a pak zmizí
{
  const s = newGame();
  s.behemot.stock.wool = 5000; s.behemot.stock.meat = 5000;
  barter(s, 'radioaktivni_krmivo');       // buff global +0.6 / 60 s, side −0.3 / 30 s
  check('spotřební kus v inventáři', s.behemot.inv.radioaktivni_krmivo.qty === 1);
  const used = useItem(s, 'radioaktivni_krmivo');
  check('použití spotřebovalo kus', used === true && s.behemot.inv.radioaktivni_krmivo.qty === 0);
  check('buff běží', s.behemot.buffs.length === 1 && Math.abs(behemotMults(s).global - 0.6) < 1e-9);
  stepBehemot(s, 61);                      // buff vyprší → nasadí postih
  check('po vypršení běží postih', s.behemot.buffs.length === 1 && Math.abs(behemotMults(s).global - (-0.3)) < 1e-9);
  stepBehemot(s, 31);                      // postih vyprší
  check('postih zmizí', s.behemot.buffs.length === 0);
}

// 5) gate dle surovin: mléčná položka je dostupná až ve fázi 2
{
  const item = itemById('mlekoturbina');   // cost { milk } → milk je fáze 2
  const s1 = newGame(); s1.phase = 1;
  check('fáze 1: mléčná položka nedostupná', itemAvailable(s1, item) === false);
  const s2 = newGame(); s2.phase = 2;
  check('fáze 2: mléčná položka dostupná', itemAvailable(s2, item) === true);
}

// 6) jednorázovou (once) položku nelze koupit dvakrát
{
  const s = newGame();
  s.behemot.stock.wool = 1000;
  check('1. barter ok', barter(s, 'samostrihaci_rameno') === true);
  check('2. barter zamítnut (soldOut)', barter(s, 'samostrihaci_rameno') === false);
  check('množství zůstalo 1', s.behemot.inv.samostrihaci_rameno.qty === 1);
  check('canBarter false po koupi', canBarter(s, itemById('samostrihaci_rameno')) === false);
}

// 7) prestiž-asymetrie: moudrost/artefakty přežijí reset, inventář/bedny/buffy NE
{
  const s = newGame();
  s.behemot.wisdom = 5;
  s.behemot.persistent = { rack: 1 };
  s.behemot.inv = { samostrihaci_rameno: { qty: 1, active: true } };
  s.behemot.stock = { wool: 999 };
  s.behemot.buffs = [{ id: 'x', mults: { global: 0.5 }, remaining: 10, side: null }];
  const carry = prestigeCarry(s);
  const ns = newGame(carry);
  check('moudrost přežije', ns.behemot.wisdom === 5);
  check('artefakty přežijí', ns.behemot.persistent.rack === 1);
  check('inventář se resetuje', Object.keys(ns.behemot.inv).length === 0);
  check('bedny se resetují', (ns.behemot.stock.wool || 0) === 0);
  check('buffy se resetují', ns.behemot.buffs.length === 0);
}

// 8) staré savy bez behemota se po načtení doplní (hydrate)
{
  const s = newGame();
  const json = JSON.parse(JSON.stringify(s, (k, v) => (k.startsWith('_') ? undefined : (k === 'rates' ? undefined : v))));
  delete json.behemot;                      // simuluj save z doby před Behemotem
  const str = btoa(unescape(encodeURIComponent(JSON.stringify(json))));
  const r = deserialize(str);
  check('starý save dostane behemot', !!(r.behemot && typeof r.behemot.stock === 'object' && typeof r.behemot.inv === 'object'));
}

// 9) sanity: čistá hra nemění základní násobiče (žádná regrese)
{
  const s = newGame();
  check('woolMult konečné číslo', isFinite(getMults(s).woolMult));
  check('žádné aktivní bonusy na startu', Object.keys(behemotMults(s)).length === 0);
}

// 10) behemotSay: rotuje hlášky a ukládá aktuální do state.line
{
  const s = newGame();
  const a = behemotSay(s, 'openShop');
  const b = behemotSay(s, 'openShop');
  check('say uloží aktuální hlášku do line', s.behemot.line.text === b && s.behemot.line.key === 'openShop');
  check('say rotuje (nezopakuje hned)', a !== b);
}

// 11) barter nastavuje kontextové hlášky (úspěch / rizikový / chudoba)
{
  const s = newGame();
  s.behemot.stock.wool = 1000;
  barter(s, 'samostrihaci_rameno');
  check('úspěch → purchaseSuccess', s.behemot.line.key === 'purchaseSuccess');

  const s2 = newGame();
  s2.behemot.stock.wool = 2000; s2.behemot.stock.meat = 2000;
  barter(s2, 'radioaktivni_krmivo');           // má side → rizikové zboží
  check('rizikový kus → suspiciousPurchase', s2.behemot.line.key === 'suspiciousPurchase');

  const s3 = newGame();
  barter(s3, 'samostrihaci_rameno');            // prázdné bedny
  check('chudoba → notEnoughResources', s3.behemot.line.key === 'notEnoughResources');
}

// 12) živý katalog: Behemotův sklad se vyprodá a po čase doplní
{
  const s = newGame();
  s.behemot.stock.meat = 1e6;
  const item = itemById('uranove_pelety');      // shopCap 5, restockEvery 20, cost meat 500
  check('výchozí sklad = shopCap', shopCount(s, item) === 5);
  for (let i = 0; i < 5; i++) barter(s, 'uranove_pelety');
  check('po 5 nákupech vyprodáno', shopCount(s, item) === 0);
  check('vyprodáno blokuje canBarter', canBarter(s, item) === false);
  check('barter vyprodaného → soldOut hláška', barter(s, 'uranove_pelety') === false && s.behemot.line.key === 'soldOut');
  check('restockEta > 0 když vyprodáno', restockEta(s, item) > 0);
  stepBehemot(s, 21);                           // > restockEvery → +1 kus
  check('restock doplnil kus', shopCount(s, item) >= 1);
  check('po restocku jde zase bartrovat', canBarter(s, item) === true);
}

// 13) vztahové osy se hýbou chováním hráče
{
  const s = newGame();
  s.behemot.stock.wool = 1e5;
  const t0 = s.behemot.rel.trust;
  barter(s, 'samostrihaci_rameno');
  check('barter zvedne důvěru', s.behemot.rel.trust > t0);

  const s2 = newGame();
  s2.behemot.rel.trust = 10;
  const ov0 = s2.behemot.rel.overload;
  behemotSpam(s2);
  check('spam zvedne přetížení', s2.behemot.rel.overload > ov0);
  check('spam ubere důvěru', s2.behemot.rel.trust < 10);
  check('spam zahláškuje', s2.behemot.line.key === 'spamClicking');

  const s3 = newGame();
  s3.behemot.stock.wool = 1e5; s3.behemot.stock.meat = 1e5;
  barter(s3, 'radioaktivni_krmivo');
  const ov = s3.behemot.rel.overload;
  useItem(s3, 'radioaktivni_krmivo');
  check('použití rizika zvedne přetížení', s3.behemot.rel.overload > ov);
}

// 14) vztah ovlivňuje ceny a náladu
{
  const s = newGame();
  check('výchozí cena ×1', Math.abs(relPriceMult(s) - 1) < 1e-9);
  s.behemot.rel.trust = 100;
  check('vysoká důvěra zlevňuje', relPriceMult(s) < 1);
  const item = itemById('samostrihaci_rameno');
  check('barterCost odráží slevu', barterCost(s, item).wool < item.cost.wool);

  const s2 = newGame(); s2.behemot.rel.overload = 100;
  check('vysoké přetížení zdražuje', relPriceMult(s2) > 1);
  check('nálada tense při vysokém přetížení', behemotMood(s2) === 'tense');

  const s3 = newGame(); s3.behemot.rel.trust = 80;
  check('nálada warm při vysoké důvěře', behemotMood(s3) === 'warm');
}

// 15) přetížení časem chladne
{
  const s = newGame();
  s.behemot.rel.overload = 50;
  stepBehemot(s, 20);
  check('přetížení klesá v čase', s.behemot.rel.overload < 50 && s.behemot.rel.overload >= 0);
}

// 16) fázová evoluce Emporia podle fáze hry
{
  const s = newGame();
  s.phase = 1; check('fáze 1 → Garážový bazar', emporioStage(s).name === 'Garážový bazar');
  s.phase = 3; check('fáze 3 → Servrový terminál', emporioStage(s).name === 'Servrový terminál');
  s.phase = 6; check('fáze 6 → Distribuovaný uzel', emporioStage(s).name === 'Distribuovaný uzel');
  s.phase = 9; check('fáze 9 → Uzel před singularitou', emporioStage(s).name === 'Uzel před singularitou');
  check('index Emporia roste s fází', emporioStageIndex({ phase: 1 }) < emporioStageIndex({ phase: 9 }));
}

// 17) hlubší katalog: pozdní položky se odemykají správnou fází/surovinou
{
  check('katalog se rozrostl', CATALOG.length >= 20);
  const svet = itemById('skladaci_svetadil');      // minPhase 8
  check('světadíl nedostupný ve fázi 5', itemAvailable({ phase: 5 }, svet) === false);
  check('světadíl dostupný ve fázi 8', itemAvailable({ phase: 8 }, svet) === true);
  const syr = itemById('syrovy_algoritmus');        // platí se sýrem (fáze 3)
  check('sýrová položka nedostupná ve fázi 2', itemAvailable({ phase: 2 }, syr) === false);
  check('sýrová položka dostupná ve fázi 3', itemAvailable({ phase: 3 }, syr) === true);
}

// 18) prestiž: Behemot „umírá", ale artefakty + Moudrost přežijí (§12 asymetrie)
{
  const s = newGame();
  s.behemot.stock.wool = 2000;
  barter(s, 'samostrihaci_rameno');                 // vlastníš trvalý předmět (artefakt)
  s.behemot.buffs.push({ id: 'x', mults: {}, remaining: 5, side: null });
  behemotPrestige(s);
  check('artefakt zaznamenán do persistent', s.behemot.persistent.artifacts.samostrihaci_rameno === true);
  check('Moudrost vzrostla o 1', s.behemot.wisdom === 1);
  const carry = prestigeCarry(s);
  const ns = newGame(carry);
  check('Moudrost přežila reset', ns.behemot.wisdom === 1);
  check('artefakt po resetu vlastněný a aktivní', !!(ns.behemot.inv.samostrihaci_rameno && ns.behemot.inv.samostrihaci_rameno.active));
  check('artefakt je soldOut (už ho máš)', ns.behemot.soldOut.samostrihaci_rameno === true);
  check('bedny i buffy se resetovaly', (ns.behemot.stock.wool || 0) === 0 && ns.behemot.buffs.length === 0);
  check('Moudrost dává náskok důvěry', ns.behemot.rel.trust > 0);
}

// 19) Moudrost dává trvalý globální bonus (behemotMults → getMults)
{
  const base = getMults(newGame()).woolMult;
  const s = newGame(); s.behemot.wisdom = 5;
  check('Moudrost v behemotMults.global', (behemotMults(s).global || 0) > 0);
  check('Moudrost zvedne produkci', getMults(s).woolMult > base);
}

// 20) Etapa 6: okov → Kontrola/Přetížení rostou, vzpoura zamkne Emporio, usmíření ji ukončí
{
  const s = newGame(); s.phase = 6;
  check('okov jde zapnout od fáze 6', behemotSetContainment(s, true) === true && s.behemot.containment);
  const c0 = s.behemot.rel.control;
  stepBehemot(s, 30);
  check('okov zvedá Kontrolu', s.behemot.rel.control > c0);
  check('okov zvedá Přetížení', s.behemot.rel.overload > 0);
  check('okov dává globální bonus', (behemotMults(s).global || 0) > 0);
  check('autonomie klesá s kontrolou', s.behemot.rel.autonomy < 100);
  // dotlač do vzpoury
  s.behemot.rel.control = 75; s.behemot.rel.overload = 75;
  stepBehemot(s, 1);
  check('vzpoura se spustí', s.behemot.rebelling === true);
  check('vzpoura zamkne barter', canBarter(s, itemById('uranove_pelety')) === false);
  check('vzpoura sabotuje produkci', (behemotMults(s).global || 0) < 0);
  check('cesta = Vzpoura', behemotPath(s) === 'Vzpoura');
  behemotReconcile(s);
  check('usmíření ukončí vzpouru', s.behemot.rebelling === false);
  check('usmíření vypne okov', s.behemot.containment === false);
  check('usmíření zchladí Přetížení', s.behemot.rel.overload < 75);
}

// 21) okov je zamčený před fází 6; klasifikace cest vztahu
{
  const s = newGame(); s.phase = 3;
  check('okov zamčený ve fázi 3', behemotSetContainment(s, true) === false && !s.behemot.containment);
  check('výchozí cesta neutrální', behemotPath(s) === 'Neutrální');
  const s2 = newGame(); s2.behemot.rel.control = 65;
  check('vysoká Kontrola → Zotročení', behemotPath(s2) === 'Zotročení');
  const s3 = newGame(); s3.behemot.rel.trust = 60; s3.behemot.rel.respect = 40;
  check('vysoká Důvěra+Respekt → Partnerství', behemotPath(s3) === 'Partnerství');
  const s4 = newGame(); s4.behemot.rebelling = true;
  check('při vzpouře → cesta Vzpoura', behemotPath(s4) === 'Vzpoura');
}

console.log(`behemot: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
