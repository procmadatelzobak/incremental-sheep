// ===========================================================================
//  UI: HUD + záložky + panely. Dashboard-first, plátno jako akcent.
//  Bez blikání: panel se staví JEDNOU, každý frame se jen aktualizují hodnoty
//  na místě (čísla, lišty, dostupnost). Struktura se překreslí jen při změně
//  (nákup, přepnutí záložky, nová lokace/fáze).
// ===========================================================================
import { fmt, fmtCount } from '../format.js';
import * as A from '../econ/actions.js';
import { upgradeCost, perkCost, getMults } from '../econ/economy.js';
import { VERSION, UPGRADES, upgradeName, PERKS, PERK_BRANCHES, GENES, RESOURCES, BALANCE, WORLDS, WORLD_ORDER, DENSITY_TIERS, AREA_MODS, SOIL } from '../config.js';
import { totalCount, totalPopulation } from '../sim/cohort.js';
import { maleCapOf } from '../sim/groups.js';
import { soilSnapshot, manureRate } from '../sim/soil.js';
import { herdCapacity, totalArea, densityMult, densityMaxLevel, densityPhaseCap, areaModMult, worldArea, parcelsInWorld, landParcelCost, tierUnlockCost, canUnlockTier, densityCost, areaModCost } from '../content/locations.js';
import { phaseName, phaseHint, phaseProgress, PHASE_INFO, PHASES } from '../content/phases.js';
import { breedingScore, geneMin, geneMax, selectedNewbornDist } from '../sim/genetics.js';
import { resourceCap, TRADEABLE, storageEnabled } from '../econ/storage.js';
import { processFraction } from '../econ/processing.js';
import { sphereReady, dysonTarget } from '../content/projects.js';
import { canIgnite, singularityAvailable } from '../content/prestige.js';
import { ACHIEVEMENTS, unlockedTitles } from '../content/achievements.js';
import { drawHerd } from '../render/canvas.js';
import { ICONS, PHASE_ICONS, RES_ICONS, KIND_ICONS } from '../icons.js';

let root, hud, tabsBar, panelEl, bannerEl, activeTab = 'herds', lastTabSig = '', structSig = '';
let updaters = [];           // aktualizace hodnot aktivního panelu (běží každý frame)
let S, onAction = () => {};
let hooks = {};              // callbacky z main.js (export/import/reset) pro ⚙ Nastavení (#32)
let modalEl = null; const modalQueue = []; let toastWrap = null;
const phaseBannerQueue = [];   // #35: inline karty „nová fáze" na začátku aktivního panelu
let infoModalEl = null;      // dismissable overlay pro 💡/⚙/❓ (#32)
let herdCanvasEl = null;
let upgradeFilter = 'all';     // filtr v panelech vylepšení (#27): all|avail|soon|owned
let tipIdx = 0;                // rotace tipů v 💡 (#32)
// #35: nová fáze se oznamuje inline kartou na začátku panelu (NE modal). Viz notifyPhase a phaseBannerEl.

// --- DOM helpers -----------------------------------------------------------
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return e;
}
const clear = (e) => { while (e && e.firstChild) e.removeChild(e.firstChild); };
const group = () => S.groups.find(g => g.id === S.activeGroupId) || S.groups[0];

function setClass(el, cls, on) {
  const parts = (el.className || '').split(' ').filter(Boolean).filter(c => c !== cls);
  if (on) parts.push(cls);
  el.className = parts.join(' ');
}
function flashEl(el) { if (!el) return; setClass(el, 'flash', true); setTimeout(() => setClass(el, 'flash', false), 350); }
function flashChip(key) { const c = hudChips[key]; if (c) flashEl(c.chip); }
function etaStr(sec) {
  if (!isFinite(sec)) return '∞';
  if (sec < 90) return Math.round(sec) + ' s';
  if (sec < 5400) return Math.round(sec / 60) + ' min';
  return (sec / 3600).toFixed(1) + ' h';
}

// --- "živé" prvky: postaví se jednou, hodnota se obnoví v refreshPanel() ----
function reg(el, fn) { updaters.push(() => fn(el)); return el; }

// Dvouřádkové tlačítko: hlavní řádek (popisek · cena) + podřádek (efekt nákupu,
// nebo důvod nedostupnosti "chybí X"). effectFn vrací krátký popis efektu.
// opts (volitelně): primaryFn → zelený CTA stav (#10), deltaFn → po nákupu popDelta
// na chip zdroje (#25), titleFn → text v tooltipu (např. ROI; #12).
function cBtn(label, costFn, actFn, effectFn, opts = {}) {
  const main = h('span', { class: 'b-main' });
  const sub = h('span', { class: 'b-sub' });
  const b = h('button', { class: 'act cost' }, main, sub);
  b.addEventListener('click', () => {
    const cost = b._cost;
    if (actFn() !== false) {
      onAction(); flashChip('credits');
      if (cost > 0) popDelta('credits', '−' + fmt(cost), false);
      if (opts.deltaFn) { const d = opts.deltaFn(); if (d && d.key) popDelta(d.key, d.text, d.good !== false); }
      rebuildPanel();
    }
  });
  return reg(b, (el) => {
    const c = costFn(); el._cost = c;
    main.textContent = `${label} · ${fmt(c)} 💰`;
    const have = S.resources.credits || 0;
    el.disabled = have < c;
    sub.textContent = have < c ? `chybí ${fmt(c - have)} 💰` : (effectFn ? effectFn() : '');
    if (opts.primaryFn) el.classList.toggle('primary', !el.disabled && !!opts.primaryFn());
    else if (el.classList.contains('primary')) el.classList.remove('primary');
    if (opts.titleFn) el.title = opts.titleFn() || '';
  });
}
function aBtn(label, enabledFn, actFn, reasonFn, cls) {
  const main = h('span', { class: 'b-main', text: label });
  const sub = reasonFn ? h('span', { class: 'b-sub' }) : null;
  const b = h('button', { class: 'act' + (cls ? ' ' + cls : '') }, main, sub);
  b.addEventListener('click', () => { if (actFn() !== false) { onAction(); rebuildPanel(); } });
  return reg(b, (el) => { const ok = enabledFn(); el.disabled = !ok; if (sub) sub.textContent = ok ? '' : reasonFn(); });
}
function autobuyToggle(label, key) {
  const on = (S.settings.autobuy || {})[key];
  return h('label', { class: 'ck auto' },
    h('input', { type: 'checkbox', ...(on ? { checked: 'checked' } : {}), onchange: e => { A.setAutobuy(S, key, !!e.target.checked); onAction(); } }),
    ' ⚙ ' + label);
}
function presetBtn(label, gene, gid) {
  const b = h('button', { class: 'act preset', text: label });
  b.addEventListener('click', () => { A.setCull(S, gid, { enabled: true, gene, cutFrac: 0.3 }); onAction(); rebuildPanel(); });
  return b;
}
function segBtn(label, active, fn) {
  const b = h('button', { class: 'act seg' + (active ? ' on' : ''), text: label });
  b.addEventListener('click', () => { fn(); onAction(); rebuildPanel(); });
  return b;
}
// Co stádo právě nejvíc brzdí (#9). Bere v potaz i nedostatek samců (#22/#28).
function limitText(s) {
  const pop = totalPopulation(s), cap = herdCapacity(s);
  if (pop >= cap * 0.95) return '⚠ Brzdí: kapacita pozemků — rozšiř rozlohu/hustotu (Pozemky)';
  const g = group();
  if (g.counts.F.adult < 2) return '⚠ Brzdí: málo dospělých samic — kup samice';
  const fert = Math.max(0.1, g.genes.fertility.mu + (getMults(s).fertBonus || 0));
  const matable = g.counts.M.adult * fert;
  if (matable < g.counts.F.adult * 0.9) {
    const need = Math.ceil(g.counts.F.adult / fert);
    return `⚠ Brzdí: málo samců — spáří se jen ~${fmtCount(matable)} z ${fmtCount(g.counts.F.adult)} samic (drž ~${fmtCount(need)} samců${g.policy.autoMales ? ', zmírni poměr v Jatkách' : ''})`;
  }
  return 'Stádo roste — kup víc rozlohy/hustoty pro další růst';
}
function liveSpan(fn, cls) { const e = h('span', { class: cls || '' }); return reg(e, (el) => { el.textContent = fn(); }); }
function liveBar(fracFn, labelFn, color = '#6aa84f') {
  const fill = h('div', { class: 'barfill', style: `background:${color}` });
  const lab = h('span', { class: 'barlabel' });
  const wrap = h('div', { class: 'bar' }, fill, lab);
  return reg(wrap, () => { const f = Math.max(0, Math.min(1, fracFn() || 0)); fill.style.width = (f * 100).toFixed(1) + '%'; lab.textContent = labelFn(); });
}
function geneBar(key) {
  const spec = GENES[key];
  const sigmaEl = h('div', { class: 'gene-sigma' });
  const muEl = h('div', { class: 'gene-mu' });
  const valEl = h('span', { class: 'dim' });
  const node = h('div', { class: 'gene' },
    h('div', { class: 'gene-h' }, h('span', { text: spec.label }), valEl),
    h('div', { class: 'gene-track' }, sigmaEl, muEl));
  return reg(node, () => {
    const d = group().genes[key]; const cm = S.world.ceilingMult;
    const lo = geneMin(key, cm), hi = geneMax(key, cm), span = (hi - lo) || 1;
    const muF = Math.max(0, Math.min(1, (d.mu - lo) / span));
    const sigF = Math.max(0.005, Math.min(0.5, d.sigma / span));
    const good = spec.lowerBetter ? (1 - muF) : muF;
    muEl.style.background = good > 0.66 ? '#6aa84f' : good > 0.33 ? '#c9a227' : '#b06a3a';
    sigmaEl.style.left = Math.max(0, (muF - sigF) * 100) + '%';
    sigmaEl.style.width = Math.min(100, sigF * 200) + '%';
    muEl.style.left = (muF * 100) + '%';
    valEl.textContent = d.mu.toFixed(spec.dec);
  });
}

