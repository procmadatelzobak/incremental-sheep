// ===========================================================================
//  Fáze 1–11: každá mění pravidla. Gate = podmínka postupu; onEnter = odemčení.
// ===========================================================================
import { BALANCE, EPITHETS } from '../config.js';
import { totalCount } from '../sim/cohort.js';

export const totalSheep = (state) => state.groups.reduce((t, g) => t + totalCount(g), 0);

// gate(state) -> lze postoupit z této fáze do další?
export const PHASES = {
  1:  { name: 'Stvoření',        gate: s => s.stats.credLifetime >= 2e5,   hint: 'Prodávej vlnu a maso. Vydělej 200 tis. kreditů.' },
  2:  { name: 'Množení',         gate: s => s.stats.credLifetime >= 1e7,   hint: 'Šlechti stádo a prodávej mléko. Vydělej 10 mil. kreditů.' },
  3:  { name: 'Královská',       gate: s => s.stats.credLifetime >= 1e9,   hint: 'Ovládni trh (Monopol). Vydělej 1 mld. kreditů.' },
  4:  { name: 'Nesmrtelnosti',   gate: s => !!s.flags.immortal,            hint: 'Vyrob nápoj nesmrtelnosti (panel Stáda).' },
  5:  { name: 'Moudrých ovcí',   gate: s => s.stats.credLifetime >= 1e12,  hint: 'Šlechti chytré ovce. Vydělej bilion kreditů.' },
  6:  { name: 'Exodu',           gate: s => s.buys.station >= 3,           hint: 'Postav 3 vesmírné stanice (panel Stanice).' },
  7:  { name: 'Sféry',           gate: s => s.projects.dyson.count >= 1,   hint: 'Postav první Dysonovu sféru — kupuj stavitele.' },
  8:  { name: 'Rozmnožení sfér', gate: s => s.projects.dyson.count >= 5,   hint: 'Dokonči 5 sfér; posiluj laser.' },
  9:  { name: 'Soudců',          gate: s => s.stats.credLifetime >= 5e13,  hint: 'Spravuj víc stád. Vydělej 50 bilionů kreditů.' },
  10: { name: 'Černé díry',      gate: () => false,  hint: 'Nasaj produkci do centrálního skladu a zažehni černou díru (Prestiž).' },
  11: { name: 'Zjevení',         gate: () => false,  hint: 'Dosáhni singularity.' },
};

function onEnter(state, phase) {
  if (phase === 5) state.world.ceilingMult = Math.max(state.world.ceilingMult, BALANCE.ceiling.phase5);
  if (phase === 6) state.flags.storage = true;
  if (phase === 7) state.flags.dyson = true;
  if (phase === 9) state.flags.manager = true;
  if (phase === 10) state.flags.blackHole = true;
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
