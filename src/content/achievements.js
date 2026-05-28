// ===========================================================================
//  Milníky / úspěchy (Kronika). Část dává malý TRVALÝ násobič produkce
//  (state.world.achievementMult), který přežije reset. Perzistentní rekordy
//  (maxSheep, maxCredits, nejlepší geny…) se drží ve state.world.
// ===========================================================================
import { totalCount } from '../sim/cohort.js';
import { worldsColonized } from './locations.js';

// Aktualizuj perzistentní rekordy (volá se každý tik). Levné.
export function updateRecords(state) {
  const w = state.world;
  let pop = 0, bWoolQ = w.bestWoolQ || 0, bIntel = w.bestIntel || 0;
  for (const g of state.groups) {
    pop += totalCount(g);
    if (g.genes.woolQuality && g.genes.woolQuality.mu > bWoolQ) bWoolQ = g.genes.woolQuality.mu;
    if (g.genes.intelligence && g.genes.intelligence.mu > bIntel) bIntel = g.genes.intelligence.mu;
  }
  w.maxSheep = Math.max(w.maxSheep || 0, pop);
  w.maxCredits = Math.max(w.maxCredits || 0, state.resources.credits || 0);
  w.bestWoolQ = bWoolQ;
  w.bestIntel = bIntel;
  w.maxSpheres = Math.max(w.maxSpheres || 0, state.projects.dyson.count);
  w.maxStations = Math.max(w.maxStations || 0, worldsColonized(state));
  if (!w.everPasture && state.land.worlds.earth.tier >= 1) w.everPasture = true;
}

// id, name, desc, test(state), bonus? (přičte se násobič 1+bonus), title?
export const ACHIEVEMENTS = [
  { id: 'sheep10',  name: 'Stádečko',          desc: '10 ovcí',                 test: s => s.world.maxSheep >= 10 },
  { id: 'sheep100', name: 'Stádo',             desc: '100 ovcí',                test: s => s.world.maxSheep >= 100, bonus: 0.02 },
  { id: 'sheep1k',  name: 'Houf',              desc: '1 000 ovcí',              test: s => s.world.maxSheep >= 1e3, bonus: 0.03 },
  { id: 'sheep1m',  name: 'Milion beků',       desc: '1 milion ovcí',           test: s => s.world.maxSheep >= 1e6, bonus: 0.05, title: 'Pastýř milionů' },
  { id: 'sheep1b',  name: 'Bekající miliarda', desc: '1 miliarda ovcí',         test: s => s.world.maxSheep >= 1e9, bonus: 0.08 },
  { id: 'sheep1t',  name: 'Bilion rouny',      desc: '1 bilion ovcí',           test: s => s.world.maxSheep >= 1e12, bonus: 0.10 },
  { id: 'cred1k',   name: 'První tisícovka',   desc: '1 000 kreditů',           test: s => s.world.maxCredits >= 1e3 },
  { id: 'cred1m',   name: 'Milionář',          desc: '1 milion kreditů',        test: s => s.world.maxCredits >= 1e6, bonus: 0.02 },
  { id: 'cred1b',   name: 'Vlnařský magnát',   desc: '1 miliarda kreditů',      test: s => s.world.maxCredits >= 1e9, bonus: 0.03, title: 'Vlnařský magnát' },
  { id: 'cred1t',   name: 'Bilionář',          desc: '1 bilion kreditů',        test: s => s.world.maxCredits >= 1e12, bonus: 0.05 },
  { id: 'wool',     name: 'Dokonalá vlna',     desc: 'Vyšlechti kvalitu vlny k vrcholu', test: s => s.world.bestWoolQ >= 3.5, bonus: 0.05 },
  { id: 'smart',    name: 'Myslící ovce',      desc: 'Inteligence ovce nad 5',  test: s => s.world.bestIntel >= 5, bonus: 0.05 },
  { id: 'pasture',  name: 'Soused prodal',     desc: 'Rozšiř pozemky za zahradu', test: s => !!s.world.everPasture },
  { id: 'station',  name: 'Vzhůru ke hvězdám', desc: 'Kolonizuj první planetu',  test: s => (s.world.maxStations || 0) >= 1, bonus: 0.05 },
  { id: 'sphere',   name: 'Obejmout slunce',   desc: 'Dokonči první Dysonovu sféru', test: s => (s.world.maxSpheres || 0) >= 1, bonus: 0.10, title: 'Pán Stád' },
  { id: 'immortal', name: 'Nesmrtelný',        desc: 'Vypij nápoj nesmrtelnosti', test: s => !!s.flags.immortal, title: 'Pastýř' },
  { id: 'blackhole',name: 'Návrat v čase',     desc: 'Zažehni první černou díru', test: s => s.prestige.runs >= 1, bonus: 0.10, title: 'Ten, Jenž Střihá' },
  { id: 'runs5',    name: 'Smyčka utažená',    desc: '5 černoděrových resetů',  test: s => s.prestige.runs >= 5, bonus: 0.15 },
  // fázové milníky
  { id: 'phase2',  name: 'Množení',         desc: 'Dosáhni fáze 2',  test: s => s.phase >= 2 },
  { id: 'phase3',  name: 'Královská',       desc: 'Dosáhni fáze 3',  test: s => s.phase >= 3 },
  { id: 'phase4',  name: 'Nesmrtelnosti',   desc: 'Dosáhni fáze 4',  test: s => s.phase >= 4 },
  { id: 'phase5',  name: 'Moudrých ovcí',   desc: 'Dosáhni fáze 5',  test: s => s.phase >= 5 },
  { id: 'phase6',  name: 'Exodu',           desc: 'Dosáhni fáze 6',  test: s => s.phase >= 6 },
  { id: 'phase7',  name: 'Sféry',           desc: 'Dosáhni fáze 7',  test: s => s.phase >= 7 },
  { id: 'phase9',  name: 'Soudců',          desc: 'Dosáhni fáze 9',  test: s => s.phase >= 9 },
  { id: 'phase10', name: 'Černé díry',      desc: 'Dosáhni fáze 10', test: s => s.phase >= 10 },
];

// Vrátí nově odemčené úspěchy a aplikuje jejich bonusy.
export function checkAchievements(state) {
  if (!state.achievements) state.achievements = {};
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id]) continue;
    if (a.test(state)) {
      state.achievements[a.id] = state.meta.totalGameTime;
      if (a.bonus) state.world.achievementMult = (state.world.achievementMult || 1) * (1 + a.bonus);
      out.push(a);
    }
  }
  return out;
}

export const unlockedTitles = (state) => ACHIEVEMENTS.filter(a => a.title && state.achievements[a.id]).map(a => a.title);
