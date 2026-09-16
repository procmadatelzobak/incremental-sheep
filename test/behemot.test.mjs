// ===========================================================================
//  Behemot Emporio & Story Unit Tests
//  Verified using node:test and node:assert/strict
// ===========================================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOG,
  itemById,
  defaultBehemot,
  migrateBehemot,
  behemotPrestige,
  barterCost,
  itemAvailable,
  canBarter,
  barter,
  toggleItem,
  toolActive,
  effectText,
  behemotSay,
  stepBehemot,
  consumeRecipe,
} from '../src/content/behemot.js';

import {
  defaultStory,
  emitStory,
  updateStory,
  hasSeenStory,
  getStoryEvents,
} from '../src/content/story.js';

describe('Behemot Emporio Redesign', () => {
  describe('Catalog & Definitions', () => {
    it('has exactly 3 items with expected properties', () => {
      assert.equal(CATALOG.length, 3);

      const incubator = itemById('incubator');
      assert.ok(incubator);
      assert.equal(incubator.minPhase, 2);
      assert.deepEqual(incubator.cost, { wool: 250, milk: 100 });
      assert.equal(incubator.once, true);
      assert.ok(typeof incubator.desc === 'string' && incubator.desc.length > 0);

      const turbine = itemById('turbine');
      assert.ok(turbine);
      assert.equal(turbine.minPhase, 7);
      assert.deepEqual(turbine.cost, { milk: 1500, cloth: 600 });
      assert.equal(turbine.once, true);

      const switchboard = itemById('switchboard');
      assert.ok(switchboard);
      assert.equal(switchboard.minPhase, 7);
      assert.deepEqual(switchboard.cost, { bones: 3000, skin: 2500 });
      assert.equal(switchboard.once, true);
    });

    it('returns identity fixed costs via barterCost', () => {
      const state = { phase: 7 };
      const incubator = itemById('incubator');
      const cost = barterCost(state, incubator);
      assert.deepEqual(cost, { wool: 250, milk: 100 });
      cost.wool = 999;
      assert.equal(incubator.cost.wool, 250); // No mutation
    });

    it('provides informative effectText', () => {
      assert.match(effectText('incubator'), /vlastní selekcí/i);
      assert.match(effectText('turbine'), /energii/i);
      assert.match(effectText('switchboard'), /4:1/i);
    });
  });

  describe('Phase Locks & Barter Atomicity', () => {
    it('locks items below minPhase', () => {
      const state = { phase: 1, resources: { wool: 5000, milk: 5000, cloth: 5000, bones: 5000, skin: 5000 }, behemot: defaultBehemot() };
      assert.equal(itemAvailable(state, 'incubator'), false);
      assert.equal(canBarter(state, 'incubator'), false);
      assert.equal(barter(state, 'incubator'), false);

      state.phase = 2;
      assert.equal(itemAvailable(state, 'incubator'), true);
      assert.equal(canBarter(state, 'incubator'), true);
      assert.equal(itemAvailable(state, 'turbine'), false);

      state.phase = 7;
      assert.equal(itemAvailable(state, 'turbine'), true);
      assert.equal(itemAvailable(state, 'switchboard'), true);
    });

    it('barters once atomically and deducts resources', () => {
      const state = {
        phase: 2,
        resources: { wool: 300, milk: 150 },
        behemot: defaultBehemot(),
      };
      assert.equal(barter(state, 'incubator'), true);
      assert.equal(state.resources.wool, 50);
      assert.equal(state.resources.milk, 50);
      assert.deepEqual(state.behemot.inv.incubator, { qty: 1, active: false });

      // Second barter fails (buy only once)
      state.resources.wool += 500;
      state.resources.milk += 500;
      assert.equal(canBarter(state, 'incubator'), false);
      assert.equal(barter(state, 'incubator'), false);
      assert.equal(state.resources.wool, 550);
    });

    it('fails barter atomically if any resource is missing', () => {
      const state = {
        phase: 2,
        resources: { wool: 300, milk: 50 }, // milk is missing 50
        behemot: defaultBehemot(),
      };
      assert.equal(barter(state, 'incubator'), false);
      assert.equal(state.resources.wool, 300); // untouched
      assert.equal(state.resources.milk, 50);
      assert.equal(state.behemot.inv.incubator, undefined);
    });
  });

  describe('Toggle & Active State (Meaningful Optionality)', () => {
    it('allows toggling only owned and unlocked tools', () => {
      const state = {
        phase: 7,
        resources: {},
        behemot: defaultBehemot(),
      };

      assert.equal(toggleItem(state, 'incubator'), false);
      assert.equal(toolActive(state, 'incubator'), false);

      state.behemot.inv.incubator = { qty: 1, active: false };
      assert.equal(toolActive(state, 'incubator'), false);

      assert.equal(toggleItem(state, 'incubator'), true);
      assert.equal(state.behemot.inv.incubator.active, true);
      assert.equal(toolActive(state, 'incubator'), true);

      assert.equal(toggleItem(state, 'incubator'), true);
      assert.equal(state.behemot.inv.incubator.active, false);
      assert.equal(toolActive(state, 'incubator'), false);

      // Lock tool if phase rolls back below minPhase
      state.behemot.inv.incubator.active = true;
      state.phase = 1;
      assert.equal(toolActive(state, 'incubator'), false);
      assert.equal(toggleItem(state, 'incubator'), false);
    });
  });

  describe('Turbine Step & Milk Conversion', () => {
    it('converts milk to energy only when turbine is active', () => {
      const state = {
        phase: 7,
        behemot: defaultBehemot(),
      };
      state.behemot.inv.turbine = { qty: 1, active: false };

      const prodInactive = { milk: 100, energy: 0 };
      stepBehemot(state, 1, prodInactive);
      assert.equal(prodInactive.milk, 100);
      assert.equal(prodInactive.energy, 0);

      // Activate turbine (default turbineShare = 0.25, 0.1 energy / unit of milk)
      state.behemot.inv.turbine.active = true;
      const prodActive = { milk: 100, energy: 0 };
      stepBehemot(state, 1, prodActive);
      assert.equal(prodActive.milk, 75); // 25 milk converted
      assert.equal(prodActive.energy, 2.5); // 25 * 0.1 = 2.5

      // Custom capped turbineShare
      state.behemot.turbineShare = 0.5;
      const prodHalf = { milk: 200, energy: 10 };
      stepBehemot(state, 1, prodHalf);
      assert.equal(prodHalf.milk, 100); // 100 converted
      assert.equal(prodHalf.energy, 20); // 10 + 10 = 20

      // Turbine share clamped to [0, 1]
      state.behemot.turbineShare = 1.5;
      const prodMax = { milk: 80 };
      stepBehemot(state, 1, prodMax);
      assert.equal(prodMax.milk, 0);
      assert.equal(prodMax.energy, 8);
    });
  });

  describe('Switchboard Material Substitution & Conservation', () => {
    it('enforces direct inputs when switchboard is inactive', () => {
      const state = {
        phase: 7,
        resources: { bones: 10, skin: 0 },
        behemot: defaultBehemot(),
      };
      state.behemot.inv.switchboard = { qty: 1, active: false };

      const recipe = { bones: 1, skin: 1 };
      const produced = { bones: 0, skin: 0 };

      // Missing skin, switchboard inactive -> 0 work possible
      const work = consumeRecipe(state, produced, recipe, 10, 0.5);
      assert.equal(work, 0);
      assert.equal(state.resources.bones, 10);
    });

    it('substitutes missing triad materials at 4:1 conserving total units', () => {
      const state = {
        phase: 7,
        resources: { bones: 0, skin: 40, cloth: 0 },
        behemot: defaultBehemot(),
      };
      state.behemot.inv.switchboard = { qty: 1, active: true };

      const recipe = { bones: 1 }; // Needs 10 bones for 10 work
      const produced = {};

      // 40 skin can substitute for 10 bones (10 * 4 = 40)
      const work = consumeRecipe(state, produced, recipe, 10, 0.5);
      assert.equal(work, 10);
      assert.equal(state.resources.skin, 0); // exactly 40 skin consumed
      assert.equal(state.resources.bones, 0);
    });

    it('allocates direct inputs first before substitution', () => {
      const state = {
        phase: 7,
        resources: { bones: 6, skin: 16, cloth: 0 },
        behemot: defaultBehemot(),
      };
      state.behemot.inv.switchboard = { qty: 1, active: true };

      // Desired work 10 requires 10 bones
      // Available bones: 6 direct -> 4 deficit
      // 4 deficit * 4 = 16 skin needed as substitute
      const recipe = { bones: 1 };
      const work = consumeRecipe(state, {}, recipe, 10, 0.5);

      assert.equal(work, 10);
      assert.equal(state.resources.bones, 0); // 6 direct consumed
      assert.equal(state.resources.skin, 0); // 16 substitute consumed
    });

    it('atomically limits work and prevents free conversion when materials are insufficient', () => {
      const state = {
        phase: 7,
        resources: { bones: 0, skin: 12 }, // 12 skin can only cover 3 bones
        behemot: defaultBehemot(),
      };
      state.behemot.inv.switchboard = { qty: 1, active: true };

      const recipe = { bones: 1 };
      const work = consumeRecipe(state, {}, recipe, 10, 0.5);

      assert.equal(work, 3);
      assert.equal(state.resources.skin, 0);
    });

    it('consumes from produced share first, then stock', () => {
      const state = {
        phase: 7,
        resources: { wool: 10 },
        behemot: defaultBehemot(),
      };
      const produced = { wool: 20 };
      const recipe = { wool: 1 };

      // share = 0.5 -> max 10 wool from produced, remainder from stock
      const work = consumeRecipe(state, produced, recipe, 15, 0.5);
      assert.equal(work, 15);
      assert.equal(produced.wool, 10); // 20 - 10 = 10
      assert.equal(state.resources.wool, 5); // 10 - 5 = 5
    });
  });

  describe('Migration & Idempotency', () => {
    it('detects legacy state, refunds consumables at base value, and grants 3 new tools', () => {
      const legacyState = {
        rel: { trust: 50, overload: 10 },
        buffs: [{ id: 'radioaktivni_krmivo', remaining: 20 }],
        soldOut: { samostrihaci_rameno: true },
        wisdom: 4,
        persistent: { artifacts: { mlekoturbina: true } },
        inv: {
          radioaktivni_krmivo: { qty: 2 }, // cost: { wool: 800, meat: 150 } -> (800*1 + 150*6) * 2 = 3400 credits
        },
        line: { key: 'garage', text: 'nešahej na to.' },
        lineN: 3,
        visits: 5,
      };

      const result = migrateBehemot(legacyState);
      assert.equal(result.refundCredits, 3400);
      assert.equal(result.state.rel, undefined);
      assert.equal(result.state.buffs, undefined);
      assert.equal(result.state.wisdom, undefined);
      assert.equal(result.state.soldOut, undefined);

      // Granted all 3 new tools inactive
      assert.deepEqual(result.state.inv, {
        incubator: { qty: 1, active: false },
        turbine: { qty: 1, active: false },
        switchboard: { qty: 1, active: false },
      });

      // Preserved line and stats
      assert.deepEqual(result.state.line, { key: 'garage', text: 'nešahej na to.' });
      assert.equal(result.state.lineN, 3);
      assert.equal(result.state.visits, 5);

      // Idempotent call
      const secondResult = migrateBehemot(result.state);
      assert.equal(secondResult.refundCredits, 0);
      assert.deepEqual(secondResult.state, result.state);
    });
  });

  describe('Prestige Carry & Sayings', () => {
    it('returns carry ownership without mutating state', () => {
      const state = {
        behemot: {
          inv: {
            incubator: { qty: 1, active: true },
            turbine: { qty: 1, active: false },
          },
        },
      };

      const carry = behemotPrestige(state);
      assert.deepEqual(carry, {
        inv: {
          incubator: { qty: 1, active: false },
          turbine: { qty: 1, active: false },
        },
      });

      // Original state unmutated
      assert.equal(state.behemot.inv.incubator.active, true);

      // Carry to defaultBehemot
      const fresh = defaultBehemot(carry);
      assert.deepEqual(fresh.inv, {
        incubator: { qty: 1, active: false },
        turbine: { qty: 1, active: false },
      });
    });

    it('rotates deterministic terse Czech garage lines', () => {
      const state = { behemot: defaultBehemot() };
      const line1 = behemotSay(state, 'garage');
      const line2 = behemotSay(state, 'garage');
      assert.ok(typeof line1 === 'string' && line1.length > 0);
      assert.ok(typeof line2 === 'string' && line2.length > 0);
      assert.notEqual(line1, line2);
      assert.equal(state.behemot.lineN, 2);
    });
  });
});

