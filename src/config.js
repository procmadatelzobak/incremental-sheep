// ===========================================================================
//  Incremental Sheep — konfigurace (laditelné konstanty)
//  Vše, co se ladí, žije zde. Jádro hry čte jen tato data.
// ===========================================================================

export const VERSION = 3;
import { storageKey } from './io/storage-key.js';

export const SAVE_KEY_BASE = 'incremental-sheep-v3';
export const SAVE_KEY = storageKey(SAVE_KEY_BASE);
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
  gestation:     { min: 8,   max: 60,  base: 32,  sd: 4,    mut: 1.5,  dec: 1, label: 'Březost (s)',   lowerBetter: true, phase: 1 },
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
  milk:    { label: 'Mléko',    phase: 2, sell: true,  store: true,  value: 2.7 },
  bobky:   { label: 'Bobky',    phase: 2, sell: false, store: true },
  cloth:   { label: 'Sukno',    phase: 3, sell: true,  store: true,  value: 3 },
  cheese:  { label: 'Sýr',      phase: 3, sell: true,  store: true,  value: 5 },
  bones:   { label: 'Kosti',    phase: 5, sell: true,  store: true,  value: 4 },
  skin:    { label: 'Kůže',     phase: 5, sell: true,  store: true,  value: 5 },
  brain:   { label: 'Mozky',    phase: 5, sell: true,  store: true,  value: 22 },
  compute: { label: 'Výpočet',  phase: 5, sell: false, store: true },
  energy:  { label: 'Energie',  phase: 7, sell: false, store: true },
  knowledge:{label: 'Vědění',   phase: 10,sell: false, store: false },
};

