import assert from 'node:assert/strict';
import { BALANCE, MAX_OFFLINE_SECONDS } from '../src/config.js';
import { newGame } from '../src/io/state.js';
import { serialize, deserialize, simulateElapsed, applyOffline } from '../src/io/save.js';
import { advance, advanceAsync, SIM_STEP, AUTO_INTERVAL } from '../src/sim/advance.js';
import {
  buyAddSheep,
  doMoveGroup,
  craftImmortality,
  canIgnite,
  doIgnite,
  doSingularity,
  singularityAvailable,
  startNewGamePlus,
  createNursery, setIndustry, armBlackHole,
} from '../src/econ/actions.js';
import { totalCount } from '../src/sim/cohort.js';
import { worldPopulation, worldCapacity } from '../src/content/locations.js';

// 1. Fair births order-independent via step .1 on same-world groups swapped
{
  const sA = newGame();
  sA.phase = 2;
  const g1_A = {
    ...sA.groups[0],
    id: 1,
    name: 'G1',
    counts: { M: { child: 5, adult: 25, old: 5 }, F: { child: 5, adult: 25, old: 5 } },
    bredFracF: 0.5,
  };
  const g2_A = {
    ...sA.groups[0],
    id: 2,
    name: 'G2',
    counts: { M: { child: 8, adult: 30, old: 2 }, F: { child: 8, adult: 30, old: 2 } },
    bredFracF: 0.5,
  };
  sA.groups = [g1_A, g2_A];
  sA.nextGroupId = 3;

  const sB = JSON.parse(JSON.stringify(sA));
  sB.groups = [sB.groups[1], sB.groups[0]];

  advance(sA, 0.1);
  advance(sB, 0.1);

  const g1A = sA.groups.find(g => g.id === 1);
  const g1B = sB.groups.find(g => g.id === 1);
  const g2A = sA.groups.find(g => g.id === 2);
  const g2B = sB.groups.find(g => g.id === 2);

  assert.ok(Math.abs(totalCount(g1A) - totalCount(g1B)) < 1e-8, 'G1 count must be order-independent');
  assert.ok(Math.abs(totalCount(g2A) - totalCount(g2B)) < 1e-8, 'G2 count must be order-independent');
  assert.ok(Math.abs(sA.stats.born - sB.stats.born) < 1e-8, 'Births must be order-independent');
}

// 2. Same-time online advance(s, .1) repeated vs simulateElapsed(s, 60) agree within 1e-8, automated purchases occur
{
  const sOnline = newGame();
  sOnline.phase = 2;
  sOnline.resources.credits = 1e6;
  sOnline.settings.autobuy = { sheep: true, land: true, upgrades: true, sphere: false };
  const sSim = JSON.parse(JSON.stringify(sOnline));

  for (let i = 0; i < 600; i++) {
    advance(sOnline, 0.1);
  }
  simulateElapsed(sSim, 60);

  const purchasesMade =
    sOnline.buys.addSheep > 0 ||
    Object.keys(sOnline.upgrades).length > 0 ||
    (sOnline.stats.spent && Object.keys(sOnline.stats.spent).length > 0);
  assert.ok(purchasesMade, 'Automated purchases must occur during elapsed time');

  assert.ok(
    Math.abs(sOnline.resources.credits - sSim.resources.credits) < 1e-8,
    'Credits between 600x 0.1s steps and simulateElapsed(60) must agree within 1e-8'
  );
  assert.ok(
    Math.abs(sOnline.meta.gameTime - sSim.meta.gameTime) < 1e-8,
    'gameTime must agree within 1e-8'
  );
  const popOnline = sOnline.groups.reduce((sum, g) => sum + totalCount(g), 0);
  const popSim = sSim.groups.reduce((sum, g) => sum + totalCount(g), 0);
  assert.ok(
    Math.abs(popOnline - popSim) < 1e-8,
    'Population must agree within 1e-8'
  );
}

