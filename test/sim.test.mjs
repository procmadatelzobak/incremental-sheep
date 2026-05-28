import { newGame, activeGroup, prestigeCarry } from '../src/io/state.js';
import { step } from '../src/sim/simulation.js';
import { totalCount, totalPopulation } from '../src/sim/cohort.js';
import { herdCapacity, totalArea } from '../src/content/locations.js';
import { serialize, deserialize, applyOffline } from '../src/io/save.js';
import { runAutobuy, setAutobuy, suggestStep, costFor, setProtect, buyLand, buyAddSheep } from '../src/econ/actions.js';
import { checkAchievements, updateRecords } from '../src/content/achievements.js';
import { getMults } from '../src/econ/economy.js';
import { applySelectionCull } from '../src/sim/groups.js';

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

// 1b) kapacita = rozloha × hustota; koupě území zvedne strop a stádo roste dál
{
  const s = newGame();
  s.resources.credits = 1e6;
  const cap0 = herdCapacity(s);
  buyLand(s, 'earth'); buyLand(s, 'earth');     // pár parcel Země
  check('koupě území zvedne kapacitu', herdCapacity(s) > cap0);
  check('rozloha roste', totalArea(s) > 1);
  s.resources.credits = 0;
  run(s, 600);
  check('populace roste k nové kapacitě', totalPopulation(s) > cap0);
  check('populace nepřekročí kapacitu', totalPopulation(s) <= herdCapacity(s) + 5);
}

// 1c) autobuyer: zapnuté kategorie nakupují; při nasávání černé díry je pozastaven
{
  const s = newGame();
  s.resources.credits = 1e6;
  setAutobuy(s, 'land', true);
  const cr0 = s.resources.credits, area0 = totalArea(s);
  runAutobuy(s);
  check('autobuy pozemků utratil kredity', s.resources.credits < cr0);
  check('autobuy pozemků zvětšil rozlohu/hustotu', totalArea(s) > area0 || s.land.density > 0);

  const s2 = newGame(); s2.resources.credits = 1e6; setAutobuy(s2, 'upgrades', true);
  runAutobuy(s2);
  check('autobuy vylepšení něco koupil', Object.keys(s2.upgrades).length > 0);

  const s3 = newGame(); s3.resources.credits = 1e6; setAutobuy(s3, 'land', true);
  s3.phase = 10; s3.prestige.armed = true;
  const c3 = s3.resources.credits;
  runAutobuy(s3);
  check('autobuy pozastaven při nasávání černé díry', s3.resources.credits === c3);
}

// 1d) milníky: odemykají se, dávají trvalý bonus a přežijí reset
{
  const s = newGame();
  s.world.maxSheep = 100; s.phase = 2;    // dosažené rekordy → milníky se odemknou
  updateRecords(s);
  check('milník se odemkne', checkAchievements(s).length > 0);
  s.world.maxSheep = 1e6;                  // velký rekord → bonusový milník
  checkAchievements(s);
  check('bonusový milník zvýší achievementMult', s.world.achievementMult > 1);
  const carry = prestigeCarry(s);
  const s2 = newGame(carry);
  check('milníky přežijí reset', Object.keys(s2.achievements).length === Object.keys(s.achievements).length);
  check('bonus přežije reset', s2.world.achievementMult === s.world.achievementMult);
}

// 1e) doporučený krok je smysluplný řetězec
{
  check('suggestStep fáze 1', typeof suggestStep(newGame()) === 'string' && suggestStep(newGame()).length > 0);
  const sp = newGame(); sp.phase = 10; sp.prestige.singularity = true;
  check('suggestStep singularita', /singular/i.test(suggestStep(sp)));
}

// 1f) postup fáze naplní frontu událostí (_phaseUp)
{
  const s = newGame(); s.stats.credLifetime = 1e6;  // překročí gate fáze 1
  step(s, 0.1);
  check('postup fáze naplní _phaseUp', s.phase > 1 && (s._phaseUp || []).length > 0);
}

