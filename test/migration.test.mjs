import assert from 'node:assert/strict';
import { VERSION, BALANCE, GENES, WORLD_ORDER } from '../src/config.js';
import { newGame, defaultPolicy } from '../src/io/state.js';
import { serialize, deserialize } from '../src/io/save.js';
import { defaultSoil } from '../src/sim/soil.js';
import { totalCount } from '../src/sim/cohort.js';
import { installedSupport } from '../src/content/habitats.js';
import { worldPopulation, worldArea } from '../src/content/locations.js';
import { INDUSTRY } from '../src/content/industry-config.js';

const encode = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');

function createV3Fixture() {
  const fixture = newGame();
  fixture.version = 3;
  delete fixture.industry;
  delete fixture.story;
  for (const g of fixture.groups) {
    delete g.worldId;
  }
  return fixture;
}

// 1. Old v3 fixture creation & Behemot inventory refund / tools migration
{
  const fixture = createV3Fixture();
  fixture.groups[0].soil.q = .8;
  fixture.resources.credits = 100;
  fixture.behemot = {
    inv: { radioaktivni_krmivo: { qty: 2 }, samostrihaci_rameno: { qty: 1, active: true } },
    soldOut: { samostrihaci_rameno: true },
  };

  const migrated = deserialize(serialize(fixture));
  assert.equal(migrated.version, VERSION, 'Migrated state must upgrade to current VERSION');
  // 100 base credits + 3400 refund credits = 3500 credits
  assert.equal(migrated.resources.credits, 3500, 'radioaktivni_krmivo qty 2 must refund exactly 3400 credits');

  const tools = migrated.behemot?.inv;
  const toolCount = Array.isArray(tools)
    ? tools.length
    : Object.values(tools || {}).filter(Boolean).length || Object.keys(tools || {}).length;
  assert.equal(toolCount, 3, 'An owned v3 permanent item grants the replacement tools');
}

// 2. Deep nested defaults with partial payloads
{
  const partial = {
    version: 3,
    phase: 3,
    groups: [
      {
        id: 1,
        name: 'Partial Herd',
        species: 'base',
        counts: {
          M: { child: 0, adult: 5, old: 0 },
          F: { child: 0, adult: 5, old: 0 },
        },
      },
    ],
    settings: { buy: { qty: 5 } },
    land: { density: 2 },
    projects: { dyson: { progress: 50 } },
    prestige: { knowledge: 25 },
    world: { achievementMult: 1.5 },
    stats: { born: 42 },
  };

  const migrated = deserialize(encode(partial));
  assert.equal(migrated.settings.buy.qty, 5);
  assert.equal(typeof migrated.settings.autobuy.sheep, 'boolean');
  assert.equal(typeof migrated.settings.autobuy.land, 'boolean');
  assert.equal(migrated.land.density, 2);
  assert.ok(migrated.land.worlds.earth);
  assert.equal(migrated.projects.laser.level, 0);
  assert.equal(migrated.prestige.knowledge, 25);
  assert.ok(migrated.prestige.threshold > 0);
  assert.equal(migrated.world.achievementMult, 1.5);
  assert.equal(migrated.stats.born, 42);
  assert.ok(migrated.stats.spent && typeof migrated.stats.spent === 'object');
}

// 3. Preserve population and genes (mu / sigma) across allocation into owned Earth, Moon, Mars
//    and ensure installed support >= assigned population on each world
{
  const fixture = createV3Fixture();
  fixture.land = {
    density: 0,
    mods: {},
    worlds: {
      earth: { tier: 0, counts: { 0: 5 } },
      moon: { tier: 0, counts: { 0: 3 } },
      mars: { tier: 0, counts: { 0: 2 } },
      jupiter: { tier: 0, counts: {} },
      sphere: { tier: 0, counts: {} },
    },
  };

  const customMu = 1.85;
  const customSigma = 0.22;
  fixture.groups = [
    {
      id: 1,
      name: 'Stádo Alfa',
      species: 'base',
      genes: {
        woolRate: { mu: customMu, sigma: customSigma },
        maturity: { mu: 1.1, sigma: 0.1 },
      },
      counts: {
        M: { child: 10, adult: 40, old: 10 },
        F: { child: 20, adult: 80, old: 20 },
      },
      bredFracF: 0,
      policy: defaultPolicy(),
      soil: defaultSoil(),
    },
  ];

  const totalBefore = 10 + 40 + 10 + 20 + 80 + 20; // 180 sheep
  const migrated = deserialize(serialize(fixture));

  const worldsAllocated = new Set(migrated.groups.map(g => g.worldId));
  assert.ok(worldsAllocated.has('earth'), 'Earth must receive allocation');
  assert.ok(worldsAllocated.has('moon'), 'Moon must receive allocation');
  assert.ok(worldsAllocated.has('mars'), 'Mars must receive allocation');

  for (const g of migrated.groups) {
    assert.equal(g.genes.woolRate.mu, customMu, 'Gene mu must be preserved in every migrated group');
    assert.equal(g.genes.woolRate.sigma, customSigma, 'Gene sigma must be preserved in every migrated group');
  }

  const totalAfter = migrated.groups.reduce((sum, g) => sum + totalCount(g), 0);
  assert.ok(Math.abs(totalAfter - totalBefore) < 1e-6, `Total pop ${totalAfter} must equal ${totalBefore}`);

  for (const w of ['earth', 'moon', 'mars']) {
    const pop = worldPopulation(migrated, w);
    const support = installedSupport(migrated, w);
    assert.ok(
      support >= pop,
      `Support ${support} must be >= assigned population ${pop} on world ${w}`
    );
  }
}

