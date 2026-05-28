import { newGame, activeGroup, prestigeCarry } from '../src/io/state.js';
import { step } from '../src/sim/simulation.js';
import { totalCount, totalPopulation, births } from '../src/sim/cohort.js';
import { herdCapacity, totalArea } from '../src/content/locations.js';
import { serialize, deserialize, applyOffline } from '../src/io/save.js';
import { runAutobuy, setAutobuy, suggestStep, costFor, buyLand, buyAddSheep } from '../src/econ/actions.js';
import { checkAchievements, updateRecords } from '../src/content/achievements.js';
import { getMults } from '../src/econ/economy.js';
import { GENES } from '../src/config.js';

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

// 1i) výběr při narození (#18): zvedá μ, vyřazená jehňata dají maso; vypnuto = beze změny
{
  const s = newGame(); s.phase = 2;
  const g = s.groups[0];
  g.counts.M.adult = 20; g.counts.F.adult = 20;
  g.genes.woolRate.sigma = 1.0;                 // velký rozptyl → silný výběr
  g.policy.cull = { enabled: true, gene: 'woolRate', cutFrac: 0.6 };
  const mu0 = g.genes.woolRate.mu, sig0 = g.genes.woolRate.sigma;
  const ctx = getMults(s);
  let killed = 0;
  for (let i = 0; i < 300; i++) killed += births(g, 1e9, 0.5, ctx).killed;
  check('výběr při narození zvedá μ', g.genes.woolRate.mu > mu0);
  check('výběr při narození utahuje σ', g.genes.woolRate.sigma < sig0);
  check('vyřazená jehňata jdou na maso (killed>0)', killed > 0);

  // vypnutý výběr: nic se nevyřadí a μ se nehne (novorozenci mají μ rodičů)
  const g2 = newGame().groups[0];
  g2.counts.M.adult = 20; g2.counts.F.adult = 20;
  g2.policy.cull = { enabled: false, gene: 'woolRate', cutFrac: 0.6 };
  const mu2 = g2.genes.woolRate.mu;
  let killed2 = 0;
  for (let i = 0; i < 100; i++) killed2 += births(g2, 1e9, 0.5, getMults(newGame())).killed;
  check('vypnutý výběr nevyřazuje jehňata', killed2 === 0);
  check('vypnutý výběr nemění μ', Math.abs(g2.genes.woolRate.mu - mu2) < 1e-9);
}

// 2) selekce zvedá μ a (čistě) drží σ omezenou
{
  const s = newGame(); s.phase = 2;
  s.land.density = 5;                              // kapacita → je kam rodit
  const g = activeGroup(s);
  g.counts.M.adult = 500; g.counts.F.adult = 500; // velká populace
  g.genes.woolRate.sigma = 0.4;
  g.policy.cull = { enabled: true, gene: 'woolRate', cutFrac: 0.3 };
  g.policy.killOld = true;                          // churn = uvolní místo pro vybraná jehňata
  const mu0 = g.genes.woolRate.mu, sig0 = g.genes.woolRate.sigma;
  run(s, 400);
  check('selection raises woolRate μ', g.genes.woolRate.mu > mu0 + 0.05);
  check('woolRate μ within ceiling', g.genes.woolRate.mu <= 6.0001);
  check('σ stays positive (perpetual breeding)', g.genes.woolRate.sigma > 0.001);
  check('σ did not explode', g.genes.woolRate.sigma < sig0 * 3);
}