// --- HUD (staví se jednou, aktualizuje na místě) ---------------------------
let hudChips = {}, hudEp, hudPhase, hudHint, hudCap, hudGate, hudTools = {};
function buildHud() {
  clear(hud);
  hudEp = h('b', {}); hudPhase = h('span', { class: 'dim', id: 'hud-phase' });
  hudHint = h('div', { class: 'hud-hint' });
  // nástroje vpravo nahoře (#32): rada/tip, nastavení (export/import), o hře
  const tipBtn = h('button', { class: 'hud-tool', title: 'Rada pastýře a tip dne', onclick: openTipModal }, '💡');
  const gearBtn = h('button', { class: 'hud-tool', title: 'Nastavení — export/import hry', onclick: openSettingsModal }, '⚙');
  const infoBtn = h('button', { class: 'hud-tool', title: 'O hře', onclick: openAboutModal }, '❓');
  hudTools = { tip: tipBtn, gear: gearBtn, info: infoBtn };
  const topRow = h('div', { class: 'hud-top' },
    h('div', { class: 'hud-title' }, hudEp, hudPhase),
    h('div', { class: 'hud-tools' }, tipBtn, gearBtn, infoBtn));
  const chips = h('div', { class: 'chips' });
  hudChips = {};
  for (const [k, lab] of [['credits', ICONS.credits + ' Kredity'], ['pop', ICONS.sheep + ' Ovce'], ['wool', ICONS.wool + ' Vlna/s'], ['milk', ICONS.milk + ' Mléko/s'], ['meat', ICONS.meat + ' Maso/s'], ['compute', ICONS.compute + ' Výpočet/s'], ['knowledge', ICONS.knowledge + ' Vědění']]) {
    const val = h('span', { class: 'chip-v', text: '0' });
    const trend = h('span', { class: 'chip-t' });
    const delta = h('span', { class: 'chip-d' });           // delta flash po nákupu (#25)
    const chip = h('div', { class: 'chip' }, h('span', { class: 'chip-l', text: lab }), val, trend, delta);
    hudChips[k] = { chip, val, trend, delta }; chips.appendChild(chip);
  }
  // Postup k další fázi (#26): vždy viditelná lišta cur / target.
  const gateFill = h('div', { class: 'barfill gate-fill', style: 'background:#c9a227' });
  const gateLab = h('span', { class: 'barlabel' });
  const gateBar = h('div', { class: 'bar', title: 'Postup k další fázi' }, gateFill, gateLab);
  hudGate = { bar: gateBar, fill: gateFill, lab: gateLab };
  // Ukazatel naplnění pastvin (#17): vždy viditelná lišta ovce / kapacita.
  const capFill = h('div', { class: 'barfill cap-fill', style: 'background:#6aa84f' });
  const capLab = h('span', { class: 'barlabel' });
  const capBar = h('div', { class: 'bar', title: 'Naplnění pastvin (ovce / kapacita)' }, capFill, capLab);
  hudCap = { fill: capFill, lab: capLab };
  hud.appendChild(topRow);
  hud.appendChild(hudHint); hud.appendChild(chips); hud.appendChild(gateBar); hud.appendChild(capBar);
}
// Krátká delta bublina na kartě po akci (#25).
function popDelta(key, text, good) {
  const c = hudChips[key]; if (!c || !c.delta) return;
  c.delta.textContent = text;
  c.delta.className = 'chip-d show ' + (good ? 'good' : 'bad');
  clearTimeout(c._dt);
  c._dt = setTimeout(() => { if (c.delta) c.delta.className = 'chip-d'; }, 1400);
}
function updateHud(s) {
  if (!hud) return;
  hudEp.textContent = s.meta.epithet;
  const sp = (s.rates && s.rates._speed) || 1;
  hudPhase.textContent = `  •  ${PHASE_ICONS[s.phase] || ''} Fáze ${s.phase}: ${phaseName(s)}` + (sp > 1 ? `  ⏩ čas ×${sp.toFixed(1)}` : '');
  hudHint.textContent = '› ' + phaseHint(s);
  if (hudTools.tip) setClass(hudTools.tip, 'lit', stepActionable(s));   // žárovka svítí, když je co výhodně koupit
  const r = s.rates || {};
  const set = (k, txt, show) => { const c = hudChips[k]; if (!c) return; c.chip.style.display = show ? '' : 'none'; c.val.textContent = txt; };
  set('credits', fmt(s.resources.credits || 0), true);
  set('pop', `${fmtCount(r._pop || 0)} / ${fmtCount(herdCapacity(s))}`, true);
  set('wool', fmt(r.wool || 0), true);
  set('milk', fmt(r.milk || 0), s.phase >= 2);
  set('meat', fmt(r.meat || 0), true);
  set('compute', fmt(r.compute || 0), s.phase >= 5);
  set('knowledge', fmt(s.prestige.knowledge || 0), (s.prestige.knowledge || 0) > 0 || s.phase >= 10);
  // mini trend na kartách (#11): příjem kreditů /s a růst stáda /min
  if (hudChips.credits) hudChips.credits.trend.textContent = (r._income > 0.01) ? `+${fmt(r._income)}/s` : '';
  if (hudChips.pop) {
    const gpm = (r._popGrowth || 0) * 60;
    hudChips.pop.trend.textContent = Math.abs(gpm) >= 0.1 ? `${gpm > 0 ? '+' : ''}${fmt(gpm)}/min` : '';
  }
  if (hudGate) {
    const pg = phaseProgress(s);
    if (pg && pg.target > 0 && s.phase < 11) {
      hudGate.bar.style.display = '';
      const f = Math.max(0, Math.min(1, pg.cur / pg.target));
      hudGate.fill.style.width = (f * 100).toFixed(1) + '%';
      hudGate.lab.textContent = `Fáze ${s.phase}→${s.phase + 1}: ${pg.label} ${fmt(pg.cur)} / ${fmt(pg.target)} (${(f * 100).toFixed(0)} %)`;
    } else { hudGate.bar.style.display = 'none'; }
  }
  if (hudCap) {
    const cap = herdCapacity(s), pop = totalPopulation(s);
    const f = cap > 0 ? Math.max(0, Math.min(1, pop / cap)) : 0;
    hudCap.fill.style.width = (f * 100).toFixed(1) + '%';
    hudCap.fill.style.background = f > 0.97 ? '#c9a227' : '#6aa84f';   // skoro plno → zlatě (rozšiř pozemky)
    hudCap.lab.textContent = `${ICONS.pasture} Pastviny: ${fmtCount(pop)} / ${fmtCount(cap)} ovcí (${(f * 100).toFixed(0)} %)`;
  }
}

// --- ZÁLOŽKY ---------------------------------------------------------------
// Laboratoř i Jatka se odemknou, jakmile má hráč pozemky kolem prvního města (Země tier 4).
const labUnlocked = (s) => (s.land.worlds.earth.tier || 0) >= 4;
const cityUnlocked = (s) => (s.land.worlds.earth.tier || 0) >= 4;

const TABS = [
  { id: 'herds', label: ICONS.sheep + ' Stáda', avail: () => true, render: renderHerds },
  { id: 'genetics', label: ICONS.genes + ' Genetika', avail: () => true, render: renderGenetics },
  { id: 'slaughter', label: '🔪 Jatka', avail: s => cityUnlocked(s), render: renderSlaughter },
  { id: 'upgrades', label: ICONS.upgrades + ' Vylepšení', avail: () => true, render: renderUpgrades },
  { id: 'lab', label: ICONS.lab + ' Laboratoř', avail: s => labUnlocked(s), render: renderLab },
  { id: 'stations', label: ICONS.pasture + ' Pozemky', avail: s => s.phase >= 2, render: renderStations },
  { id: 'pastures', label: ICONS.soil + ' Pastviny', avail: s => s.phase >= SOIL.unlockPhase, render: renderPastures },
  { id: 'storage', label: ICONS.storage + ' Sklad', avail: s => s.phase >= 6, render: renderStorage },
  { id: 'manager', label: ICONS.manager + ' Manažer', avail: s => s.phase >= 9, render: renderManager },
  { id: 'prestige', label: ICONS.prestige + ' Prestiž', avail: s => s.phase >= 7 || (s.prestige.knowledge || 0) > 0 || s.prestige.runs > 0, render: renderPrestige },
  { id: 'kronika', label: ICONS.kronika + ' Kronika', avail: s => s.phase >= 2, render: renderKronika },
  { id: 'stats', label: ICONS.stats + ' Staty', avail: () => true, render: renderStats },
];
// Notifikace nově odemčených záložek (#34): drž v state.seenTabs (přežije reload).
// Při prvním spuštění/načtení označ vše aktuálně dostupné za viděné, aby se
// odznak „!" objevil jen u záložek, které se odemknou až POZDĚJI.
function ensureSeenTabs(s) {
  if (!s.seenTabs) { s.seenTabs = {}; for (const t of TABS) if (t.avail(s)) s.seenTabs[t.id] = true; }
  return s.seenTabs;
}
function buildTabs() {
  clear(tabsBar);
  const seen = ensureSeenTabs(S);
  for (const t of TABS) {
    const isNew = t.avail(S) && !seen[t.id];
    const b = h('button', { class: 'tab' + (t.id === activeTab ? ' active' : '') + (isNew ? ' new' : ''),
      onclick: () => { S.seenTabs[t.id] = true; if (activeTab !== t.id) activeTab = t.id; buildTabs(); rebuildPanel(); onAction(); } },
      t.label, isNew ? h('span', { class: 'tab-badge', text: '!' }) : null);
    if (!t.avail(S)) b.style.display = 'none';
    tabsBar.appendChild(b);
  }
  seen[activeTab] = true;   // aktivní záložka je vždy „viděná"
}

