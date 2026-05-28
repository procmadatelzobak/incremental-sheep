// ===========================================================================
//  Bootstrap + herní smyčka.
// ===========================================================================
import { TIME_SCALE, AUTOSAVE_MS } from './config.js';
import { newGame } from './io/state.js';
import { loadLocal, saveLocal, clearLocal, serialize, deserialize, applyOffline } from './io/save.js';
import { step } from './sim/simulation.js';
import { initUI, updateUI, showBanner } from './ui/ui.js';
import { fmt } from './format.js';

let state = loadLocal() || newGame();
const save = () => saveLocal(state);

let earned = 0;
try { earned = applyOffline(state); } catch (e) { /* ignore */ }

initUI(state, 'app', save);
if (earned > 1) showBanner(`Vítej zpět! Offline jsi vydělal ${fmt(earned)} kreditů.`);

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
let prev = performance.now(), uiAcc = 0, saveAcc = 0;
function frame(now) {
  let dt = (now - prev) / 1000; prev = now;
  if (dt > 60) dt = 60;            // delší nepřítomnost dožene offline po reloadu
  dt *= TIME_SCALE;
  let rem = dt;
  while (rem > 0) { const c = Math.min(0.1, rem); step(state, c); rem -= c; }
  uiAcc += dt; saveAcc += dt;
  const full = uiAcc >= 0.25;
  if (full) uiAcc = 0;
  updateUI(state, full);
  if (saveAcc >= AUTOSAVE_MS / 1000) { save(); saveAcc = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