// --- VYLEPŠENÍ (úrovňová, kumulativní) -------------------------------------
// effect: jak se aplikuje (viz econ/economy.js getMults). cost = base*growth^lvl.
// tiers = eskalace názvu (jen kosmetika!): s rostoucí úrovní se vylepšení honosněji
// jmenuje (viz upgradeName + UPGRADE_TIER_FROM). tiers[0] = úroveň 1 (== label),
// mechanika (base/growth/per/kind/desc) zůstává u všech úrovní stejná.
export const UPGRADES = {
  shears:    { label: 'Nůžky',         phase: 1, base: 60,   growth: 1.7,  per: 0.15, kind: 'woolMult',  desc: '+15 % vlna',
    tiers: ['Nůžky', 'Průmyslové nůžky', 'Automatická holírna', 'Mechanizovaná střižna', 'Parní stříhací stroj', 'Tovární stříhací linka', 'Elektrická střihačka', 'Hydraulická střihací soustava', 'Pneumatická střižna', 'Automatizovaný stroj na vlnu', 'Robotická střihačka', 'Kybernetická holírna', 'Laserová střižná hlava', 'Nanovláknová sklizeň', 'Orbitální sběrač vláken', 'Lunární česárna vlny', 'Marsovská manufaktura vlny', 'Asteroidní těžba rouna', 'Sluneční sběrná flotila', 'Sluneční žně rouna', 'Meziplanetární stříhárna', 'Stanice Dysonovy sféry', 'Mezigalaktická česárna', 'Kosmická textilka', 'Vesmírný průmysl na vlnu', 'Hvězdná sklizeň rouna', 'Nebulární zdroj rouna', 'Tachyonová stříhárna', 'Gravitační česárna', 'Prostoročasová tkalcovna', 'Singulární stříhárna', 'Stříhárna v černé díře', 'Věčná stříhárna', 'Pratkadlec rouna', 'Božské rouno', 'Rouno utkané z hvězd'] },
  commerce:  { label: 'Obchod',        phase: 1, base: 120,  growth: 1.75, per: 0.12, kind: 'priceMult', desc: '+12 % ceny',
    tiers: ['Obchod', 'Tržiště', 'Obchodní cech', 'Kramářská kolej', 'Kupecký dům', 'Tržní hala', 'Obchodní továrna', 'Průmyslová burza', 'Mechanizovaný trh', 'Parní obchodní síť', 'Elektrická tržnice', 'Automatizovaná tržnice', 'Telegrafní tržiště', 'Průmyslová výměna zboží', 'Síť digitálního obchodu', 'Počítačová tržnice', 'Robotické obchodní centrum', 'Kybernetická burza', 'Syntetická obchodní stanice', 'Síť automatizovaného prodeje', 'Globální elektronický trh', 'Satelitní obchodní systém', 'Orbitální burza', 'Lunární obchodní stanice', 'Planetární obchodní síť', 'Meziplanetární aukční dům', 'Hvězdné obchodní centrum', 'Kosmická burza', 'Galaktická tržnice', 'Vesmírný obchodní uzel', 'Intergalaktické tržiště', 'Burza osudu', 'Sjednocený vesmírný trh', 'Singulární výměna', 'Věčný trh', 'Trh řídící osud'] },
  courtship: { label: 'Námluvy',       phase: 1, base: 100,  growth: 1.8,  per: 0.10, kind: 'breedMult', desc: '-10 % březost',
    tiers: ['Námluvy', 'Dohazování', 'Říje na povel', 'Rodičovský dohled', 'Chov pod kontrolou', 'Selektivní páření', 'Šlechtitelský spolek', 'Plánovitý chov', 'Řízená reprodukce', 'Mechanizovaný chov', 'Průmyslový chov', 'Parní inkubátor', 'Elektrická stimulace', 'Automatizovaná porodnice', 'Radiační zrychlení', 'Digitální kontrola chovu', 'Počítačově řízený chov', 'Genetické inženýrství', 'Robotická asistence', 'Kybernetický rodič', 'Klonovací komora', 'Satelitní reprodukční stanice', 'Orbitální inkubační centrum', 'Lunární porodní hala', 'Planetární chrám zrodu', 'Meziplanetární rodičovská síť', 'Hvězdné ústředí zrodu', 'Kosmický zázrak života', 'Galaktická plodnost', 'Vesmírná matka', 'Zřídlo zrození', 'Pramen plodnosti', 'Dech života', 'Prvotní stvoření', 'Pramáti všehomíra', 'Stvoření na zavolání'] },
  ram:       { label: 'Beran',         phase: 2, base: 300,  growth: 2.0,  per: 2,    kind: 'fertBonus', desc: '+2 plodnost samců',
    tiers: ['Beran', 'Plemenný beran', 'Šampion stáda', 'Genetický mistr', 'Tvůrce potomstva', 'Vládce rozmnožování', 'Průmyslový plemenář', 'Mechanizovaný chovatel', 'Výrobna genetiky', 'Líhňová stanice', 'Laboratorní tvořitel', 'Klonovna beranů', 'Digitální reproduktor', 'Syntetický potomek', 'Počítačový genofond', 'Algoritmické potomstvo', 'Hvězdný genofond', 'Orbitální inkubátor', 'Lunární líheň', 'Marsovský plemenář', 'Planetární genofond', 'Mezigalaktické potomstvo', 'Kosmické plemeniště', 'Vesmírný zdroj života', 'Hvězdný tvůrce bytostí', 'Nekonečný plemeník', 'Singulární praotec', 'Kvintesenční praotec', 'Absolutní tvůrce genomu', 'Věčný otec jsoucna', 'Prvotní zárodek', 'Demiurgův beran', 'Posvátný zroditel', 'Všemocný plemeník', 'Otec všech stád', 'Nebeský Beránek'] },
  milkMach:  { label: 'Dojička',       phase: 2, base: 400,  growth: 1.75, per: 0.18, kind: 'milkMult',  desc: '+18 % mléko', lab: true,
    tiers: ['Dojička', 'Dojicí stroj', 'Automatická dojírna', 'Mlékárna s pumpami', 'Dojicí linka', 'Průmyslová dojírna', 'Mechanizovaná mlékárna', 'Hydraulický dojící systém', 'Automatizovaný dojicí závod', 'Manufaktura mléka', 'Tovární dojicí hala', 'Elektrifikovaná mlékárna', 'Robotická dojička', 'Počítačová dojírna', 'Digitální mlékárenský systém', 'Senzorová dojírna', 'Algoritmická mlékárna', 'Řízená mlékárna', 'Syntetická dojírna', 'Nanodojička', 'Holografická mlékárna', 'Kvantová mlékárna', 'Orbitální mlékárenský systém', 'Lunární dojička', 'Marsovská mlékárna', 'Planetární produkce mléka', 'Asteroidní dojírna', 'Kosmická mlékárenská síť', 'Hvězdná mlékárna', 'Nekonečný mléčný zdroj', 'Singulární mléko', 'Absolutní mléčný princip', 'Věčný proud mléka', 'Prapramen mléka', 'Nebeská mlékárna', 'Mléčná dráha'] },
  fatten:    { label: 'Výkrm',         phase: 2, base: 500,  growth: 1.8,  per: 0.15, kind: 'meatMult',  desc: '+15 % maso',
    tiers: ['Výkrm', 'Krmná směs', 'Výkrmna', 'Výkrmová farma', 'Pastvinářská farma', 'Krmná stanice', 'Průmyslová výkrmna', 'Mechanizovaný chlév', 'Automatické krmítko', 'Výkrmová manufaktura', 'Továrna na maso', 'Průmyslový velkochov', 'Kontinuální výkrm', 'Dávkovací krmná linka', 'Počítačem řízená výkrmna', 'Robotický velkochov', 'Digitální produkce masa', 'Algoritmická výkrmna', 'Syntetický výkrm', 'Nanomolekulární výživa', 'Holografická výkrmna', 'Kvantová masná produkce', 'Orbitální výkrmna', 'Lunární velkochov', 'Marsovský výkrmový závod', 'Planetární masný komplex', 'Asteroidní produkce', 'Kosmický masný průmysl', 'Hvězdný masný komplex', 'Nekonečný zdroj masa', 'Singulární maso', 'Absolutní masný princip', 'Věčná hojnost masa', 'Maso ze světla', 'Nebeská hojnost masa', 'Maso z čisté energie'] },
  monopoly:  { label: 'Monopol',       phase: 3, base: 5e3,  growth: 2.1,  per: 0.25, kind: 'priceMult', desc: '+25 % ceny (šponování)',
    tiers: ['Monopol', 'Kartel', 'Cenový diktát', 'Tržní nadvláda', 'Nadvláda nad cenou', 'Vůle trhu', 'Průmyslové spiknutí', 'Tovární spiknutí', 'Syndikát průmyslu', 'Železný trh', 'Cenová tyranie', 'Automatický kartel', 'Elektronické ovládání trhu', 'Digitální nadvláda', 'Počítačová hegemonie', 'Kybernetické impérium', 'Síťová nadvláda', 'Algoritmus moci', 'Diktát cen', 'Orbitální monopol', 'Planetární kartel', 'Hvězdná nadvláda', 'Kosmické spiknutí', 'Galaktický kartel', 'Meziplanetární vláda', 'Solární impérium', 'Dysonův trh', 'Vesmírný monopol', 'Hvězdné impérium', 'Kosmické panství', 'Univerzální cena', 'Věčné ovládání', 'Absolutní nadvláda', 'Božské právo cen', 'Božstvo všech cen', 'Pán všech cen'] },
  looms:     { label: 'Tkalcovny',     phase: 3, base: 8e3,  growth: 1.9,  per: 0.2,  kind: 'procFrac',  desc: '+20 % vlny→sukno a mléka→sýr', lab: true,
    tiers: ['Tkalcovny', 'Mechanické stavy', 'Automatizovaná přádelna', 'Tovární přádelna', 'Parní tkalcovna', 'Mechanizovaná textilka', 'Velkotkalcovna', 'Průmyslová přádelna', 'Průmyslové stavy', 'Tovární tkalcovské stavy', 'Průmyslové tkalcovny', 'Automatizovaná textilka', 'Elektromechanické stavy', 'Automatické tkalcovny', 'Počítačové tkaní', 'Robotické tkalcovny', 'Elektronické zpracování', 'Kybernetické zpracování', 'Digitální tkaní', 'Algoritmická přádelna', 'Orbitální přádelna', 'Orbitální tkalcovny', 'Lunární tkalcovna', 'Lunární manufaktura', 'Marsovské tkalcovny', 'Planetární zpracování', 'Meziplanetární přádelna', 'Hvězdná manufaktura', 'Hvězdné tkalcovny', 'Kosmická přádelna', 'Tkalcovna Dysonovy sféry', 'Galaktická přádelna', 'Kvantová tkalcovna', 'Tkadlec hvězd', 'Tkadlec věčnosti', 'Tkadlec osudu'] },
  genetics:  { label: 'Genetika',      phase: 5, base: 5e4,  growth: 1.9,  per: 0.05, kind: 'ceilingMult', desc: '+5 % strop genů', lab: true,
    tiers: ['Genetika', 'Selektivní šlechtění', 'Genová laboratoř', 'Mapování genomu', 'Sekvenování genomu', 'Mutační katalog', 'Řízení genové exprese', 'CRISPR technologie', 'Syntetická biologie', 'Genová terapie', 'Evoluční inženýrství', 'Superorganismus', 'Genetická asimilace', 'Dokonalý genotyp', 'Digitální genom', 'Kvantová genetika', 'Prediktivní genetika', 'Kosmické DNA', 'Nebulární chromozom', 'Hvězdná genealogie', 'Orbitální genofond', 'Planetární genom', 'Sluneční genetika', 'Metagalaktická evoluce', 'Vesmírný genom', 'Transcendentní šlechtění', 'Univerzální DNA', 'Singulární genofond', 'Božská genetika', 'Kosmický genom', 'Dokonalý genom', 'Věčná matrice genů', 'Prvotní genese', 'Strom života', 'Božský kód', 'Kniha života'] },
  cloning:   { label: 'Klonování',     phase: 5, base: 8e4,  growth: 1.85, per: 0.2,  kind: 'birthMult', desc: '+20 % porodnost', lab: true,
    tiers: ['Klonování', 'Klonovací nádrže', 'Líheň klonů', 'Reprodukční továrna', 'Masové klonování', 'Klonová dynastie', 'Umělá inkubace', 'Biokultivační linka', 'Proliferační centrum', 'Klonovací komplex', 'Syntetické rozmnožování', 'Replikační továrna', 'Vícenásobná gestace', 'Klonovací linka', 'Digitální líheň', 'Robotická líheň', 'Automatizované potomstvo', 'Kybernetické rozmnožování', 'Armáda klonů', 'Orbitální líheň', 'Kosmická líheň', 'Lunární inkubátor', 'Marsovská líheň', 'Orbitální inkubátor', 'Vesmírná gestace', 'Nebeská líheň', 'Metagalaktická líheň', 'Transcendentní zrod', 'Sféra věčného zrodu', 'Černá díra plodnosti', 'Singulární zrod', 'Věčný koloběh zrodu', 'Absolutní potomstvo', 'Kosmický zrod', 'Všeplození', 'Nekonečné rozmnožení'] },
  computeOpt:{ label: 'Optimalizace',  phase: 5, base: 1e5,  growth: 1.9,  per: 0.25, kind: 'computeMult',desc:'+25 % výpočet', lab: true,
    tiers: ['Optimalizace', 'Přetaktování', 'Paralelní výpočet', 'Procesní zrychlení', 'Snížení latence', 'Optimalizace paměti', 'Distribuované výpočty', 'Vícejádrové zpracování', 'Umělá inteligence', 'Neuronová síť', 'Hluboké učení', 'Kvantový procesor', 'Biokomputace', 'Optický superpočítač', 'Molekulární výpočty', 'Nanopočítač', 'Automatizované řešení', 'Robotický intelekt', 'Síť umělých mozků', 'Orbitální procesor', 'Lunární datacentrum', 'Planetární mozek', 'Sluneční výpočetní síť', 'Solární procesor', 'Hvězdný počítač', 'Galaktický algoritmus', 'Hyperprostorový procesor', 'Kosmický výpočet', 'Prediktivní mysl', 'Multivesmírná síť', 'Probuzené vědomí', 'Mysl bohů', 'Absolutní intelekt', 'Transcendentní výpočet', 'Kosmická mysl', 'Vševědoucí mysl'] },
};

