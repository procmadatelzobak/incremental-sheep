// Balanc / pacing: auto-hráč projde hrou. Měříme TVAR KŘIVKY (čistý průchod bez
// resetů, fáze po fázi) i celkovou cestu k singularitě (reset-loop). Sim je
// deterministická, časy jsou reprodukovatelné. Cíl: ~100 h, plynulá eskalace.
import { newGame } from '../src/io/state.js';
import { step } from '../src/sim/simulation.js';
import { perkCost } from '../src/econ/economy.js';
import { totalArea } from '../src/content/locations.js';
import { totalPopulation } from '../src/sim/cohort.js';
import * as A from '../src/econ/actions.js';

const H = (sec) => sec / 3600;

function setupSelection(s) {
  for (const g of s.groups) {
    const c = g.policy.cull;
    c.enabled = true; c.gene = 'breedingScore'; c.cutFrac = 0.3; c.stage = 'adult';
    if (s.phase >= 2) g.policy.killOld = true;
  }
}
function buyCheapestPerk(s) {
  let best = null, bc = Infinity;
  for (const k of ['headstart', 'flock', 'vigor', 'foreknow', 'haste', 'geneCeiling', 'legacy', 'cosmos', 'voyage', 'foresight']) {
    const c = perkCost(s, k);
    if (c <= (s.prestige.knowledge || 0) && c < bc) { best = k; bc = c; }
  }
  if (best) A.buyPerk(s, best);
}
function play(s, allowPrestige) {
  setupSelection(s);
  buyCheapestPerk(s);
  s.settings.autobuy = { sheep: true, land: true, upgrades: true, sphere: true };
  if (s.phase === 4 && !s.flags.immortal) { A.craftImmortality(s); return; }   // střádej na nesmrtelnost
  if (s.phase >= 10 && allowPrestige) {
    s.prestige.armed = true;
    if (A.singularityAvailable(s)) { A.doSingularity(s); return; }
    if (A.canIgnite(s)) { A.doIgnite(s); return; }
    return; // nasává do skladu
  }
  A.runAutobuy(s);
}

// --- 1) ČISTÝ PRŮCHOD (bez resetů): tvar křivky fáze po fázi ---------------
const clean = newGame();
const phaseAt = {};
{
  let lastPhase = 1; const dt = 2; const budget = 1.5e6;
  for (let i = 0; i < budget; i++) {
    step(clean, dt);
    if ((i & 1) === 0) play(clean, false);
    if (clean.phase > lastPhase) { for (let p = lastPhase + 1; p <= clean.phase; p++) if (!phaseAt[p]) phaseAt[p] = clean.meta.totalGameTime; lastPhase = clean.phase; }
    if (clean.phase >= 10) break;
  }
}

// --- 2) RESET-LOOP k singularitě ------------------------------------------
const s = newGame();
let firstIgnite = null, singularityAt = null, igniteCount = 0, prevRuns = 0;
const t0 = Date.now();
{
  const dt = 2; const budget = 1.5e6;
  for (let i = 0; i < budget; i++) {
    step(s, dt);
    if ((i & 1) === 0) play(s, true);
    if (s.prestige.runs > prevRuns) { igniteCount += (s.prestige.runs - prevRuns); if (firstIgnite == null) firstIgnite = s.meta.totalGameTime; prevRuns = s.prestige.runs; }
    if (s.flags.preludeUnlocked && singularityAt == null) { singularityAt = s.meta.totalGameTime; break; }
  }
}
const wall = ((Date.now() - t0) / 1000).toFixed(1);

console.log('--- BALANC REPORT ---');
console.log('  Tvar křivky (čistý 1. průchod, bez resetů):');
const NAMES = { 2: 'Množení', 3: 'Královská', 4: 'Nesmrtelnosti', 5: 'Moudrých ovcí', 6: 'Exodu', 7: 'Sféry', 8: 'Rozmnožení sfér', 9: 'Soudců', 10: 'Černé díry' };
let prev = 0;
for (let p = 2; p <= 10; p++) if (phaseAt[p] != null) { console.log(`    fáze ${String(p).padStart(2)} ${(NAMES[p] || '').padEnd(16)} @ ${H(phaseAt[p]).toFixed(2).padStart(7)} h   (Δ ${(H(phaseAt[p]) - prev).toFixed(2)} h)`); prev = H(phaseAt[p]); }
console.log(`  1. zažehnutí černé díry: ${firstIgnite != null ? H(firstIgnite).toFixed(1) + ' h' : '—'}`);
console.log(`  zažehnutí celkem: ${igniteCount}, resetů: ${s.prestige.runs}`);
console.log(`  singularita: ${singularityAt != null ? H(singularityAt).toFixed(1) + ' h' : 'NEDOSAŽENO'}`);
console.log(`  (sim wall ${wall}s; vědění ${Math.round(s.prestige.knowledgeLifetime)})`);
console.log(`  DIAG: fáze ${s.phase}, credLifetime ${s.stats.credLifetime.toExponential(2)}, pop ${Math.round(totalPopulation(s))}, rozloha ${totalArea(s).toExponential(2)}, sfér ${s.projects.dyson.count}, vědění ${Math.round(s.prestige.knowledge)}`);

let pass = 0, fail = 0;
const check = (n, c) => { if (c) pass++; else { fail++; console.error('  FAIL:', n); } };
// Tvar křivky: rané fáze nesmí být „prosvištěné" (dřív 6 fází za 0,3 h), ani musí být dosažitelné.
check('čistý průchod dosáhne fáze 10', phaseAt[10] != null);
check('rané fáze mají náplň (fáze 5 až po >0,3 h)', phaseAt[5] != null && H(phaseAt[5]) > 0.3);
check('kolonizace není zeď (fáze 7 do 80 h)', phaseAt[7] != null && H(phaseAt[7]) < 80);
check('1. průchod k fázi 10 je dlouhý, ne absurdní (5–200 h)', phaseAt[10] != null && H(phaseAt[10]) > 5 && H(phaseAt[10]) < 200);
// Cesta k singularitě
check('dosažena fáze 10 / zažehnutí', firstIgnite != null);
check('singularita dosažena', singularityAt != null);
check('cesta k singularitě je dlouhá (>20 h)', singularityAt != null && H(singularityAt) > 20);
check('a ne absurdně dlouhá (<600 h)', singularityAt != null && H(singularityAt) < 600);
check('počet resetů k singularitě dle spec (3–6)', s.prestige.runs >= 3 && s.prestige.runs <= 6);
console.log(`balance: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
