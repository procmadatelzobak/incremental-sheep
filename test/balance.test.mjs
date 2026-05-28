// Balanc / pacing: auto-hráč projde hrou k singularitě; měříme časy milníků.
import { newGame } from '../src/io/state.js';
import { step } from '../src/sim/simulation.js';
import { UPGRADES, BALANCE } from '../src/config.js';
import { upgradeCost, perkCost } from '../src/econ/economy.js';
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
  for (const k in { headstart: 1, vigor: 1, haste: 1, legacy: 1, foreknow: 1 }) {
    const c = perkCost(s, k);
    if (c <= (s.prestige.knowledge || 0) && c < bc) { best = k; bc = c; }
  }
  if (best) A.buyPerk(s, best);
}
function growProduction(s, reserve = 0) {
  for (let i = 0; i < 60; i++) {
    const opts = [];
    for (const k in UPGRADES) if (UPGRADES[k].phase <= s.phase) opts.push(['up', k, upgradeCost(s, k)]);
    for (const loc of s.locations) {
      opts.push(['exp', loc, A.costFor(s, 'expand', loc)]);
      if (loc.density < BALANCE.density.max) opts.push(['den', loc, A.costFor(s, 'density', loc)]);
    }
    opts.push(['sheep', null, A.costFor(s, 'addSheep')]);
    if (s.phase >= 2) opts.push(['past', null, A.costFor(s, 'newPasture')]);
    if (s.phase >= 6) { opts.push(['ware', null, A.costFor(s, 'warehouse')]); opts.push(['oxy', null, A.costFor(s, 'oxygen')]); }
    if (s.phase >= 7) opts.push(['build', null, A.costFor(s, 'builder')]);
    if (s.phase >= 8) opts.push(['laser', null, A.costFor(s, 'laser')]);
    opts.sort((a, b) => a[2] - b[2]);
    const avail = (s.resources.credits || 0) - reserve;
    const pick = opts.find(o => o[2] <= avail);
    if (!pick) return;
    const [t, ref] = pick;
    if (t === 'up') A.buyUpgrade(s, ref);
    else if (t === 'exp') A.buyExpand(s, ref.id);
    else if (t === 'den') A.buyDensity(s, ref.id);
    else if (t === 'sheep') A.buyAddSheep(s);
    else if (t === 'past') A.buyNewPasture(s);
    else if (t === 'ware') A.buyWarehouse(s);
    else if (t === 'oxy') A.buyOxygen(s);
    else if (t === 'build') A.buyBuilder(s);
    else if (t === 'laser') A.buyLaser(s);
  }
}
function play(s) {
  setupSelection(s);
  buyCheapestPerk(s);
  if (s.phase === 4 && !s.flags.immortal) { A.craftImmortality(s); growProduction(s, A.costFor(s, 'immortality')); return; }
  if (s.phase >= 10) {
    s.prestige.armed = true;
    if (A.singularityAvailable(s)) { A.doSingularity(s); return; }
    if (A.canIgnite(s)) { A.doIgnite(s); return; }
    return; // nasává do skladu, čeká na práh
  }
  if (s.phase >= 7) { A.doClaimSphere(s); A.buyBuilder(s); A.buyLaser(s); }
  if (s.phase === 6 && s.buys.station < 3) { A.buyStation(s); A.buyOxygen(s); A.buyWarehouse(s); }
  growProduction(s);
}

// --- běh harnessu ---
const s = newGame();
const phaseAt = {};        // gameTime kumulovaný (totalGameTime) při dosažení fáze
let firstIgnite = null, singularityAt = null, igniteCount = 0;
let prevRuns = 0, lastPhase = 1;
const dt = 2;
const budget = 1.2e6;      // kroků (≈ 2.4 mil. herních s = 666 h kumul.)
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
console.log(`  (sim wall time ${wall}s; vědění celkem ${Math.round(s.prestige.knowledgeLifetime)})`);
import { totalCount } from '../src/sim/cohort.js';
let popNow = 0; for (const g of s.groups) popNow += totalCount(g);
console.log(`  DIAG: fáze ${s.phase}, credLifetime ${s.stats.credLifetime.toExponential(2)}, credits/s ~${Math.round((s.rates.wool||0)*1+(s.rates.meat||0)*6)}, pop ${Math.round(popNow)}, sfér ${s.projects.dyson.count}, lokací ${s.locations.length}, vědění ${Math.round(s.prestige.knowledge)}, centrální ${s.prestige.centralWarehouse.toExponential(2)}`);

// kritéria
let pass = 0, fail = 0;
const check = (n, c) => { if (c) pass++; else { fail++; console.error('  FAIL:', n); } };
check('dosažena fáze 5', (phaseAt[5] != null) || s.prestige.runs > 0 || singularityAt != null);
check('dosažena fáze 10 / zažehnutí', firstIgnite != null);
check('singularita dosažena', singularityAt != null);
check('cesta k singularitě je dlouhá (>20 h)', singularityAt != null && H(singularityAt) > 20);
check('a ne absurdně dlouhá (<600 h)', singularityAt != null && H(singularityAt) < 600);
console.log(`balance: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
