// Bobky a hnojení (#63): produkce bobků, kvalita půdy (saturace + setrvačnost),
// kapacitní bonus, zásoba/braní ze skladu, umělé hnojivo, per-stádo, save.
import { newGame } from '../src/io/state.js';
import { step } from '../src/sim/simulation.js';
import { defaultSoil, manureRate, soilDemand, soilSnapshot, soilMultOf, stepSoil } from '../src/sim/soil.js';
import { herdCapacity, soilCapMult } from '../src/content/locations.js';
import { setSoil, toggleSoil } from '../src/econ/actions.js';
import { serialize, deserialize } from '../src/io/save.js';
import { createGroup } from '../src/sim/groups.js';
import { SOIL } from '../src/config.js';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }
function run(state, seconds, dt = 0.5) { for (let t = 0; t < seconds; t += dt) step(state, dt); }

// --- výchozí stav -----------------------------------------------------------
{
  const s = newGame();
  const soil = s.groups[0].soil;
  check('newGame: stádo má soil', !!soil);
  check('výchozí q = 0', soil.q === 0);
  check('výchozí input = 100 %', soil.input === 1);
  check('výchozí konverze zapnutá', soil.convert === true);
  check('výchozí braní ze zásoby zapnuté', soil.useStock === true);
  check('výchozí umělé hnojivo vypnuté', soil.fertMode === 'off');
}

// --- produkce bobků: dítě poloviční, dospělá/stará plné --------------------
{
  const adults = newGame().groups[0];
  adults.counts = { M: { child: 0, adult: 10, old: 0 }, F: { child: 0, adult: 10, old: 0 } };
  const kids = newGame().groups[0];
  kids.counts = { M: { child: 20, adult: 0, old: 0 }, F: { child: 20, adult: 0, old: 0 } };
  check('20 dospělých = 20 bobků/s (manurePerSheep=1)', Math.abs(manureRate(adults) - 20) < 1e-9);
  check('děti dávají poloviční bobky (40 dětí = 20/s)', Math.abs(manureRate(kids) - 20) < 1e-9);
  const olds = newGame().groups[0];
  olds.counts = { M: { child: 0, adult: 0, old: 10 }, F: { child: 0, adult: 0, old: 10 } };
  check('staré ovce dávají plné bobky', Math.abs(manureRate(olds) - 20) < 1e-9);
}

// --- fáze 1: bobky/hnojení zamčené (stepSoil nic nedělá) --------------------
{
  const s = newGame();   // fáze 1
  s.groups[0].counts.M.adult = 50; s.groups[0].counts.F.adult = 50;
  const left = stepSoil(s.groups[0], 1, s);   // přímo, bez postupu fáze přes step()
  check('fáze 1: stepSoil nevrátí žádné bobky', left === 0);
  check('fáze 1: kvalita půdy se nemění (zamčeno)', s.groups[0].soil.q === 0);
  check('fáze 1: soilCapMult = 1', soilCapMult(s) === 1);
}

// --- fáze 2+: kvalita půdy stoupá a zvedá kapacitu -------------------------
{
  const s = newGame(); s.phase = 2;
  s.groups[0].counts.M.adult = 20; s.groups[0].counts.F.adult = 20;
  const cap0 = herdCapacity(s);
  check('q=0 → soilCapMult = 1', Math.abs(soilCapMult(s) - 1) < 1e-9);
  run(s, 400);
  check('kvalita půdy stoupne nad 0', s.groups[0].soil.q > 0.01);
  check('kvalita půdy je v [0,1]', s.groups[0].soil.q > 0 && s.groups[0].soil.q <= 1);
  check('soilCapMult > 1 při pohnojené půdě', soilCapMult(s) > 1);
  check('kapacita pastvin vzroste s kvalitou půdy', herdCapacity(s) > cap0);
  check('bonus odpovídá maxBonus × q', Math.abs(soilMultOf(s.groups[0]) - (1 + SOIL.maxBonus * s.groups[0].soil.q)) < 1e-9);
}

// --- setrvačnost: q neskočí na cíl v jednom kroku --------------------------
{
  const s = newGame(); s.phase = 2;
  s.groups[0].counts.M.adult = 50; s.groups[0].counts.F.adult = 50;
  const snap = soilSnapshot(s.groups[0], s);
  check('snapshot má kladný cíl saturace', snap.target > 0);
  stepSoil(s.groups[0], 1, s);   // jeden malý krok
  check('po jednom kroku je q daleko pod cílem (setrvačnost)', s.groups[0].soil.q > 0 && s.groups[0].soil.q < snap.target * 0.2);
}

