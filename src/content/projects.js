// ===========================================================================
//  Velké projekty: Dysonova sféra + stavitelé, energie, stroj času.
// ===========================================================================
import { BALANCE } from '../config.js';

// Cíl rostoucí s počtem sfér (každá další větší dílo). Laser zrychluje stavbu.
export const dysonTarget = (state) => BALANCE.dyson.target * (1 + 0.8 * state.projects.dyson.count);

export function stepProjects(state, dt, ctx) {
  const d = state.projects.dyson;
  const target = dysonTarget(state);
  if (state.phase >= 7 && d.progress < target) {
    const rate = (1 + d.builders * BALANCE.dyson.builderRate) * (1 + state.projects.laser.level * 0.5) * (ctx.globalProd || 1);
    d.progress = Math.min(target, d.progress + rate * dt);
  }
  if (d.count > 0) {
    state.resources.energy = (state.resources.energy || 0) + d.count * BALANCE.dyson.energyPerSphere * 0.01 * dt;
  }
  if (state.phase >= 7) state.projects.timeMachine.progress += dt;
}

export const sphereReady = (state) => state.projects.dyson.progress >= dysonTarget(state);

export function claimSphere(state) {
  if (!sphereReady(state)) return false;
  const d = state.projects.dyson;
  d.count++;
  d.progress = 0;
  state.locations.push({ id: state.nextLocationId++, kind: 'sphere', name: 'Sféra ' + d.count, level: 0, density: 0 });
  return true;
}