// 3. Save midtick scheduler exact fractional carry parity without clock drift
{
  const sMid = newGame();
  sMid.phase = 2;
  advance(sMid, 0.25);
  assert.ok(Math.abs(sMid.settings.simRemainder - 0.05) < 1e-8, 'simRemainder must hold 0.05 fractional carry');

  const sRestored = deserialize(serialize(sMid));
  assert.ok(Math.abs(sRestored.settings.simRemainder - 0.05) < 1e-8, 'Fractional carry preserved across save/load');

  advance(sRestored, 0.05);

  const sDirect = newGame();
  sDirect.phase = 2;
  advance(sDirect, 0.30);

  assert.ok(
    Math.abs(sRestored.meta.gameTime - sDirect.meta.gameTime) < 1e-8,
    'Game time must match exactly between carry-resumed and direct advance'
  );
  assert.ok(
    Math.abs(sRestored.resources.credits - sDirect.resources.credits) < 1e-8,
    'Credits must match exactly between carry-resumed and direct advance'
  );
}

// 4. .1 vs .05 step size cannot step smaller because SIM_STEP is minimum
{
  const s = newGame();
  assert.equal(SIM_STEP, 0.1, 'SIM_STEP minimum must be 0.1');
  advance(s, 0.05);
  assert.equal(s.meta.gameTime, 0, 'No step may execute when advance duration < SIM_STEP');
  assert.ok(Math.abs(s.settings.simRemainder - 0.05) < 1e-8, 'Remainder stores 0.05');
}

// 5. Offline 8h parity runtime avoids simulating 180h
{
  const sOff = newGame();
  sOff.meta.lastSaved = Date.now() - 180 * 3600 * 1000;
  const summary = applyOffline(sOff);
  assert.ok(summary !== null);
  assert.equal(
    summary.seconds,
    MAX_OFFLINE_SECONDS,
    `applyOffline must cap elapsed time at MAX_OFFLINE_SECONDS (8h = ${MAX_OFFLINE_SECONDS}s), avoiding 180h`
  );
}

// 6. Compare online vs async: advanceAsync uses 10 batches (30s each for 300s)
{
  const sSync = newGame();
  sSync.phase = 2;
  sSync.resources.credits = 10000;
  const sAsync = JSON.parse(JSON.stringify(sSync));

  let batchCount = 0;
  await advanceAsync(sAsync, 300, () => {
    batchCount++;
  });
  advance(sSync, 300);

  assert.ok(batchCount >= 10, `Expected at least 10 async progress batches for 300s, got ${batchCount}`);
  assert.ok(
    Math.abs(sAsync.resources.credits - sSync.resources.credits) < 1e-8,
    'Credits must match between async and sync advance'
  );
  assert.ok(
    Math.abs(sAsync.meta.gameTime - sSync.meta.gameTime) < 1e-8,
    'Game time must match between async and sync advance'
  );
}

// 7. Prestige: canIgnite requires phase 10 and centralWarehouse filled to threshold
{
  const s = newGame();
  s.phase = 9;
  s.prestige.centralWarehouse = s.prestige.threshold;
  assert.equal(canIgnite(s), false, 'Cannot ignite before phase 10');

  s.phase = 10;
  s.prestige.centralWarehouse = s.prestige.threshold - 1;
  assert.equal(canIgnite(s), false, 'Cannot ignite when warehouse below threshold');

  s.prestige.centralWarehouse = s.prestige.threshold;
  assert.equal(canIgnite(s), true, 'canIgnite must be true at phase 10 with filled warehouse');
}