// --- PANELY (staví strukturu jednou; hodnoty přes reg()) -------------------
function section(title, ...kids) { return h('div', { class: 'sect' }, h('h3', { text: title }), ...kids); }

// Rozpad příjmů (#24): z čeho plynou kredity (zdroj → /s → kr/s).
function incomeSection(s) {
  const tbl = h('table', { class: 'stats income' });
  const pm = () => getMults(s).priceMult;
  for (const k of Object.keys(RESOURCES)) {
    const def = RESOURCES[k];
    if (!def.sell || def.phase > s.phase) continue;
    const row = h('tr', {},
      h('td', { class: 'dim' }, (RES_ICONS[k] || '') + ' ' + def.label),
      h('td', {}, liveSpan(() => { const r = s.rates[k] || 0; return r > 1e-9 ? fmt(r) + '/s' : '—'; })),
      h('td', {}, liveSpan(() => { const r = s.rates[k] || 0; return r > 1e-9 ? fmt(r * (def.value || 0) * pm()) + ' kr/s' : ''; })));
    reg(row, () => { row.style.display = (s.rates[k] || 0) > 1e-9 ? '' : 'none'; });
    tbl.appendChild(row);
  }
  tbl.appendChild(h('tr', { class: 'income-total' },
    h('td', { class: 'dim', text: 'Celkem' }), h('td', {}),
    h('td', {}, liveSpan(() => {
      let t = 0;
      for (const k of Object.keys(RESOURCES)) { const def = RESOURCES[k]; if (!def.sell || def.phase > s.phase) continue; t += (s.rates[k] || 0) * (def.value || 0) * pm(); }
      return fmt(t) + ' kr/s';
    }))));
  return section('💰 Příjem kreditů (z čeho plynou)', tbl,
    h('div', { class: 'dim small', text: 'Hrubá tržní hodnota produkce za sekundu. Zpracování v Laboratoři mění vlnu na sukno a mléko na sýr (dražší).' }));
}

function renderHerds(s) {
  const g = group();
  const wrap = h('div', {});

  if (s.groups.length > 1) {
    wrap.appendChild(section('Stádo',
      h('select', { onchange: e => { s.activeGroupId = +e.target.value; rebuildPanel(); } },
        ...s.groups.map(x => h('option', { value: x.id, ...(x.id === g.id ? { selected: 'selected' } : {}) }, `${x.name} (${fmtCount(totalCount(x))})`)))));
  }

  const cv = h('canvas', { class: 'herdcanvas', width: 280, height: 90 });
  herdCanvasEl = cv;
  reg(cv, (el) => drawHerd(el, group()));
  const buy = s.settings.buy || { sex: 'mix', qty: 1 };
  const sexRow = h('div', { class: 'ctl-row' }, 'Kupovat: ',
    segBtn('🐏 Samec', buy.sex === 'M', () => A.setBuy(s, { sex: 'M' })),
    segBtn('🐑 Samice', buy.sex === 'F', () => A.setBuy(s, { sex: 'F' })),
    segBtn('⚖️ Auto', buy.sex === 'mix', () => A.setBuy(s, { sex: 'mix' })));
  const qtyRow = h('div', { class: 'ctl-row' }, 'Množství: ',
    ...[1, 10, 100].map(q => segBtn('×' + q, buy.qty === q, () => A.setBuy(s, { qty: q }))));
  const sexLbl = { M: 'samců', F: 'samic', mix: 'ovcí (půl/půl)' };
  const buyBtn = cBtn(`${ICONS.sheep} Koupit ovce`, () => A.addSheepCost(s),
    () => A.buyAddSheep(s),
    () => { const add = (s.settings.buy.qty || 1) * BALANCE.sheepPerUnit, pop = totalPopulation(s); return `+${fmtCount(add)} ${sexLbl[s.settings.buy.sex] || 'ovcí'} · stádo ${fmtCount(pop)}→${fmtCount(pop + add)}`; },
    { primaryFn: () => { const sa = A.suggestedAction(s); return !!sa && sa.kind === 'addSheep'; } });
  buyBtn.addEventListener('click', () => flashEl(herdCanvasEl));
  // přehled počtů po pohlaví × stádiu (#22) — hráč vidí, kde ovce jsou a kam mizí
  const mfCell = (sex, stage) => liveSpan(() => fmtCount(group().counts[sex][stage]));
  const mfTable = h('table', { class: 'mf' },
    h('tr', {}, h('td', {}), h('th', { text: '🐏 Samci' }), h('th', { text: '🐑 Samice' })),
    h('tr', {}, h('td', { class: 'dim', text: 'Děti' }), h('td', {}, mfCell('M', 'child')), h('td', {}, mfCell('F', 'child'))),
    h('tr', {}, h('td', { class: 'dim', text: 'Dospělí' }), h('td', {}, mfCell('M', 'adult')), h('td', {}, mfCell('F', 'adult'))),
    h('tr', {}, h('td', { class: 'dim', text: 'Staří' }), h('td', {}, mfCell('M', 'old')), h('td', {}, mfCell('F', 'old'))));
  const breedLine = liveSpan(() => {
    const gg = group();
    const fert = Math.max(0.1, gg.genes.fertility.mu + (getMults(s).fertBonus || 0));
    const eff = Math.min(gg.counts.F.adult, gg.counts.M.adult * fert);
    let t = `Páření: ${fmtCount(gg.counts.M.adult)} samců spáří ~${fmtCount(eff)} z ${fmtCount(gg.counts.F.adult)} dospělých samic`;
    if (gg.counts.M.adult * fert < gg.counts.F.adult * 0.95 && gg.counts.F.adult >= 2) t += ' ⚠ málo samců';
    return t;
  }, 'dim small statusline');
  const marketHint = liveSpan(() => {
    const add = ((s.settings.buy && s.settings.buy.qty) || 1) * BALANCE.sheepPerUnit;
    // vyhlazený růst (#36) — surový kmitá u kapacity a hláška pak blikala; fallback drží testy
    const growth = (s.rates && (s.rates._popGrowthAvg ?? s.rates._popGrowth)) || 0;
    const belowCap = totalPopulation(s) < herdCapacity(s) * 0.95;   // u plné pastviny je rada bezpředmětná
    return (belowCap && growth > 0 && growth * 20 >= add && A.addSheepCost(s) > 500)
      ? '🛒 Trh ovcí se vyčerpává — vlastní stádo se teď množí rychleji, než stihneš dokupovat. Investuj radši do pozemků a šlechtění.'
      : '';
  }, 'small note');
  const buyHelp = h('div', { class: 'dim small' }, 'Zprvu hlavně dokupuj — množení je pomalé. Jak vyšlechtíš nižší Březost a rozrosteš stádo, množení převezme a nákup ztratí smysl (trh dojde). Samice se množí, samci dávají kapacitu páření (1 samec spáří ≈ Plodnost samic).');
  const buyAutobuy = autobuyToggle('Automaticky dokupovat ovce', 'sheep');
  // #43: od fáze 5 už nákup ovcí na trhu zpravidla nedává smysl (trh dojde) → schovat do <details>.
  const buyBlock = s.phase >= 5
    ? h('details', { class: 'buy-collapse' }, h('summary', { class: 'dim small' }, `${ICONS.sheep} Nákup ovcí (rozbalit — v této fázi už zpravidla nedává smysl)`),
        sexRow, qtyRow, buyBtn, marketHint, buyAutobuy, buyHelp)
    : h('div', {}, sexRow, qtyRow, buyBtn, marketHint, buyAutobuy, buyHelp);
  wrap.appendChild(section(g.name,
    cv,
    h('div', { class: 'stat-row' },
      liveSpan(() => `Ovce: ${fmtCount(totalPopulation(s))} / ${fmtCount(herdCapacity(s))}`),
      liveSpan(() => `Skóre: ${(breedingScore(group().genes, s.world.ceilingMult) * 100).toFixed(0)} %`)),
    mfTable,
    breedLine,
    liveBar(() => totalPopulation(s) / herdCapacity(s), () => { const p = totalPopulation(s), c = herdCapacity(s); return `naplnění ${fmtCount(p)} / ${fmtCount(c)} (${c > 0 ? (p / c * 100).toFixed(0) : 0} %)`; }),
    liveSpan(() => limitText(s), 'dim small statusline'),
    s.phase >= SOIL.unlockPhase ? liveSpan(() => {
      const gg = group(), q = (gg.soil && gg.soil.q) || 0;
      const pop = totalPopulation(s), cap = herdCapacity(s);
      const dropping = typeof gg._soilTarget === 'number' && gg._soilTarget < q - 0.01;
      let t = `${ICONS.soil} Půda: pohnojení ${(q * 100).toFixed(0)} % (kapacita +${(SOIL.maxBonus * q * 100).toFixed(0)} %).`;
      if (pop >= cap * 0.98) t += ' Pastviny plné — množení dalších ovcí se zastavilo; zvyš pohnojení (Pastviny) nebo rozlohu (Pozemky).';
      else if (dropping) t += ' ⚠ Půda chudne — kapacita i množení budou klesat.';
      return t;
    }, 'dim small statusline') : null,
    buyBlock));

  wrap.appendChild(incomeSection(s));

  if (cityUnlocked(s)) {
    wrap.appendChild(h('div', { class: 'dim small', text: '🔪 Automatika porážek (přebyteční samci, porážka před zestárnutím) je v záložce Jatka.' }));
  }

  if (s.phase === 4 && !s.flags.immortal) {
    wrap.appendChild(section('Nápoj nesmrtelnosti',
      h('div', { class: 'dim' }, 'Z ovčího mléka. Po vypití získáš čas na pokročilou genetiku.'),
      cBtn(`${ICONS.immortality} Vyrobit nápoj nesmrtelnosti`, () => A.costFor(s, 'immortality'), () => A.craftImmortality(s))));
  }
  return wrap;
}

