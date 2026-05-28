// ===========================================================================
//  Incremental Sheep — konfigurace (laditelné konstanty)
//  Vše, co se ladí, žije zde. Jádro hry čte jen tato data.
// ===========================================================================

export const VERSION = 3;
export const SAVE_KEY = 'incremental-sheep-v3';
export const TIME_SCALE = 1;              // herních sekund na reálnou sekundu
export const MAX_OFFLINE_SECONDS = 8 * 3600;
export const AUTOSAVE_MS = 5000;

// --- GENY ------------------------------------------------------------------
// Každý gen je v populaci Gauss {mu, sigma}. spec: meze, základ, SD startu,
// mut (mutační SD = přidaný rozptyl při porodu), lowerBetter, extreme (smí mu
// stoupat nad max přes pohyblivý strop), phase (kdy se gen zobrazí).
export const GENES = {
  woolRate:      { min: 0.3, max: 6,   base: 1,   sd: 0.25, mut: 0.12, dec: 2, label: 'Vlna/s',        extreme: true,  phase: 1 },
  woolQuality:   { min: 0.4, max: 4,   base: 1,   sd: 0.2,  mut: 0.10, dec: 2, label: 'Kvalita vlny',  extreme: true,  phase: 1 },
  size:          { min: 0.4, max: 5,   base: 1,   sd: 0.2,  mut: 0.10, dec: 2, label: 'Velikost',      extreme: true,  phase: 1 },
  fertility:     { min: 4,   max: 24,  base: 8,   sd: 1.5,  mut: 0.6,  dec: 1, label: 'Plodnost',      extreme: true,  phase: 1 },
  gestation:     { min: 8,   max: 60,  base: 25,  sd: 4,    mut: 1.5,  dec: 1, label: 'Březost (s)',   lowerBetter: true, phase: 1 },
  lifespan:      { min: 60,  max: 600, base: 180, sd: 20,   mut: 8,    dec: 0, label: 'Délka života',  extreme: true,  phase: 1 },
  childhoodFrac: { min: 0.10,max: 0.45,base: 0.25,sd: 0.03, mut: 0.02, dec: 2, label: 'Podíl dětství', phase: 1 },
  adultFrac:     { min: 0.30,max: 0.60,base: 0.45,sd: 0.04, mut: 0.02, dec: 2, label: 'Podíl dospěl.', phase: 1 },
  milkRate:      { min: 0.2, max: 6,   base: 0.8, sd: 0.2,  mut: 0.10, dec: 2, label: 'Mléko/s',       extreme: true,  phase: 2 },
  intelligence:  { min: 0.1, max: 10,  base: 0.5, sd: 0.15, mut: 0.12, dec: 2, label: 'Inteligence',   extreme: true,  phase: 5 },
};

// --- ZDROJE ----------------------------------------------------------------
// sell: prodává se za kredity (value). store: smí se skladovat. phase: odemčení.
export const RESOURCES = {
  credits: { label: 'Kredity',  phase: 1, sell: false, store: false },
  wool:    { label: 'Vlna',     phase: 1, sell: true,  store: true,  value: 1.0 },
  meat:    { label: 'Maso',     phase: 1, sell: true,  store: true,  value: 6.0 },
  milk:    { label: 'Mléko',    phase: 2, sell: true,  store: true,  value: 2.0 },
  cloth:   { label: 'Sukno',    phase: 3, sell: true,  store: true,  value: 14 },
  cheese:  { label: 'Sýr',      phase: 3, sell: true,  store: true,  value: 12 },
  bones:   { label: 'Kosti',    phase: 5, sell: true,  store: true,  value: 4 },
  skin:    { label: 'Kůže',     phase: 5, sell: true,  store: true,  value: 5 },
  brain:   { label: 'Mozky',    phase: 5, sell: true,  store: true,  value: 22 },
  compute: { label: 'Výpočet',  phase: 5, sell: false, store: true },
  oxygen:  { label: 'Kyslík',   phase: 6, sell: false, store: true },
  energy:  { label: 'Energie',  phase: 7, sell: false, store: true },
  knowledge:{label: 'Vědění',   phase: 10,sell: false, store: false },
};

// --- VYLEPŠENÍ (úrovňová, kumulativní) -------------------------------------
// effect: jak se aplikuje (viz econ/economy.js getMults). cost = base*growth^lvl.
export const UPGRADES = {
  shears:    { label: 'Nůžky',         phase: 1, base: 60,   growth: 1.7,  per: 0.15, kind: 'woolMult',  desc: '+15 % vlna' },
  commerce:  { label: 'Obchod',        phase: 1, base: 120,  growth: 1.75, per: 0.12, kind: 'priceMult', desc: '+12 % ceny' },
  courtship: { label: 'Námluvy',       phase: 1, base: 100,  growth: 1.8,  per: 0.10, kind: 'breedMult', desc: '-10 % březost' },
  ram:       { label: 'Beran',         phase: 1, base: 300,  growth: 2.0,  per: 2,    kind: 'fertBonus', desc: '+2 plodnost samců' },
  milkMach:  { label: 'Dojička',       phase: 2, base: 400,  growth: 1.75, per: 0.18, kind: 'milkMult',  desc: '+18 % mléko' },
  fatten:    { label: 'Výkrm',         phase: 2, base: 500,  growth: 1.8,  per: 0.15, kind: 'meatMult',  desc: '+15 % maso' },
  monopoly:  { label: 'Monopol',       phase: 3, base: 5e3,  growth: 2.1,  per: 0.25, kind: 'priceMult', desc: '+25 % ceny (šponování)' },
  looms:     { label: 'Tkalcovny',     phase: 3, base: 8e3,  growth: 1.9,  per: 0.2,  kind: 'procMult',  desc: '+20 % zpracování' },
  genetics:  { label: 'Genetika',      phase: 5, base: 5e4,  growth: 1.9,  per: 0.05, kind: 'ceilingMult', desc: '+5 % strop genů' },
  cloning:   { label: 'Klonování',     phase: 5, base: 8e4,  growth: 1.85, per: 0.2,  kind: 'birthMult', desc: '+20 % porodnost' },
  computeOpt:{ label: 'Optimalizace',  phase: 5, base: 1e5,  growth: 1.9,  per: 0.25, kind: 'computeMult',desc:'+25 % výpočet' },
};

