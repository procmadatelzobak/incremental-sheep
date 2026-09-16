// Dyson construction consumes staffed work and materials in industry.js.
import { INDUSTRY, projectMemory } from './industry-config.js';

export const dysonTarget = state => state.projects.dyson.count === 0
  ? INDUSTRY.jobs.sphere.firstTarget
  : INDUSTRY.jobs.sphere.subsequentBaseTarget * (1 + INDUSTRY.jobs.sphere.targetGrowth * state.projects.dyson.count);
export function stepProjects(state, dt) {
  if (state.projects.dyson.count > 0) state.resources.energy = (state.resources.energy || 0) + state.projects.dyson.count * INDUSTRY.jobs.sphere.energyPerSphere * projectMemory(state) * dt;
}
export const sphereReady = state => state.phase >= 7 && state.projects.dyson.progress >= dysonTarget(state);
export function claimSphere(state) {
  if (!sphereReady(state)) return false;
  state.projects.dyson.count++;
  state.projects.dyson.progress = 0;
  const world = state.land.worlds.sphere;
  world.counts[world.tier] = (world.counts[world.tier] || 0) + 1;
  return true;
}