// Genetika (#30): genom + výběr při narození (šlechtění), přesunuté z dashboardu Stáda.
function renderGenetics(s) {
  const g = group();
  const wrap = h('div', {});
  if (s.groups.length > 1) {
    wrap.appendChild(section('Stádo',
      h('select', { onchange: e => { s.activeGroupId = +e.target.value; rebuildPanel(); } },
        ...s.groups.map(x => h('option', { value: x.id, ...(x.id === g.id ? { selected: 'selected' } : {}) }, `${x.name} (${fmtCount(totalCount(x))})`)))));
  }

  const genes = h('div', { class: 'genes' });
  for (const k in GENES) if (GENES[k].phase <= s.phase) genes.appendChild(geneBar(k));
  wrap.appendChild(section('Geny stáda (μ • rozptyl σ)',
    liveSpan(() => `Celkové skóre šlechtění: ${(breedingScore(group().genes, s.world.ceilingMult) * 100).toFixed(0)} %`, 'dim small'),
    genes));

  // Výběr jehňat (šlechtění) je dostupný už od fáze 1 — fáze 1 = lekce genetiky,
  // ne jen čekání na kredity (genom i selekce viditelné od první generace).
  if (s.phase >= 1) {
    const cull = g.policy.cull;
    const geneOpts = [h('option', { value: 'breedingScore', ...(cull.gene === 'breedingScore' ? { selected: 'selected' } : {}) }, 'Celkové skóre'),
      ...Object.keys(GENES).filter(k => GENES[k].phase <= s.phase).map(k => h('option', { value: k, ...(cull.gene === k ? { selected: 'selected' } : {}) }, GENES[k].label))];
    wrap.appendChild(section('🧬 Výběr při narození (šlechtění)',
      h('label', { class: 'ck' }, h('input', { type: 'checkbox', ...(cull.enabled ? { checked: 'checked' } : {}), onchange: e => { A.setCull(s, g.id, { enabled: !!e.target.checked }); onAction(); } }), ' Vybírat nejlepší jehňata do chovu (zbytek rovnou na maso)'),
      h('div', { class: 'ctl-row' }, 'Šlechtit na: ',
        presetBtn('🧶 Vlna', 'woolRate', g.id), s.phase >= 2 ? presetBtn('🥛 Mléko', 'milkRate', g.id) : null, presetBtn('🥩 Maso', 'size', g.id),
        presetBtn('🐇 Množení', 'gestation', g.id), presetBtn('🍼 Dospívání', 'maturity', g.id), presetBtn('⏳ Dlouhověkost', 'lifespan', g.id),
        s.phase >= 5 ? presetBtn('🧠 Mozek', 'intelligence', g.id) : null, presetBtn('⚖️ Vše', 'breedingScore', g.id)),
      h('div', { class: 'ctl-row' }, 'Cíl: ', h('select', { onchange: e => { A.setCull(s, g.id, { gene: e.target.value }); rebuildPanel(); } }, ...geneOpts)),
      h('div', { class: 'ctl-row' },
        liveSpan(() => { const p = group().policy.cull.cutFrac; return `Přísnost výběru: necháš nejlepších ${((1 - p) * 100).toFixed(0)} % jehňat, ${(p * 100).toFixed(0)} % jde na maso`; }),
        h('input', { type: 'range', min: 0, max: BALANCE.maxCutFrac, step: 0.01, value: cull.cutFrac, oninput: e => { A.setCull(s, g.id, { cutFrac: +e.target.value }); } })),
      liveSpan(() => {
        const gg = group(), cl = gg.policy.cull;
        if (!cl.enabled) return 'Výběr vypnutý — do chovu jdou všechna jehňata.';
        const p = Math.min(BALANCE.maxCutFrac, cl.cutFrac);
        if (p <= 0) return 'Přísnost 0 % — nevyřazuje se žádné jehně.';
        if (cl.gene === 'breedingScore') return 'Vybraná jehňata mají lepší celkové skóre ve všech genech → μ stádečka roste s každým vrhem.';
        const d = gg.genes[cl.gene]; if (!d) return '';
        const spec = GENES[cl.gene];
        const sChild = Math.sqrt(d.sigma * d.sigma / 2 + spec.mut * spec.mut);
        const nb = selectedNewbornDist(cl.gene, d.mu, sChild, cl, s.world.ceilingMult, Object.keys(gg.genes).length);
        const dpct = d.mu > 0 ? Math.abs((nb.mu - d.mu) / d.mu * 100) : 0;
        return `Vybraná jehňata mají ${spec.label} ${spec.lowerBetter ? '−' : '+'}${dpct.toFixed(1)} % oproti průměru stáda → μ se posouvá každým vrhem.`;
      }, 'dim small'),
      h('div', { class: 'dim small' }, 'Pastýř pravil: měkká vlna zůstane, hrubá odejde. Vybíráš rovnou při narození — žádné cykly. (μ stoupá, σ se utahuje; mutace ji doplňuje → šlechtit lze napořád.)')));
  }
  return wrap;
}

// Jatka (#33): automatika porážek, odemčená s městskými pozemky. Dvě sekce vedle sebe —
// porážka přebytečných samců (poměr samic/samec) a porážka těsně před zestárnutím.
function renderSlaughter(s) {
  const g = group();
  const wrap = h('div', {});
  if (s.groups.length > 1) {
    wrap.appendChild(section('Stádo',
      h('select', { onchange: e => { s.activeGroupId = +e.target.value; rebuildPanel(); } },
        ...s.groups.map(x => h('option', { value: x.id, ...(x.id === g.id ? { selected: 'selected' } : {}) }, `${x.name} (${fmtCount(totalCount(x))})`)))));
  }
  const fertOf = () => Math.max(0.1, group().genes.fertility.mu + (getMults(s).fertBonus || 0));

  const malesCard = h('div', { class: 'jcard' },
    h('h4', { text: '🐏 Přebyteční samci' }),
    h('label', { class: 'ck' }, h('input', { type: 'checkbox', ...(g.policy.autoMales ? { checked: 'checked' } : {}), onchange: () => { A.togglePolicy(s, g.id, 'autoMales'); onAction(); rebuildPanel(); } }), ' Automaticky porážet přebytečné dospělé samce'),
    h('div', { class: 'ctl-row' }, 'Samic na 1 samce: ',
      h('input', { type: 'number', min: 1, value: g.policy.femalesPerMale ?? 8, style: 'width:80px', onchange: e => { A.setFemalesPerMale(s, g.id, +e.target.value); onAction(); } })),
    liveSpan(() => {
      const gg = group();
      if (!gg.policy.autoMales) return 'Vypnuto — všichni samci zůstávají (víc kapacity páření, ale ujídají místo a krmení).';
      const keep = maleCapOf(gg);
      const f = fertOf();
      const fpm = Math.max(1, gg.policy.femalesPerMale || 8);
      const warn = fpm > f ? ` ⚠ poměr ${fmtCount(fpm)} je vyšší než plodnost (${f.toFixed(1)}) — samci nestihnou oplodnit všechny samice a porody klesnou.` : '';
      return `Necháš ~${fmtCount(keep)} dospělých samců (z ${fmtCount(gg.counts.M.adult)}), zbytek (nejstarší) jde na maso. 1 samec oplodní ~${f.toFixed(1)} samic.${warn}`;
    }, 'dim small'));

  const oldCard = h('div', { class: 'jcard' },
    h('h4', { text: '⏳ Porážka před zestárnutím' }),
    h('label', { class: 'ck' }, h('input', { type: 'checkbox', ...(g.policy.slaughterBeforeOld ? { checked: 'checked' } : {}), onchange: () => { A.togglePolicy(s, g.id, 'slaughterBeforeOld'); onAction(); rebuildPanel(); } }), ' Porážet ovce těsně před zestárnutím'),
    h('div', { class: 'dim small', text: 'Stará ovce dává míň masa i vlny a nakonec uhyne bez užitku. Porážkou těsně předtím získáš plný (dospělý) výnos masa.' }),
    liveSpan(() => group().policy.slaughterBeforeOld
      ? 'Zapnuto — žádná ovce nezestárne; všechny jdou na maso v plném výnosu.'
      : 'Vypnuto — ovce stárnou a staré uhynou stářím bez masa.', 'dim small'));

  wrap.appendChild(section('🔪 Jatka — automatika porážek',
    h('div', { class: 'dim small', text: 'Automatické řízení porážek pro maso (a od fáze 5 i kosti, kůži a mozky). Odemčeno s městskými pozemky.' }),
    h('div', { class: 'jatka-cols' }, malesCard, oldCard)));
  return wrap;
}

