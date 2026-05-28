// ===========================================================================
//  Ukládání: JSON → base64, offline progres. Verze 3, bez migrace (čistý start).
// ===========================================================================
import { SAVE_KEY, VERSION, MAX_OFFLINE_SECONDS, TIME_SCALE } from '../config.js';
import { newGame } from './state.js';
import { step } from '../sim/simulation.js';

function replacer(key, value) {
  if (key.startsWith('_')) return undefined;   // _cullAcc apod.
  if (key === 'rates') return undefined;        // přepočítává se
  return value;
}

export function serialize(state) {
  state.meta.lastSaved = Date.now();
  const json = JSON.stringify(state, replacer);
  return btoa(unescape(encodeURIComponent(json)));
}

export function deserialize(str) {
  const json = decodeURIComponent(escape(atob(str.trim())));
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object' || data.version !== VERSION || !Array.isArray(data.groups)) {
    throw new Error('neplatný nebo zastaralý save');
  }
  return hydrate(data);
}

function hydrate(data) {
  const defaults = newGame();
  const state = Object.assign({}, defaults, data);
  // doplň vnořená nastavení (staré savy nemají nová pole jako autobuy → jinak pád UI)
  state.settings = Object.assign({}, defaults.settings, data.settings || {});
  state.settings.autobuy = Object.assign({}, defaults.settings.autobuy, (data.settings || {}).autobuy || {});
  state.rates = {};
  if (typeof state._cullAcc !== 'number') state._cullAcc = 0;
  return state;
}

export function saveLocal(state) {
  try { localStorage.setItem(SAVE_KEY, serialize(state)); } catch (e) { /* plné/zakázané úložiště */ }
}
export function loadLocal() {
  try {
    const str = localStorage.getItem(SAVE_KEY);
    if (!str) return null;
    return deserialize(str);
  } catch (e) { return null; }
}
export function clearLocal() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

// Offline progres: dožeň reálný čas od posledního uložení (strop 8 h), po krocích.
export function applyOffline(state) {
  const elapsed = Math.min(MAX_OFFLINE_SECONDS, ((Date.now() - state.meta.lastSaved) / 1000) * TIME_SCALE);
  if (elapsed < 1) return 0;
  const before = state.stats.credLifetime;
  const steps = Math.min(3000, Math.ceil(elapsed));
  const chunk = elapsed / steps;
  for (let i = 0; i < steps; i++) step(state, chunk);
  return state.stats.credLifetime - before;
}
