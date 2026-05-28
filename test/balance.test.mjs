// Balanc / pacing: auto-hráč projde hrou k singularitě; měříme časy milníků.
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
function play(s) {
  setupSelection(s);
  buyCheapestPerk(s);
  s.settings.autobuy = { sheep: true, land: true, upgrades: true, sphere: true };
  if (s.phase === 4 && !s.flags.immortal) { A.craftImmortality(s); return; }   // střádej na nesmrtelnost
  if (s.phase >= 10) {
    s.prestige.armed = true;
    if (A.singularityAvailable(s)) { A.doSingularity(s); return; }
    if (A.canIgnite(s)) { A.doIgnite(s); return; }
    return; // nasává do skladu
  }
  A.runAutobuy(s);
}

const s = newGame();
const phaseAt = {};
let firstIgnite = null, singularityAt = null, igniteCount = 0;
let prevRuns = 0, lastPhase = 1;
const dt = 2;
const budget = 1.2e6;
const t0 = Date.now();

for (let i = 0; i < budget; i++) {
  step(s, dt);
  if ((i & 1) === 0) play(s);
  if (s.phase > lastPhase) { for (let p = lastPhase + 1; p <= s.phase; p++) if (!phaseAt[p]) phaseAt[p] = s.meta.totalGameTime; lastPhase = s.phase; }
  if (s.prestige.runs > prevRuns) { igniteCount += (s.prestige.runs - prevRuns); if (firstIgnite == null) firstIgnite = s.meta.totalGameTime; prevRuns = s.prestige.runs; lastPhase = 1; }
  if (s.flags.preludeUnlocked && singularityAt == null) { singularityAt = s.meta.totalGameTime; break; }
}
const wall = ((Date.now() - t0) / 1000).toFixed(1);

console.log('--- BALANC REPORT ---');
for (let p = 2; p <= 10; p++) if (phaseAt[p] != null) console.log(`  fáze ${p}: ${H(phaseAt[p]).toFixed(1)} h`);
console.log(`  1. zažehnutí černé díry: ${firstIgnite != null ? H(firstIgnite).toFixed(1) + ' h' : '—'}`);
console.log(`  zažehnutí celkem: ${igniteCount}, resetů: ${s.prestige.runs}`);
console.log(`  singularita: ${singularityAt != null ? H(singularityAt).toFixed(1) + ' h' : 'NEDOSAŽENO'}`);
console.log(`  (sim wall ${wall}s; vědění ${Math.round(s.prestige.knowledgeLifetime)})`);
console.log(`  DIAG: fáze ${s.phase}, credLifetime ${s.stats.credLifetime.toExponential(2)}, pop ${Math.round(totalPopulation(s))}, rozloha ${totalArea(s).toExponential(2)}, sfér ${s.projects.dyson.count}, vědění ${Math.round(s.prestige.knowledge)}`);

let pass = 0, fail = 0;
const check = (n, c) => { if (c) pass++; else { fail++; console.error('  FAIL:', n); } };
check('dosažena fáze 5', (phaseAt[5] != null) || s.prestige.runs > 0 || singularityAt != null);
check('dosažena fáze 10 / zažehnutí', firstIgnite != null);
check('singularita dosažena', singularityAt != null);
check('cesta k singularitě je dlouhá (>20 h)', singularityAt != null && H(singularityAt) > 20);
check('a ne absurdně dlouhá (<600 h)', singularityAt != null && H(singularityAt) < 600);
console.log(`balance: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