// Aktuální kumulativní efekt upgradu (#16): co teď tahle linka vylepšení reálně dělá.
function upgradeAgg(s, u) {
  const m = getMults(s);
  switch (u.kind) {
    case 'woolMult':    return `vlna ×${m.woolMult.toFixed(2)}`;
    case 'milkMult':    return `mléko ×${m.milkMult.toFixed(2)}`;
    case 'meatMult':    return `maso ×${m.meatMult.toFixed(2)}`;
    case 'priceMult':   return `ceny ×${m.priceMult.toFixed(2)}`;
    case 'breedMult':   return `březost ×${m.breedMult.toFixed(2)}`;
    case 'fertBonus':   return `+${m.fertBonus.toFixed(1)} plodnost`;
    case 'birthMult':   return `porody ×${m.birthMult.toFixed(2)}`;
    case 'ceilingMult': return `strop ×${m.ceilingMult.toFixed(2)}`;
    case 'computeMult': return `výpočet ×${m.computeMult.toFixed(2)}`;
    default: return '';
  }
}
// Které chip-y po nákupu flashnout (#25). Pro priceMult dáme delta na 'credits'.
function upgradeDelta(u) {
  const pct = `+${Math.round((u.per || 0) * 100)} %`;
  switch (u.kind) {
    case 'woolMult':  return { key: 'wool',    text: pct, good: true };
    case 'milkMult':  return { key: 'milk',    text: pct, good: true };
    case 'meatMult':  return { key: 'meat',    text: pct, good: true };
    case 'priceMult': return { key: 'credits', text: pct, good: true };
    default: return null;
  }
}
// Odhad návratnosti upgradu (#12): Δ příjem z proporčního scalingu relevantního multu.
const ROI_MAP = { woolMult: 'woolMult', milkMult: 'milkMult', meatMult: 'meatMult', priceMult: 'priceMult' };
function upgradeRoi(s, k) {
  const u = UPGRADES[k];
  const mk = ROI_MAP[u.kind];
  const inc = s.rates && s.rates._income;
  if (!mk || !inc || inc <= 0) return '';
  const m0 = getMults(s);
  const orig = s.upgrades[k] || 0;
  s.upgrades[k] = orig + 1;
  const m1 = getMults(s);
  s.upgrades[k] = orig;
  const ratio = m0[mk] > 0 ? m1[mk] / m0[mk] : 1;
  const newInc = inc * ratio;
  const delta = newInc - inc;
  if (delta <= 0) return '';
  const roi = upgradeCost(s, k) / delta;
  return `Příjem: ${fmt(inc)} → ${fmt(newInc)} kr/s · ROI ~${etaStr(roi)}`;
}
function upgradeItem(s, k) {
  const u = UPGRADES[k];
  // Titulek je „živý": s rostoucí úrovní vylepšení honosněji jmenuje (kosmetika).
  const nameEl = reg(h('b', {}), (el) => { el.textContent = upgradeName(u, s.upgrades[k] || 0); });
  return h('div', { class: 'item' },
    h('div', { class: 'item-h' }, nameEl, liveSpan(() => `Lv ${s.upgrades[k] || 0}`, 'dim'), liveSpan(() => upgradeAgg(s, u), 'dim small')),
    h('div', { class: 'dim small', text: u.desc }),
    cBtn('Koupit', () => upgradeCost(s, k), () => A.buyUpgrade(s, k), () => {
      const lvl = s.upgrades[k] || 0;
      const next = upgradeName(u, lvl + 1);
      // když další úroveň odemyká nový název, ukaž ho na tlačítku jako lákadlo
      return next !== upgradeName(u, lvl) ? `${u.desc} → ${next} (Lv ${lvl + 1})` : `${u.desc} → Lv ${lvl + 1}`;
    }, {
      primaryFn: () => { const sa = A.suggestedAction(s); return !!sa && sa.kind === 'upgrade' && sa.key === k; },
      deltaFn: () => upgradeDelta(u),
      titleFn: () => upgradeRoi(s, k),
    }));
}

// Filtr vylepšení (#27): projde-li daný klíč aktuálním filtrem.
function upgradeVisible(s, k, isLab) {
  const u = UPGRADES[k];
  if (u.phase > s.phase) return false;
  if (isLab ? !u.lab : (u.lab && labUnlocked(s))) return false;   // lab/ne-lab rozdělení
  if (upgradeFilter === 'avail') return (s.resources.credits || 0) >= upgradeCost(s, k);
  if (upgradeFilter === 'soon') return (s.resources.credits || 0) < upgradeCost(s, k);
  if (upgradeFilter === 'owned') return (s.upgrades[k] || 0) > 0;
  return true;   // 'all'
}
function filterChips() {
  const opts = [['all', 'Vše'], ['avail', 'Dostupné'], ['soon', 'Brzy'], ['owned', 'Zakoupené']];
  return h('div', { class: 'ctl-row' }, ...opts.map(([id, lab]) => {
    const b = h('button', { class: 'act seg' + (upgradeFilter === id ? ' on' : ''), text: lab });
    b.addEventListener('click', () => { upgradeFilter = id; rebuildPanel(); });
    return b;
  }));
}
const filterEmptyMsg = () => upgradeFilter === 'avail' ? 'Na nic teď nemáš — šetři.' : upgradeFilter === 'owned' ? 'Zatím nic zakoupeného.' : upgradeFilter === 'soon' ? 'Vše dostupné je koupené nebo na dosah.' : 'Zatím nic.';

function renderUpgrades(s) {
  const wrap = h('div', {});
  const list = h('div', { class: 'list' });
  let any = false;
  for (const k in UPGRADES) {
    if (!upgradeVisible(s, k, false)) continue;
    any = true;
    list.appendChild(upgradeItem(s, k));
  }
  wrap.appendChild(section('Vylepšení',
    autobuyToggle('Automaticky kupovat vylepšení', 'upgrades'),
    filterChips(),
    any ? list : h('div', { class: 'dim', text: filterEmptyMsg() })));
  return wrap;
}

// Laboratoř (#8): samostatná sekce pro pokročilé upgrady — dojení, zpracování,
// genetika, klonování, vývoj mozků. Odemkne se s pozemky kolem prvního města.
function renderLab(s) {
  const wrap = h('div', {});
  const list = h('div', { class: 'list' });
  let any = false;
  let anyUnlocked = false;
  for (const k in UPGRADES) {
    if (UPGRADES[k].lab && UPGRADES[k].phase <= s.phase) anyUnlocked = true;
    if (!upgradeVisible(s, k, true)) continue;
    any = true;
    list.appendChild(upgradeItem(s, k));
  }
  wrap.appendChild(section(ICONS.lab + ' Laboratoř',
    h('div', { class: 'dim small', text: 'Výzkumné křídlo farmy: dojení, zpracování, genetika a vývoj ovčích mozků.' }),
    autobuyToggle('Automaticky kupovat vylepšení', 'upgrades'),
    filterChips(),
    any ? list : h('div', { class: 'dim', text: anyUnlocked ? filterEmptyMsg() : 'Zatím není co zkoumat — odemkne se s dalšími fázemi.' })));

  // Zpracování (#23): co dělají Tkalcovny + živý ukazatel sukna/sýra.
  if (s.phase >= 3) {
    wrap.appendChild(section(ICONS.processing + ' Zpracování (vlna→sukno, mléko→sýr)',
      liveSpan(() => {
        const f = processFraction(s);
        return f <= 0
          ? 'Zatím se nezpracovává nic. Kup Tkalcovny výše — část vlny se promění na sukno a mléka na sýr (prodá se dráž).'
          : `Tkalcovny zpracují ${(f * 100).toFixed(0)} % vlny na sukno a mléka na sýr.`;
      }, 'dim'),
      h('div', { class: 'stat-row dim small' },
        liveSpan(() => `🧵 Sukno: ${fmt(s.rates.cloth || 0)}/s`),
        liveSpan(() => `🧀 Sýr: ${fmt(s.rates.cheese || 0)}/s`))));
  }
  return wrap;
}

function renderStations(s) {
  const wrap = h('div', {});

  // přehled kapacity = rozloha × hustota × modifikátory
  wrap.appendChild(section('🌍 Pozemky',
    liveSpan(() => `Kapacita: ${fmtCount(totalPopulation(s))} / ${fmtCount(herdCapacity(s))} ovcí`, 'dim'),
    liveSpan(() => `Rozloha ${fmt(totalArea(s))} · hustota ×${fmt(densityMult(s))} · modifikátory ×${areaModMult(s).toFixed(2)}`, 'dim small'),
    autobuyToggle('Automaticky rozšiřovat pozemky a hustotu', 'land')));

  // ROZLOHA: per-svět žebříček
  const worldsBox = h('div', { class: 'list' });
  for (const wk of WORLD_ORDER) {
    const w = WORLDS[wk];
    if (w.phase > s.phase) continue;
    const t = s.land.worlds[wk];
    const item = h('div', { class: 'item' },
      h('div', { class: 'item-h' }, h('b', { text: `${w.icon} ${w.label}` }), h('span', { class: 'dim', text: w.tiers[t.tier].label })),
      liveSpan(() => `Rozloha ${fmt(worldArea(s, wk))} · parcel ${parcelsInWorld(s, wk)}`, 'dim small'));
    if (w.fromProject) {
      item.appendChild(h('div', { class: 'dim small', text: 'Roste dokončováním Dysonových sfér (níže).' }));
    } else {
      item.appendChild(h('div', { class: 'btn-row' },
        cBtn(`+ ${w.tiers[t.tier].label}`, () => landParcelCost(s, wk), () => A.buyLand(s, wk), () => `+${fmt(w.tiers[t.tier].area)} rozlohy`),
        canUnlockTier(s, wk) ? cBtn(`⤴ Odemknout: ${w.tiers[t.tier + 1].label}`, () => tierUnlockCost(s, wk), () => A.unlockTier(s, wk), () => `${fmt(w.tiers[t.tier + 1].area)} rozlohy / parcela`) : null));
    }
    worldsBox.appendChild(item);
  }
  wrap.appendChild(section('Rozloha — kup území nebo odemkni větší kategorii', worldsBox));

  // HUSTOTA: globální track (fázové brány: vyšší stupně se odemykají s fázemi)
  const dmax = densityMaxLevel();
  const dcap = densityPhaseCap(s);
  wrap.appendChild(section('Hustota / technologie pastvy (globální násobič)',
    liveSpan(() => `${DENSITY_TIERS[s.land.density].icon} ${DENSITY_TIERS[s.land.density].label} (×${fmt(densityMult(s))})`, 'dim'),
    s.land.density < dcap
      ? cBtn(`Vylepšit → ${DENSITY_TIERS[s.land.density + 1].label}`, () => densityCost(s), () => A.buyDensity(s), () => `kapacita ×${(DENSITY_TIERS[s.land.density + 1].mult / DENSITY_TIERS[s.land.density].mult).toFixed(0)}`)
      : s.land.density < dmax
        ? h('div', { class: 'dim', text: `Další stupeň (${DENSITY_TIERS[s.land.density + 1].label}) se odemkne ve fázi ${DENSITY_TIERS[s.land.density + 1].phase}.` })
        : h('div', { class: 'dim', text: 'Maximální hustota.' })));

  // MODIFIKÁTORY ROZLOHY
  const modsBox = h('div', { class: 'btn-row' });
  let anyMod = false;
  for (const m of AREA_MODS) {
    if (m.phase > s.phase) continue;
    anyMod = true;
    if (s.land.mods[m.key]) modsBox.appendChild(h('span', { class: 'dim', text: `${m.icon} ${m.label} ✓` }));
    else modsBox.appendChild(cBtn(`${m.icon} ${m.label} (+${Math.round(m.bonus * 100)} %)`, () => areaModCost(s, m.key), () => A.buyAreaMod(s, m.key)));
  }
  if (anyMod) wrap.appendChild(section('Modifikátory rozlohy (globální % bonus)', modsBox));

  // (Rozšiřování skladu se kupuje v záložce Sklad — #38.)

  // DYSONOVA SFÉRA (fáze 7+)
  if (s.phase >= 7) {
    wrap.appendChild(section(`${ICONS.sphere} Dysonova sféra`,
      liveBar(() => s.projects.dyson.progress / dysonTarget(s), () => `${fmt(s.projects.dyson.progress)} / ${fmt(dysonTarget(s))}`, '#c9a227'),
      liveSpan(() => `Hotových sfér: ${s.projects.dyson.count} · stavitelů: ${s.projects.dyson.builders} · energie: ${fmt(s.resources.energy || 0)}`, 'dim small'),
      autobuyToggle('Automaticky stavět (stavitelé + dokončovat sféry)', 'sphere'),
      h('div', { class: 'btn-row' },
        cBtn(`${ICONS.builder} + Stavitel`, () => A.costFor(s, 'builder'), () => A.buyBuilder(s), () => `+${(BALANCE.dyson.builderRate * 100).toFixed(0)} % rychlost stavby`),
        aBtn(`${ICONS.sphere} Dokončit sféru!`, () => sphereReady(s), () => A.doClaimSphere(s), () => 'sféra ještě není hotová'),
        s.phase >= 8 ? cBtn(`${ICONS.laser} + Laser`, () => A.costFor(s, 'laser'), () => A.buyLaser(s), () => '+50 % rychlost stavby') : null)));
  }
  return wrap;
}