describe('Story System Module', () => {
  it('initializes defaultStory with empty or carried events', () => {
    const s1 = defaultStory();
    assert.deepEqual(s1.events, []);
    assert.deepEqual(s1.seen, {});

    const carry = { events: [{ id: 'ev1', text: 'txt', at: 1, run: 0 }], seen: { ev1: true } };
    const s2 = defaultStory(carry);
    assert.equal(s2.events.length, 1);
    assert.equal(s2.seen.ev1, true);
  });

  it('emitStory stores events up to 128 and marks seen permanently', () => {
    const state = { meta: { totalGameTime: 123 }, prestige: { runs: 2 } };
    const ev = emitStory(state, 'test_ev', 'Událost se stala.');
    assert.equal(ev.id, 'test_ev');
    assert.equal(ev.run, 2);
    assert.equal(ev.at, 123);
    assert.equal(hasSeenStory(state, 'test_ev'), true);
    assert.equal(getStoryEvents(state).length, 1);

    // Overflow capped at 128
    for (let i = 0; i < 150; i++) {
      emitStory(state, `ev_${i}`, `Event ${i}`);
    }
    assert.equal(getStoryEvents(state).length, 128);
  });

  it('updateStory evaluates milestones idempotently without adding multipliers', () => {
    const state = {
      phase: 11,
      stats: { selected: 15, peakPop: 2e18 },
      world: { bestIntel: 6, maxSpheres: 5 },
      prestige: { runs: 5, knowledge: 100 },
      flags: { immortal: true },
      projects: { dyson: { count: 5 } },
      groups: [{ worldId: 'moon', genes: { intelligence: { mu: 6 } }, counts: { M: { child: 0, adult: 2e18, old: 0 }, F: { child: 0, adult: 0, old: 0 } } }],
      meta: { epithet: 'Vládce hvězd' },
    };

    const newEvents = updateStory(state);
    assert.ok(newEvents.length >= 10);

    assert.ok(hasSeenStory(state, 'first_selection'));
    assert.ok(hasSeenStory(state, 'immortality'));
    assert.ok(hasSeenStory(state, 'intelligent_sheep'));
    assert.ok(hasSeenStory(state, 'earth_departure'));
    assert.ok(hasSeenStory(state, 'spheres_1'));
    assert.ok(hasSeenStory(state, 'spheres_5'));
    assert.ok(hasSeenStory(state, 'judges_phase_9'));
    assert.ok(hasSeenStory(state, 'blackhole_run_1'));
    assert.ok(hasSeenStory(state, 'blackhole_run_3'));
    assert.ok(hasSeenStory(state, 'blackhole_run_5'));
    assert.ok(hasSeenStory(state, 'revelation_phase_11'));
    assert.ok(hasSeenStory(state, 'pop_1e6'));
    assert.ok(hasSeenStory(state, 'pop_1e12'));
    assert.ok(hasSeenStory(state, 'pop_1e18'));
    assert.ok(hasSeenStory(state, 'touha_bottomless'));
    assert.ok(hasSeenStory(state, 'epithet_arc'));

    // Check recurring phrase
    const pop18 = getStoryEvents(state).find((e) => e.id === 'pop_1e18');
    assert.match(pop18.text, /A přece jich nebylo dosti/);

    // Idempotent: subsequent updateStory returns 0 new events
    const followUp = updateStory(state);
    assert.equal(followUp.length, 0);
  });

  it('is tolerant of absent or partial state structures', () => {
    assert.deepEqual(updateStory(null), []);
    assert.deepEqual(updateStory({}), []);
    assert.deepEqual(updateStory({ phase: 2 }), []);
  });
});