// --- pokles s setrvačností: při výpadku produkce q pomalu klesá ------------
{
  const s = newGame(); s.phase = 2;
  s.groups[0].soil.q = 0.6;
  s.groups[0].counts = { M: { child: 0, adult: 0, old: 0 }, F: { child: 0, adult: 0, old: 0 } };  // žádné ovce → žádné bobky
  s.groups[0].soil.convert = true;
  run(s, 30);
  check('q klesá při výpadku (setrvačnost)', s.groups[0].soil.q < 0.6);
  check('q neklesne hned na 0 (pomalý pokles)', s.groups[0].soil.q > 0.2);
  const qMid = s.groups[0].soil.q;
  run(s, 120);
  check('q dál klesá k nule', s.groups[0].soil.q < qMid);
}

// --- konverze vypnutá: půda nehnojí, bobky se skladují ---------------------
{
  const s = newGame(); s.phase = 2;
  s.groups[0].counts.M.adult = 30; s.groups[0].counts.F.adult = 30;
  s.groups[0].soil.convert = false;
  run(s, 60);
  check('konverze off: q zůstává 0', s.groups[0].soil.q < 1e-6);
  check('konverze off: všechny bobky jdou do zásoby', s.resources.bobky > 0);
}

// --- input 0 %: nic do půdy, vše do zásoby ---------------------------------
{
  const s = newGame(); s.phase = 2;
  s.groups[0].counts.M.adult = 30; s.groups[0].counts.F.adult = 30;
  setSoil(s, s.groups[0].id, { input: 0, useStock: false });
  run(s, 60);
  check('input 0 %: q zůstává 0', s.groups[0].soil.q < 1e-6);
  check('input 0 %: bobky se skladují', s.resources.bobky > 0);
}

// --- braní ze zásoby: při nedostatku produkce čerpá ze skladu --------------
{
  const s = newGame(); s.phase = 2;
  s.groups[0].counts.M.adult = 2; s.groups[0].counts.F.adult = 2;   // málo ovcí → produkce < poptávka
  s.resources.bobky = 100000;
  s.groups[0].soil.useStock = true;
  const stock0 = s.resources.bobky;
  const q0 = s.groups[0].soil.q;
  run(s, 60);
  check('braní ze zásoby: zásoba klesá při nedostatku produkce', s.resources.bobky < stock0);
  check('braní ze zásoby: q stoupá díky doplnění', s.groups[0].soil.q > q0);

  // vypnuté braní → zásoba se nečerpá (a q nižší)
  const s2 = newGame(); s2.phase = 2;
  s2.groups[0].counts.M.adult = 2; s2.groups[0].counts.F.adult = 2;
  s2.resources.bobky = 100000;
  s2.groups[0].soil.useStock = false;
  run(s2, 60);
  check('vypnuté braní: zásoba se nečerpá', s2.resources.bobky >= 100000 - 1e-6);
  check('vypnuté braní → nižší q než se zásobou', s2.groups[0].soil.q < s.groups[0].soil.q);
}

// --- přebytek bobků se skladuje (hustá pastvina) ---------------------------
{
  const s = newGame(); s.phase = 2;
  s.groups[0].genes.lifespan.mu = 1e6;   // ať stádo během testu neumírá (stabilní produkce)
  s.groups[0].counts.M.adult = 2000; s.groups[0].counts.F.adult = 2000;  // produkce >> poptávka
  const snap = soilSnapshot(s.groups[0], s);
  check('hustá pastvina: cílová saturace je vysoká', snap.target > 0.9);
  check('hustá pastvina: přebytek bobků /s je velký', snap.stored > snap.demand);
  run(s, 300);   // tau=60 → ~300 s stačí, aby se q přiblížila cíli
  check('hustá pastvina: přebytek bobků se ukládá', s.resources.bobky > 0);
  check('hustá pastvina: q se blíží plné saturaci', s.groups[0].soil.q > 0.7);
}

// --- umělé hnojivo: utrácí kredity, zvyšuje q, klesající výnos -------------
{
  const base = newGame(); base.phase = 2;
  base.groups[0].counts.M.adult = 2; base.groups[0].counts.F.adult = 2;
  base.resources.credits = 1e9; base.rates = { _income: 1e6 };
  const fertd = newGame(); fertd.phase = 2;
  fertd.groups[0].counts.M.adult = 2; fertd.groups[0].counts.F.adult = 2;
  fertd.resources.credits = 1e9; fertd.rates = { _income: 1e6 };
  setSoil(fertd, fertd.groups[0].id, { fertMode: 'fixed', fertValue: 5000, useStock: false });
  setSoil(base, base.groups[0].id, { useStock: false });
  const cr0 = fertd.resources.credits;
  run(base, 60); run(fertd, 60);
  check('umělé hnojivo utrácí kredity', fertd.resources.credits < cr0);
  check('umělé hnojivo zvedá q nad stav bez hnojiva', fertd.groups[0].soil.q > base.groups[0].soil.q);
  // klesající výnos: dvojnásobná útrata < dvojnásobek bobků
  const m1 = SOIL.fert.k * Math.pow(1000, SOIL.fert.exp);
  const m2 = SOIL.fert.k * Math.pow(2000, SOIL.fert.exp);
  check('klesající výnos (2× útrata < 2× bobky)', m2 < 2 * m1 && m2 > m1);

  // procentní režim: utrácí podíl příjmu
  const pct = newGame(); pct.phase = 2;
  pct.groups[0].counts.M.adult = 2; pct.groups[0].counts.F.adult = 2;
  pct.resources.credits = 1e9; pct.rates = { _income: 1e5 };
  setSoil(pct, pct.groups[0].id, { fertMode: 'percent', fertValue: 0.5 });
  const c0 = pct.resources.credits;
  step(pct, 1);
  check('procentní hnojivo utrácí podíl příjmu', pct.resources.credits < c0);
}