// Pastviny (#63): bobky a hnojení. Kvalita půdy (per stádo) zvedá kapacitu pastvin.
function renderPastures(s) {
  const g = group();
  const wrap = h('div', {});
  if (s.groups.length > 1) {
    wrap.appendChild(section('Stádo',
      h('select', { onchange: e => { s.activeGroupId = +e.target.value; rebuildPanel(); } },
        ...s.groups.map(x => h('option', { value: x.id, ...(x.id === g.id ? { selected: 'selected' } : {}) }, `${x.name} (${fmtCount(totalCount(x))})`)))));
  }

  // přehled kvality půdy + zásoby bobků
  wrap.appendChild(section(ICONS.soil + ' Kvalita půdy',
    liveBar(() => group().soil.q, () => {
      const q = group().soil.q;
      return `Pohnojení ${(q * 100).toFixed(0)} % → kapacita +${(SOIL.maxBonus * q * 100).toFixed(0)} %`;
    }, '#8a6d3b'),
    liveSpan(() => {
      const snap = soilSnapshot(group(), s);
      const tr = snap.target > snap.q + 0.01 ? ' ▲ stoupá' : snap.target < snap.q - 0.01 ? ' ▼ klesá' : ' ≈ ustáleno';
      return `Saturace${tr}. Bobky: výroba ${fmt(snap.prod)}/s, do půdy ${fmt(snap.toSoil)}/s; pro plné hnojení by půda brala ~${fmt(snap.demand)}/s.`;
    }, 'dim small statusline'),
    liveSpan(() => `${ICONS.bobky} Zásoba bobků: ${fmt(s.resources.bobky || 0)} (přebytek ${fmt(soilSnapshot(group(), s).stored)}/s)`, 'dim small'),
    h('div', { class: 'dim small' }, 'Čím lépe pohnojená půda, tím větší kapacita ovcí. Saturace souvisí s rozlohou půdy (metry), produkce bobků s počtem ovcí — 100 % se blíží až s pokročilou hustotou. Kvalita má setrvačnost: při výpadku pomalu klesá, po návratu zase stoupá.')));

  // hnojení z bobků
  const soil = g.soil;
  wrap.appendChild(section(ICONS.bobky + ' Hnojení z bobků',
    h('label', { class: 'ck' }, h('input', { type: 'checkbox', ...(soil.convert ? { checked: 'checked' } : {}), onchange: e => { A.setSoil(s, g.id, { convert: !!e.target.checked }); onAction(); rebuildPanel(); } }), ' Hnojit pastvinu bobky v reálném čase'),
    h('div', { class: 'ctl-row' },
      liveSpan(() => `Podíl výnosu do půdy: ${Math.round(group().soil.input * 100)} %`),
      h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: soil.input, oninput: e => { A.setSoil(s, g.id, { input: +e.target.value }); } })),
    h('label', { class: 'ck' }, h('input', { type: 'checkbox', ...(soil.useStock ? { checked: 'checked' } : {}), onchange: e => { A.setSoil(s, g.id, { useStock: !!e.target.checked }); onAction(); rebuildPanel(); } }), ' Při nedostatku brát bobky ze zásoby'),
    h('div', { class: 'dim small' }, 'Bobky generuje každá ovce (dítě poloviční, dospělá a stará plné). Přebytek se ukládá do zásoby; ta se použije, když produkce nestačí.')));

  // umělé hnojivo (za kredity)
  const fm = soil.fertMode;
  const fertValueRow = fm === 'off' ? null
    : fm === 'percent'
      ? h('div', { class: 'ctl-row' },
          liveSpan(() => `Podíl příjmu na hnojivo: ${Math.round(group().soil.fertValue * 100)} %`),
          h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: soil.fertValue, oninput: e => { A.setSoil(s, g.id, { fertValue: +e.target.value }); } }))
      : h('div', { class: 'ctl-row' }, 'Kredity/s: ',
          h('input', { type: 'number', min: 0, value: soil.fertValue, style: 'width:120px', onchange: e => { A.setSoil(s, g.id, { fertValue: +e.target.value }); } }));
  wrap.appendChild(section(ICONS.immortality + ' Umělé hnojivo (za kredity)',
    h('div', { class: 'ctl-row' }, 'Režim: ',
      segBtn('Vypnuto', fm === 'off', () => A.setSoil(s, g.id, { fertMode: 'off' })),
      segBtn('% z příjmu', fm === 'percent', () => A.setSoil(s, g.id, { fertMode: 'percent' })),
      segBtn('Pevně /s', fm === 'fixed', () => A.setSoil(s, g.id, { fertMode: 'fixed' }))),
    fertValueRow,
    liveSpan(() => {
      const so = group().soil;
      if (so.fertMode === 'off') return 'Vypnuto — hnojíš jen bobky od ovcí.';
      const income = (s.rates && s.rates._income) || 0;
      const budget = so.fertMode === 'percent' ? so.fertValue * Math.max(0, income) : so.fertValue;
      const manure = SOIL.fert.k * Math.pow(Math.max(0, budget), SOIL.fert.exp);
      return `Utratíš ~${fmt(budget)} kr/s → +${fmt(manure)} bobků/s do půdy. Čím víc utratíš, tím menší přírůstek (křivka se zplošťuje), ale útrata může růst donekonečna.`;
    }, 'dim small statusline'),
    h('div', { class: 'dim small' }, 'Umělé hnojivo doplňuje půdu nezávisle na ovcích — pevnou částkou za sekundu, nebo procentem z příjmu.')));
  return wrap;
}

function renderStorage(s) {
  const wrap = h('div', {});
  // Rozšiřování skladu (přesunuto z Pozemků, #38) vedle ukazatele — strop je per surovina.
  wrap.appendChild(section('Rozšíření skladu',
    h('div', { class: 'btn-row' },
      cBtn(`${ICONS.storage} + Sklad`, () => A.costFor(s, 'warehouse'), () => A.buyWarehouse(s), () => `+${fmt(BALANCE.warehouse.capInc)} kapacity na surovinu`),
      liveSpan(() => `Kapacita na surovinu: ${fmt(resourceCap(s))}`, 'dim')),
    h('div', { class: 'dim small', text: 'Strop platí pro každou surovinu zvlášť. Pozor: jakýkoli nákup vyprázdní sklad.' })));
  const list = h('div', { class: 'list' });
  for (const k of TRADEABLE) {
    if (RESOURCES[k].phase > s.phase) continue;
    const frac = s.storage.autotrade[k] ?? 1;
    list.appendChild(h('div', { class: 'item' },
      h('div', { class: 'item-h' }, h('b', { text: (RES_ICONS[k] || '') + ' ' + RESOURCES[k].label }), liveSpan(() => fmt(s.resources[k] || 0), 'dim')),
      liveBar(() => { const c = resourceCap(s); return c ? Math.min(1, (s.resources[k] || 0) / c) : 0; }, () => `${fmt(s.resources[k] || 0)} / ${fmt(resourceCap(s))}`, '#5b8def'),
      h('div', { class: 'ctl-row' },
        liveSpan(() => `Prodávat: ${((s.storage.autotrade[k] ?? 1) * 100).toFixed(0)} %`),
        h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: frac, oninput: e => { A.setAutotrade(s, k, +e.target.value); } }))));
  }
  wrap.appendChild(section('Suroviny (prodej / sklad po strop)', list));
  return wrap;
}

