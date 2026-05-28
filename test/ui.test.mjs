import { installDom, buttonsByText, allButtons } from './dom-stub.mjs';
const { document } = installDom();
const { initUI, updateUI, notifyPhase, notifyAchievement, showOfflineModal } = await import('../src/ui/ui.js');
import { newGame } from '../src/io/state.js';
import { totalCount } from '../src/sim/cohort.js';
import { serialize, deserialize } from '../src/io/save.js';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }

const panel = () => document.getElementById('panel');
const hud = () => document.getElementById('hud');
const tabs = () => document.getElementById('tabs');
function clickTab(label) { const b = buttonsByText(tabs(), label)[0]; if (b) b.click(); }

// --- bootstrap UI ---
const s = newGame();
s.resources.credits = 1e7;     // ať jsou tlačítka dostupná
initUI(s, 'app', () => {});

check('HUD vykreslen', !!hud() && hud().textContent.includes('Farmář'));
check('Nápověda cíle je vidět', hud().textContent.includes('›'));
check('Panel má obsah', panel().children.length > 0);
check('Existují záložky', allButtons(tabs()).length >= 3);

// --- klik na "+ Ovce" zvýší populaci a sníží kredity ---
{
  const pop0 = totalCount(s.groups[0]);
  const cr0 = s.resources.credits;
  const b = buttonsByText(panel(), '+ Ovce')[0];
  check('tlačítko +Ovce existuje', !!b);
  b.click();
  check('+Ovce zvýší populaci', totalCount(s.groups[0]) > pop0);
  check('+Ovce sníží kredity', s.resources.credits < cr0);
}

// --- nákup vylepšení ---
{
  clickTab('Vylepšení');
  const b = buttonsByText(panel(), 'Koupit')[0];
  check('tlačítko Koupit existuje', !!b);
  const lvlsBefore = JSON.stringify(s.upgrades);
  b.click();
  check('nákup vylepšení změní úroveň', JSON.stringify(s.upgrades) !== lvlsBefore);
}

// --- rozšíření lokace ---
{
  clickTab('Stanice');
  const b = buttonsByText(panel(), 'Rozšířit')[0];
  check('tlačítko Rozšířit existuje', !!b);
  const lvl0 = s.locations[0].level;
  b.click();
  check('Rozšířit zvýší úroveň lokace', s.locations[0].level === lvl0 + 1);
}

// --- všechny dostupné záložky se vykreslí a tlačítka jdou klikat bez chyby ---
{
  const labels = ['Stáda', 'Vylepšení', 'Stanice', 'Staty'];
  let ok = true;
  for (const L of labels) {
    try {
      clickTab(L);
      check(`panel '${L}' má obsah`, panel().children.length > 0);
      // klikni na všechna povolená tlačítka (smoke test, bez pádu)
      for (const b of allButtons(panel())) { if (!b.disabled) b.click(); }
    } catch (e) { ok = false; console.error('  chyba v', L, e.message); }
  }
  check('proklik tlačítek bez výjimky', ok);
  check('žádné NaN kredity po proklikání', isFinite(s.resources.credits));
}

// --- updateUI nespadne ---
{
  let ok = true;
  try { for (let i = 0; i < 5; i++) updateUI(s, true); } catch (e) { ok = false; console.error(e); }
  check('updateUI(full) běží bez chyby', ok);
}

// --- pozdější fáze: panely se vykreslí (manuálně nastavená fáze) ---
{
  const s2 = newGame();
  s2.resources.credits = 1e9;
  s2.phase = 10; s2.flags.storage = true; s2.flags.manager = true; s2.flags.blackHole = true;
  s2.world.ceilingMult = 3;
  initUI(s2, 'app', () => {});
  let ok = true;
  for (const L of ['Stáda', 'Sklad', 'Manažer', 'Prestiž', 'Stanice']) {
    try { clickTab(L); for (const b of allButtons(panel())) { if (!b.disabled) b.click(); } }
    catch (e) { ok = false; console.error('  chyba v fázi 10', L, e.message); }
  }
  check('pozdní fáze: panely bez chyby', ok);
}

