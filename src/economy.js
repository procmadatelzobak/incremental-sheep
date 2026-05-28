import { COSTS, UPGRADES, PEN_BASE_CAPACITY } from './config.js';

export const costRandomSheep  = (n)   => Math.floor(COSTS.randomSheep.base  * COSTS.randomSheep.growth  ** n);
export const costPremiumSheep = (n)   => Math.floor(COSTS.premiumSheep.base * COSTS.premiumSheep.growth ** n);
export const costPenExpand    = (lvl) => Math.floor(COSTS.penExpand.base    * COSTS.penExpand.growth    ** lvl);
export const penCapacity      = (lvl) => PEN_BASE_CAPACITY + lvl * COSTS.penExpand.increment;
export const costUpgrade      = (key, lvl) => Math.floor(UPGRADES[key].base * UPGRADES[key].growth ** lvl);

export const woolMult     = (s) => 1 + UPGRADES.woolRate.perLevel * s.upgrades.woolRate;
export const breedingMult = (s) => Math.max(0.15, 1 - UPGRADES.breedingSpeed.perLevel * s.upgrades.breedingSpeed); // multiplies gestation
export const priceMult    = (s) => 1 + UPGRADES.salePrice.perLevel * s.upgrades.salePrice;
export const fertilityBonus = (s) => UPGRADES.fertility.perLevel * s.upgrades.fertility;
