import { defaultIndustry, getLaborRate, stepIndustry, upgradeSupport, supportTarget } from '../src/content/industry.js';
import { GENES } from '../src/config.js';

let pass = 0, fail = 0;
function check(name, value) { if (value) pass++; else { fail++; console.error('  FAIL:', name); } }
const near = (a, b, epsilon = 1e-8) => Math.abs(a - b) < epsilon * Math.max(1, Math.abs(a), Math.abs(b));

function group(worldId = 'earth', genes = {}) {
  return { worldId, genes: Object.fromEntries(Object.entries(GENES).map(([key, spec]) => [key, { mu: genes[key] ?? spec.base, sigma: spec.sd }])),
    counts: { M: { child: 0, adult: 500, old: 0 }, F: { child: 0, adult: 500, old: 0 } } };
}
function state(phase = 2) {
  return { phase, industry: defaultIndustry(), groups: [group()], resources: { credits: 1e30, milk: 1e5, bones: 1e5, skin: 1e5, compute: 1e5, cloth: 1e5 },
    land: { worlds: { earth: { counts: { 0: 1e5 } }, moon: { counts: {} }, mars: { counts: {} }, jupiter: { counts: {} }, sphere: { counts: {} } }, density: 0, mods: {} },
    prestige: { threshold: 1e12, centralWarehouse: 0, armed: false }, projects: { dyson: { count: 0, progress: 0, builders: 0 }, laser: { level: 0 } }, behemot: { inv: {} } };
}

// Work is bounded by the remaining project, so a large offline step cannot
// consume a whole warehouse after the project is already done.
{
  const s = state(); s.industry.enabled = true; s.industry.work.breeding = 8999.99;
  const milk = s.resources.milk; stepIndustry(s, 1e6, {}, {});
  check('project completes at its target', near(s.industry.work.breeding, 9000));
  check('only remaining recipe was consumed', near(milk - s.resources.milk, .01));
}

// Population and credits do not bypass installed work throughput.
{
  const s = state(); s.industry.enabled = true;
  s.groups[0].counts.M.adult = 1e20; s.groups[0].counts.F.adult = 1e20;
  stepIndustry(s, 1, {}, {});
  check('unbounded population and credits do not instant-complete', (s.industry.work.breeding || 0) < 9000 && !s.industry.completed.breeding);
}

// Support is an Exodus-only owned-world project with a material recipe.
{
  const early = state(5); check('support rejects pre-Exodus world', upgradeSupport(early, 'earth') === false);
  const s = state(6); s.industry.enabled = true; s.industry.worlds.earth.pending = true;
  const before = { bones: s.resources.bones, skin: s.resources.skin, compute: s.resources.compute };
  stepIndustry(s, 1, {}, {});
  check('support consumes bones', s.resources.bones < before.bones);
  check('support consumes skin', s.resources.skin < before.skin);
  check('support consumes compute', s.resources.compute < before.compute);
}

// Labour is deterministic and distinct specialised herds improve the Judges.
{
  const a = state(9), b = state(9);
  for (const s of [a, b]) {
    s.industry.enabled = true;
    for (const key of ['moon', 'mars', 'jupiter']) s.land.worlds[key].counts = { 0: 1 };
    s.groups = [group('moon'), group('mars'), group('jupiter')];
  }
  b.groups[0].genes.woolRate.mu = 5; b.groups[0].genes.woolQuality.mu = 4;
  b.groups[1].genes.intelligence.mu = 8;
  b.groups[2].genes.size.mu = 4; b.groups[2].genes.lifespan.mu = 500;
  const r1 = getLaborRate(b, 'mars', 'compute', 9), r2 = getLaborRate(b, 'mars', 'compute', 9);
  check('labor rate is state-deterministic', near(r1, r2));
  stepIndustry(a, 10, {}, {}); const plain = a.industry.work.judges || 0;
  stepIndustry(b, 10, {}, {}); const specialised = b.industry.work.judges || 0;
  check('diversified genetics increases Judges work', specialised > plain);
}

// A black hole can only receive actual material value, regardless of credits.
{
  const s = state(10); s.prestige.armed = true; s.resources = { credits: Infinity };
  stepIndustry(s, 1, {}, {});
  check('black hole cannot collapse from credits alone', s.prestige.centralWarehouse === 0);
}

// --- Adversarial Phase 6-9 Regression Tests ---

