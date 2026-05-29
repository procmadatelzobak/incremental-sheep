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
  document.body.classList.toggle('cosmic', c > 0.45);
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

// ===========================================================================
//  HRAČIČKA: "louka oveček" na pozadí.
//  Pokaždé, když populace stoupne o další ovci, přibude na pozadí jedna
//  jednoduchá ručně-kreslená ovečka (s drobným „pop" odskokem). Až do 1000.
//  Pozice se pamatují (localStorage), takže po refreshi zůstanou.
// ===========================================================================
const FLOCK_CAP = 1000;
const FLOCK_KEY = 'sheep-meadow-v1';
const FLOCK_SHEEP_SCALE = 2;
let fCanvas, fCtx, flock = [], flockAniming = false, lastSheepFloor = null;

// Popisek populačního chipu má prefix s ikonou (viz ui.js: ICONS.sheep + ' Ovce'),
// proto hledáme podřetězec, NE přesnou shodu. Dřív tu bylo === 'Ovce', což se kvůli
// emoji „🐑 " nikdy netrefilo → počet se četl jako NaN a louka zůstala prázdná.
export function isSheepChipLabel(text) {
  return /\bOvce\b/.test(text || '');
}

export function flockSheepScale() {
  return FLOCK_SHEEP_SCALE;
}

function readSheepCount() {
  // najdi chip populace (popisek „🐑 Ovce") a přečti jeho hodnotu
  const labels = document.querySelectorAll('.chip .chip-l');
  for (const l of labels) {
    if (isSheepChipLabel(l.textContent)) {
      const v = l.parentElement.querySelector('.chip-v');
      if (v) return parseNum(v.textContent);
    }
  }
  return NaN;
}

function flockSetup() {
  fCanvas = document.createElement('canvas');
  fCanvas.id = 'sheep-meadow';
  Object.assign(fCanvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    zIndex: '0', pointerEvents: 'none',
  });
  // za obsah (#app má z-index 1), ale nad pozadí stránky
  document.body.insertBefore(fCanvas, document.body.firstChild);
  fCtx = fCanvas.getContext('2d');
  resizeFlock();
  window.addEventListener('resize', () => { resizeFlock(); drawFlock(); });

  // načti uložené pozice
  try {
    const saved = JSON.parse(localStorage.getItem(FLOCK_KEY) || 'null');
    if (saved && Array.isArray(saved.sheep)) {
      flock = saved.sheep.map(s => ({ fx: s.fx, fy: s.fy, seed: s.seed, born: 0 }));
      lastSheepFloor = saved.floor ?? flock.length;
    }
  } catch (e) { /* ignoruj */ }
  drawFlock();
}