// 4. Retain phase, knowledge/perks, and Dyson sphere progress fraction
{
  const fixture = createV3Fixture();
  fixture.phase = 8;
  fixture.groups[0].soil.q = .9;
  fixture.prestige = {
    knowledge: 550,
    knowledgeLifetime: 600,
    runs: 2,
    perks: { voyage: 2, foresight: 1 },
  };
  // v3 count 0 base target was 2.6e6. 1.3e6 represents a 0.5 fraction.
  fixture.projects = {
    dyson: { progress: 1.3e6, count: 0, builders: 5 },
    laser: { level: 2 },
    timeMachine: { progress: 0 },
  };

  const migrated = deserialize(serialize(fixture));
  assert.equal(migrated.phase, 8);
  assert.equal(migrated.prestige.knowledge, 550);
  assert.equal(migrated.prestige.perks.voyage, 2);
  assert.equal(migrated.prestige.perks.foresight, 1);

  const expectedProgress = 0.5 * INDUSTRY.jobs.sphere.firstTarget;
  assert.ok(
    Math.abs(migrated.projects.dyson.progress - expectedProgress) < 1e-4,
    `Sphere progress ${migrated.projects.dyson.progress} must reflect 0.5 fraction of firstTarget ${INDUSTRY.jobs.sphere.firstTarget}`
  );
}

// 5. Serialize -> deserialize twice must be idempotent (no duplicate refunds or population)
{
  const fixture = createV3Fixture();
  fixture.resources.credits = 0;
  fixture.behemot = {
    inv: { radioaktivni_krmivo: 2 },
    oldonce: 1,
  };

  const once = deserialize(serialize(fixture));
  const creditsOnce = once.resources.credits;
  const popOnce = once.groups.reduce((n, g) => n + totalCount(g), 0);
  const groupsLenOnce = once.groups.length;

  const twice = deserialize(serialize(once));
  assert.equal(twice.resources.credits, creditsOnce, 'Second deserialize must not award duplicate refunds');
  assert.equal(twice.groups.length, groupsLenOnce, 'Second deserialize must not re-split or duplicate groups');
  const popTwice = twice.groups.reduce((n, g) => n + totalCount(g), 0);
  assert.ok(Math.abs(popTwice - popOnce) < 1e-9, 'Second deserialize must preserve exact population');
}

// 6. Unknown world falls back to Earth
{
  const state = newGame();
  state.groups[0].worldId = 'unknown_galaxy';
  const migrated = deserialize(serialize(state));
  assert.equal(migrated.groups[0].worldId, 'earth', 'Unknown world must fall back to earth');
}

// 7. Corrupt version rejects
{
  const badVersionA = newGame();
  badVersionA.version = 2;
  assert.throws(() => deserialize(serialize(badVersionA)), /neplatný nebo zastaralý save/);

  const badVersionB = newGame();
  badVersionB.version = 99;
  assert.throws(() => deserialize(serialize(badVersionB)), /neplatný nebo zastaralý save/);

  assert.throws(() => deserialize('corrupt-non-base64-payload'));
}

// 8. Missing recent fields properly hydrated
{
  const state = newGame();
  delete state.story;
  delete state.industry;
  delete state.achievements;
  delete state.stats;
  for (const g of state.groups) {
    delete g.soil;
    delete g.policy.cull;
  }

  const hydrated = deserialize(serialize(state));
  assert.ok(hydrated.story && Array.isArray(hydrated.story.events));
  assert.ok(hydrated.industry && hydrated.industry.completed);
  assert.ok(hydrated.stats && typeof hydrated.stats.born === 'number');
  assert.ok(hydrated.groups[0].soil && typeof hydrated.groups[0].soil.q === 'number');
  assert.ok(hydrated.groups[0].policy.cull && typeof hydrated.groups[0].policy.cull.cutFrac === 'number');
}

// 9. Low populations remain finite
{
  const state = newGame();
  state.groups[0].counts.M.adult = 1e-9;
  state.groups[0].counts.F.adult = 1e-9;
  state.groups[0].counts.M.child = 0;
  state.groups[0].counts.F.child = 0;
  state.groups[0].counts.M.old = 0;
  state.groups[0].counts.F.old = 0;

  const migrated = deserialize(serialize(state));
  for (const g of migrated.groups) {
    for (const sex of ['M', 'F']) {
      for (const stage of ['child', 'adult', 'old']) {
        assert.ok(Number.isFinite(g.counts[sex][stage]), `${sex}.${stage} count must be finite`);
      }
    }
  }
}
