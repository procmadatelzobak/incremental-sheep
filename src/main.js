// ===========================================================================
//  Bootstrap + herní smyčka.
// ===========================================================================
import { TIME_SCALE, AUTOSAVE_MS } from './config.js';
import { newGame } from './io/state.js';
import { loadLocal, saveLocal, clearLocal, serialize, deserialize, applyOffline, resumeProgress } from './io/save.js';
import { step } from './sim/simulation.js';
import { runAutobuy } from './econ/actions.js';
import { initUI, updateUI, showBanner, notifyPhase, notifyAchievement, showOfflineModal } from './ui/ui.js';

const loaded = loadLocal();
let state = loaded || newGame();
const save = () => saveLocal(state);

// Export/import/reset (#32): obsluhuje je ⚙ Nastavení v HUDu (dřív footer).
const uiHooks = {
  exportSave: () => serialize(state),
  importSave: (str) => { state = deserialize(str); save(); initUI(state, 'app', save, uiHooks); showBanner('Hra načtena ze save stringu.'); },
  resetGame: () => {
    if (typeof confirm === 'function' && !confirm('Opravdu smazat veškerý postup a začít úplně znovu?')) return;
    clearLocal(); state = newGame(); initUI(state, 'app', save, uiHooks);
  },
};

let off = null;
try { off = applyOffline(state); } catch (e) { /* ignore */ }

initUI(state, 'app', save, uiHooks);
if (!loaded) {
  showBanner('Vítej! Ovce dávají vlnu, ta se prodává za kredity. Kupuj ovce a vylepšení, rozšiřuj a zahušťuj pastviny; od fáze 2 šlechti stádo selekcí. Nahoře vždy vidíš cíl aktuální fáze.');
} else if (off && off.seconds >= 60 && off.credits > 0) {
  showOfflineModal(off, state);
}

// --- smyčka ----------------------------------------------------------------
const FRAME_CLAMP = 60;            // strop jednoho frame v reálných sekundách
let prev = performance.now(), lastWall = Date.now(), saveAcc = 0;

// Toasty fází a achievementů — sdílené normálním framem i doháněním po probuzení.
function flushNotices() {
  if (state._phaseUp && state._phaseUp.length) { for (const p of state._phaseUp) notifyPhase(p); state._phaseUp.length = 0; }
  if (state._achUp && state._achUp.length) { for (const id of state._achUp.slice(0, 6)) notifyAchievement(id); state._achUp.length = 0; }
}

function frame(now) {
  const wallNow = Date.now();
  let dt = (now - prev) / 1000; prev = now;
  const wallElapsed = (wallNow - lastWall) / 1000; lastWall = wallNow;

  // #46: tab se probudil z uspání/throttlingu (nebo bfcache restore) — jeden
  // frame pokryl víc než FRAME_CLAMP reálných sekund. Dožeň uplynulý čas jako
  // offline progres (stejný strop), ať se tiše nezahodí všechno nad 60 s. Řídíme
  // se wall-clockem: performance.now() může během spánku tabu zamrznout.
  if (wallElapsed > FRAME_CLAMP) {
    const off = resumeProgress(state, wallElapsed);
    runAutobuy(state);
    updateUI(state);
    flushNotices();
    if (off && off.seconds >= 60 && off.credits > 0) showOfflineModal(off, state);
    save(); saveAcc = 0;
    requestAnimationFrame(frame);
    return;
  }

  if (dt > FRAME_CLAMP) dt = FRAME_CLAMP;   // krátký zámrz bez skoku wall-clocku (clock skew)
  dt *= TIME_SCALE;
  let rem = dt;
  while (rem > 0) { const c = Math.min(0.1, rem); step(state, c); rem -= c; }
  runAutobuy(state);               // automatické nákupy (zapnuté kategorie)
  saveAcc += dt;
  updateUI(state);                 // jen aktualizuje hodnoty na místě (bez blikání)
  flushNotices();
  if (saveAcc >= AUTOSAVE_MS / 1000) { save(); saveAcc = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