// Prahy úrovní pro názvy vylepšení (jako EPITHETS): index do `tiers` = poslední práh
// ≤ úroveň. Úrovně 1–30 mají každá vlastní název, pak se ocas rozprostře k vysokým
// úrovním (33,37,42,50,62,80) honosným finále. Délka odpovídá počtu názvů v `tiers`.
export const UPGRADE_TIER_FROM = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 33, 37, 42, 50, 62, 80];

// Název vylepšení pro danou úroveň (kosmetické; mechanika beze změny). Úroveň 0
// (nezakoupeno) i 1 ukazují tiers[0]; výš se posouvá dle UPGRADE_TIER_FROM a na
// posledním názvu se ustálí (vyšší úrovně už jen přidávají „Lv X").
export function upgradeName(u, level) {
  const names = u.tiers;
  if (!names || !names.length) return u.label;
  const L = Math.max(1, level | 0);
  let idx = 0;
  for (let i = 0; i < names.length && i < UPGRADE_TIER_FROM.length; i++) {
    if (L >= UPGRADE_TIER_FROM[i]) idx = i;
  }
  return names[idx];
}

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
  immortalityCost: 5e11,        // cena nápoje nesmrtelnosti (fáze 4 = skutečný save-up milník)
  // čas: před nápojem nesmrtelnosti běží sim normálně, po něm se násobně zrychlí
  immortalSpeed: 1.8,           // násobič rychlosti simulace po vypití elixíru
  immortalSpeedPerPhase: 0.15, // + za každou fázi nad 4 (eskalující "čas letí")
  sheepPerUnit: 4,            // kolik ovcí přidá jedna zakoupená "jednotka"
  // kohorty / genetika (výběr při narození #18: nejhorší jehňata se vyřadí hned)
  maxCutFrac: 0.99,         // max podíl vyřazených jehňat z vrhu (god mode od fáze 9)
  sigmaFloorMut: 0.6,       // σ-floor = sigmaFloorMut * mut (drží šlechtění "živé")
  // kapacita: rozloha × hustota × modifikátory × baseCap
  baseCap: 12,              // kapacita na jednotku rozlohy
  // ceny (base, growth)
  // KAPACITNÍ SINKY (rozloha, hustota, modifikátory) se cení ZA JEDNOTKU PŘIDANÉ
  // KAPACITY (perCap = kredity/kapacita). Žádný násobič tak nejde „obejít": kapacita
  // roste jen úměrně útratě → řízená exponenciála místo super-exponenciálního výbuchu.
  // (Dřív: rozloha ∝ area^0.55 ale kapacita ∝ area → vyšší tier = skoro zadarmo;
  //  hustota měla pevný strop ~5e8 za 65536× — obojí dělalo z pozemků formalitu.)
  cost: {
    addSheep:  { base: 50,   growth: 1.4  },          // přidá malé stádo; cena roste (trh dojde), ale mírněji – ať nákup přemostí pomalé rané množení
    land:      { perCap: 5,   growth: 1.30, base: 50 }, // rozloha = hlavní (nejlevnější) sink; růst per parcela v tieru tlačí k odemykání vyšších tierů
    density:   { perCap: 22,  base: 2e3 },             // hustota = prémiový globální násobič kapacity
    areaMod:   { perCap: 12,  base: 2e3 },             // modifikátory rozlohy = prémiový globální bonus kapacity
    warehouse: { base: 1e5,  growth: 1.8  },           // +strop skladu na surovinu (fáze 6)
    builder:   { base: 1e7,  growth: 1.18 },           // stavitel sféry (fáze 7)
    laser:     { base: 5e6,  growth: 1.6  },           // laser (fáze 8)
  },
  landUnlockReq: 3,         // kolik parcel tieru pro odemčení dalšího
  tierUnlockMult: 12,       // odemčení dalšího tieru = cena parcely × tato hodnota
  warehouse: { capInc: 5000 },   // přírůstek stropu skladu PRO KAŽDOU SUROVINU ZVLÁŠŤ (#38)
  // zpracování (fáze 3+): poměr raw → processed
  processing: { wool: { to: 'cloth', ratio: 1 }, milk: { to: 'cheese', ratio: 1 } },
  // projekty
  dyson: { target: 2.6e6, targetGrowth: 0.5, builderRate: 0.8, energyPerSphere: 1e4 },  // targetGrowth = o kolik roste cíl s každou další sférou (nižší = svižnější stavba sfér 2–5)
  laser: { rangePerLevel: 1 },
  // prestiž
  prestige: {
    blackHoleBase: 5e12,    // strop centrálního skladu pro 1. zažehnutí
    thresholdGrowth: 1.3,   // mírný růst stropu každý reset
    // odměna roste s počtem běhů (+ log z velikosti běhu) → ~3–6 smyček k singularitě
    award: (cw, base, runs) => Math.max(1, Math.floor(8 * (runs + 1) + 4 * Math.log10(Math.max(10, cw / (base / 100))))),
    singularityKnowledge: 380, // kumulativní Vědění pro odemčení singularity (spec: 3–6 resetů)
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
    label: 'Měsíc', icon: '🌕', phase: 6, costMult: 1.5, env: { woolMult: 1.1 },
    tiers: [{ label: 'Regolitové skleníky', area: 5e8 }, { label: 'Kráterové farmy', area: 4e9 }, { label: 'Lávové tunely', area: 3e10 }, { label: 'Kupolová města', area: 2e11 }],
  },
  mars: {
    label: 'Mars', icon: '🔴', phase: 6, costMult: 2, env: { woolMult: 0.8, milkMult: 0.9 },
    tiers: [{ label: 'Kopule', area: 8e8 }, { label: 'Terraformované údolí', area: 6e9 }, { label: 'Polární skleníky', area: 5e10 }, { label: 'Atmosférické pastviny', area: 4e11 }],
  },
  jupiter: {
    label: 'Jupiter', icon: '🪐', phase: 6, costMult: 3, env: { meatMult: 1.4, birthMult: 0.6 },
    tiers: [{ label: 'Orbitální stanice', area: 2e9 }, { label: 'Plovoucí farmy', area: 2e10 }, { label: 'Bouřkové pastviny', area: 2e11 }, { label: 'Měsíční prstenec', area: 2e12 }],
  },
  sphere: {
    label: 'Dysonova sféra', icon: '☀️', phase: 7, costMult: 0, fromProject: true, env: { woolMult: 1.5, milkMult: 1.5, meatMult: 1.5 },
    tiers: [{ label: 'Solární prstence', area: 1e12 }, { label: 'Vnitřní pastviny', area: 1e13 }, { label: 'Sférové vrstvy', area: 1e14 }, { label: 'Hvězdná vlna', area: 1e15 }],
  },
};
export const WORLD_ORDER = ['earth', 'moon', 'mars', 'jupiter', 'sphere'];