// --- kvalita půdy je per stádo ---------------------------------------------
{
  const s = newGame(); s.phase = 9;   // manažer → víc stád
  s.groups[0].counts.M.adult = 30; s.groups[0].counts.F.adult = 30;
  const g2 = createGroup(s);
  g2.counts.M.adult = 30; g2.counts.F.adult = 30;
  g2.soil.convert = false;            // druhé stádo nehnojí
  check('nové stádo má vlastní soil', !!g2.soil && g2.soil !== s.groups[0].soil);
  run(s, 200);
  check('per-stádo: hnojící stádo má q > 0', s.groups[0].soil.q > 0.01);
  check('per-stádo: nehnojící stádo má q ≈ 0', g2.soil.q < 1e-6);
  check('per-stádo: kvalita se liší mezi stády', s.groups[0].soil.q !== g2.soil.q);
}

// --- akce setSoil / toggleSoil ---------------------------------------------
{
  const s = newGame();
  const id = s.groups[0].id;
  setSoil(s, id, { input: 2 });
  check('setSoil ořízne input na ≤1', s.groups[0].soil.input === 1);
  setSoil(s, id, { input: -1 });
  check('setSoil ořízne input na ≥0', s.groups[0].soil.input === 0);
  setSoil(s, id, { fertMode: 'nonsense' });
  check('setSoil ignoruje neplatný režim', s.groups[0].soil.fertMode === 'off');
  setSoil(s, id, { fertMode: 'percent', fertValue: -5 });
  check('setSoil: platný režim projde, fertValue ≥0', s.groups[0].soil.fertMode === 'percent' && s.groups[0].soil.fertValue === 0);
  toggleSoil(s, id, 'convert');
  check('toggleSoil přepne konverzi', s.groups[0].soil.convert === false);
}

// --- save/load roundtrip ----------------------------------------------------
{
  const s = newGame(); s.phase = 2;
  s.groups[0].counts.M.adult = 30; s.groups[0].counts.F.adult = 30;
  setSoil(s, s.groups[0].id, { input: 0.7, fertMode: 'fixed', fertValue: 123 });
  run(s, 120);
  const q = s.groups[0].soil.q, bobky = s.resources.bobky || 0;
  check('po běhu je q > 0 a zásoba bobků ≥ 0', q > 0 && bobky >= 0);
  const s2 = deserialize(serialize(s));
  check('roundtrip zachová q', Math.abs(s2.groups[0].soil.q - q) < 1e-6);
  check('roundtrip zachová nastavení (input/fert)', s2.groups[0].soil.input === 0.7 && s2.groups[0].soil.fertMode === 'fixed' && s2.groups[0].soil.fertValue === 123);
  check('roundtrip zachová zásobu bobků', Math.abs((s2.resources.bobky || 0) - bobky) < 1e-3);
}

// --- starý save bez soil se doplní (hydrate) -------------------------------
{
  const old = newGame();
  delete old.groups[0].soil;
  const loaded = deserialize(serialize(old));
  check('hydrate doplní chybějící soil', !!loaded.groups[0].soil);
  check('doplněný soil má výchozí hodnoty', loaded.groups[0].soil.q === 0 && loaded.groups[0].soil.convert === true);
  let ok = true;
  try { loaded.phase = 2; loaded.groups[0].counts.M.adult = 10; loaded.groups[0].counts.F.adult = 10; run(loaded, 30); } catch (e) { ok = false; console.error(e); }
  check('starý save (bez soil) běží bez chyby', ok && isFinite(loaded.groups[0].soil.q));
}

// --- soilDemand souvisí s rozlohou -----------------------------------------
{
  const small = newGame(); small.phase = 2;
  const big = newGame(); big.phase = 2;
  big.land.worlds.earth.counts = { 0: 100 };   // 100× větší rozloha
  check('větší rozloha → větší poptávka po bobcích', soilDemand(big.groups[0], big) > soilDemand(small.groups[0], small));
}

console.log(`soil: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
