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
  maturity:      { min: 0.5, max: 4,   base: 1,   sd: 0.12, mut: 0.06, dec: 2, label: 'Rychlost dospívání', extreme: true, phase: 1 },
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
  cloth:   { label: 'Sukno',    phase: 3, sell: true,  store: true,  value: 3 },
  cheese:  { label: 'Sýr',      phase: 3, sell: true,  store: true,  value: 5 },
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
  milkMach:  { label: 'Dojička',       phase: 2, base: 400,  growth: 1.75, per: 0.18, kind: 'milkMult',  desc: '+18 % mléko', lab: true },
  fatten:    { label: 'Výkrm',         phase: 2, base: 500,  growth: 1.8,  per: 0.15, kind: 'meatMult',  desc: '+15 % maso' },
  monopoly:  { label: 'Monopol',       phase: 3, base: 5e3,  growth: 2.1,  per: 0.25, kind: 'priceMult', desc: '+25 % ceny (šponování)' },
  looms:     { label: 'Tkalcovny',     phase: 3, base: 8e3,  growth: 1.9,  per: 0.2,  kind: 'procFrac',  desc: '+20 % vlny→sukno a mléka→sýr', lab: true },
  genetics:  { label: 'Genetika',      phase: 5, base: 5e4,  growth: 1.9,  per: 0.05, kind: 'ceilingMult', desc: '+5 % strop genů', lab: true },
  cloning:   { label: 'Klonování',     phase: 5, base: 8e4,  growth: 1.85, per: 0.2,  kind: 'birthMult', desc: '+20 % porodnost', lab: true },
  computeOpt:{ label: 'Optimalizace',  phase: 5, base: 1e5,  growth: 1.9,  per: 0.25, kind: 'computeMult',desc:'+25 % výpočet', lab: true },
};