// 1g) offline souhrn
{
  const s = newGame();
  s.meta.lastSaved = Date.now() - 600000;   // 10 minut zpět
  const o = applyOffline(s);
  check('offline vrací souhrn', !!o && o.seconds > 300 && o.credits > 0);
  check('offline má pole vlna/maso', !!o && typeof o.wool === 'number' && typeof o.meat === 'number');
}

// 1h) perky (5 větví) mají efekt a buildy se liší
{
  const base = newGame();
  check('perk flock zvyšuje kapacitu', herdCapacity(newGame({ perks: { flock: 5 } })) > herdCapacity(base));
  check('perk geneCeiling zvyšuje strop genů', getMults(newGame({ perks: { geneCeiling: 5 } })).ceilingMult > getMults(base).ceilingMult);
  check('perk cosmos zvyšuje rychlost sfér', getMults(newGame({ perks: { cosmos: 4 } })).spaceMult > 1);
  check('perk vigor zvyšuje produkci', getMults(newGame({ perks: { vigor: 3 } })).globalProd > getMults(base).globalProd);
  const voy = newGame({ perks: { voyage: 4 } });
  check('perk voyage zlevňuje stavitele', costFor(voy, 'builder') < costFor(base, 'builder'));
  check('perk foresight zapne autobuy', newGame({ perks: { foresight: 1 } }).settings.autobuy.land === true);
}

// 1j) po elixíru se simulace násobně zrychlí (#7)
{
  const a = newGame(), b = newGame();
  a.phase = 5; b.phase = 5; b.flags.immortal = true;
  for (const s of [a, b]) { const g = s.groups[0]; g.counts.M.adult = 200; g.counts.F.adult = 200; s.resources.credits = 0; }
  run(a, 60); run(b, 60);
  check('elixír zrychlí produkci', b.stats.woolLifetime > a.stats.woolLifetime * 1.5);
}

// 1k) nákup ovcí dle pohlaví/množství (#7)
{
  const s = newGame(); s.resources.credits = 1e6;
  const m0 = s.groups[0].counts.M.adult;
  buyAddSheep(s, 'M', 3);
  check('nákup samců přidá jen samce', s.groups[0].counts.M.adult > m0 && s.groups[0].counts.F.adult === 2);
}

// 1i) autoculling: ochrana chovného jádra + záznam poslední selekce
{
  const s = newGame();
  const g = s.groups[0];
  g.counts.M.adult = 10; g.counts.F.adult = 10;
  g.policy.cull = { enabled: true, gene: 'woolRate', cutFrac: 0.85, stage: 'adult' };
  g.policy.protect = { enabled: true, minF: 8, minM: 2 };
  applySelectionCull(g, getMults(s), s);
  check('ochrana drží min. samic', g.counts.F.adult >= 8 - 1e-6);
  check('ochrana drží min. samců', g.counts.M.adult >= 2 - 1e-6);
  check('poslední selekce zaznamenána', g._lastSel && g._lastSel.muAfter >= g._lastSel.muBefore);

  const g2 = newGame().groups[0];
  g2.counts.M.adult = 10; g2.counts.F.adult = 10;
  g2.policy.cull = { enabled: true, gene: 'woolRate', cutFrac: 0.85, stage: 'adult' };
  g2.policy.protect = { enabled: false };
  applySelectionCull(g2, getMults(s), s);
  check('bez ochrany klesne pod jádro', g2.counts.F.adult < 8);

  const sp = newGame(); setProtect(sp, sp.groups[0].id, { minF: 20 });
  check('setProtect funguje', sp.groups[0].policy.protect.minF === 20);
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
import { craftImmortality } from '../src/econ/actions.js';
function autoPlayer() {
  return (s) => {
    for (const g of s.groups) if (!g.policy.cull.enabled) { g.policy.cull.enabled = true; g.policy.cull.gene = 'breedingScore'; g.policy.cull.cutFrac = 0.25; }
    s.settings.autobuy = { sheep: true, land: true, upgrades: true, sphere: true };
    if (s.phase === 4 && !s.flags.immortal) { craftImmortality(s); return; }
    runAutobuy(s);
  };
}

console.log(`sim: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