// 3) gestation (lowerBetter) klesá při selekci
{
  const s = newGame(); s.phase = 2;
  s.land.density = 5;
  const g = activeGroup(s);
  g.counts.M.adult = 400; g.counts.F.adult = 400;
  g.genes.gestation.sigma = 6;
  g.policy.cull = { enabled: true, gene: 'gestation', cutFrac: 0.3 };
  g.policy.killOld = true;
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

// 6) #15: gen "rychlost dospívání" (maturity) + migrace starého childhoodFrac
{
  check('gen maturity existuje, childhoodFrac ne', !!GENES.maturity && !GENES.childhoodFrac);
  const ng = newGame();
  check('nová skupina má gen maturity', !!ng.groups[0].genes.maturity && !ng.groups[0].genes.childhoodFrac);

  // vyšší maturity = rychlejší dospívání (kratší dětství → dřív dospělí)
  const fast = newGame(), slow = newGame();
  fast.groups[0].genes.maturity.mu = 3; slow.groups[0].genes.maturity.mu = 0.6;
  fast.groups[0].counts = { M: { child: 100, adult: 0, old: 0 }, F: { child: 100, adult: 0, old: 0 } };
  slow.groups[0].counts = { M: { child: 100, adult: 0, old: 0 }, F: { child: 100, adult: 0, old: 0 } };
  run(fast, 20); run(slow, 20);
  check('vyšší maturity → rychleji dospělí', fast.groups[0].counts.M.adult > slow.groups[0].counts.M.adult);

  // starý save: gen childhoodFrac místo maturity se zmigruje, hra nespadne
  const old = newGame();
  delete old.groups[0].genes.maturity;
  old.groups[0].genes.childhoodFrac = { mu: 0.4, sigma: 0.03 };  // pomalé dětství
  const loaded = deserialize(serialize(old));
  check('hydrate přejmenuje childhoodFrac → maturity', !!loaded.groups[0].genes.maturity && !loaded.groups[0].genes.childhoodFrac);
  check('migrace: dlouhé dětství → nízká maturity', loaded.groups[0].genes.maturity.mu < 1);
  let ok = true;
  try { run(loaded, 30); } catch (e) { ok = false; console.error(e); }
  check('starý save (childhoodFrac) běží bez chyby', ok && isFinite(loaded.resources.credits) && isFinite(totalPopulation(loaded)));

  // výběr při narození na maturity i dlouhověkost zvedá μ
  const s = newGame(); s.phase = 2;
  const g = s.groups[0];
  g.counts.M.adult = 20; g.counts.F.adult = 20;
  g.genes.maturity.sigma = 0.4;
  const mu0 = g.genes.maturity.mu;
  g.policy.cull = { enabled: true, gene: 'maturity', cutFrac: 0.5 };
  const ctx = getMults(s);
  for (let i = 0; i < 300; i++) births(g, 1e9, 0.5, ctx);
  check('výběr na maturity zvedá μ', g.genes.maturity.mu > mu0);

  const s2 = newGame(); s2.phase = 2; const g2 = s2.groups[0];
  g2.counts.M.adult = 20; g2.counts.F.adult = 20;
  g2.genes.lifespan.sigma = 40;
  const life0 = g2.genes.lifespan.mu;
  g2.policy.cull = { enabled: true, gene: 'lifespan', cutFrac: 0.5 };
  const ctx2 = getMults(s2);
  for (let i = 0; i < 300; i++) births(g2, 1e9, 0.5, ctx2);
  check('výběr na dlouhověkost zvedá μ', g2.genes.lifespan.mu > life0);
}

// 7) #11: tik počítá trend příjmu a růstu stáda
{
  const s = newGame();
  run(s, 30);
  check('rates: příjem kreditů /s je číslo', typeof s.rates._income === 'number' && s.rates._income >= 0);
  check('rates: růst stáda /s je číslo', typeof s.rates._popGrowth === 'number');
  check('rostoucí stádo má kladný příjem', s.rates._income > 0);
}

// 8) stárnutí: statistiky born/died a konzervace populace
{
  const s = newGame();
  const start = totalCount(activeGroup(s));
  run(s, 600);                                  // > délka života → child→adult→old→smrt proběhne
  const g = activeGroup(s);
  check('born se počítá (>0)', s.stats.born > 0);
  check('died (úhyn stářím) je konečné číslo ≥0', isFinite(s.stats.died) && s.stats.died >= 0);
  check('staré ovce uhynuly stářím (died>0)', s.stats.died > 0);
  // default policy neporáží → culled musí být 0
  check('bez politiky se neporáží (culled=0)', s.stats.culled === 0);
  // konzervace: konec = start + narození − úhyn − poražení
  const expected = start + s.stats.born - s.stats.died - s.stats.culled;
  check('konzervace populace (start+born−died−culled)', Math.abs(totalCount(g) - expected) < 1e-6 * Math.max(1, s.stats.born + s.stats.died));
  // offline souhrn hlásí narozené
  const s2 = newGame();
  s2.meta.lastSaved = Date.now() - 120000;      // 120 s zpět
  const off = applyOffline(s2);
  check('offline souhrn obsahuje born', off && typeof off.born === 'number' && off.born > 0);
}

// 9) zpracování (#23): bez Tkalcoven žádné sukno/sýr; s Tkalcovnami ano
{
  const s = newGame();
  s.phase = 3;
  s.groups[0].counts.F.adult = 200; s.groups[0].counts.M.adult = 60; s.groups[0].bredFracF = 1;
  step(s, 1);
  check('bez Tkalcoven se nezpracovává (cloth=0)', !(s.rates.cloth > 0) && !(s.rates.cheese > 0));
  const woolRaw = s.rates.wool;
  check('syrová vlna se prodává', woolRaw > 0);
  s.upgrades.looms = 2;
  step(s, 1);
  check('Tkalcovny vyrábějí sukno', s.rates.cloth > 0);
  check('Tkalcovny vyrábějí sýr', s.rates.cheese > 0);
  check('zpracováním ubude syrové vlny', s.rates.wool < woolRaw);
}

console.log(`sim: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
