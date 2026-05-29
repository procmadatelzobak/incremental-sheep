// Integrační smoke: nahraj skutečný main.js se stubem prohlížeče a proklikni frejmy.
import { installDom } from './dom-stub.mjs';
const { document } = installDom();

let pass = 0, fail = 0;
const check = (n, c) => { if (c) pass++; else { fail++; console.error('  FAIL:', n); } };

// doplň browser globály, které main.js potřebuje
document.addEventListener = () => {};
document.hidden = false;
let raf = null;
globalThis.requestAnimationFrame = (cb) => { raf = cb; return 1; };
globalThis.performance = { now: () => globalThis.__clock || 0 };
globalThis.Date.now = () => globalThis.__wallClock || 0;
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

let ok = true;
try {
  await import('../src/main.js');   // spustí bootstrap + naplánuje 1. frame
} catch (e) { ok = false; console.error('  import main.js selhal:', e); }
check('main.js se načte bez chyby', ok);
check('je naplánován frame (rAF)', typeof raf === 'function');

// proklikej několik frejmů s rostoucím časem
const hud = () => document.getElementById('hud');
const panel = () => document.getElementById('panel');
let credBefore = null;
ok = true;
try {
  for (let i = 1; i <= 80; i++) {       // 8 s herního času (přes práh autosave 5 s)
    globalThis.__clock = i * 100;       // +100 ms/frame
    globalThis.__wallClock = i * 100;
    if (i === 3) credBefore = hud() ? hud().textContent : '';
    raf(i * 100);                        // frame() se sám přeplánuje (znovu nastaví raf)
  }
} catch (e) { ok = false; console.error('  běh smyčky selhal:', e); }
check('herní smyčka běží bez chyby', ok);
check('HUD má obsah', !!hud() && hud().textContent.includes('Fáze'));
check('panel má obsah', !!panel() && panel().children.length > 0);
check('save uložen do localStorage', !!store['incremental-sheep-v3']);

// localStorage save → nové načtení obnoví stav (deserializace)
ok = true;
try {
  const { deserialize } = await import('../src/io/save.js');
  const s2 = deserialize(store['incremental-sheep-v3']);
  check('uložený stav jde načíst', s2 && s2.version === 3 && Array.isArray(s2.groups));
} catch (e) { ok = false; console.error(e); check('uložený stav jde načíst', false); }

// dlouhý suspend tabu se po návratu nesmí potichu zkrátit na 60 s (#46)
ok = true;
try {
  const { deserialize } = await import('../src/io/save.js');
  const before = deserialize(store['incremental-sheep-v3']).meta.gameTime;
  globalThis.__clock += 120000;
  globalThis.__wallClock += 120000;
  raf(globalThis.__clock);
  const after = deserialize(store['incremental-sheep-v3']).meta.gameTime;
  check('dlouhý frame gap dopočítá suspend nad 60 s', after - before > 119);
} catch (e) { ok = false; console.error(e); check('dlouhý frame gap dopočítá suspend nad 60 s', false); }

console.log(`integration: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