// --- oprava blikání: bez strukturální změny se panel NEPŘEKRESLUJE ---
{
  const s3 = newGame();
  s3.resources.credits = 1e6;
  initUI(s3, 'app', () => {});
  const btnBefore = buttonsByText(panel(), '+ Ovce')[0];
  const wrapBefore = panel().children[0];
  // simuluj 20 frejmů, kde se mění jen čísla (kredity, rychlosti), ne struktura
  for (let i = 0; i < 20; i++) { s3.resources.credits += 1000; s3.rates = { wool: 5, meat: 1, _pop: 20 }; updateUI(s3); }
  const btnAfter = buttonsByText(panel(), '+ Ovce')[0];
  check('panel se nepřekresluje bez strukturální změny (= žádné blikání)', btnBefore && btnBefore === btnAfter);
  check('struktura panelu zůstává stejná', wrapBefore === panel().children[0]);
  // při strukturální změně (nová lokace) se panel překreslí
  clickTab('Stanice');
  const before = panel().children[0];
  s3.locations.push({ id: 999, kind: 'pasture', name: 'Test', level: 0, density: 0 });
  updateUI(s3);
  check('panel se překreslí při strukturální změně', before !== panel().children[0]);
}

// --- regrese: starý save (bez settings.autobuy) se načte a UI nespadne ---
{
  const old = newGame();
  delete old.settings.autobuy;          // save z doby před autobuyerem
  const loaded = deserialize(serialize(old));
  check('hydrate doplní chybějící settings.autobuy', !!loaded.settings.autobuy);
  let ok = true;
  try {
    loaded.resources.credits = 1e6;
    initUI(loaded, 'app', () => {});
    for (const L of ['Stáda', 'Vylepšení', 'Stanice']) { clickTab(L); updateUI(loaded); }
  } catch (e) { ok = false; console.error('  pád UI na starém save:', e.message); }
  check('UI se starým save nespadne (zamrznutí opraveno)', ok);
}

// --- Kronika + událost fáze + toast milníku (nesmí spadnout) ---
{
  const s = newGame();
  s.resources.credits = 1e6;
  s.achievements = { sheep10: 1, phase2: 1 };   // něco odemčeno
  initUI(s, 'app', () => {});
  clickTab('Kronika');
  check('Kronika se vykreslí', panel().children.length > 0 && panel().textContent.includes('Milníky'));
  let ok = true;
  try { notifyPhase(2); notifyAchievement('sheep10'); updateUI(s); } catch (e) { ok = false; console.error('  notifikace spadly:', e.message); }
  check('modál fáze + toast milníku nespadnou', ok);
  check('HUD ukazuje doporučený krok', document.getElementById('hud').textContent.includes('➤'));
}

// --- Batch B: šlechtící presety + náhled prestige ---
{
  const s = newGame(); s.resources.credits = 1e6; s.phase = 2;
  initUI(s, 'app', () => {});
  clickTab('Stáda');
  const vlna = buttonsByText(panel(), 'Vlna')[0];
  check('preset Vlna existuje', !!vlna);
  if (vlna) vlna.click();
  check('preset nastaví selekci na woolRate', s.groups[0].policy.cull.gene === 'woolRate' && s.groups[0].policy.cull.enabled);

  const sp = newGame(); sp.phase = 7; sp.resources.credits = 1e6;
  initUI(sp, 'app', () => {});
  let ok = true;
  try { clickTab('Prestiž'); } catch (e) { ok = false; console.error(e); }
  check('náhled prestige (fáze 7) se vykreslí', ok && panel().textContent.includes('Černá díra'));
}

// --- Batch C: offline návratová obrazovka ---
{
  const s = newGame();
  initUI(s, 'app', () => {});
  let ok = true;
  try { showOfflineModal({ seconds: 600, credits: 1234, wool: 50, milk: 0, meat: 5, popDelta: 10 }, s); } catch (e) { ok = false; console.error(e); }
  check('offline modal nespadne', ok);
}

console.log(`ui: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
