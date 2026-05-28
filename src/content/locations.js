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