function resizeFlock() {
  if (!fCanvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  fCanvas.width = Math.round(window.innerWidth * dpr);
  fCanvas.height = Math.round(window.innerHeight * dpr);
  fCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function addSheep(n, animate) {
  for (let i = 0; i < n && flock.length < FLOCK_CAP; i++) {
    flock.push({
      fx: 0.04 + Math.random() * 0.92,
      fy: 0.10 + Math.random() * 0.86,
      seed: Math.random(),
      born: animate ? performance.now() + i * 55 : 0, // mírně rozfázovaný pop
    });
  }
  saveFlock();
  if (animate) startFlockAnim(); else drawFlock();
}

function saveFlock() {
  try {
    localStorage.setItem(FLOCK_KEY, JSON.stringify({
      floor: lastSheepFloor,
      sheep: flock.map(s => ({ fx: +s.fx.toFixed(4), fy: +s.fy.toFixed(4), seed: +s.seed.toFixed(3) })),
    }));
  } catch (e) { /* plný storage – přežijeme */ }
}

// jednoduchá ovečka: chomáček vlny + hlavička + nožičky
function drawOneSheep(ctx, x, y, scale, seed, cosmic) {
  const s = scale * (0.85 + seed * 0.4);
  const flip = seed > 0.5 ? 1 : -1;
  // barvy laděné s motivem (čitelné na světlém i tmavém pozadí)
  const wool = cosmic > 0.45 ? 'rgba(225,235,250,0.50)' : 'rgba(255,253,247,0.62)';
  const ink  = cosmic > 0.45 ? 'rgba(180,205,235,0.55)' : 'rgba(90,78,60,0.40)';
  const dark = cosmic > 0.45 ? 'rgba(40,36,62,0.65)' : 'rgba(70,62,50,0.55)';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip, 1);
  if (cosmic > 0.45) { ctx.shadowColor = 'rgba(150,200,255,0.5)'; ctx.shadowBlur = 6 * s; }
  // nožičky
  ctx.strokeStyle = dark; ctx.lineWidth = 1.4 * s; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-3.5 * s, 4.5 * s); ctx.lineTo(-3.5 * s, 8 * s);
  ctx.moveTo(2.5 * s, 4.5 * s);  ctx.lineTo(2.5 * s, 8 * s);
  ctx.stroke();
  // tělo – pár překrývajících se obloučků (vlna)
  ctx.fillStyle = wool; ctx.strokeStyle = ink; ctx.lineWidth = 1 * s;
  ctx.beginPath();
  const puffs = [[-5,0,4.2],[-1.5,-2.5,4],[2.5,-2,4],[4.5,1,3.6],[1,2,4.2],[-3,2.2,4]];
  for (const [px, py, pr] of puffs) {
    ctx.moveTo((px + pr) * s, py * s);
    ctx.arc(px * s, py * s, pr * s, 0, Math.PI * 2);
  }
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // hlavička
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.ellipse(6.5 * s, -1.5 * s, 2.6 * s, 2.2 * s, 0.25, 0, Math.PI * 2); ctx.fill();
  // ouško
  ctx.beginPath(); ctx.ellipse(5.2 * s, -3.4 * s, 1.1 * s, 0.7 * s, -0.5, 0, Math.PI * 2); ctx.fill();
  // očko
  ctx.fillStyle = cosmic > 0.45 ? 'rgba(220,235,255,0.9)' : 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(7.2 * s, -1.8 * s, 0.5 * s, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function easeOutBack(t) { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

function drawFlock() {
  if (!fCtx) return;
  const W = window.innerWidth, H = window.innerHeight;
  fCtx.clearRect(0, 0, W, H);
  const cosmic = lastCosmic < 0 ? 0 : lastCosmic;
  const now = performance.now();
  const base = flockSheepScale();
  for (const sh of flock) {
    let scale = base;
    if (sh.born) {
      const t = (now - sh.born) / 450;
      if (t < 0) continue;            // ještě se „nenarodila"
      if (t < 1) scale = base * Math.max(0, easeOutBack(t));
    }
    drawOneSheep(fCtx, sh.fx * W, sh.fy * H, scale, sh.seed, cosmic);
  }
}

function startFlockAnim() {
  if (flockAniming) return;
  flockAniming = true;
  const step = () => {
    drawFlock();
    const now = performance.now();
    const stillYoung = flock.some(s => s.born && now - s.born < 470);
    if (stillYoung) requestAnimationFrame(step);
    else { flockAniming = false; flock.forEach(s => s.born = 0); drawFlock(); }
  };
  requestAnimationFrame(step);
}

function flockTick() {
  const n = readSheepCount();
  if (!isFinite(n)) return;
  const floor = Math.floor(n);
  // První načtení, nebo prázdná louka i přes kladný počet (např. po starém
  // vadném save): tiše dorovnej na aktuální počet (bez „pop" animace).
  if (lastSheepFloor == null || (flock.length === 0 && floor > 0)) {
    if (floor > 0 && flock.length < FLOCK_CAP) addSheep(floor - flock.length, false);
    lastSheepFloor = floor;
    return;
  }
  if (floor > lastSheepFloor && flock.length < FLOCK_CAP) {
    const gained = floor - lastSheepFloor;
    addSheep(gained, gained <= 60);   // velké skoky přidej rovnou bez bouřky popů
  }
  lastSheepFloor = Math.max(lastSheepFloor, floor);
}

// --- start -----------------------------------------------------------------
function start() {
  syncCosmic();
  setInterval(syncCosmic, 500);   // fáze se mění zřídka; levný poll
  wireJuice();
  wireChipPulse();
  // znovu navázat pulz kreditů, kdyby se chip přegeneroval
  setInterval(() => { if (!document.querySelector('.chip:first-child .chip-v.__wired')) wireChipPulse(); }, 1500);
  // hračička: louka oveček na pozadí
  flockSetup();
  setInterval(flockTick, 600);
}
function wireChipPulse() {
  const chip = document.querySelector('.chip:first-child .chip-v');
  if (!chip || chip.classList.contains('__wired')) return;
  chip.classList.add('__wired');
  let prev = chip.textContent;
  new MutationObserver(() => { if (chip.textContent !== prev) { prev = chip.textContent; pulse(chip); } }).observe(chip, { childList: true, characterData: true, subtree: true });
}

// Auto-start jen v prohlížeči (ne při importu v Node/testech, kde document
// nemá addEventListener) — modul je tím i bezpečně importovatelný v testech.
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
