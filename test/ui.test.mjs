import { installDom, buttonsByText, allButtons } from './dom-stub.mjs';
const { document } = installDom();
const { initUI, updateUI } = await import('../src/ui/ui.js');
import { newGame } from '../src/io/state.js';
import { totalCount } from '../src/sim/cohort.js';

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

console.log(`ui: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