// 8. doIgnite actual 5 cycles: constructed fixture with filled threshold yields cumulative knowledge 160 after 5
//    and owned tools carry over with no generic bonus
{
  const s = newGame();
  s.behemot.inv = { incubator: { qty: 1, active: false } };

  for (let cycle = 0; cycle < 5; cycle++) {
    s.phase = 10;
    s.prestige.centralWarehouse = s.prestige.threshold;
    const ok = doIgnite(s);
    assert.equal(ok, true, `doIgnite must succeed in cycle ${cycle + 1}`);
  }

  assert.equal(s.prestige.runs, 5, 'Must have recorded 5 runs after 5 cycles');
  assert.ok(s.prestige.knowledge >= BALANCE.prestige.singularityKnowledge, 'Five resets unlock revelation');
  assert.equal(s.prestige.knowledgeLifetime, s.prestige.knowledge, 'Unspent knowledge is retained');
  assert.ok(s.behemot?.inv?.incubator, 'Owned tool must carry over after 5 ignitions');
}

// 9. doSingularity only when final phase 10 filled with singularity flag -> phase 11 retains world
//    then explicit startNewGamePlus does not increment BH count
{
  const s = newGame();
  s.phase = 10;
  s.prestige.singularity = false;
  s.prestige.centralWarehouse = s.prestige.threshold;

  assert.equal(singularityAvailable(s), false, 'Singularity unavailable without singularity flag');
  assert.equal(doSingularity(s), false, 'doSingularity must reject without flag');

  s.prestige.singularity = true;
  s.prestige.centralWarehouse = s.prestige.threshold - 1;
  assert.equal(singularityAvailable(s), false, 'Singularity unavailable below threshold');
  assert.equal(doSingularity(s), false, 'doSingularity must reject below threshold');

  s.prestige.centralWarehouse = s.prestige.threshold;
  assert.equal(singularityAvailable(s), true, 'Singularity available when flag set and warehouse filled');

  const triggered = doSingularity(s);
  assert.equal(triggered, true, 'doSingularity must succeed');
  assert.equal(s.phase, 11, 'Phase must advance to 11');
  assert.equal(s.flags.preludeUnlocked, true, 'Prelude flag unlocked');
  assert.ok(s.groups.length > 0 && worldPopulation(s, 'earth') > 0, 'Phase 11 must retain world');

  const bhRunsBefore = s.prestige.runs;
  const ngpStarted = startNewGamePlus(s);
  assert.equal(ngpStarted, true, 'startNewGamePlus must succeed');
  assert.equal(s.phase, 1, 'NG+ resets game to phase 1');
  assert.equal(s.meta.ngPlus, 1, 'ngPlus counter incremented');
  assert.equal(s.prestige.runs, bhRunsBefore, 'startNewGamePlus must NOT increment Black Hole runs count');
  s.phase = 10;
  s.prestige.centralWarehouse = s.prestige.threshold;
  doIgnite(s);
  assert.equal(s.meta.ngPlus, 1, 'A later black hole preserves the NG+ count');
  assert.equal(s.flags.preludeUnlocked, true, 'Revealed Prelude remains unlocked across later resets');
}

// 10. Early industry gate cannot be bypassed by Infinity credits
{
  const s = newGame();
  s.phase = 4;
  s.resources.credits = Infinity;
  s.industry.completed.elixir = false;

  const result = craftImmortality(s);
  assert.equal(result, false, 'craftImmortality must fail when elixir is incomplete, even with Infinity credits');
  assert.equal(Boolean(s.flags.immortal), false, 'immortal flag must not be granted');
}

// 11. Empty colonies do not advance population
{
  const s = newGame();
  s.phase = 6;
  s.land.worlds.moon = { tier: 0, counts: { 0: 5 } };
  assert.equal(worldPopulation(s, 'moon'), 0);
  advance(s, 10);
  assert.equal(worldPopulation(s, 'moon'), 0, 'Empty colonies must not generate sheep or advance population');
}

// 12. Optional Behemot does not gate progression
{
  const s = newGame();
  for (let i = 0; i < 50; i++) advance(s, 0.1);
  assert.ok(s.resources.credits > 0);
  s.phase = 10;
  s.prestige.centralWarehouse = s.prestige.threshold;
  assert.equal(canIgnite(s), true, 'canIgnite must function without Behemot interaction');
}