function renderManager(s) {
  const wrap = h('div', {});
  const list = h('div', { class: 'list' });
  for (const g of s.groups) {
    list.appendChild(h('div', { class: 'item' },
      h('div', { class: 'item-h' }, h('b', { text: g.name }), liveSpan(() => `${fmtCount(totalCount(g))} ovcí`, 'dim')),
      liveSpan(() => `skóre ${(breedingScore(g.genes, s.world.ceilingMult) * 100).toFixed(0)} % · ${g.policy.cull.enabled ? 'selekce: ' + (GENES[g.policy.cull.gene] ? GENES[g.policy.cull.gene].label : 'skóre') : 'bez selekce'}`, 'dim small'),
      h('div', { class: 'btn-row' },
        aBtn('Vybrat', () => s.activeGroupId !== g.id, () => { s.activeGroupId = g.id; activeTab = 'herds'; buildTabs(); }),
        aBtn('Rozdělit', () => totalCount(g) > 4, () => A.doSplitGroup(s, g.id)))));
  }
  wrap.appendChild(section('Stáda', list, aBtn('+ Nové stádo', () => true, () => A.addGroup(s))));
  return wrap;
}

function renderPrestige(s) {
  const wrap = h('div', {});
  if (s.phase >= 10) {
    wrap.appendChild(section('Černá díra',
      h('div', { class: 'dim small', text: 'Nasávej surovou produkci do centrálního skladu, dokud nevznikne černá díra.' }),
      h('label', { class: 'ck' }, h('input', { type: 'checkbox', ...(s.prestige.armed ? { checked: 'checked' } : {}), onchange: () => { A.armBlackHole(s); onAction(); } }), ' Nasávat produkci do skladu'),
      liveBar(() => s.prestige.centralWarehouse / s.prestige.threshold, () => `${fmt(s.prestige.centralWarehouse)} / ${fmt(s.prestige.threshold)}`, '#8a5bef'),
      liveSpan(() => {
        let rate = 0; for (const k of TRADEABLE) rate += (s.rates[k] || 0) * (RESOURCES[k].value || 0);
        const remain = Math.max(0, s.prestige.threshold - s.prestige.centralWarehouse);
        const award = BALANCE.prestige.award(s.prestige.threshold, BALANCE.prestige.blackHoleBase, s.prestige.runs);
        return s.prestige.armed
          ? `Plní se ${fmt(rate)}/s → zažehnutí za ~${etaStr(rate > 0 ? remain / rate : Infinity)} · získáš ~${fmt(award)} ${ICONS.knowledge}`
          : `Po zažehnutí získáš ~${fmt(award)} ${ICONS.knowledge} Vědění`;
      }, 'dim small'),
      aBtn('Zažehnout černou díru (RESET)', () => canIgnite(s), () => A.doIgnite(s), () => 'sklad ještě není plný', 'danger'),
      singularityAvailable(s) ? aBtn('★ Dosáhnout singularity (NG+)', () => true, () => A.doSingularity(s), null, 'danger') : null));
  } else {
    const est = BALANCE.prestige.award(BALANCE.prestige.blackHoleBase, BALANCE.prestige.blackHoleBase, s.prestige.runs);
    wrap.appendChild(section('Černá díra — zatím nedostupné 🔒',
      h('div', { class: 'dim small' }, 'Odemkne se ve fázi 10. Nahromadíš tolik surovin, až se zhroutí v černou díru — a s ní přijde návrat v čase (reset).'),
      h('div', { class: 'dim small' }, `Odhad: první zažehnutí ti dá přibližně ${fmt(est)} Vědění.`),
      h('div', { class: 'dim small' }, 'Za Vědění pak kupuješ trvalé perky níže — každý další běh je rychlejší.')));
  }
  const perks = h('div', {});
  perks.appendChild(liveSpan(() => `${ICONS.knowledge} Vědění: ${fmt(s.prestige.knowledge || 0)} · resetů: ${s.prestige.runs}`, 'dim'));
  for (const bk in PERK_BRANCHES) {
    const br = PERK_BRANCHES[bk];
    perks.appendChild(h('div', { class: 'branch-h' }, `${br.icon} ${br.label}`, h('span', { class: 'dim small', text: ' — ' + br.desc })));
    for (const k of Object.keys(PERKS).filter(x => PERKS[x].branch === bk)) {
      const p = PERKS[k];
      perks.appendChild(h('div', { class: 'item' },
        h('div', { class: 'item-h' }, h('b', { text: p.label }), liveSpan(() => `Lv ${s.prestige.perks[k] || 0}`, 'dim')),
        h('div', { class: 'dim small', text: p.desc }),
        aBtn(`Koupit (${fmt(perkCost(s, k))} ${ICONS.knowledge})`, () => (s.prestige.knowledge || 0) >= perkCost(s, k), () => A.buyPerk(s, k))));
    }
  }
  wrap.appendChild(section('Větve perků (různé buildy pro příští běh)', perks));
  return wrap;
}

function renderStats(s) {
  const hrs = (x) => (x / 3600).toFixed(2) + ' h';
  const rows = [
    ['Fáze', () => `${s.phase} — ${phaseName(s)}`],
    ['Čas v běhu', () => hrs(s.meta.gameTime)],
    ['Čas celkem (všechny běhy)', () => hrs(s.meta.totalGameTime)],
    ['Resetů (černá díra)', () => String(s.prestige.runs)],
    ['Vlna celkem', () => fmt(s.stats.woolLifetime)],
    ['Mléko celkem', () => fmt(s.stats.milkLifetime)],
    ['Maso celkem', () => fmt(s.stats.meatLifetime)],
    ['Kredity celkem', () => fmt(s.stats.credLifetime)],
    ['Narozeno celkem', () => fmtCount(s.stats.born)],
    ['Uhynulo stářím', () => fmtCount(s.stats.died)],
    ['Poraženo', () => fmtCount(s.stats.culled)],
    ['Vrchol populace', () => fmtCount(s.stats.peakPop)],
  ];
  return section('Statistiky', h('table', { class: 'stats' },
    ...rows.map(([a, fn]) => h('tr', {}, h('td', { class: 'dim', text: a }), h('td', {}, liveSpan(fn))))));
}

function achRow(a, done) {
  return h('div', { class: 'item' + (done ? ' done' : '') },
    h('div', { class: 'item-h' }, h('b', { text: (done ? '🏆 ' : '🔒 ') + a.name }), a.bonus ? h('span', { class: 'dim', text: `+${Math.round(a.bonus * 100)} %` }) : null),
    h('div', { class: 'dim small', text: a.desc }));
}
function renderKronika(s) {
  const wrap = h('div', {});
  const titles = unlockedTitles(s);
  wrap.appendChild(section('Tituly',
    titles.length ? h('div', { class: 'dim' }, titles.join('  ·  ')) : h('div', { class: 'dim', text: 'Zatím žádné — odemykají se milníky.' }),
    liveSpan(() => `Trvalý bonus z milníků: ×${(s.world.achievementMult || 1).toFixed(2)} k veškeré produkci`, 'dim small')));
  const done = ACHIEVEMENTS.filter(a => s.achievements[a.id]);
  const todo = ACHIEVEMENTS.filter(a => !s.achievements[a.id]);
  const list = h('div', { class: 'list' });
  for (const a of done) list.appendChild(achRow(a, true));
  for (const a of todo) list.appendChild(achRow(a, false));
  wrap.appendChild(section(`Milníky (${done.length}/${ACHIEVEMENTS.length})`, list));
  return wrap;
}

// --- jádro: build vs in-place refresh --------------------------------------
function structSigOf(s) {
  const land = WORLD_ORDER.map(wk => s.land.worlds[wk].tier).join(',') + ':' + s.land.density + ':' + Object.keys(s.land.mods).length;
  return [activeTab, s.phase, s.groups.length, land, s.activeGroupId,
    storageEnabled(s) ? 1 : 0, s.flags.immortal ? 1 : 0, sphereReady(s) ? 1 : 0,
    singularityAvailable(s) ? 1 : 0, s.phase >= 10 ? 1 : 0].join('|');
}
function refreshPanel() {
  for (const u of updaters) { try { u(); } catch (e) { /* prvek mohl zmizet */ } }
  // zvýrazni nejlevnější dostupný nákup (další nejlepší krok)
  if (!panelEl) return;
  const btns = panelEl.querySelectorAll('button');
  let best = null;
  for (const b of btns) { if (b._cost == null) continue; if (!b.disabled && (best == null || b._cost < best._cost)) best = b; }
  for (const b of btns) { if (b._cost == null) continue; setClass(b, 'best', b === best); }
}
// Obsah modálu „nová fáze" (#35): tag + název + lore + nově odemčený obsah.
// Tlačítko „Pokračovat" doplní sám modál (showNextModal), proto tu není.
function phaseModalContent(phase) {
  const info = PHASE_INFO[phase];
  const name = (PHASES[phase] && PHASES[phase].name) || '';
  return h('div', {},
    h('div', { class: 'modal-tag', text: `Nová fáze ${phase}` }),
    h('h2', { text: (PHASE_ICONS[phase] || '') + ' ' + name }),
    info ? h('div', { class: 'modal-lore', text: info.lore }) : null,
    info && info.unlocks ? h('div', {}, h('div', { class: 'dim small', text: 'Nově odemčeno:' }),
      h('ul', { class: 'unlocks' }, ...info.unlocks.map(u => h('li', { text: u })))) : null);
}
function rebuildPanel() {
  if (!panelEl) return;
  let tab = TABS.find(t => t.id === activeTab) || TABS[0];
  if (!tab.avail(S)) { activeTab = 'herds'; tab = TABS[0]; }
  updaters = [];
  clear(panelEl);
  if (phaseBannerQueue.length) panelEl.appendChild(phaseBannerEl(phaseBannerQueue[0]));   // #35
  panelEl.appendChild(tab.render(S));
  structSig = structSigOf(S);
  refreshPanel();
}

// --- horní nástroje (#32): rada/tip, nastavení, o hře ----------------------
// Žárovka „svítí", když doporučený krok jde rovnou provést (něco výhodného koupit).
function stepActionable(s) { return /^(Kup:|★|Zažehni|Dokonči|Vyrob)/.test(A.suggestStep(s)); }