// --- PERKY (trvalé, kupují se za Vědění; přežijí reset) --------------------
export const PERKS = {
  headstart: { label: 'Náskok',        base: 1,  growth: 1.6, per: 0.5,  kind: 'startCredits', desc: '+50 % start. kreditů / lvl' },
  vigor:     { label: 'Plodná krev',   base: 2,  growth: 1.7, per: 0.15, kind: 'globalProd',   desc: '+15 % veškerá produkce' },
  haste:     { label: 'Spěch',         base: 3,  growth: 1.8, per: 0.12, kind: 'globalSpeed',  desc: '+12 % rychlost cyklu' },
  legacy:    { label: 'Dědictví genů', base: 5,  growth: 1.9, per: 0.08, kind: 'startGenes',   desc: 'lepší startovní geny' },
  foreknow:  { label: 'Předvídání',    base: 8,  growth: 2.0, per: 0.2,  kind: 'cheaper',      desc: '-20 % ceny vylepšení' },
};

// --- EPITETA HRDINY dle fáze -----------------------------------------------
export const EPITHETS = [
  { from: 1,  name: 'Farmář' },
  { from: 4,  name: 'Pastýř' },
  { from: 7,  name: 'Pán Stád' },
  { from: 10, name: 'Ten, Jenž Střihá' },
];

// --- LADĚNÍ ----------------------------------------------------------------
export const BALANCE = {
  startCredits: 25,
  // kohorty / genetika
  cullPeriod: 20,           // herních sekund mezi aplikacemi selekce
  maxCutFrac: 0.85,
  sigmaFloorMut: 0.6,       // σ-floor = sigmaFloorMut * mut (drží šlechtění "živé")
  // porody / kapacita
  baseCap: 12,
  capPerLevel: 10,
  birthCapDamp: 0.5,
  // ceny (base, growth)
  cost: {
    addSheep:   { base: 50,   growth: 1.5  },   // přidá malé stádo na aktivní lokaci
    expand:     { base: 200,  growth: 1.75 },   // +kapacita lokace
    density:    { base: 400,  growth: 1.9  },   // +hustota (víc ovcí na metr)
    newPasture: { base: 5e3,  growth: 2.0  },   // nová lokace (fáze 2+)
    warehouse:  { base: 1e5,  growth: 1.8  },   // +strop skladu (fáze 6)
    oxygen:     { base: 8e4,  growth: 1.8  },   // +kyslík (fáze 6)
    builder:    { base: 1e7,  growth: 1.18 },   // stavitel sféry (fáze 7)
    laser:      { base: 5e6,  growth: 1.6  },   // laser (fáze 8)
    station:    { base: 1e8,  growth: 2.4  },   // nová planetární stanice (fáze 6)
  },
  density: { per: 0.35, max: 25 },              // každá úroveň hustoty +35 % kapacity
  warehouse: { capInc: 5000 },                  // +strop za úroveň skladu
  oxygenPerLevel: 60,
  // zpracování (fáze 3+): poměr raw → processed
  processing: { wool: { to: 'cloth', ratio: 1 }, milk: { to: 'cheese', ratio: 1 } },
  // projekty
  dyson: { target: 1.6e6, builderRate: 0.8, energyPerSphere: 1e4 },
  laser: { rangePerLevel: 1 },
  // prestiž
  prestige: {
    blackHoleBase: 1e12,    // strop centrálního skladu pro 1. zažehnutí
    thresholdGrowth: 1.3,   // mírný růst stropu každý reset
    // odměna roste s počtem běhů (+ log z velikosti běhu) → ~8 smyček k singularitě
    award: (cw, base, runs) => Math.max(1, Math.floor(8 * (runs + 1) + 4 * Math.log10(Math.max(10, cw / (base / 100))))),
    singularityKnowledge: 200, // kumulativní Vědění pro odemčení singularity
  },
  // ceny extrémních genů: strop genu × ceilingMult (fáze 5 + perky)
  ceiling: { phase5: 3, perPerk: 1 },
};

// --- DEFINICE LOKACÍ (druhy) -----------------------------------------------
// env modifikátory; capMult = násobič kapacity; phase = kdy lze stavět.
export const LOCATION_KINDS = {
  meadow:   { label: 'Louka',    phase: 1, capMult: 1.0, env: {} },
  pasture:  { label: 'Pastvina', phase: 2, capMult: 1.6, env: {} },
  moon:     { label: 'Měsíc',    phase: 6, capMult: 2.2, env: { oxygenRequired: true, woolMult: 1.1 } },
  mars:     { label: 'Mars',     phase: 6, capMult: 2.6, env: { light: 0.6, woolMult: 0.8, milkMult: 0.9 } },
  jupiter:  { label: 'Jupiter',  phase: 6, capMult: 3.5, env: { gravity: 2.0, birthMult: 0.6, meatMult: 1.4 } },
  sphere:   { label: 'Dysonova sféra', phase: 7, capMult: 50, env: { woolMult: 1.5, milkMult: 1.5, meatMult: 1.5 } },
};

// pořadí planet pro fázi 6 (Exodus)
export const PLANET_ORDER = ['moon', 'mars', 'jupiter'];
