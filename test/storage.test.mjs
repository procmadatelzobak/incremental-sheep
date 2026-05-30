// Regrese pro #38 (sklad: strop PRO KAŽDOU SUROVINU ZVLÁŠŤ + ořez při zmenšení)
// a #39 (zrušený kyslík — plocha Měsíce se už neškrtí kyslíkem).
import { newGame } from '../src/io/state.js';
import { resourceCap, clampStorage, applyProduced, storageEnabled, TRADEABLE } from '../src/econ/storage.js';
import { worldArea, effectiveWorldArea } from '../src/content/locations.js';
import { getMults } from '../src/econ/economy.js';
import { RESOURCES, BALANCE, WORLDS } from '../src/config.js';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }

// --- #38: strop per surovina ----------------------------------------------
{
  const s = newGame();
  s.phase = 6;
  s.storage.warehouseLevel = 1;
  const cap = resourceCap(s);
  check('resourceCap = base0 + úroveň × capInc', cap === BALANCE.warehouse.base0 + BALANCE.warehouse.capInc);
  check('sklad běží (od začátku)', storageEnabled(s));

  // ulož všechno (autotrade 0) — vlna i maso musí mít VLASTNÍ strop, ne sdílený
  s.storage.autotrade = { wool: 0, meat: 0 };
  const credBefore = s.resources.credits;
  const m = getMults(s);
  applyProduced(s, { wool: cap * 2 }, m);   // dvojnásobek stropu
  applyProduced(s, { meat: cap * 2 }, m);
  check('vlna se naplní po vlastní strop', Math.abs((s.resources.wool || 0) - cap) < 1e-6);
  check('maso se naplní po vlastní strop', Math.abs((s.resources.meat || 0) - cap) < 1e-6);
  check('strop je per surovina (vlna+maso > jeden strop)', (s.resources.wool + s.resources.meat) > cap + 1);
  check('přebytek nad strop se prodal (anti-softlock)', s.resources.credits > credBefore);
}

// --- #38: zmenšení stropu jen ořízne ---------------------------------------
{
  const s = newGame();
  s.phase = 6;
  s.storage.warehouseLevel = 2;
  s.resources.wool = resourceCap(s) - 1000;   // pod stropem (cap=10000 → 9000)
  s.resources.meat = 3000;
  s.storage.warehouseLevel = 1;               // strop spadne na 5000
  clampStorage(s);
  check('nad strop se ořízne na nový strop', Math.abs(s.resources.wool - resourceCap(s)) < 1e-6);
  check('pod stropem zůstane beze změny', s.resources.meat === 3000);
}

// --- #39: Měsíc už nemá kyslíkový strop ploch ------------------------------
{
  const s = newGame();
  s.land.worlds.moon.counts = { 0: 1 };       // 1 parcela 1. tieru Měsíce
  const expected = WORLDS.moon.tiers[0].area;
  check('worldArea Měsíce = plocha tieru', worldArea(s, 'moon') === expected);
  check('effectiveWorldArea = worldArea (žádný kyslíkový ořez)', effectiveWorldArea(s, 'moon') === worldArea(s, 'moon'));
  check('plocha Měsíce je kladná bez kupování kyslíku', effectiveWorldArea(s, 'moon') > 0);
}

// --- #39: kyslík je z hry pryč ---------------------------------------------
{
  const s = newGame();
  check('RESOURCES nemá kyslík', RESOURCES.oxygen === undefined);
  check('BALANCE.cost nemá kyslík', BALANCE.cost.oxygen === undefined);
  check('BALANCE nemá oxygenPerLevel', BALANCE.oxygenPerLevel === undefined);
  check('newGame nezakládá buys.oxygen', s.buys.oxygen === undefined);
  check('Měsíc nemá env.oxygenRequired', WORLDS.moon.env.oxygenRequired === undefined);
  check('kyslík není mezi obchodovatelnými', !TRADEABLE.includes('oxygen'));
}

console.log(`storage: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
