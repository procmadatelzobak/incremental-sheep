// ===========================================================================
//  Lokace: prostředí a kapacita.
// ===========================================================================
import { LOCATION_KINDS, BALANCE } from '../config.js';

export const locKind = (loc) => LOCATION_KINDS[loc.kind] || LOCATION_KINDS.meadow;
export const locEnv = (loc) => locKind(loc).env || {};

// Kapacita lokace = (základ + úrovně) × capMult druhu × (1 + hustota·per).
export function locationCap(loc) {
  const kind = locKind(loc);
  const base = (BALANCE.baseCap + loc.level * BALANCE.capPerLevel) * kind.capMult;
  const density = 1 + loc.density * BALANCE.density.per;
  return base * density;
}

export function totalCap(state) {
  return state.locations.reduce((t, l) => t + locationCap(l), 0);
}

// Sdílená kapacita stáda = součet všech pozemků. Lokace vyžadující kyslík
// (Měsíc) se započítají jen do výše dostupné kyslíkové kapacity.
export function herdCapacity(state) {
  const oxCap = (state.buys.oxygen || 0) * BALANCE.oxygenPerLevel;
  let normal = 0, oxReq = 0;
  for (const loc of state.locations) {
    const c = locationCap(loc);
    if (locEnv(loc).oxygenRequired) oxReq += c; else normal += c;
  }
  const flock = 1 + 0.10 * ((state.prestige && state.prestige.perks && state.prestige.perks.flock) || 0);
  return (normal + Math.min(oxReq, oxCap)) * flock;
}