// --- PERKY (trvalé, kupují se za Vědění; přežijí reset) — 5 větví -----------
export const PERK_BRANCHES = {
  shepherd: { label: 'Pastýřství', icon: '🐑', desc: 'rychlejší začátek, víc ovcí' },
  genetics: { label: 'Genetika',   icon: '🧬', desc: 'vyšší genové stropy, lepší start' },
  industry: { label: 'Průmysl',    icon: '🏭', desc: 'levnější vylepšení, víc produkce' },
  cosmos:   { label: 'Kosmos',     icon: '🚀', desc: 'rychlejší stanice a sféry' },
  prophecy: { label: 'Proroctví',  icon: '🔮', desc: 'automatizace a rychlost' },
};
export const PERKS = {
  headstart:   { branch: 'shepherd', label: 'Náskok',             base: 1,  growth: 1.6,  per: 0.5,  kind: 'startCredits', desc: '+50 % startovních kreditů / lvl' },
  flock:       { branch: 'shepherd', label: 'Velké stádo',        base: 3,  growth: 1.7,  per: 0.10, kind: 'capMult',      desc: '+10 % kapacity všech pozemků / lvl' },
  geneCeiling: { branch: 'genetics', label: 'Prolomené stropy',   base: 5,  growth: 1.9,  per: 0.05, kind: 'ceilingMult',  desc: '+5 % strop genů / lvl' },
  legacy:      { branch: 'genetics', label: 'Dědictví genů',      base: 4,  growth: 1.85, per: 0.10, kind: 'startGenes',   desc: 'lepší startovní geny' },
  vigor:       { branch: 'industry', label: 'Plodná krev',        base: 2,  growth: 1.7,  per: 0.15, kind: 'globalProd',   desc: '+15 % veškerá produkce / lvl' },
  foreknow:    { branch: 'industry', label: 'Předvídání',         base: 3,  growth: 1.8,  per: 0.20, kind: 'cheaper',      desc: '−20 % ceny vylepšení / lvl' },
  cosmos:      { branch: 'cosmos',   label: 'Hvězdné inženýrství',base: 6,  growth: 1.9,  per: 0.25, kind: 'spaceMult',    desc: '+25 % rychlost stavby sfér / lvl' },
  voyage:      { branch: 'cosmos',   label: 'Laserový dosah',     base: 6,  growth: 1.9,  per: 0.15, kind: 'cheaperSpace', desc: '−15 % cena stavitelů a stanic / lvl' },
  haste:       { branch: 'prophecy', label: 'Spěch',              base: 4,  growth: 1.8,  per: 0.12, kind: 'globalSpeed',  desc: '+12 % rychlost cyklu / lvl' },
  foresight:   { branch: 'prophecy', label: 'Prozřetelnost',      base: 10, growth: 2.2,  per: 1,    kind: 'autostart',    desc: 'každý běh začíná se zapnutými autobuyery' },
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
  // čas: před nápojem nesmrtelnosti běží sim normálně, po něm se násobně zrychlí
  immortalSpeed: 1.8,           // násobič rychlosti simulace po vypití elixíru
  immortalSpeedPerPhase: 0.15, // + za každou fázi nad 4 (eskalující "čas letí")
  sheepPerUnit: 4,            // kolik ovcí přidá jedna zakoupená "jednotka"
  // kohorty / genetika (výběr při narození #18: nejhorší jehňata se vyřadí hned)
  maxCutFrac: 0.85,         // max podíl vyřazených jehňat z vrhu
  sigmaFloorMut: 0.6,       // σ-floor = sigmaFloorMut * mut (drží šlechtění "živé")
  // kapacita: rozloha × hustota × modifikátory × baseCap
  baseCap: 12,              // kapacita na jednotku rozlohy
  birthCapDamp: 0.5,
  // ceny (base, growth)
  cost: {
    addSheep:  { base: 50,   growth: 1.5  },   // přidá malé stádo
    land:      { base: 60,   growth: 1.28 },   // koupě parcely aktuálního tieru (× costMult světa)
    density:   { base: 1e3,  growth: 5    },   // globální hustota pastvy (track)
    areaMod:   { base: 4e3,  growth: 7    },   // globální modifikátory rozlohy
    warehouse: { base: 1e5,  growth: 1.8  },   // +strop skladu (fáze 6)
    oxygen:    { base: 8e4,  growth: 1.7  },   // +kyslíková kapacita (fáze 6)
    builder:   { base: 1e7,  growth: 1.18 },   // stavitel sféry (fáze 7)
    laser:     { base: 5e6,  growth: 1.6  },   // laser (fáze 8)
  },
  landUnlockReq: 3,         // kolik parcel tieru pro odemčení dalšího
  tierUnlockMult: 12,       // odemčení dalšího tieru = cena parcely × tato hodnota
  warehouse: { capInc: 5000 },
  oxygenPerLevel: 5e8,      // kyslíková kapacita (v jednotkách rozlohy) za úroveň
  // zpracování (fáze 3+): poměr raw → processed
  processing: { wool: { to: 'cloth', ratio: 1 }, milk: { to: 'cheese', ratio: 1 } },
  // projekty
  dyson: { target: 2.6e6, builderRate: 0.8, energyPerSphere: 1e4 },
  laser: { rangePerLevel: 1 },
  // prestiž
  prestige: {
    blackHoleBase: 5e12,    // strop centrálního skladu pro 1. zažehnutí
    thresholdGrowth: 1.3,   // mírný růst stropu každý reset
    // odměna roste s počtem běhů (+ log z velikosti běhu) → ~8 smyček k singularitě
    award: (cw, base, runs) => Math.max(1, Math.floor(8 * (runs + 1) + 4 * Math.log10(Math.max(10, cw / (base / 100))))),
    singularityKnowledge: 1400, // kumulativní Vědění pro odemčení singularity
  },
  // ceny extrémních genů: strop genu × ceilingMult (fáze 5 + perky)
  ceiling: { phase5: 3, perPerk: 1 },
};