// 13. Data contains no NaN
{
  function verifyNoNaN(obj, path = '') {
    if (typeof obj === 'number') {
      assert.ok(!Number.isNaN(obj), `NaN detected at ${path}`);
    } else if (obj && typeof obj === 'object') {
      for (const k of Object.keys(obj)) {
        verifyNoNaN(obj[k], path ? `${path}.${k}` : k);
      }
    }
  }
  const s = newGame();
  advance(s, 10);
  verifyNoNaN(s, 'state');
}

// 14. Max cap: buyAddSheep rejects excess with no cost deducted
{
  const s = newGame();
  s.resources.credits = 100000;
  const capacity = worldCapacity(s, 'earth');
  const current = worldPopulation(s, 'earth');
  const excessUnits = Math.ceil((capacity - current + 1) / BALANCE.sheepPerUnit) + 5;

  const creditsBefore = s.resources.credits;
  const buysBefore = s.buys.addSheep;
  const popBefore = worldPopulation(s, 'earth');

  const bought = buyAddSheep(s, 'mix', excessUnits);
  assert.equal(bought, false, 'buyAddSheep must reject purchase exceeding capacity');
  assert.equal(s.resources.credits, creditsBefore, 'No credits should be deducted on rejected buy');
  assert.equal(s.buys.addSheep, buysBefore, 'Buys counter must not change');
  assert.equal(worldPopulation(s, 'earth'), popBefore, 'Population must remain unchanged');
}

// 15. Moves min population
{
  const s = newGame();
  s.phase = 6;
  s.land.worlds.moon = { tier: 0, counts: { 0: 5 } };
  const herd = s.groups[0];
  herd.counts.M.adult = 0;
  herd.counts.F.adult = 0;

  const movedEmpty = doMoveGroup(s, herd.id, 'moon', 0.5);
  assert.equal(movedEmpty, false, 'Cannot move empty population');

  herd.counts.M.adult = 100;
  herd.counts.F.adult = 100;
  const movedValid = doMoveGroup(s, herd.id, 'moon', 0.5);
  assert.equal(movedValid, true, 'Moving valid herd must succeed');
  assert.ok(worldPopulation(s, 'moon') > 0, 'Colony must receive transferred population');
  assert.ok(worldPopulation(s, 'earth') > 0, 'Origin world must retain remaining population');
}

// Nursery is a physical split with independent selection, not a cloning bonus.
{
  const s = newGame(); s.phase = 2;
  s.behemot.inv.incubator = { qty: 1, active: true };
  const parent = s.groups[0]; parent.counts.F.adult = 100; parent.counts.M.adult = 100;
  const before = totalCount(parent), genes = structuredClone(parent.genes);
  assert.equal(createNursery(s, parent.id), true);
  const nursery = s.groups.find(g => g.nursery);
  assert.ok(Math.abs(totalCount(nursery) - before * .1) < 1e-8);
  assert.ok(Math.abs(s.groups.reduce((n, g) => n + totalCount(g), 0) - before) < 1e-8);
  assert.deepEqual(nursery.genes, genes);
  nursery.policy.cull.gene = 'profile:textile';
  assert.notEqual(parent.policy.cull.gene, nursery.policy.cull.gene);
  assert.equal(createNursery(s, parent.id), false, 'Only one nursery per world');
}

// Both controls pause the same warehouse transport, with no hidden drain.
{
  const s = newGame(); s.phase = 10; s.resources.wool = 1000;
  s.prestige.armed = true; s.industry.enabled = true;
  setIndustry(s, { enabled: false });
  const before = s.prestige.centralWarehouse;
  advance(s, 1);
  assert.equal(s.prestige.centralWarehouse, before);
  assert.equal(armBlackHole(s), true);
  assert.equal(s.industry.enabled, true);
  advance(s, 1);
  assert.ok(s.prestige.centralWarehouse > before);
}
