import { TIME_SCALE, MAX_OFFLINE_SECONDS, AUTOSAVE_MS, AUTO_SLAUGHTER } from './config.js';
import { newGame } from './state.js';
import { randomSheep } from './sheep.js';
import { step, slaughter } from './simulation.js';
import {
  costRandomSheep, costPremiumSheep, costPenExpand, costUpgrade, penCapacity,
} from './economy.js';
import { aggCount } from './population.js';
import { render } from './render.js';
import { initUI, updateUI } from './ui.js';
import { serialize, deserialize, saveLocal, loadLocal, clearLocal, applyOffline } from './save.js';
import { fmt } from './format.js';

let state = loadLocal() || newGame();

const canvas = document.getElementById('pen');
const ctx = canvas.getContext('2d');
const wrap = document.getElementById('canvas-wrap');
const cullMode = document.getElementById('cull-mode');
const welcome = document.getElementById('welcome');

function resize() {
  canvas.width = Math.max(100, wrap.clientWidth - 24);
  canvas.height = Math.max(100, wrap.clientHeight - 24);
}
window.addEventListener('resize', resize);
resize();

function herdCount() {
  return state.aggregate ? aggCount(state.aggregate) : state.sheep.length;
}

// Mouse tracking for hover tooltip.
let mousePos = null;
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mousePos = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
});
canvas.addEventListener('mouseleave', () => { mousePos = null; });

const actions = {
  buyStarter() {
    if (state.startedPair) return;
    state.sheep.push(randomSheep(0, 'M', true));
    state.sheep.push(randomSheep(0, 'F', true));
    state.startedPair = true;
  },
  buyRandom() {
    if (state.aggregate) return;
    const cost = costRandomSheep(state.purchaseCount.random);
    if (state.credits < cost || herdCount() >= penCapacity(state.penLevel)) return;
    state.credits -= cost;
    state.sheep.push(randomSheep(0, null, true));
    state.purchaseCount.random++;
  },
  buyPremium() {
    if (state.aggregate) return;
    const cost = costPremiumSheep(state.purchaseCount.premium);
    if (state.credits < cost || herdCount() >= penCapacity(state.penLevel)) return;
    state.credits -= cost;
    state.sheep.push(randomSheep(0.6, null, true));
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
  unlockAuto(id) {
    const map = { killOld: 'killOld', killMaleChildren: 'killMaleChildren', capCull: 'capThreshold' };
    const cost = AUTO_SLAUGHTER[map[id]].cost;
    const unKey = id + 'Unlocked';
    if (state.autoSlaughter[unKey] || state.credits < cost) return;
    state.credits -= cost;
    state.autoSlaughter[unKey] = true;
    state.autoSlaughter[id] = true;
  },
  toggleAuto(id, value) {
    state.autoSlaughter[id] = value;
  },
  exportSave() {
    return serialize(state);
  },
  importSave(str) {
    try {
      state = deserialize(str);
      saveLocal(state);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
  reset() {
    state = newGame();
    clearLocal();
  },
};

initUI(state, actions);

canvas.addEventListener('click', (e) => {
  if (!cullMode.checked || state.aggregate) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;
  for (let i = state.sheep.length - 1; i >= 0; i--) {
    const s = state.sheep[i];
    if (s._sx == null) continue;
    const dx = mx - s._sx, dy = my - s._sy;
    if (dx * dx + dy * dy <= (s._sr + 2) ** 2) {
      slaughter(state, s.id);
      break;
    }
  }
});

// Offline catch-up on load.
const offlineSecs = Math.min(MAX_OFFLINE_SECONDS, ((Date.now() - state.lastSaved) / 1000) * TIME_SCALE);
if (offlineSecs > 60) {
  const earned = applyOffline(state);
  if (earned > 0) {
    welcome.textContent = `Vítej zpět! Za ${fmt(offlineSecs)} s offline jsi vydělal ${fmt(earned)} kreditů.`;
    welcome.classList.remove('hidden');
    setTimeout(() => welcome.classList.add('hidden'), 8000);
  }
}

// Autosave.
setInterval(() => saveLocal(state), AUTOSAVE_MS);
window.addEventListener('beforeunload', () => saveLocal(state));
document.addEventListener('visibilitychange', () => { if (document.hidden) saveLocal(state); });

// Drift constants: normalized units/s; sheep wander gently.
const DRIFT_SPD = 0.018;
const DRIFT_CHANGE = 0.025; // probability of changing direction per second

let simClock = Date.now();
let accCred = 0, accWool = 0, accMeat = 0, accWall = 0;
let prevNow = performance.now();

function frame(now) {
  const realDt = Math.min((now - prevNow) / 1000, 0.1); // cap at 100 ms for tab switch
  prevNow = now;

  // Simulation (wall-clock based, catches up after tab sleep).
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

  // Smooth income display (0.5 s window).
  accWall += realDt;
  if (accWall >= 0.5) {
    state.income.credits = accCred / accWall;
    state.income.wool = accWool / accWall;
    state.income.meat = accMeat / accWall;
    accCred = accWool = accMeat = accWall = 0;
  }

  // Gentle sheep drift (cosmetic, not simulated, not saved — uses _ prefix).
  if (!state.aggregate) {
    for (const s of state.sheep) {
      if (s._vx == null) {
        const angle = Math.random() * Math.PI * 2;
        s._vx = Math.cos(angle) * DRIFT_SPD;
        s._vy = Math.sin(angle) * DRIFT_SPD;
      }
      if (Math.random() < DRIFT_CHANGE * realDt) {
        const angle = Math.random() * Math.PI * 2;
        s._vx = Math.cos(angle) * DRIFT_SPD;
        s._vy = Math.sin(angle) * DRIFT_SPD;
      }
      s.x += s._vx * realDt;
      s.y += s._vy * realDt;
      if (s.x < 0.01) { s.x = 0.01; s._vx = Math.abs(s._vx); }
      if (s.x > 0.99) { s.x = 0.99; s._vx = -Math.abs(s._vx); }
      if (s.y < 0.01) { s.y = 0.01; s._vy = Math.abs(s._vy); }
      if (s.y > 0.99) { s.y = 0.99; s._vy = -Math.abs(s._vy); }
    }
  }

  render(ctx, state, mousePos);
  updateUI(state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