// Huge credit, capacity, and population do not increase work past staff saturation
// when both fixtures have sufficient effective capacity (labor saturation invariant).
{
  const a = state(7), b = state(7);
  a.industry.enabled = true; b.industry.enabled = true;

  // Fixture a: at 100% staff utilization threshold (1000 adults) with sufficient capacity.
  a.land.worlds.earth.counts = { 0: 1000 };
  a.resources = { credits: 1e5, bones: 1e4, skin: 1e4, cloth: 1e4 };

  // Fixture b: 50x adult population, massive land, upgraded support, and huge credits.
  b.land.worlds.earth.counts = { 0: 1e6 };
  b.industry.worlds.earth.level = 4;
  b.groups[0].counts.M.adult = 25000;
  b.groups[0].counts.F.adult = 25000;
  b.resources = { credits: 1e25, bones: 1e4, skin: 1e4, cloth: 1e4 };

  const rateA = getLaborRate(a, 'earth', 'materials', 7);
  const rateB = getLaborRate(b, 'earth', 'materials', 7);
  check('labor rate saturates once staff threshold is met', near(rateA, rateB));

  stepIndustry(a, 10, {}, {});
  stepIndustry(b, 10, {}, {});
  check('huge credit, capacity, and population do not increase work past saturation',
    near(a.projects.dyson.progress, b.projects.dyson.progress));
  check('both saturated fixtures performed identical non-zero work',
    a.projects.dyson.progress > 0 && near(a.resources.bones, b.resources.bones));
}

// Phase 6 colonization requires both an owned target world and a physical herd present on it.
{
  // Target world owned, but physical herd is on Earth (no herd on Moon).
  const s1 = state(6); s1.industry.enabled = true;
  s1.land.worlds.moon.counts = { 0: 1 };
  s1.groups = [group('earth')];
  stepIndustry(s1, 10, {}, {});
  check('phase 6 cannot progress without physical herd on target world', (s1.industry.work.moon || 0) === 0);
  check('phase 6 bottleneck is seed_required when target world has no herd', s1.industry.last?.bottleneck === 'seed_required');

  // Physical herd on Moon, but target world is not owned (no parcels).
  const s2 = state(6); s2.industry.enabled = true;
  s2.land.worlds.moon.counts = {};
  s2.groups = [group('moon')];
  stepIndustry(s2, 10, {}, {});
  check('phase 6 cannot progress on unowned target world', (s2.industry.work.moon || 0) === 0);
  check('phase 6 explains missing parcel before requesting a herd', s2.industry.last?.bottleneck === 'parcel_required');

  // Both conditions satisfied: Moon is owned and has a physical herd.
  const s3 = state(6); s3.industry.enabled = true;
  s3.land.worlds.moon.counts = { 0: 1 };
  s3.groups = [group('moon')];
  stepIndustry(s3, 10, {}, {});
  check('phase 6 progresses when physical herd is on owned target world', (s3.industry.work.moon || 0) > 0);
}

// Phase 9 Judges project strictly requires 3 distinct occupied worlds;
// multiple groups on the same world cannot bypass this constraint.
{
  // 3 groups, but all residing on Earth (1 occupied world).
  const s1 = state(9); s1.industry.enabled = true;
  for (const key of ['moon', 'mars', 'jupiter']) s1.land.worlds[key].counts = { 0: 1 };
  s1.groups = [group('earth'), group('earth'), group('earth')];
  stepIndustry(s1, 10, {}, {});
  check('phase 9 cannot progress when all groups occupy a single world', (s1.industry.work.judges || 0) === 0);

  // 3 groups distributed across only 2 worlds (2 on Earth, 1 on Moon).
  const s2 = state(9); s2.industry.enabled = true;
  for (const key of ['moon', 'mars', 'jupiter']) s2.land.worlds[key].counts = { 0: 1 };
  s2.groups = [group('earth'), group('earth'), group('moon')];
  stepIndustry(s2, 10, {}, {});
  check('phase 9 cannot progress with only 2 distinct occupied worlds', (s2.industry.work.judges || 0) === 0);

  // 3 distinct occupied worlds (Moon, Mars, Jupiter).
  const s3 = state(9); s3.industry.enabled = true;
  for (const key of ['moon', 'mars', 'jupiter']) s3.land.worlds[key].counts = { 0: 1 };
  s3.groups = [group('moon'), group('mars'), group('jupiter')];
  stepIndustry(s3, 10, {}, {});
  check('phase 9 progresses when 3 distinct worlds are occupied', (s3.industry.work.judges || 0) > 0);
}

