// ===========================================================================
//  Fáze 1–11: každá mění pravidla. Gate = podmínka postupu; onEnter = odemčení.
// ===========================================================================
import { BALANCE, EPITHETS } from '../config.js';
import { totalCount } from '../sim/cohort.js';
import { worldsColonized } from './locations.js';
import { phaseJob } from './industry.js';

export const totalSheep = (state) => state.groups.reduce((t, g) => t + totalCount(g), 0);

// gate(state) -> lze postoupit z této fáze do další?
export const PHASES = {
  1:  { name: 'Stvoření',        gate: s => s.stats.credLifetime >= 1500,  hint: 'Prodávej vlnu, dokupuj ovce. Vydělej 1 500 kreditů.' },
  2:  { name: 'Množení',         gate: s => !!s.industry.completed.breeding,   hint: 'Zadej chovatelský program. Šlechtění urychlí práci; mléko ji zásobí.' },
  3:  { name: 'Královská',       gate: s => !!s.industry.completed.commerce, hint: 'Zásobuj obchodní projekt suknem a sýrem. Rozvíjej zpracování a monopol.'  },
  4:  { name: 'Nesmrtelnosti',   gate: s => !!s.flags.immortal,            hint: 'Dokonči projekt elixíru, našetři na něj a vyrob ho (Stáda).' },
  5:  { name: 'Moudrých ovcí',   gate: s => !!s.industry.completed.research, hint: 'Přiděl výpočet chytrých ovcí výzkumu vesmírného programu.' },
  6:  { name: 'Exodu',           gate: s => ['moon', 'mars', 'jupiter'].every(w => s.industry.completed[w]),       hint: 'Založ a osaď tři kolonie. Dokonči jejich podpůrnou infrastrukturu.' },
  7:  { name: 'Sféry',           gate: s => s.projects.dyson.count >= 1,   hint: 'Postav první Dysonovu sféru z kostí, kůží a sukna. Geny a stavitelé urychlí práci.' },
  8:  { name: 'Rozmnožení sfér', gate: s => s.projects.dyson.count >= 5,   hint: 'Dokonči 5 sfér; posiluj laser.' },
  9:  { name: 'Soudců',          gate: s => !!s.industry.completed.judges,  hint: 'Koordinuj výpočetní, textilní a materiálová stáda na třech světech.' },
  10: { name: 'Černé díry',      gate: () => false,  hint: 'Nasaj produkci do centrálního skladu a zažehni černou díru (Prestiž).' },
  11: { name: 'Zjevení',         gate: () => false,  hint: 'Dosáhni singularity.' },
};

function onEnter(state, phase) {
  if (phase === 5) state.world.ceilingMult = Math.max(state.world.ceilingMult, BALANCE.ceiling.phase5);
  if (phase === 6) state.flags.storage = true;
  if (phase === 7) state.flags.dyson = true;
  if (phase === 9) state.flags.manager = true;
  if (phase === 10) {
    state.flags.blackHole = true;
    // The commissioned production queue includes transport, never ignition.
    if (state.industry.enabled) state.prestige.armed = true;
  }
  state.meta.epithet = epithetFor(phase);
}

export function epithetFor(phase) {
  let name = EPITHETS[0].name;
  for (const e of EPITHETS) if (phase >= e.from) name = e.name;
  return name;
}

// Postup fází (může přeskočit víc najednou, pokud jsou gaty splněné).
export function checkPhase(state) {
  let guard = 0;
  while (state.phase < 11 && PHASES[state.phase].gate(state) && guard++ < 12) {
    state.phase++;
    onEnter(state, state.phase);
  }
}

export const phaseName = (state) => PHASES[state.phase]?.name || '?';
export const phaseHint = (state) => PHASES[state.phase]?.hint || '';

// Postup k další fázi (#26): { cur, target, label }. Cíle musí sedět s gate výše.
export function phaseProgress(state) {
  const job = phaseJob(state);
  if (job) return { cur: job.progress, target: job.target, label: job.label };
  const cred = (target, label = 'Kredity celkem') => ({ cur: state.stats.credLifetime, target, label });
  switch (state.phase) {
    case 1: return cred(1500);
    case 2: return { cur: 1, target: 1, label: 'Chovatelský program' };
    case 3: return { cur: 1, target: 1, label: 'Obchodní projekt' };
    case 4: return { cur: state.flags.immortal ? 1 : 0, target: 1, label: 'Nápoj nesmrtelnosti' };
    case 5: return { cur: 1, target: 1, label: 'Vesmírný program' };
    case 6: return { cur: worldsColonized(state), target: 3, label: 'Kolonizované světy' };
    case 7: return { cur: state.projects.dyson.count, target: 1, label: 'Dysonovy sféry' };
    case 8: return { cur: state.projects.dyson.count, target: 5, label: 'Dysonovy sféry' };
    case 9: return { cur: 1, target: 1, label: 'Soudci' };
    case 10: return { cur: state.prestige.centralWarehouse, target: state.prestige.threshold, label: 'Centrální sklad' };
    default: return null;
  }
}

// Vstup do fáze jako událost: lore + co se nově odemklo.
export const PHASE_INFO = {
  2:  { unlocks: ['Mléko', 'Šlechtění (selekce)', 'Pastviny'], lore: '„I počal Farmář šlechtit, a stádo se mu množilo pod rukama."' },
  3:  { unlocks: ['Monopol', 'Zpracování (sukno, sýr)', 'Dražší vylepšení'], lore: '„Ovládl trh a počal šponovat ceny — neb kdo jiný by mu v tom zabránil."' },
  4:  { unlocks: ['Nápoj nesmrtelnosti', 'Pokročilá genetika'], lore: '„Vypil mléko věčnosti a přestal být pouhým ovčákem. Stal se Pastýřem."' },
  5:  { unlocks: ['Extrémní geny (vyšší stropy)', 'Inteligence → Výpočet', 'Kosti, kůže, mozek', 'Cesta do vesmíru'], lore: '„Vyšlechtil ovce moudré a z jejich mozků složil počítače."' },
  6:  { unlocks: ['Měsíc, Mars, Jupiter', 'Místní podpora', 'Dělení a přesuny stád'], lore: '„Vyšel ke hvězdám a zaséval stáda mezi planety."' },
  7:  { unlocks: ['Dysonova sféra', 'Stavitelé', 'Energie'], lore: '„Obestavěl Slunce, aby ani paprsek nezůstal nespasen."' },
  8:  { unlocks: ['Další sféry', 'Laser (zrychlení stavby)'], lore: '„Jedna sféra je jen první sféra."' },
  9:  { unlocks: ['Soudci', 'Koordinace tří specializovaných světů'], lore: '„Ustanovil Soudce, jenž spravuje stáda všech světů."' },
  10: { unlocks: ['Černá díra', 'Prestiž reset', 'Vědění a perky'], lore: '„Nahromadil tolik, až hmota povolila — a zrodila se díra."' },
};
