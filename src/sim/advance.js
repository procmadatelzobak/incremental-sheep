// One deterministic scheduler for frames, offline catch-up and headless players.
import { step } from './simulation.js';
import { runAutobuy } from '../econ/actions.js';

export const SIM_STEP = 0.1;
export const AUTO_INTERVAL = 5;

export function advance(state, seconds, maxStep = SIM_STEP) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  let remaining = seconds + (state.settings.simRemainder || 0);
  const size = Math.max(SIM_STEP, maxStep);
  while (remaining + 1e-9 >= size) {
    const dt = Math.min(size, AUTO_INTERVAL - (state.settings.autoClock || 0));
    step(state, dt);
    remaining -= dt;
    state.settings.autoClock = (state.settings.autoClock || 0) + dt;
    if (state.settings.autoClock >= AUTO_INTERVAL - 1e-9) {
      state.settings.autoClock = 0;
      runAutobuy(state);
    }
  }
  state.settings.simRemainder = Math.max(0, remaining);
}

// Yield between batches: large offline imports must not freeze the browser.
export async function advanceAsync(state, seconds, onProgress = () => {}) {
  let remaining = seconds;
  while (remaining > 0) {
    const batch = Math.min(30, remaining);
    advance(state, batch);
    remaining -= batch;
    onProgress(1 - remaining / seconds);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
}