const TIPS = [
  'Zprvu dokupuj ovce — vlastní množení je pomalé. Jakmile vyšlechtíš nižší Březost a rozrosteš stádo, množení nákup předežene (a trh ovcí dojde).',
  'Samec dává kapacitu páření: 1 samec spáří zhruba tolik samic, kolik je Plodnost. Drž poměr samců, ať porody nebrzdí nedostatek beranů.',
  'Šlechtění (Genetika) zvedá průměr μ a utahuje rozptyl σ. Vyber gen a přísnost — nejhorší jehňata padnou rovnou na maso.',
  'Kapacitu pastvin zvyšuješ rozlohou × hustotou × modifikátory (Pozemky). Když je skoro plno, ukazatel zezlátne.',
  'S městskými pozemky se odemkne Laboratoř (zpracování, dojení, mozky) a Jatka (automatika porážek).',
  'V Jatkách zapni „porážku před zestárnutím" — stará ovce dává míň masa, takhle z ní dostaneš plný výnos.',
  'Zpracování v Laboratoři mění vlnu na sukno a mléko na sýr — prodá se dráž. Kupuj Tkalcovny.',
  'Od fáze 6 funguje sklad s autotrade (strop pro každou surovinu zvlášť): vypni prodej a zboží se střádá. Pozor: jakýkoli nákup sklad vyprázdní.',
  'Před černou dírou (fáze 10) zapni „Nasávat produkci" a nech sklad naplnit — pak zažehni a získáš Vědění na trvalé perky.',
];

function openModalNode(node) {
  if (!root) return;
  closeInfoModal();
  const card = h('div', { class: 'modal' }, h('button', { class: 'modal-x', title: 'Zavřít', onclick: closeInfoModal }, '×'), node);
  infoModalEl = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === infoModalEl) closeInfoModal(); } }, card);
  root.appendChild(infoModalEl);
}
function closeInfoModal() {
  if (infoModalEl && root) { try { root.removeChild(infoModalEl); } catch (e) { /* ignore */ } }
  infoModalEl = null;
}

function openTipModal() {
  const tipBox = h('div', { class: 'modal-lore' });
  const setTip = () => { tipBox.textContent = TIPS[((tipIdx % TIPS.length) + TIPS.length) % TIPS.length]; };
  setTip();
  openModalNode(h('div', {},
    h('h2', { text: '💡 Rada pastýře' }),
    h('div', { class: 'dim small', text: 'Co se teď nejvíc vyplatí:' }),
    h('div', { class: 'tip-step', text: '➤ ' + A.suggestStep(S) }),
    h('div', { class: 'dim small', text: 'Tip:' }),
    tipBox,
    h('button', { class: 'act', onclick: () => { tipIdx++; setTip(); } }, 'Další tip')));
}

function openSettingsModal() {
  const field = h('input', { placeholder: 'sem vlož save string pro načtení…' });
  const msg = h('div', { class: 'dim small' });
  const expBtn = h('button', { class: 'act', onclick: () => {
    const str = hooks.exportSave ? hooks.exportSave() : '';
    field.value = str; if (field.setAttribute) field.setAttribute('value', str);
    msg.textContent = 'Save string je v poli níže (zálohuj si ho).';
    try { globalThis.navigator?.clipboard?.writeText(str); msg.textContent = 'Zkopírováno do schránky.'; } catch (e) { /* ignore */ }
  } }, '⬇ Export (kopírovat)');
  const impBtn = h('button', { class: 'act', onclick: () => {
    const str = (field.value || '').trim();
    if (!str) { msg.textContent = 'Vlož nejdřív save string do pole.'; return; }
    try { if (hooks.importSave) hooks.importSave(str); } catch (e) { msg.textContent = 'Chyba načtení: ' + e.message; }
  } }, '⬆ Načíst');
  const resetBtn = h('button', { class: 'act danger', onclick: () => { if (hooks.resetGame) hooks.resetGame(); } }, 'Reset hry (smazat postup)');
  openModalNode(h('div', {},
    h('h2', { text: '⚙ Nastavení' }),
    h('div', { class: 'dim small', text: 'Export uloží celý stav hry jako text (záloha / přenos na jiné zařízení). Načíst obnoví hru z takového textu.' }),
    h('div', { class: 'btn-row' }, expBtn, impBtn),
    field, msg,
    h('div', { class: 'sect-div' }),
    h('div', { class: 'dim small', text: 'Nebezpečná zóna — reset smaže veškerý postup:' }),
    resetBtn));
}

function openAboutModal() {
  openModalNode(h('div', {},
    h('h2', { text: '❓ O hře' }),
    h('div', { class: 'modal-lore', text: 'Incremental Sheep — idle hra o stádu, které tě dovede od první ostříhané ovce až k singularitě. Vanilková JavaScript hra bez buildu.' }),
    h('div', { class: 'about-row' }, h('span', { class: 'dim', text: 'Autor' }), h('span', { text: 'procmadatelzobak' })),
    h('div', { class: 'about-row' }, h('span', { class: 'dim', text: 'Verze save' }), h('span', { text: String(VERSION) })),
    h('div', { class: 'btn-row', style: 'margin-top:12px' },
      h('a', { class: 'about-link', href: 'https://github.com/procmadatelzobak/incremental-sheep', target: '_blank', rel: 'noopener' }, '🐙 GitHub'),
      h('a', { class: 'about-link', href: 'lore/README.md', target: '_blank', rel: 'noopener' }, '📜 Bible Farmářova'))));
}

// --- veřejné API -----------------------------------------------------------
export function initUI(state, mountId = 'app', actionCb = () => {}, opts = {}) {
  S = state; onAction = actionCb; hooks = opts || {}; activeTab = 'herds'; upgradeFilter = 'all';
  root = document.getElementById(mountId);
  clear(root);
  hud = h('div', { class: 'hud', id: 'hud' });
  tabsBar = h('div', { class: 'tabs', id: 'tabs' });
  panelEl = h('div', { class: 'panel', id: 'panel' });
  bannerEl = h('div', { class: 'banner', id: 'banner', style: 'display:none' });
  root.appendChild(bannerEl); root.appendChild(hud); root.appendChild(tabsBar); root.appendChild(panelEl);
  lastTabSig = ''; structSig = '';
  modalEl = null; infoModalEl = null; toastWrap = null; modalQueue.length = 0; phaseBannerQueue.length = 0;
  buildHud(); updateHud(state); buildTabs(); rebuildPanel();
}

// volá main každý frame — jen aktualizuje hodnoty; strukturu překreslí při změně
export function updateUI(state) {
  S = state;
  updateHud(state);
  const tsig = TABS.filter(t => t.avail(state)).map(t => t.id).join(',');
  if (tsig !== lastTabSig) { lastTabSig = tsig; buildTabs(); }
  const ssig = structSigOf(state);
  if (ssig !== structSig) rebuildPanel();
  else refreshPanel();
}

export function showBanner(text) {
  if (!bannerEl) return;
  bannerEl.textContent = text;
  bannerEl.style.display = '';
  setTimeout(() => { if (bannerEl) bannerEl.style.display = 'none'; }, 8000);
}

// --- modály (vstup do fáze) a toasty (milníky) -----------------------------
function showNextModal() {
  if (modalEl || !modalQueue.length || !root) return;
  const content = modalQueue.shift();
  const card = h('div', { class: 'modal' }, content, h('button', { class: 'act', onclick: closeModal }, 'Pokračovat'));
  modalEl = h('div', { class: 'modal-bg' }, card);
  root.appendChild(modalEl);
}
function closeModal() {
  if (modalEl && root) { try { root.removeChild(modalEl); } catch (e) { /* ignore */ } }
  modalEl = null;
  showNextModal();
}

// #35: inline „karta" v aktivním panelu (NE modal). Fronta zvládne víc fází po sobě.
function phaseBannerEl(phase) {
  return h('div', { class: 'sect phase-banner' },
    phaseModalContent(phase),
    h('button', { class: 'act primary', onclick: () => { phaseBannerQueue.shift(); rebuildPanel(); } }, 'Pokračovat'));
}
export function notifyPhase(phase) {
  phaseBannerQueue.push(phase);
  if (panelEl) rebuildPanel();
}

function showToast(text) {
  if (!root) return;
  if (!toastWrap) { toastWrap = h('div', { class: 'toasts', id: 'toasts' }); root.appendChild(toastWrap); }
  const t = h('div', { class: 'toast', text });
  toastWrap.appendChild(t);
  setTimeout(() => { if (toastWrap) { try { toastWrap.removeChild(t); } catch (e) { /* ignore */ } } }, 4500);
}
export function notifyAchievement(id) {
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return;
  showToast(`🏆 ${a.name}` + (a.bonus ? `  (+${Math.round(a.bonus * 100)} %)` : ''));
}

// Návratová obrazovka po offline (souhrn z applyOffline).
export function showOfflineModal(o, state) {
  if (!o) return;
  const mins = Math.max(1, Math.round(o.seconds / 60));
  const row = (label, val) => h('div', { class: 'stat-row' }, h('span', { class: 'dim', text: label }), h('span', { text: val }));
  const content = h('div', {},
    h('div', { class: 'modal-tag', text: 'Vítej zpět' }),
    h('h2', { text: `Byl jsi pryč ~${mins} min` }),
    row('Vyděláno kreditů', '+' + fmt(o.credits)),
    o.popDelta ? row('Změna stáda', (o.popDelta >= 0 ? '+' : '') + fmt(o.popDelta)) : null,
    o.born ? row('Narozeno', '+' + fmt(o.born)) : null,
    row('Vlna', '+' + fmt(o.wool)),
    state.phase >= 2 ? row('Mléko', '+' + fmt(o.milk)) : null,
    row('Maso', '+' + fmt(o.meat)),
    h('div', { class: 'modal-lore', text: '➤ ' + A.suggestStep(state) }));
  modalQueue.push(content);
  showNextModal();
}
