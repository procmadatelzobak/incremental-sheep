import { SAVE_KEY, MAX_OFFLINE_SECONDS, TIME_SCALE } from './config.js';
import { newGame, cullDefaults } from './state.js';
import { seedIdCounter } from './genetics.js';
import { step } from './simulation.js';

function replacer(key, value) {
  if (key.startsWith('_')) return undefined;
  if (key === 'income') return undefined;
  return value;
}

export function serialize(state) {
  state.lastSaved = Date.now();
  const json = JSON.stringify(state, replacer);
  return btoa(unescape(encodeURIComponent(json)));
}

export function deserialize(str) {
  const json = decodeURIComponent(escape(atob(str.trim())));
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object' || !('credits' in data)) throw new Error('neplatný save');
  return hydrate(data);
}

function hydrate(data) {
  const fresh = newGame();
  const state = Object.assign(fresh, data);
  state.income = { credits: 0, wool: 0, meat: 0 };

  // Migrate v1 saves: autoSlaughter → cull
  if (!data.cull && data.autoSlaughter) {
    state.cull = Object.assign({}, fresh.cull);
    if (data.autoSlaughter.killOld)          state.cull.killOld = true;
    if (data.autoSlaughter.killMaleChildren) state.cull.killMaleChildren = true;
  }
  // Ensure all cull fields exist (fills missing keys in partial saves)
  state.cull = Object.assign({}, cullDefaults(), state.cull || {});

  let maxId = 0;
  for (const s of state.sheep || []) if (s.id > maxId) maxId = s.id;
  seedIdCounter(maxId);
  return state;
}

export function saveLocal(state) {
  try { localStorage.setItem(SAVE_KEY, serialize(state)); } catch (e) { /* storage full / disabled */ }
}

export function loadLocal() {
  const str = localStorage.getItem(SAVE_KEY);
  if (!str) return null;
  try { return deserialize(str); } catch (e) { return null; }
}

export function clearLocal() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

export function applyOffline(state) {
  const elapsed = Math.min(MAX_OFFLINE_SECONDS, ((Date.now() - state.lastSaved) / 1000) * TIME_SCALE);
  if (elapsed < 1) return 0;
  const before = state.stats.credLifetime;
  const steps = Math.min(3000, Math.ceil(elapsed));
  const chunk = elapsed / steps;
  for (let i = 0; i < steps; i++) step(state, chunk);
  return state.stats.credLifetime - before;
}