// --- SVĚTY (per-svět žebříček rozlohy; sdílí globální hustotu) --------------
// env = produkční modifikátory (vážený průměr dle podílu rozlohy). costMult škáluje
// cenu parcel. fromProject: sféra se "kupuje" jen dokončováním Dysonova projektu.
export const WORLDS = {
  earth: {
    label: 'Země', icon: '🌍', phase: 1, costMult: 1, env: {},
    tiers: [
      { label: 'Zahrada', area: 1 }, { label: 'Pastvina u domu', area: 4 }, { label: 'Sousední pastviny', area: 12 },
      { label: 'Okolí vesnice', area: 80 }, { label: 'Okolí města', area: 800 }, { label: 'Celý kraj', area: 1.2e4 },
      { label: 'Kontinent', area: 2e6 }, { label: 'Planeta Země', area: 1e9 },
    ],
  },
  moon: {
    label: 'Měsíc', icon: '🌕', phase: 6, costMult: 2e3, env: { oxygenRequired: true, woolMult: 1.1 },
    tiers: [{ label: 'Regolitové skleníky', area: 5e8 }, { label: 'Kráterové farmy', area: 4e9 }, { label: 'Lávové tunely', area: 3e10 }, { label: 'Kupolová města', area: 2e11 }],
  },
  mars: {
    label: 'Mars', icon: '🔴', phase: 6, costMult: 8e3, env: { woolMult: 0.8, milkMult: 0.9 },
    tiers: [{ label: 'Kopule', area: 8e8 }, { label: 'Terraformované údolí', area: 6e9 }, { label: 'Polární skleníky', area: 5e10 }, { label: 'Atmosférické pastviny', area: 4e11 }],
  },
  jupiter: {
    label: 'Jupiter', icon: '🪐', phase: 6, costMult: 3e4, env: { meatMult: 1.4, birthMult: 0.6 },
    tiers: [{ label: 'Orbitální stanice', area: 2e9 }, { label: 'Plovoucí farmy', area: 2e10 }, { label: 'Bouřkové pastviny', area: 2e11 }, { label: 'Měsíční prstenec', area: 2e12 }],
  },
  sphere: {
    label: 'Dysonova sféra', icon: '☀️', phase: 7, costMult: 0, fromProject: true, env: { woolMult: 1.5, milkMult: 1.5, meatMult: 1.5 },
    tiers: [{ label: 'Solární prstence', area: 1e12 }, { label: 'Vnitřní pastviny', area: 1e13 }, { label: 'Sférové vrstvy', area: 1e14 }, { label: 'Hvězdná vlna', area: 1e15 }],
  },
};
export const WORLD_ORDER = ['earth', 'moon', 'mars', 'jupiter', 'sphere'];

// --- GLOBÁLNÍ HUSTOTA PASTVY (násobič kapacity všech pozemků) ---------------
export const DENSITY_TIERS = [
  { label: 'Obyčejný trávník', mult: 1, icon: '🌱' }, { label: 'Slušný trávník', mult: 4, icon: '🌿' },
  { label: 'Nejlepší trávník', mult: 16, icon: '🍀' }, { label: 'Hydroponické nádrže', mult: 64, icon: '💧' },
  { label: 'Vícepatrové farmy', mult: 256, icon: '🏢' }, { label: 'Podzemní farmy', mult: 1024, icon: '⛏️' },
  { label: 'Oceánské farmy', mult: 4096, icon: '🌊' }, { label: 'Hlubinné farmy', mult: 16384, icon: '🌌' },
  { label: 'Orbitální farmy', mult: 65536, icon: '🛰️' },
];

// --- MODIFIKÁTORY ROZLOHY (globální % bonus k efektivní rozloze) ------------
export const AREA_MODS = [
  { key: 'rocks', label: 'Pěstování na skalách', bonus: 0.30, icon: '🪨', phase: 1 },
  { key: 'forest', label: 'Lesní pastva', bonus: 0.20, icon: '🌲', phase: 2 },
  { key: 'desert', label: 'Pouštní zavlažování', bonus: 0.40, icon: '🏜️', phase: 3 },
  { key: 'sea', label: 'Mořské plošiny', bonus: 0.80, icon: '🌊', phase: 5 },
  { key: 'underground', label: 'Podzemní haly', bonus: 1.5, icon: '⛏️', phase: 6 },
  { key: 'orbital', label: 'Orbitální prstence', bonus: 3.0, icon: '🛰️', phase: 7 },
];
