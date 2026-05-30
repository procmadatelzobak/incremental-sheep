// ===========================================================================
//  Ukládání: JSON → base64, offline progres. Verze 3, bez migrace (čistý start).
// ===========================================================================
import { SAVE_KEY, VERSION, MAX_OFFLINE_SECONDS, TIME_SCALE, GENES } from '../config.js';
import { newGame, defaultPolicy } from './state.js';
import { step } from '../sim/simulation.js';
import { totalCount } from '../sim/cohort.js';
import { defaultSoil } from '../sim/soil.js';
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
  state.stats = Object.assign({}, defaults.stats, data.stats || {});
  state.achievements = data.achievements || {};
  state.behemot = Object.assign({}, defaults.behemot, data.behemot || {});   // doplň Behemota do starých savů
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
    g.policy = Object.assign(defaultPolicy(), g.policy || {});   // doplní nové spínače Jatek (#33) do starých savů
    if (!g.policy.cull) g.policy.cull = { enabled: false, gene: 'woolRate', cutFrac: 0.2 };
    g.soil = Object.assign(defaultSoil(), g.soil || {});        // bobky/hnojení (#63) do starých savů
    g.soil.q = clamp(typeof g.soil.q === 'number' ? g.soil.q : 0, 0, 1);
    g.soil.input = clamp(typeof g.soil.input === 'number' ? g.soil.input : 1, 0, 1);
  }
  state.rates = {};
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

// Dožene `seconds` herního času po malých krocích a vrátí souhrn přírůstků
// (kredity, suroviny, populace) pro návratovou obrazovku — nebo null, když je
// čas zanedbatelný (< 1 s). Strop a převod reálný→herní čas řeší volající.
export function simulateElapsed(state, seconds) {
  if (!(seconds >= 1)) return null;
  const popOf = () => state.groups.reduce((t, g) => t + totalCount(g), 0);
  const b = { cred: state.stats.credLifetime, wool: state.stats.woolLifetime, milk: state.stats.milkLifetime, meat: state.stats.meatLifetime, born: state.stats.born, pop: popOf() };
  const steps = Math.min(3000, Math.ceil(seconds));
  const chunk = seconds / steps;
  for (let i = 0; i < steps; i++) step(state, chunk);
  return {
    seconds,
    credits: state.stats.credLifetime - b.cred,
    wool: state.stats.woolLifetime - b.wool,
    milk: state.stats.milkLifetime - b.milk,
    meat: state.stats.meatLifetime - b.meat,
    born: state.stats.born - b.born,
    popDelta: popOf() - b.pop,
  };
}

// Offline progres: dožeň reálný čas od posledního uložení (strop MAX_OFFLINE_SECONDS),
// po krocích. Vrací souhrn pro návratovou obrazovku (nebo null, když je čas zanedbatelný).
export function applyOffline(state) {
  const elapsed = Math.min(MAX_OFFLINE_SECONDS, ((Date.now() - state.meta.lastSaved) / 1000) * TIME_SCALE);
  return simulateElapsed(state, elapsed);
}

// Probuzení uspaného/throttlovaného tabu (#46): dožeň uplynulý reálný interval
// stejně jako offline progres — stejný strop (MAX_OFFLINE_SECONDS) i převod
// reálný→herní čas. Volá se z herní smyčky, když jeden frame pokryl dlouhou pauzu.
export function resumeProgress(state, realSeconds) {
  const elapsed = Math.min(MAX_OFFLINE_SECONDS, realSeconds * TIME_SCALE);
  return simulateElapsed(state, elapsed);
}
