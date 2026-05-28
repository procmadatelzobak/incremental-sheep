// Tunable game constants. Times are in game-seconds.

export const TICK_MS = 100;
export const TIME_SCALE = 1;
export const INDIVIDUAL_CAP = 800;
export const MAX_OFFLINE_SECONDS = 8 * 3600;
export const AUTOSAVE_MS = 5000;
export const SAVE_KEY = 'incremental-sheep-save';

export const STAGE = { CHILD: 'child', ADULT: 'adult', OLD: 'old' };

export const GENES = {
  fertility:     { min: 4,    max: 24,  base: 8,   sd: 1.5,  mut: 0.6,  label: 'Plodnost ♂',      dec: 1 },
  gestation:     { min: 8,    max: 60,  base: 25,  sd: 4,    mut: 1.5,  label: 'Březost [s]',      dec: 1, lowerBetter: true },
  woolRate:      { min: 0.3,  max: 6,   base: 1,   sd: 0.25, mut: 0.12, label: 'Růst vlny/s',      dec: 2 },
  woolQuality:   { min: 0.4,  max: 4,   base: 1,   sd: 0.2,  mut: 0.1,  label: 'Kvalita vlny',     dec: 2 },
  size:          { min: 0.4,  max: 5,   base: 1,   sd: 0.2,  mut: 0.1,  label: 'Velikost (maso)',  dec: 2 },
  lifespan:      { min: 60,   max: 600, base: 180, sd: 20,   mut: 8,    label: 'Délka života [s]', dec: 0 },
  childhoodFrac: { min: 0.10, max: 0.45,base: 0.25,sd: 0.03, mut: 0.02, label: 'Podíl dětství',   dec: 2 },
  adultFrac:     { min: 0.30, max: 0.60,base: 0.45,sd: 0.04, mut: 0.02, label: 'Podíl dospělosti', dec: 2 },
};

export const ECON = {
  woolPriceBase:  1.0,
  meatPriceBase:  6.0,
  oldWoolMult:    0.5,
  adultMeatMult:  1.0,
  oldMeatMult:    0.6,
  childMeatMult:  0.25,
  sexSelectMult:  1.15,  // +15 % cost for sex-specific purchase
};

export const PEN_BASE_CAPACITY = 12;

export const COSTS = {
  randomSheep:  { base: 50,  growth: 1.18 },
  premiumSheep: { base: 400, growth: 1.30 },
  penExpand:    { base: 100, growth: 1.55, increment: 10 },
};

export const UPGRADES = {
  woolRate:      { base: 80,  growth: 1.70, perLevel: 0.15, label: 'Nůžky — vlna +15 %' },
  breedingSpeed: { base: 120, growth: 1.80, perLevel: 0.10, label: 'Námluvy — březost −10 %' },
  salePrice:     { base: 150, growth: 1.75, perLevel: 0.12, label: 'Obchod — ceny +12 %' },
  fertility:     { base: 300, growth: 2.00, perLevel: 2,    label: 'Beran — plodnost +2' },
};

// Cull system: unlock costs for advanced features.
export const CULL_COSTS = {
  geneFloor:    3000,
  whenFull:     800,
};
