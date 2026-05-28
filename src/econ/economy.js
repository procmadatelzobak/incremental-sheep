// ===========================================================================
//  Ekonomika: cenové křivky a multiplikátory z vylepšení + perků.
// ===========================================================================
import { UPGRADES, PERKS } from '../config.js';

export function costOf(spec, level) {
  return Math.floor(spec.base * Math.pow(spec.growth, level));
}

// foreknow perk zlevňuje vylepšení
export function costMult(state) {
  return Math.max(0.2, 1 - 0.2 * (state.prestige.perks.foreknow || 0));
}

export function upgradeCost(state, key) {
  return Math.floor(costOf(UPGRADES[key], state.upgrades[key] || 0) * costMult(state));
}

export function perkCost(state, key) {
  return costOf(PERKS[key], state.prestige.perks[key] || 0);
}

// Všechny multiplikátory odvozené ze stavu (čteno každý tick i v UI).
export function getMults(state) {
  const u = state.upgrades, p = state.prestige.perks, U = UPGRADES;
  const lvl = k => u[k] || 0;
  const plvl = k => p[k] || 0;
  const globalProd = (1 + 0.15 * plvl('vigor')) * (state.world.achievementMult || 1);
  const speed = 1 / (1 + 0.12 * plvl('haste'));
  return {
    priceMult: (1 + U.commerce.per * lvl('commerce')) * (1 + U.monopoly.per * lvl('monopoly')),
    woolMult: (1 + U.shears.per * lvl('shears')) * globalProd,
    milkMult: (1 + U.milkMach.per * lvl('milkMach')) * globalProd,
    meatMult: (1 + U.fatten.per * lvl('fatten')) * globalProd,
    computeMult: (1 + U.computeOpt.per * lvl('computeOpt')) * globalProd,
    procMult: 1 + U.looms.per * lvl('looms'),
    breedMult: Math.max(0.15, 1 - U.courtship.per * lvl('courtship')) * speed,
    fertBonus: U.ram.per * lvl('ram'),
    birthMult: 1 + U.cloning.per * lvl('cloning'),
    ceilingMult: state.world.ceilingMult * (1 + U.genetics.per * lvl('genetics')) * (1 + 0.05 * plvl('geneCeiling')),
    spaceMult: 1 + 0.25 * plvl('cosmos'),
    globalProd,
  };
}