// Project and support together cannot spend more than one reserved share of fresh production
// when stocks are zero and labor is supply-limited.
{
  const s = state(6); s.industry.enabled = true;
  s.industry.share = 0.4;
  s.land.worlds.earth.counts = { 0: 1000 };
  s.land.worlds.moon.counts = { 0: 1000 };
  s.groups = [group('earth'), group('moon')];
  s.industry.worlds.earth.pending = true;

  // Zero inventory stock: only fresh production can be utilized.
  s.resources = { credits: 1e5, bones: 0, skin: 0, compute: 0, cloth: 0, milk: 0, meat: 0, wool: 0 };

  // Fresh production supplies materials required by both colonization and support.
  const produced = { bones: 100, skin: 80, compute: 500 };
  const initialProduced = { ...produced };

  // High dt ensures labor demand is large enough to consume all available material quota.
  stepIndustry(s, 100, produced, {});

  const maxAllowedBones = initialProduced.bones * s.industry.share;
  const maxAllowedSkin = initialProduced.skin * s.industry.share;
  const maxAllowedCompute = initialProduced.compute * s.industry.share;

  const consumedBones = initialProduced.bones - produced.bones;
  const consumedSkin = initialProduced.skin - produced.skin;
  const consumedCompute = initialProduced.compute - produced.compute;

  check('total bones consumption does not exceed reserved share', consumedBones <= maxAllowedBones + 1e-8);
  check('total skin consumption does not exceed reserved share', consumedSkin <= maxAllowedSkin + 1e-8);
  check('total compute consumption does not exceed reserved share', consumedCompute <= maxAllowedCompute + 1e-8);
  check('supply-limited budget is fully utilized up to share limit',
    near(consumedBones, maxAllowedBones) || near(consumedSkin, maxAllowedSkin) || near(consumedCompute, maxAllowedCompute));
  check('zero inventory stock is never overdrafted',
    s.resources.bones === 0 && s.resources.skin === 0 && s.resources.compute === 0);
  check('unreserved fresh production is preserved',
    produced.bones >= initialProduced.bones * (1 - s.industry.share) - 1e-8);
}

// Arbitrary massive dt cannot overconsume materials beyond completed target for support or late projects.
{
  // Support near completion: exactly 0.5 work remaining.
  const s1 = state(6); s1.industry.enabled = true;
  s1.industry.worlds.earth.level = 0;
  const targetSupport = supportTarget(0);
  s1.industry.worlds.earth.work = targetSupport - 0.5;
  s1.industry.worlds.earth.pending = true;
  s1.resources = { credits: 1e5, bones: 1e5, skin: 1e5, compute: 1e5 };

  stepIndustry(s1, 1e7, {}, {});
  check('support completes and resets pending on target reached',
    s1.industry.worlds.earth.level === 1 && !s1.industry.worlds.earth.pending && s1.industry.worlds.earth.work === 0);
  check('support does not overconsume bones on huge dt', near(1e5 - s1.resources.bones, 0.5 * 2));
  check('support does not overconsume skin on huge dt', near(1e5 - s1.resources.skin, 0.5 * 1));
  check('support does not overconsume compute on huge dt', near(1e5 - s1.resources.compute, 0.5 * 10));

  // Phase 7 Dyson Sphere near completion: exactly 1.0 work remaining.
  const s2 = state(7); s2.industry.enabled = true;
  s2.projects.dyson.count = 0;
  s2.projects.dyson.progress = 108000 - 1.0;
  s2.resources = { credits: 1e5, bones: 1e5, skin: 1e5, cloth: 1e5 };

  stepIndustry(s2, 1e8, {}, {});
  check('dyson sphere completes at exactly its target', near(s2.projects.dyson.progress, 108000));
  check('dyson sphere does not overconsume bones on huge dt', near(1e5 - s2.resources.bones, 1.0 * 4));
  check('dyson sphere does not overconsume skin on huge dt', near(1e5 - s2.resources.skin, 1.0 * 2));
  check('dyson sphere does not overconsume cloth on huge dt', near(1e5 - s2.resources.cloth, 1.0 * 2));
}

// Black hole cannot spend credits and maintains exact material accounting between stock, production, and warehouse.
{
  const s = state(10);
  s.prestige.armed = true;
  s.industry.share = 0.5;
  const initialCredits = 1e20;
  s.resources = {
    credits: initialCredits,
    wool: 40,
    milk: 60,
    meat: 20,
    cloth: 0,
    cheese: 0,
    bones: 0,
    skin: 0,
    brain: 0,
  };
  const produced = { wool: 100, milk: 80, meat: 0 };
  const initialProduced = { ...produced };
  const initialResources = { ...s.resources };
  const initialWarehouse = s.prestige.centralWarehouse || 0;

  stepIndustry(s, 5, produced, {});

  const deltaWarehouse = (s.prestige.centralWarehouse || 0) - initialWarehouse;
  check('black hole progressed warehouse with materials', deltaWarehouse > 0);
  check('black hole strictly never spends credits', s.resources.credits === initialCredits);

  const sellValues = { wool: 1.0, milk: 2.7, meat: 6.0, cloth: 3.0, cheese: 5.0, bones: 4.0, skin: 5.0, brain: 22.0 };
  let computedMaterialValue = 0;
  for (const [key, value] of Object.entries(sellValues)) {
    const prodConsumed = (initialProduced[key] || 0) - (produced[key] || 0);
    const stockConsumed = (initialResources[key] || 0) - (s.resources[key] || 0);
    check(`valid non-negative consumption for ${key}`, prodConsumed >= -1e-12 && stockConsumed >= -1e-12);
    check(`production consumption for ${key} respects industry share`,
      prodConsumed <= (initialProduced[key] || 0) * s.industry.share + 1e-12);
    computedMaterialValue += (prodConsumed + stockConsumed) * value;
  }
  check('exact material value delivered matches warehouse increase', near(deltaWarehouse, computedMaterialValue));
}

console.log(`industry: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
