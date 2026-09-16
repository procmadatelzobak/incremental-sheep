// ===========================================================================
//  Ukládání: JSON → base64, offline progres. Version 4, explicit migration from the shipped v3 schema.
// ===========================================================================
import { SAVE_KEY, VERSION, MAX_OFFLINE_SECONDS, TIME_SCALE, GENES, WORLD_ORDER, BALANCE } from '../config.js';
import { newGame, defaultPolicy } from './state.js';
import { advance, advanceAsync } from '../sim/advance.js';
import { migrateBehemot } from '../content/behemot.js';
import { defaultIndustry } from '../content/industry.js';
import { INDUSTRY } from '../content/industry-config.js';
import { rawWorldCapacity, worldArea, worldPopulation, worldSizeDemand } from '../content/locations.js';
import { emitStory } from '../content/story.js';
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
  if (!data || typeof data !== 'object' || ![3, VERSION].includes(data.version) || !Array.isArray(data.groups)) {
    throw new Error('neplatný nebo zastaralý save');
  }
  return hydrate(data);
}

function hydrate(data) {
  const defaults = newGame();
  const legacy = data.version === 3;
  const state = Object.assign({}, defaults, data);
  state.version = VERSION;
  // doplň vnořená pole (staré savy nemají novinky jako autobuy/achievements/world → jinak pád UI)
  state.settings = Object.assign({}, defaults.settings, data.settings || {});
  state.settings.autobuy = Object.assign({}, defaults.settings.autobuy, (data.settings || {}).autobuy || {});
  state.settings.buy = Object.assign({}, defaults.settings.buy, (data.settings || {}).buy || {});
  state.world = Object.assign({}, defaults.world, data.world || {});
  state.stats = Object.assign({}, defaults.stats, data.stats || {});
  state.achievements = data.achievements || {};
  const migratedBehemot = migrateBehemot(data.behemot);
  state.behemot = Object.assign({}, defaults.behemot, migratedBehemot.state);
  state.resources = Object.assign({}, defaults.resources, data.resources || {});
  state.resources.credits += migratedBehemot.refundCredits;
  state.prestige = Object.assign({}, defaults.prestige, data.prestige || {});
  if (state.prestige.knowledgeLifetime >= BALANCE.prestige.singularityKnowledge) state.prestige.singularity = true;
  state.storage = Object.assign({}, defaults.storage, data.storage || {});
  state.projects = Object.assign({}, defaults.projects, data.projects || {});
  delete state.projects.timeMachine;
  for (const key of Object.keys(defaults.projects)) state.projects[key] = Object.assign({}, defaults.projects[key], state.projects[key]);
  state.story = { seen: { ...(data.story?.seen || {}) }, events: [...(data.story?.events || [])].slice(-128) };
  state.industry = Object.assign(defaultIndustry(), data.industry || {});
  const di = defaultIndustry();
  state.industry.completed = { ...di.completed, ...state.industry.completed };
  state.industry.work = { ...di.work, ...state.industry.work };
  state.industry.worlds = Object.fromEntries(WORLD_ORDER.map(w => [w, { ...di.worlds[w], ...state.industry.worlds?.[w] }]));
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
    g.worldId = WORLD_ORDER.includes(g.worldId) ? g.worldId : 'earth';
    if (typeof g.bredFracF !== 'number') g.bredFracF = 0;
    g.policy = Object.assign(defaultPolicy(), g.policy || {});   // doplní nové spínače Jatek (#33) do starých savů
    if (!g.policy.cull) g.policy.cull = { enabled: false, gene: 'woolRate', cutFrac: 0.2 };
    g.soil = Object.assign(defaultSoil(), g.soil || {});        // bobky/hnojení (#63) do starých savů
    g.soil.q = clamp(typeof g.soil.q === 'number' ? g.soil.q : 0, 0, 1);
    g.soil.input = clamp(typeof g.soil.input === 'number' ? g.soil.input : 1, 0, 1);
  }
  if (legacy) {
    const stages = { breeding: 2, commerce: 3, elixir: 4, research: 5, moon: 6, mars: 6, jupiter: 6, judges: 9 };
    for (const [key, phase] of Object.entries(stages)) if (state.phase > phase) state.industry.completed[key] = true;
    // Redistribute real cohorts, never synthesize or discard sheep. Keep each
    // original genetic distribution for every part of its migrated population.
    let worlds = WORLD_ORDER.filter(w => worldArea(state, w) > 0);
    if (!worlds.length) { state.land.worlds.earth = structuredClone(defaults.land.worlds.earth); worlds = ['earth']; }
    const capacities = Object.fromEntries(worlds.map(w => [w, rawWorldCapacity(state, w)]));
    const total = Object.values(capacities).reduce((a, b) => a + b, 0);
    const oldGroups = state.groups;
    state.groups = [];
    state.nextGroupId = Math.max(state.nextGroupId || 1, ...oldGroups.map(g => g.id + 1));
    for (const original of oldGroups) {
      for (let i = 0; i < worlds.length; i++) {
        const worldId = worlds[i];
        const g = JSON.parse(JSON.stringify(original));
        g.id = i === 0 ? original.id : state.nextGroupId++;
        g.worldId = worldId;
        const share = total > 0 ? capacities[worldId] / total : 1 / worlds.length;
        for (const sex of ['M', 'F']) for (const stage of ['child', 'adult', 'old']) g.counts[sex][stage] *= share;
        state.groups.push(g);
      }
    }
    for (const w of worlds) state.industry.worlds[w].legacySupport = worldPopulation(state, w) * worldSizeDemand(state, w) * 1.01;
    const d = state.projects.dyson;
    const fraction = Math.min(1, d.progress / (2.6e6 * (1 + .5 * d.count)));
    d.progress = fraction * (d.count === 0 ? INDUSTRY.jobs.sphere.firstTarget : INDUSTRY.jobs.sphere.subsequentBaseTarget * (1 + INDUSTRY.jobs.sphere.targetGrowth * d.count));
    state.industry.enabled = state.phase >= 2;
    emitStory(state, 'migration-v4', 'Stáda dostala vlastní světy. Behemot uklidil garáž: staré nástroje vyměnil, nepoužité zásoby vyúčtoval. Ovce a Vědění zůstaly.');
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
function elapsedBaseline(state) {
  return { cred: state.stats.credLifetime, wool: state.stats.woolLifetime, milk: state.stats.milkLifetime,
    meat: state.stats.meatLifetime, born: state.stats.born,
    pop: state.groups.reduce((n, g) => n + totalCount(g), 0), events: state.story.events.length };
}
function elapsedSummary(state, seconds, before) {
  return { seconds, credits: state.stats.credLifetime - before.cred,
    wool: state.stats.woolLifetime - before.wool, milk: state.stats.milkLifetime - before.milk,
    meat: state.stats.meatLifetime - before.meat, born: state.stats.born - before.born,
    popDelta: state.groups.reduce((n, g) => n + totalCount(g), 0) - before.pop,
    events: state.story.events.slice(before.events) };
}
export function simulateElapsed(state, seconds) {
  if (!(seconds >= 1)) return null;
  const before = elapsedBaseline(state);
  advance(state, seconds);
  return elapsedSummary(state, seconds, before);
}
export async function simulateElapsedAsync(state, seconds, onProgress) {
  if (!(seconds >= 1)) return null;
  const before = elapsedBaseline(state);
  await advanceAsync(state, seconds, onProgress);
  return elapsedSummary(state, seconds, before);
}
export async function applyOfflineAsync(state, onProgress) {
  const seconds = Math.min(MAX_OFFLINE_SECONDS, ((Date.now() - state.meta.lastSaved) / 1000) * TIME_SCALE);
  return simulateElapsedAsync(state, seconds, onProgress);
}
export const resumeProgressAsync = (state, seconds, onProgress) => simulateElapsedAsync(state, Math.min(MAX_OFFLINE_SECONDS, seconds * TIME_SCALE), onProgress);

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
