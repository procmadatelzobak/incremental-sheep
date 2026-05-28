import { newGame, activeGroup } from '../src/io/state.js';
import { step } from '../src/sim/simulation.js';
import { totalCount, totalPopulation } from '../src/sim/cohort.js';
import { herdCapacity, locationCap } from '../src/content/locations.js';
import { serialize, deserialize } from '../src/io/save.js';
import { runAutobuy, setAutobuy } from '../src/econ/actions.js';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }
function run(state, seconds, dt = 0.2) { for (let t = 0; t < seconds; t += dt) step(state, dt); }

// 1) základní běh: populace a kredity rostou
{
  const s = newGame();
  const pop0 = totalCount(activeGroup(s));
  run(s, 120);
  const g = activeGroup(s);
  check('population grows', totalCount(g) > pop0);
  check('credits earned', s.resources.credits > 25);
  check('wool lifetime > 0', s.stats.woolLifetime > 0);
  check('no NaN credits', isFinite(s.resources.credits));
}

// 1b) kapacita je sdílená přes pozemky (oprava: pastviny se započítají)
{
  const s = newGame();
  const meadowCap = locationCap(s.locations[0]);
  // přidej 2 pastviny (jako v hlášeném save)
  s.locations.push({ id: 2, kind: 'pasture', name: 'P1', level: 0, density: 0 });
  s.locations.push({ id: 3, kind: 'pasture', name: 'P2', level: 0, density: 0 });
  const cap = herdCapacity(s);
  check('celková kapacita = součet pozemků', cap > meadowCap * 2);
  check('pastviny přidávají kapacitu', cap === s.locations.reduce((t, l) => t + locationCap(l), 0));
  // stádo na louce poroste nad kapacitu samotné louky (do pastvin)
  run(s, 600);
  check('populace přeroste kapacitu jedné louky', totalPopulation(s) > meadowCap + 1);
  check('populace nepřekročí celkovou kapacitu', totalPopulation(s) <= cap + 5);
}

// 1c) autobuyer: zapnuté kategorie nakupují; při nasávání černé díry je pozastaven
{
  const s = newGame();
  s.resources.credits = 1e6;
  setAutobuy(s, 'land', true);
  const cr0 = s.resources.credits, lvl0 = s.locations[0].level;
  runAutobuy(s);
  check('autobuy pozemků utratil kredity', s.resources.credits < cr0);
  check('autobuy pozemků něco koupil', s.locations[0].level > lvl0 || s.locations.length > 1);

  const s2 = newGame(); s2.resources.credits = 1e6; setAutobuy(s2, 'upgrades', true);
  runAutobuy(s2);
  check('autobuy vylepšení něco koupil', Object.keys(s2.upgrades).length > 0);

  const s3 = newGame(); s3.resources.credits = 1e6; setAutobuy(s3, 'land', true);
  s3.phase = 10; s3.prestige.armed = true;
  const c3 = s3.resources.credits;
  runAutobuy(s3);
  check('autobuy pozastaven při nasávání černé díry', s3.resources.credits === c3);
}

// 2) selekce zvedá μ a (čistě) drží σ omezenou
{
  const s = newGame();
  const g = activeGroup(s);
  g.counts.M.adult = 500; g.counts.F.adult = 500; // velká populace
  g.policy.cull = { enabled: true, gene: 'woolRate', cutFrac: 0.3, stage: 'adult' };
  const mu0 = g.genes.woolRate.mu, sig0 = g.genes.woolRate.sigma;
  run(s, 400);
  check('selection raises woolRate μ', g.genes.woolRate.mu > mu0 + 0.05);
  check('woolRate μ within ceiling', g.genes.woolRate.mu <= 6.0001);
  check('σ stays positive (perpetual breeding)', g.genes.woolRate.sigma > 0.001);
  check('σ did not explode', g.genes.woolRate.sigma < sig0 * 3);
}

// 3) gestation (lowerBetter) klesá při selekci
{
  const s = newGame();
  const g = activeGroup(s);
  g.counts.M.adult = 400; g.counts.F.adult = 400;
  g.policy.cull = { enabled: true, gene: 'gestation', cutFrac: 0.3, stage: 'adult' };
  const mu0 = g.genes.gestation.mu;
  run(s, 400);
  check('selection lowers gestation μ', g.genes.gestation.mu < mu0 - 0.2);
}

// 4) auto-hráč postoupí fázemi (jednoduchá hltavá strategie)
{
  const s = newGame();
  const A = autoPlayer();
  let advanced = 1;
  for (let i = 0; i < 200000; i++) {
    step(s, 0.5);
    A(s);
    if (s.phase > advanced) advanced = s.phase;
    if (s.phase >= 5) break;
  }
  check('auto-player reaches phase >=2', s.phase >= 2);
  check('auto-player reaches phase >=3', s.phase >= 3);
  check('reached phase >=5 within budget', s.phase >= 5);
}

// 5) save/load roundtrip
{
  const s = newGame();
  run(s, 60);
  s.phase = 3; s.resources.credits = 12345;
  const str = serialize(s);
  const s2 = deserialize(str);
  check('roundtrip credits', Math.round(s2.resources.credits) === 12345);
  check('roundtrip phase', s2.phase === 3);
  check('roundtrip groups', s2.groups.length === s.groups.length);
}

// jednoduchý auto-hráč pro test postupu
import { buyAddSheep, buyExpand, buyDensity, buyNewPasture, buyUpgrade, buyStation, buyWarehouse, buyOxygen, buyBuilder, doClaimSphere, craftImmortality } from '../src/econ/actions.js';
import { UPGRADES } from '../src/config.js';
function autoPlayer() {
  return (s) => {
    // selekce zapnutá na všech skupinách (zlepšuje produkci)
    for (const g of s.groups) if (!g.policy.cull.enabled) { g.policy.cull.enabled = true; g.policy.cull.gene = 'breedingScore'; g.policy.cull.cutFrac = 0.25; }
    craftImmortality(s);
    doClaimSphere(s);
    // koupit nejlevnější dostupné vylepšení/expanzi, pokud je levné vůči kreditům
    let acted = true, guard = 0;
    while (acted && guard++ < 40) {
      acted = false;
      for (const k in UPGRADES) if (UPGRADES[k].phase <= s.phase && buyUpgrade(s, k)) acted = true;
      const loc = s.locations[0];
      if (buyExpand(s, loc.id)) acted = true;
      if (buyDensity(s, loc.id)) acted = true;
      if (buyAddSheep(s)) acted = true;
      if (s.phase >= 2 && buyNewPasture(s)) acted = true;
      if (s.phase >= 6) { buyStation(s); buyWarehouse(s); buyOxygen(s); }
      if (s.phase >= 7) buyBuilder(s);
    }
  };
}

console.log(`sim: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
