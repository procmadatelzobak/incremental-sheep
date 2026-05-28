// ===========================================================================
//  Bootstrap + herní smyčka.
// ===========================================================================
import { TIME_SCALE, AUTOSAVE_MS } from './config.js';
import { newGame } from './io/state.js';
import { loadLocal, saveLocal, clearLocal, serialize, deserialize, applyOffline } from './io/save.js';
import { step } from './sim/simulation.js';
import { runAutobuy } from './econ/actions.js';
import { initUI, updateUI, showBanner, notifyPhase, notifyAchievement } from './ui/ui.js';
import { fmt } from './format.js';

const loaded = loadLocal();
let state = loaded || newGame();
const save = () => saveLocal(state);

let earned = 0;
try { earned = applyOffline(state); } catch (e) { /* ignore */ }

initUI(state, 'app', save);
if (!loaded) {
  showBanner('Vítej! Ovce dávají vlnu, ta se prodává za kredity. Kupuj ovce a vylepšení, rozšiřuj a zahušťuj pastviny; od fáze 2 šlechti stádo selekcí. Nahoře vždy vidíš cíl aktuální fáze.');
} else if (earned > 1) {
  showBanner(`Vítej zpět! Offline jsi vydělal ${fmt(earned)} kreditů.`);
}

// --- footer (export/import/reset) ------------------------------------------
const $ = (id) => document.getElementById(id);
$('btn-export')?.addEventListener('click', () => {
  const str = serialize(state);
  $('save-string').value = str;
  $('save-msg').textContent = 'String je v poli níže.';
  try { navigator.clipboard?.writeText(str); $('save-msg').textContent = 'Zkopírováno do schránky.'; } catch (e) { /* ignore */ }
});
$('btn-import')?.addEventListener('click', () => {
  const str = ($('save-string').value || '').trim();
  if (!str) return;
  try { state = deserialize(str); save(); initUI(state, 'app', save); $('save-msg').textContent = 'Načteno.'; }
  catch (e) { $('save-msg').textContent = 'Chyba: ' + e.message; }
});
$('btn-reset')?.addEventListener('click', () => {
  if (!confirm('Opravdu smazat veškerý postup a začít úplně znovu?')) return;
  clearLocal(); state = newGame(); initUI(state, 'app', save);
});

// --- smyčka ----------------------------------------------------------------
let prev = performance.now(), saveAcc = 0;
function frame(now) {
  let dt = (now - prev) / 1000; prev = now;
  if (dt > 60) dt = 60;            // delší nepřítomnost dožene offline po reloadu
  dt *= TIME_SCALE;
  let rem = dt;
  while (rem > 0) { const c = Math.min(0.1, rem); step(state, c); rem -= c; }
  runAutobuy(state);               // automatické nákupy (zapnuté kategorie)
  saveAcc += dt;
  updateUI(state);                 // jen aktualizuje hodnoty na místě (bez blikání)
  if (state._phaseUp && state._phaseUp.length) { for (const p of state._phaseUp) notifyPhase(p); state._phaseUp.length = 0; }
  if (state._achUp && state._achUp.length) { for (const id of state._achUp.slice(0, 6)) notifyAchievement(id); state._achUp.length = 0; }
  if (saveAcc >= AUTOSAVE_MS / 1000) { save(); saveAcc = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
