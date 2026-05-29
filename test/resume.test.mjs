// Regrese pro #46: probuzení uspaného/throttlovaného tabu dožene reálný čas
// (jako offline progres), místo tichého ořezu herní smyčky na 60 s.
import { installDom } from './dom-stub.mjs';
import { newGame } from '../src/io/state.js';
import { simulateElapsed, resumeProgress, deserialize } from '../src/io/save.js';
import { MAX_OFFLINE_SECONDS } from '../src/config.js';

const { document } = installDom();
let pass = 0, fail = 0;
const check = (n, c) => { if (c) pass++; else { fail++; console.error('  FAIL:', n); } };

// --- save.js: jádro dohánění -----------------------------------------------
// simulateElapsed posune herní čas přesně o zadaný interval a vrátí souhrn.
{
  const s = newGame();
  const t0 = s.meta.totalGameTime;
  const sum = simulateElapsed(s, 3600);
  check('simulateElapsed vrací souhrn s seconds=3600', !!sum && Math.abs(sum.seconds - 3600) < 1e-9);
  check('simulateElapsed posune totalGameTime o 3600', Math.abs((s.meta.totalGameTime - t0) - 3600) < 1e-6);
}

// Zanedbatelný čas (< 1 s) → null a žádná změna stavu.
{
  const s = newGame();
  const t0 = s.meta.totalGameTime;
  check('simulateElapsed(0) = null', simulateElapsed(s, 0) === null);
  check('simulateElapsed(0.5) = null', simulateElapsed(s, 0.5) === null);
  check('nulový čas nehýbe stavem', s.meta.totalGameTime === t0);
}

// resumeProgress respektuje stejný strop jako offline (MAX_OFFLINE_SECONDS).
{
  const s = newGame();
  const t0 = s.meta.totalGameTime;
  const sum = resumeProgress(s, 100 * 3600);   // 100 h reálně → ořez na strop
  check('resumeProgress ořízne na MAX_OFFLINE_SECONDS', !!sum && Math.abs(sum.seconds - MAX_OFFLINE_SECONDS) < 1e-6);
  check('totalGameTime posunut max o strop', Math.abs((s.meta.totalGameTime - t0) - MAX_OFFLINE_SECONDS) < 1e-3);
}

// Jádro #46: hodinová pauza dožene mnohem víc než starý 60s ořez.
{
  const a = newGame(), b = newGame();
  resumeProgress(a, 3600);            // probuzení po hodině spánku
  simulateElapsed(b, 60);             // co dával starý ořez na 60 s
  check('hodinové probuzení posune čas >> 60 s ořez', (a.meta.totalGameTime - b.meta.totalGameTime) > 3000);
  check('hodinové probuzení vydělá víc kreditů než 60 s', a.stats.credLifetime > b.stats.credLifetime);
}

// --- main.js: herní smyčka opravdu doháněcí větev používá -------------------
// Ovladatelné hodiny: performance.now() i Date.now() (wall-clock) zvlášť.
let perfClock = 0, wallClock = 1e12;
globalThis.performance = { now: () => perfClock };
Date.now = () => wallClock;
document.addEventListener = () => {};
document.hidden = false;
let raf = null;
globalThis.requestAnimationFrame = (cb) => { raf = cb; return 1; };
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

let ok = true;
try { await import('../src/main.js'); } catch (e) { ok = false; console.error('  import main.js selhal:', e); }
check('main.js se načte a naplánuje frame', ok && typeof raf === 'function');

const savedTime = () => deserialize(store['incremental-sheep-v3']).meta.totalGameTime;

// pár normálních frejmů (po 100 ms) → překročí práh autosave a zapíše save
function advance(ms) { perfClock += ms; wallClock += ms; raf(perfClock); }
for (let i = 0; i < 80; i++) advance(100);
check('po normálním běhu existuje save', !!store['incremental-sheep-v3']);
const t0 = savedTime();

// PROBUZENÍ: wall-clock skočí o hodinu, performance.now jen o 100 ms
// (monotónní hodiny během spánku tabu zamrzly). Starý kód by oříznul na ~0,1 s.
wallClock += 3600 * 1000;
perfClock += 100;
raf(perfClock);
const t1 = savedTime();

check('frame loop: probuzení dožene ~1 h herního času (ne ořez na 60 s)', (t1 - t0) > 3000);
check('frame loop: dohnaný čas zůstává v mezích offline stropu', (t1 - t0) <= MAX_OFFLINE_SECONDS + 60);

console.log(`resume: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
