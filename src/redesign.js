// ===========================================================================
//  Incremental Sheep — REDESIGN runtime (aditivní vrstva).
//  - Řídí proměnnou --cosmic (louka → vesmír) podle čísla aktuální fáze,
//    které čte z HUDu (#hud-phase). Žádný zásah do herní logiky.
//  - Přidává „šťávu": particly + pulz na akčních tlačítkách, pulz kreditů.
//
//  Použití: v index.html přidej za <script type="module" src="src/main.js">:
//      <script type="module" src="src/redesign.js"></script>
//  a nahraď styles.css přiloženou verzí (definuje --cosmic a celý vzhled).
// ===========================================================================

// --- proměna fází → --cosmic (0 = pastorální, 1 = kosmické) ----------------
function phaseFromHud() {
  const el = document.getElementById('hud-phase');
  if (!el) return null;
  const m = /Fáze\s+(\d+)/.exec(el.textContent || '');
  return m ? +m[1] : null;
}
function cosmicFor(phase) {
  if (phase == null) return 0;
  return Math.max(0, Math.min(1, (phase - 3) / 6)); // f.3 ještě louka, f.9 už plný vesmír
}
let lastCosmic = -1;
function syncCosmic() {
  const phase = phaseFromHud();
  if (phase == null) return;
  const c = cosmicFor(phase);
  if (Math.abs(c - lastCosmic) < 0.001) return;
  lastCosmic = c;
  document.documentElement.style.setProperty('--cosmic', c.toFixed(3));
  document.body.classList.toggle('cosmic', c > 0.55);
}

// --- juice -----------------------------------------------------------------
let fxLayer;
function layer() {
  if (!fxLayer) { fxLayer = document.createElement('div'); fxLayer.className = 'fxlayer'; document.body.appendChild(fxLayer); }
  return fxLayer;
}
function burst(x, y, opts = {}) {
  const n = opts.count || 14;
  const colors = opts.colors || ['var(--gold)', 'var(--green)', 'var(--gold-deep)'];
  const L = layer();
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    p.className = 'fx-particle';
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.6;
    const dist = 26 + Math.random() * 50;
    p.style.left = x + 'px'; p.style.top = y + 'px';
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    p.style.setProperty('--dy', (Math.sin(ang) * dist - 8) + 'px');
    const s = 4 + Math.random() * 6; p.style.width = s + 'px'; p.style.height = s + 'px';
    L.appendChild(p);
    setTimeout(() => p.remove(), 820);
  }
}
function floatNum(x, y, text, color) {
  const el = document.createElement('div');
  el.className = 'fx-float';
  el.textContent = text;
  el.style.left = x + 'px'; el.style.top = y + 'px';
  if (color) el.style.color = color;
  layer().appendChild(el);
  setTimeout(() => el.remove(), 1150);
}
function pulse(el) { if (!el) return; el.classList.remove('fx-pulse'); void el.offsetWidth; el.classList.add('fx-pulse'); }

// kredity: parsuj číslo z textu chipu (zvládne i k/M/mld) pro plovoucí zisk
const SUFFIX = { k: 1e3, m: 1e6, mld: 1e9, bil: 1e12, kvad: 1e15 };
function parseNum(t) {
  if (!t) return NaN;
  const m = /([-\d\s.,]+)\s*([a-záč]*)/i.exec(t.replace(/\u00a0/g, ' '));
  if (!m) return NaN;
  let n = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
  const suf = (m[2] || '').toLowerCase();
  if (SUFFIX[suf]) n *= SUFFIX[suf];
  return n;
}

function wireJuice() {
  // particly + pulz na akčních tlačítkách
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('button.act');
    if (!btn || btn.disabled) return;
    const r = btn.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, { count: 16, colors: ['var(--green)', 'var(--gold)', 'oklch(0.95 0.01 90)'] });
    pulse(btn);
    // plovoucí zisk kreditů (porovná chip před/po)
    const chip = document.querySelector('.chip:first-child .chip-v');
    if (chip) {
      const before = parseNum(chip.textContent);
      setTimeout(() => {
        const after = parseNum(chip.textContent);
        if (isFinite(before) && isFinite(after) && after < before) {
          floatNum(r.left + r.width / 2, r.top, '−' + fmtShort(before - after), 'var(--gold-deep)');
        }
      }, 90);
    }
  }, true);
}
function fmtShort(n) {
  n = Math.abs(n);
  if (n < 1000) return Math.round(n).toString();
  const u = [' k', ' M', ' mld', ' bil']; let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return (n < 10 ? n.toFixed(1) : Math.round(n)) + u[i];
}

// --- start -----------------------------------------------------------------
function start() {
  syncCosmic();
  setInterval(syncCosmic, 500);   // fáze se mění zřídka; levný poll
  wireJuice();
  wireChipPulse();
  // znovu navázat pulz kreditů, kdyby se chip přegeneroval
  setInterval(() => { if (!document.querySelector('.chip:first-child .chip-v.__wired')) wireChipPulse(); }, 1500);
}
function wireChipPulse() {
  const chip = document.querySelector('.chip:first-child .chip-v');
  if (!chip || chip.classList.contains('__wired')) return;
  chip.classList.add('__wired');
  let prev = chip.textContent;
  new MutationObserver(() => { if (chip.textContent !== prev) { prev = chip.textContent; pulse(chip); } }).observe(chip, { childList: true, characterData: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
