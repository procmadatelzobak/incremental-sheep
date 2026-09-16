// Local life-support is deliberately separate from purchased pasture.  Land is
// room; habitats are the machinery which makes that room usable after Exodus.
import { GENES } from '../config.js';

export const HABITATS = {
  supportBase: { earth: 1e7, moon: 1e8, mars: 1e10, jupiter: 1e12, sphere: 1e16 },
  supportGrowth: 4,
  charterCost: { moon: 5e8, mars: 5e9, jupiter: 5e10 },
  maxGroups: 32,
};

export function habitatRecord(state, worldId) {
  const worlds = state.industry && state.industry.worlds;
  return (worlds && worlds[worldId]) || { level: 0, work: 0 };
}

// `legacySupport` gives migrated saves a safe way to preserve an already built
// colony while the normal source of truth remains its installed level.
export function installedSupport(state, worldId) {
  const record = habitatRecord(state, worldId);
  const base = HABITATS.supportBase[worldId] || 0;
  const level = Math.max(0, Number(record.level) || 0);
  return Math.max(Number(record.legacySupport) || 0, base * Math.pow(HABITATS.supportGrowth, level));
}

export function sizeDemandOf(group) {
  const size = group && group.genes && group.genes.size && group.genes.size.mu;
  return Math.pow(Math.max(0.5, (size || GENES.size.base) / GENES.size.base), 0.5);
}
