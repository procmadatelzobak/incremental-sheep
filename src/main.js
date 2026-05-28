import { TIME_SCALE, MAX_OFFLINE_SECONDS, AUTOSAVE_MS, ECON } from './config.js';
import { newGame } from './state.js';
import { randomSheep } from './sheep.js';
import { step, slaughter } from './simulation.js';
import {
  costRandomSheep, costPremiumSheep, costPenExpand, costUpgrade, penCapacity,
} from './economy.js';
import { CULL_COSTS } from './config.js';
import { aggCount } from './population.js';
import { render } from './render.js';
import { initUI, updateUI } from './ui.js';
import { serialize, deserialize, saveLocal, loadLocal, clearLocal, applyOffline } from './save.js';
import { stageOf } from './sheep.js';
import { fmt } from './format.js';

let state = loadLocal() || newGame();

if (!state.startedPair || (state.sheep.length === 0 && !state.aggregate)) {
  state.sheep = [];
  state.sheep.push(randomSheep(0, 'M', true));
  state.sheep.push(randomSheep(0, 'F', true));
  state.startedPair = true;
}

const canvas  = document.getElementById('pen');
const ctx     = canvas.getContext('2d');
const wrap    = document.getElementById('canvas-wrap');
const cullModeCheck = document.getElementById('cull-mode');
const welcome = document.getElementById('welcome');

function resize() {
  canvas.width  = Math.max(100, wrap.clientWidth  - 24);
  canvas.height = Math.max(100, wrap.clientHeight - 24);
}
window.addEventListener('resize', resize);
resize();

function herdCount() { return state.aggregate ? aggCount(state.aggregate) : state.sheep.length; }

// Mouse tracking for hover tooltip.
let mousePos = null;
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mousePos = {
    x: (e.clientX - rect.left) * (canvas.width  / rect.width),
    y: (e.clientY - rect.top)  * (canvas.height / rect.height),
  };
});
canvas.addEventListener('mouseleave', () => { mousePos = null; });

const actions = {
  buyRandom(sex = null) {
    if (state.aggregate) return;
    const mult = sex !== null ? ECON.sexSelectMult : 1;
    const cost = Math.ceil(costRandomSheep(state.purchaseCount.random) * mult);
    if (state.credits < cost || herdCount() >= penCapacity(state.penLevel)) return;
    state.credits -= cost;
    state.sheep.push(randomSheep(0, sex, true));
    state.purchaseCount.random++;
  },
  buyPremium(sex = null) {
    if (state.aggregate) return;
    const mult = sex !== null ? ECON.sexSelectMult : 1;
    const cost = Math.ceil(costPremiumSheep(state.purchaseCount.premium) * mult);
    if (state.credits < cost || herdCount() >= penCapacity(state.penLevel)) return;
    state.credits -= cost;
    state.sheep.push(randomSheep(0.6, sex, true));
    state.purchaseCount.premium++;
  },
  expandPen() {
    const cost = costPenExpand(state.penLevel);
    if (state.credits < cost) return;
    state.credits -= cost;
    state.penLevel++;
  },
  upgrade(key) {
    const cost = costUpgrade(key, state.upgrades[key]);
    if (state.credits < cost) return;
    state.credits -= cost;
    state.upgrades[key]++;
  },
  // Cull system
  setCull(key, value) {
    state.cull[key] = value;
  },
  unlockCull(feature) {
    const cost = CULL_COSTS[feature];
    if (!cost || state.credits < cost) return;
    const key = feature === 'whenFull' ? 'whenFullUnlocked' : 'geneFloorUnlocked';
    if (state.cull[key]) return;
    state.credits -= cost;
    state.cull[key] = true;
  },
  setStud(id) {
    state.cull.studId = id;
  },
  exportSave() { return serialize(state); },
  importSave(str) {
    try { state = deserialize(str); saveLocal(state); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  },
  reset() { state = newGame(); clearLocal(); },
};

initUI(state, actions);

// Canvas click: cull or pin stud depending on mode.
canvas.addEventListener('click', (e) => {
  if (state.aggregate) return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width  / rect.width);
  const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
  for (let i = state.sheep.length - 1; i >= 0; i--) {
    const s = state.sheep[i];
    if (s._sx == null) continue;
    const dx = mx - s._sx, dy = my - s._sy;
    if (dx * dx + dy * dy > (s._sr + 2) ** 2) continue;
    if (cullModeCheck.checked) {
      slaughter(state, s.id);
    } else if (s.sex === 'M' && stageOf(s) === 'adult') {
      // Pin as stud (only adult males)
      state.cull.studId = state.cull.studId === s.id ? null : s.id;
    }
    break;
  }
});

// Offline catch-up.
const offlineSecs = Math.min(MAX_OFFLINE_SECONDS, ((Date.now() - state.lastSaved) / 1000) * TIME_SCALE);
if (offlineSecs > 60) {
  const earned = applyOffline(state);
  if (earned > 0) {
    welcome.textContent = `Vítej zpět! Za ${fmt(offlineSecs)} s offline jsi vydělal ${fmt(earned)} kreditů.`;
    welcome.classList.remove('hidden');
    setTimeout(() => welcome.classList.add('hidden'), 8000);
  }
}

setInterval(() => saveLocal(state), AUTOSAVE_MS);
window.addEventListener('beforeunload', () => saveLocal(state));
document.addEventListener('visibilitychange', () => { if (document.hidden) saveLocal(state); });

const DRIFT_SPD    = 0.018;
const DRIFT_CHANGE = 0.025;

let simClock = Date.now();
let accCred = 0, accWool = 0, accMeat = 0, accWall = 0;
let prevNow = performance.now();

function frame(now) {
  const realDt = Math.min((now - prevNow) / 1000, 0.1);
  prevNow = now;

  let dt = ((Date.now() - simClock) / 1000) * TIME_SCALE;
  simClock = Date.now();
  if (dt > MAX_OFFLINE_SECONDS) dt = MAX_OFFLINE_SECONDS;

  if (dt > 0) {
    const steps = Math.min(5000, Math.max(1, Math.ceil(dt / 0.1)));
    const chunk = dt / steps;
    for (let i = 0; i < steps; i++) {
      const d = step(state, chunk);
      accCred += d.credits; accWool += d.wool; accMeat += d.meat;
    }
  }

  accWall += realDt;
  if (accWall >= 0.5) {
    state.income.credits = accCred / accWall;
    state.income.wool    = accWool / accWall;
    state.income.meat    = accMeat / accWall;
    accCred = accWool = accMeat = accWall = 0;
  }

  if (!state.aggregate) {
    for (const s of state.sheep) {
      if (s._vx == null) {
        const a = Math.random() * Math.PI * 2;
        s._vx = Math.cos(a) * DRIFT_SPD; s._vy = Math.sin(a) * DRIFT_SPD;
      }
      if (Math.random() < DRIFT_CHANGE * realDt) {
        const a = Math.random() * Math.PI * 2;
        s._vx = Math.cos(a) * DRIFT_SPD; s._vy = Math.sin(a) * DRIFT_SPD;
      }
      s.x += s._vx * realDt; s.y += s._vy * realDt;
      if (s.x < 0.01) { s.x = 0.01; s._vx =  Math.abs(s._vx); }
      if (s.x > 0.99) { s.x = 0.99; s._vx = -Math.abs(s._vx); }
      if (s.y < 0.01) { s.y = 0.01; s._vy =  Math.abs(s._vy); }
      if (s.y > 0.99) { s.y = 0.99; s._vy = -Math.abs(s._vy); }
    }
  }

  render(ctx, state, mousePos);
  updateUI(state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
