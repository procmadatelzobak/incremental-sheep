// ===========================================================================
//  Ukládání: JSON → base64, offline progres. Verze 3, bez migrace (čistý start).
// ===========================================================================
import { SAVE_KEY, VERSION, MAX_OFFLINE_SECONDS, TIME_SCALE, GENES } from '../config.js';
import { newGame, defaultPolicy } from './state.js';
import { step } from '../sim/simulation.js';
import { totalCount } from '../sim/cohort.js';
import { clamp } from '../rng.js';

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
  // doplň vnořená pole (staré savy nemají novinky jako autobuy/achievements/world → jinak pád UI)
  state.settings = Object.assign({}, defaults.settings, data.settings || {});
  state.settings.autobuy = Object.assign({}, defaults.settings.autobuy, (data.settings || {}).autobuy || {});
  state.settings.buy = Object.assign({}, defaults.settings.buy, (data.settings || {}).buy || {});
  state.world = Object.assign({}, defaults.world, data.world || {});
  state.achievements = data.achievements || {};
  // pozemky: doplň nový model (staré savy měly locations → začnou s default rozlohou)
  const dl = (data.land && typeof data.land === 'object') ? data.land : {};
  state.land = {
    density: typeof dl.density === 'number' ? dl.density : 0,
    mods: dl.mods || {},
    worlds: Object.assign({}, JSON.parse(JSON.stringify(defaults.land.worlds)), dl.worlds || {}),
  };
  // geny skupin: srovnej na aktuální sadu GENES (doplň chybějící, zahoď osiřelé,
  // přejmenuj childhoodFrac → maturity, ať staré savy nepadnou na NaN).
  for (const g of state.groups) {
    const old = (g && typeof g.genes === 'object' && g.genes) || {};
    const fixed = {};
    for (const k in GENES) {
      const spec = GENES[k];
      fixed[k] = (old[k] && typeof old[k].mu === 'number')
        ? { mu: old[k].mu, sigma: typeof old[k].sigma === 'number' ? old[k].sigma : spec.sd }
        : { mu: spec.base, sigma: spec.sd };
    }
    // migrace: vyšší childhoodFrac = pomalejší dospívání → maturity ≈ 0.25/childFrac
    if (old.childhoodFrac && typeof old.childhoodFrac.mu === 'number' && !old.maturity) {
      fixed.maturity = { mu: clamp(0.25 / Math.max(0.05, old.childhoodFrac.mu), GENES.maturity.min, GENES.maturity.max), sigma: GENES.maturity.sd };
    }
    g.genes = fixed;
    if (typeof g.bredFracF !== 'number') g.bredFracF = 0;
    if (!g.policy) g.policy = defaultPolicy();
    if (!g.policy.protect) g.policy.protect = { enabled: true, minF: 8, minM: 2 };
  }
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
// Vrací souhrn pro návratovou obrazovku (nebo null, když je čas zanedbatelný).
export function applyOffline(state) {
  const elapsed = Math.min(MAX_OFFLINE_SECONDS, ((Date.now() - state.meta.lastSaved) / 1000) * TIME_SCALE);
  if (elapsed < 1) return null;
  const popOf = () => state.groups.reduce((t, g) => t + totalCount(g), 0);
  const b = { cred: state.stats.credLifetime, wool: state.stats.woolLifetime, milk: state.stats.milkLifetime, meat: state.stats.meatLifetime, born: state.stats.born, pop: popOf() };
  const steps = Math.min(3000, Math.ceil(elapsed));
  const chunk = elapsed / steps;
  for (let i = 0; i < steps; i++) step(state, chunk);
  return {
    seconds: elapsed,
    credits: state.stats.credLifetime - b.cred,
    wool: state.stats.woolLifetime - b.wool,
    milk: state.stats.milkLifetime - b.milk,
    meat: state.stats.meatLifetime - b.meat,
    popDelta: popOf() - b.pop,
  };
}
