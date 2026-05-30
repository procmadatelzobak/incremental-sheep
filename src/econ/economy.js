// ===========================================================================
//  Ekonomika: cenové křivky a multiplikátory z vylepšení + perků.
// ===========================================================================
import { UPGRADES, PERKS } from '../config.js';
import { behemotMults } from '../content/behemot.js';

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
  const b = behemotMults(state);                       // aktivní bonusy z Behemotových předmětů (aditivní %)
  const globalProd = (1 + 0.15 * plvl('vigor')) * (state.world.achievementMult || 1) * (1 + (b.global || 0));
  const speed = 1 / (1 + 0.12 * plvl('haste'));
  return {
    priceMult: (1 + U.commerce.per * lvl('commerce')) * (1 + U.monopoly.per * lvl('monopoly')) * (1 + (b.price || 0)),
    woolMult: (1 + U.shears.per * lvl('shears')) * globalProd * (1 + (b.wool || 0)),
    milkMult: (1 + U.milkMach.per * lvl('milkMach')) * globalProd * (1 + (b.milk || 0)),
    meatMult: (1 + U.fatten.per * lvl('fatten')) * globalProd * (1 + (b.meat || 0)),
    computeMult: (1 + U.computeOpt.per * lvl('computeOpt')) * globalProd * (1 + (b.compute || 0)),
    breedMult: Math.max(0.15, 1 - U.courtship.per * lvl('courtship')) * speed,
    fertBonus: U.ram.per * lvl('ram'),
    birthMult: (1 + U.cloning.per * lvl('cloning')) * (1 + (b.birth || 0)),
    ceilingMult: state.world.ceilingMult * (1 + U.genetics.per * lvl('genetics')) * (1 + 0.05 * plvl('geneCeiling')) * (1 + (b.ceiling || 0)),
    spaceMult: 1 + 0.25 * plvl('cosmos'),
    globalProd,
  };
}