// --- GLOBÁLNÍ HUSTOTA PASTVY (násobič kapacity všech pozemků) ---------------
// phase = od které fáze lze stupeň koupit. Hustota tak šplhá SPOLU s postupem
// (nelze maxnout 65536× už ve fázi 2) — to drží kapacitní křivku plynulou.
export const DENSITY_TIERS = [
  { label: 'Obyčejný trávník', mult: 1, icon: '🌱', phase: 1 }, { label: 'Slušný trávník', mult: 4, icon: '🌿', phase: 1 },
  { label: 'Nejlepší trávník', mult: 16, icon: '🍀', phase: 2 }, { label: 'Hydroponické nádrže', mult: 64, icon: '💧', phase: 3 },
  { label: 'Vícepatrové farmy', mult: 256, icon: '🏢', phase: 4 }, { label: 'Podzemní farmy', mult: 1024, icon: '⛏️', phase: 5 },
  { label: 'Oceánské farmy', mult: 4096, icon: '🌊', phase: 6 }, { label: 'Hlubinné farmy', mult: 16384, icon: '🌌', phase: 7 },
  { label: 'Orbitální farmy', mult: 65536, icon: '🛰️', phase: 8 },
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

// --- BOBKY A HNOJENÍ (#63) — kvalita půdy zvedá kapacitu pastvin ------------
// Saturace q ∈ [0,1] = supply/(supply+demand) (Hill, saturující). Nabídka bobků
// roste s počtem ovcí (manurePerSheep × vážený počet), poptávka s rozlohou půdy
// (demandPerArea × metry). Proto se 100 % blíží až s pokročilou hustotou
// (vícepatrové farmy a výš). Kapacita = … × (1 + maxBonus × q). tau = setrvačnost
// (sekundy) náběhu i poklesu kvality. Umělé hnojivo: bobky/s = fert.k × (kr/s)^exp
// (exp<1 → čím víc utratíš, tím menší přírůstek; útrata může jít do nekonečna).
export const SOIL = {
  unlockPhase: 2,                                   // bobky a Pastviny od fáze 2
  manurePerSheep: 1,                                // bobky/s na 1 (vážený) kus
  stageManure: { child: 0.5, adult: 1, old: 1 },    // dítě poloviční, dospělá/stará plné
  demandPerArea: 30,                                // referenční tok bobků/s na jednotku rozlohy
  maxBonus: 0.6,                                    // +60 % kapacity při plné saturaci (q=1)
  tau: 60,                                          // setrvačnost kvality (s)
  fert: { k: 2, exp: 0.5 },                         // umělé hnojivo: bobky/s = k × (kr/s)^exp
  defaultInput: 1,                                  // výchozí podíl výnosu bobků do půdy (100 %)
};
