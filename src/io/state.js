// ===========================================================================
//  Tvar herního stavu + newGame(). Jediný zdroj pravdy o struktuře.
// ===========================================================================
import { VERSION, BALANCE, RESOURCES, GENES } from '../config.js';
import { seedGroupGenes } from '../sim/genetics.js';
import { emptyCounts } from '../sim/cohort.js';

export function defaultPolicy() {
  return {
    killOld: false,
    killMaleChildren: false,
    maxMales: 0,                 // 0 = bez limitu
    cull: { enabled: false, gene: 'woolRate', cutFrac: 0.2, stage: 'adult' },
    protect: { enabled: true, minF: 8, minM: 2 },   // chovné jádro (bezpečnostní brzda)
  };
}

function startCreditsFor(carry) {
  let c = BALANCE.startCredits;
  const lvl = carry?.perks?.headstart || 0;
  return c * (1 + 0.5 * lvl);
}

// carry = přenos po černoděrovém resetu (přežije reset).
export function newGame(carry = null) {
  const ceilingMult = 1 + (carry?.perks?.genetics ? 0 : 0); // ceiling se zvedá ve hře
  const startQuality = Math.min(0.8, 0.1 * (carry?.perks?.legacy || 0));
  const group = {
    id: 1, name: 'Stádo A', species: 'base', locationId: 1,
    genes: seedGroupGenes(startQuality, 1),
    counts: emptyCounts(),
    bredFracF: 0,
    policy: defaultPolicy(),
  };
  // malé startovní stádo, aby se hned množilo
  group.counts.M.adult = 2;
  group.counts.F.adult = 2;

  const state = {
    version: VERSION,
    meta: {
      epithet: 'Farmář',
      startedAt: Date.now(),
      lastSaved: Date.now(),
      gameTime: 0,
      totalGameTime: carry?.totalGameTime || 0,
    },
    phase: 1,
    flags: {},
    groups: [group],
    nextGroupId: 2,
    activeGroupId: 1,
    locations: [{ id: 1, kind: 'meadow', name: 'První louka', level: 0, density: 0 }],
    nextLocationId: 2,
    activeLocationId: 1,
    resources: { credits: startCreditsFor(carry) },
    rates: {},
    storage: { warehouseLevel: 0, autotrade: {}, stockpile: {} },
    upgrades: {},
    buys: { addSheep: 0, newPasture: 0, station: 0, warehouse: 0, oxygen: 0 },
    projects: {
      dyson: { progress: 0, count: 0, builders: 0 },
      laser: { level: 0 },
      timeMachine: { progress: 0 },
    },
    prestige: {
      knowledge: carry?.knowledge || 0,
      knowledgeLifetime: carry?.knowledgeLifetime || 0,
      runs: carry?.runs || 0,
      perks: carry?.perks || {},
      centralWarehouse: 0,
      armed: false,
      threshold: BALANCE.prestige.blackHoleBase * Math.pow(BALANCE.prestige.thresholdGrowth, carry?.runs || 0),
      singularity: carry?.singularity || false,
    },
    settings: {
      timeScale: 1,
      autobuy: carry?.perks?.foresight
        ? { sheep: true, land: true, upgrades: true, sphere: true }
        : (carry?.autobuy || { sheep: false, land: false, upgrades: false, sphere: false }),
    },
    stats: { born: 0, died: 0, culled: 0, woolLifetime: 0, milkLifetime: 0, meatLifetime: 0, credLifetime: 0, peakPop: 0 },
    achievements: carry?.achievements || {},
    world: {
      ceilingMult: 1,
      achievementMult: carry?.achievementMult || 1,
      maxSheep: carry?.maxSheep || 0,
      maxCredits: carry?.maxCredits || 0,
      bestWoolQ: carry?.bestWoolQ || 0,
      bestIntel: carry?.bestIntel || 0,
      maxSpheres: carry?.maxSpheres || 0,
      maxStations: carry?.maxStations || 0,
      everPasture: carry?.everPasture || false,
    },
    _cullAcc: 0,
  };
  // přenesené perky, které okamžitě platí
  return state;
}

// --- pomocné dotazy --------------------------------------------------------
export const unlocked = (state, resKey) => (RESOURCES[resKey]?.phase || 99) <= state.phase;
export const groupById = (state, id) => state.groups.find(g => g.id === id);
export const locationById = (state, id) => state.locations.find(l => l.id === id);
export const activeGroup = (state) => groupById(state, state.activeGroupId) || state.groups[0];
export const activeLocation = (state) => locationById(state, state.activeLocationId) || state.locations[0];

// carry objekt pro reset (co přežije černou díru)
export function prestigeCarry(state) {
  return {
    knowledge: state.prestige.knowledge,
    knowledgeLifetime: state.prestige.knowledgeLifetime,
    runs: state.prestige.runs,
    perks: state.prestige.perks,
    totalGameTime: state.meta.totalGameTime,
    singularity: state.prestige.singularity,
    autobuy: state.settings.autobuy,
    achievements: state.achievements,
    achievementMult: state.world.achievementMult,
    maxSheep: state.world.maxSheep,
    maxCredits: state.world.maxCredits,
    bestWoolQ: state.world.bestWoolQ,
    bestIntel: state.world.bestIntel,
    maxSpheres: state.world.maxSpheres,
    maxStations: state.world.maxStations,
    everPasture: state.world.everPasture,
  };
}
