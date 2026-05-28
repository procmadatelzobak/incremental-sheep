// ===========================================================================
//  UI: HUD + záložky + panely. Dashboard-first, plátno jako akcent.
//  Bez blikání: panel se staví JEDNOU, každý frame se jen aktualizují hodnoty
//  na místě (čísla, lišty, dostupnost). Struktura se překreslí jen při změně
//  (nákup, přepnutí záložky, nová lokace/fáze).
// ===========================================================================
import { fmt } from '../format.js';
import * as A from '../econ/actions.js';
import { upgradeCost, perkCost } from '../econ/economy.js';
import { UPGRADES, PERKS, GENES, RESOURCES, BALANCE } from '../config.js';
import { totalCount, totalPopulation } from '../sim/cohort.js';
import { locationCap, locKind, herdCapacity } from '../content/locations.js';
import { phaseName, phaseHint, PHASE_INFO, PHASES } from '../content/phases.js';
import { breedingScore, geneMin, geneMax } from '../sim/genetics.js';
import { combinedCap, storedTradeTotal, TRADEABLE, storageEnabled } from '../econ/storage.js';
import { sphereReady, dysonTarget } from '../content/projects.js';
import { canIgnite, singularityAvailable } from '../content/prestige.js';
import { ACHIEVEMENTS, unlockedTitles } from '../content/achievements.js';
import { drawHerd } from '../render/canvas.js';

let root, hud, tabsBar, panelEl, bannerEl, activeTab = 'herds', lastTabSig = '', structSig = '';
let updaters = [];           // aktualizace hodnot aktivního panelu (běží každý frame)
let S, onAction = () => {};
let modalEl = null; const modalQueue = []; let toastWrap = null; const visitedTabs = new Set();
let herdCanvasEl = null;

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

// --- "živé" prvky: postaví se jednou, hodnota se obnoví v refreshPanel() ----
function reg(el, fn) { updaters.push(() => fn(el)); return el; }

function cBtn(label, costFn, actFn) {
  const b = h('button', { class: 'act cost' });
  b.addEventListener('click', () => { if (actFn() !== false) { onAction(); flashChip('credits'); rebuildPanel(); } });
  return reg(b, (el) => { const c = costFn(); el._cost = c; el.textContent = `${label} (${fmt(c)})`; el.disabled = (S.resources.credits || 0) < c; });
}
function aBtn(label, enabledFn, actFn) {
  const b = h('button', { class: 'act', text: label });
  b.addEventListener('click', () => { if (actFn() !== false) { onAction(); rebuildPanel(); } });
  return reg(b, (el) => { el.disabled = !enabledFn(); });
}
function autobuyToggle(label, key) {
  const on = (S.settings.autobuy || {})[key];
  return h('label', { class: 'ck auto' },
    h('input', { type: 'checkbox', ...(on ? { checked: 'checked' } : {}), onchange: e => { A.setAutobuy(S, key, !!e.target.checked); onAction(); } }),
    ' ⚙ ' + label);
}
function presetBtn(label, gene, gid) {
  const b = h('button', { class: 'act preset', text: label });
  b.addEventListener('click', () => { A.setCull(S, gid, { enabled: true, gene, stage: 'adult', cutFrac: 0.3 }); onAction(); rebuildPanel(); });
  return b;
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
let hudChips = {}, hudEp, hudPhase, hudHint, hudStep;
function buildHud() {
  clear(hud);
  hudEp = h('b', {}); hudPhase = h('span', { class: 'dim' });
  hudHint = h('div', { class: 'hud-hint' });
  hudStep = h('div', { class: 'hud-step' });
  const chips = h('div', { class: 'chips' });
  hudChips = {};
  for (const [k, lab] of [['credits', 'Kredity'], ['pop', 'Ovce'], ['wool', 'Vlna/s'], ['milk', 'Mléko/s'], ['meat', 'Maso/s'], ['compute', 'Výpočet/s'], ['knowledge', 'Vědění']]) {
    const val = h('span', { class: 'chip-v', text: '0' });
    const chip = h('div', { class: 'chip' }, h('span', { class: 'chip-l', text: lab }), val);
    hudChips[k] = { chip, val }; chips.appendChild(chip);
  }
  hud.appendChild(h('div', { class: 'hud-title' }, hudEp, hudPhase));
  hud.appendChild(hudHint); hud.appendChild(hudStep); hud.appendChild(chips);
}
function updateHud(s) {
  if (!hud) return;
  hudEp.textContent = s.meta.epithet;
  hudPhase.textContent = `  •  Fáze ${s.phase}: ${phaseName(s)}`;
  hudHint.textContent = '› ' + phaseHint(s);
  hudStep.textContent = '➤ ' + A.suggestStep(s);
  const r = s.rates || {};
  const set = (k, txt, show) => { const c = hudChips[k]; if (!c) return; c.chip.style.display = show ? '' : 'none'; c.val.textContent = txt; };
  set('credits', fmt(s.resources.credits || 0), true);
  set('pop', fmt(r._pop || 0), true);
  set('wool', fmt(r.wool || 0), true);
  set('milk', fmt(r.milk || 0), s.phase >= 2);
  set('meat', fmt(r.meat || 0), true);
  set('compute', fmt(r.compute || 0), s.phase >= 5);
  set('knowledge', fmt(s.prestige.knowledge || 0), (s.prestige.knowledge || 0) > 0 || s.phase >= 10);
}

// --- ZÁLOŽKY ---------------------------------------------------------------
const TABS = [
  { id: 'herds', label: 'Stáda', avail: () => true, render: renderHerds },
  { id: 'upgrades', label: 'Vylepšení', avail: () => true, render: renderUpgrades },
  { id: 'stations', label: 'Stanice', avail: () => true, render: renderStations },
  { id: 'storage', label: 'Sklad', avail: s => s.phase >= 6, render: renderStorage },
  { id: 'manager', label: 'Manažer', avail: s => s.phase >= 9, render: renderManager },
  { id: 'prestige', label: 'Prestiž', avail: s => s.phase >= 7 || (s.prestige.knowledge || 0) > 0 || s.prestige.runs > 0, render: renderPrestige },
  { id: 'kronika', label: 'Kronika', avail: () => true, render: renderKronika },
  { id: 'stats', label: 'Staty', avail: () => true, render: renderStats },
];
function buildTabs() {
  clear(tabsBar);
  for (const t of TABS) {
    const isNew = t.avail(S) && !visitedTabs.has(t.id) && t.id !== activeTab;
    const b = h('button', { class: 'tab' + (t.id === activeTab ? ' active' : '') + (isNew ? ' pulse' : ''), onclick: () => { if (activeTab !== t.id) { visitedTabs.add(t.id); activeTab = t.id; buildTabs(); rebuildPanel(); } } }, t.label);
    if (!t.avail(S)) b.style.display = 'none';
    tabsBar.appendChild(b);
  }
  visitedTabs.add(activeTab);
}

// --- PANELY (staví strukturu jednou; hodnoty přes reg()) -------------------
function section(title, ...kids) { return h('div', { class: 'sect' }, h('h3', { text: title }), ...kids); }

function renderHerds(s) {
  const g = group();
  const wrap = h('div', {});
  const loc = s.locations.find(l => l.id === g.locationId) || s.locations[0];

  if (s.groups.length > 1) {
    wrap.appendChild(section('Stádo',
      h('select', { onchange: e => { s.activeGroupId = +e.target.value; rebuildPanel(); } },
        ...s.groups.map(x => h('option', { value: x.id, ...(x.id === g.id ? { selected: 'selected' } : {}) }, `${x.name} (${fmt(totalCount(x))})`)))));
  }

  const cv = h('canvas', { class: 'herdcanvas', width: 280, height: 90 });
  herdCanvasEl = cv;
  reg(cv, (el) => drawHerd(el, group()));
  const sheepBtn = cBtn('+ Ovce', () => A.costFor(s, 'addSheep'), () => A.buyAddSheep(s));
  sheepBtn.addEventListener('click', () => flashEl(herdCanvasEl));
  wrap.appendChild(section(`${g.name} — ${loc.name}`,
    cv,
    h('div', { class: 'stat-row' },
      liveSpan(() => `Ovce: ${fmt(totalPopulation(s))} / ${fmt(herdCapacity(s))}`),
      liveSpan(() => `Skóre: ${(breedingScore(group().genes, s.world.ceilingMult) * 100).toFixed(0)} %`)),
    h('div', { class: 'stat-row dim' },
      liveSpan(() => `Děti ${fmt(group().counts.M.child + group().counts.F.child)}`),
      liveSpan(() => `Dospělí ${fmt(group().counts.M.adult + group().counts.F.adult)}`),
      liveSpan(() => `Staří ${fmt(group().counts.M.old + group().counts.F.old)}`)),
    liveBar(() => totalPopulation(s) / herdCapacity(s), () => 'naplnění (všechny pozemky)'),
    h('div', { class: 'dim small' }, 'Kapacita = součet všech pozemků. Kupuj/rozšiřuj louky a pastviny v záložce Stanice.'),
    sheepBtn,
    autobuyToggle('Automaticky kupovat ovce', 'sheep')));

  const genes = h('div', { class: 'genes' });
  for (const k in GENES) if (GENES[k].phase <= s.phase) genes.appendChild(geneBar(k));
  wrap.appendChild(section('Geny (μ • rozptyl σ)', genes));

  if (s.phase >= 2) {
    const cull = g.policy.cull;
    const geneOpts = [h('option', { value: 'breedingScore', ...(cull.gene === 'breedingScore' ? { selected: 'selected' } : {}) }, 'Celkové skóre'),
      ...Object.keys(GENES).filter(k => GENES[k].phase <= s.phase).map(k => h('option', { value: k, ...(cull.gene === k ? { selected: 'selected' } : {}) }, GENES[k].label))];
    const stageOpts = ['adult', 'old', 'child'].map(st => h('option', { value: st, ...(cull.stage === st ? { selected: 'selected' } : {}) }, { adult: 'dospělí', old: 'staří', child: 'děti' }[st]));
    wrap.appendChild(section('Šlechtění (selekce)',
      h('label', { class: 'ck' }, h('input', { type: 'checkbox', ...(cull.enabled ? { checked: 'checked' } : {}), onchange: e => { A.setCull(s, g.id, { enabled: !!e.target.checked }); onAction(); } }), ' Zapnout selekci'),
      h('div', { class: 'ctl-row' }, 'Cíl: ', h('select', { onchange: e => { A.setCull(s, g.id, { gene: e.target.value }); } }, ...geneOpts),
        ' ve stádiu ', h('select', { onchange: e => { A.setCull(s, g.id, { stage: e.target.value }); } }, ...stageOpts)),
      h('div', { class: 'ctl-row' },
        liveSpan(() => `Useknout nejhorších: ${(group().policy.cull.cutFrac * 100).toFixed(0)} %`),
        h('input', { type: 'range', min: 0, max: BALANCE.maxCutFrac, step: 0.05, value: cull.cutFrac, oninput: e => { A.setCull(s, g.id, { cutFrac: +e.target.value }); } })),
      h('div', { class: 'ctl-row' }, 'Strategie: ',
        presetBtn('Vlna', 'woolRate', g.id), presetBtn('Množení', 'gestation', g.id), presetBtn('Maso', 'size', g.id),
        s.phase >= 5 ? presetBtn('Inteligence', 'intelligence', g.id) : null, presetBtn('Vše', 'breedingScore', g.id)),
      h('div', { class: 'dim small' }, 'Selekce zvedá μ a utahuje σ; mutace ji doplňuje → šlechtit lze napořád. Rychlá březost množí rychleji, kvalitní vlna nese víc kreditů; ve fázi 9 rozděl stáda a specializuj je (Manažer).')));

    wrap.appendChild(section('Automatika',
      h('label', { class: 'ck' }, h('input', { type: 'checkbox', ...(g.policy.killOld ? { checked: 'checked' } : {}), onchange: () => { A.togglePolicy(s, g.id, 'killOld'); onAction(); } }), ' Porážet staré (maso)'),
      h('label', { class: 'ck' }, h('input', { type: 'checkbox', ...(g.policy.killMaleChildren ? { checked: 'checked' } : {}), onchange: () => { A.togglePolicy(s, g.id, 'killMaleChildren'); onAction(); } }), ' Porážet samce-děti'),
      h('div', { class: 'ctl-row' }, 'Max samců (0 = bez limitu): ',
        h('input', { type: 'number', min: 0, value: g.policy.maxMales, style: 'width:80px', onchange: e => { A.setMaxMales(s, g.id, +e.target.value); } }))));
  }

  if (s.phase === 4 && !s.flags.immortal) {
    wrap.appendChild(section('Nápoj nesmrtelnosti',
      h('div', { class: 'dim' }, 'Z ovčího mléka. Po vypití získáš čas na pokročilou genetiku.'),
      cBtn('Vyrobit nápoj nesmrtelnosti', () => A.costFor(s, 'immortality'), () => A.craftImmortality(s))));
  }
  return wrap;
}

function renderUpgrades(s) {
  const wrap = h('div', {});
  const list = h('div', { class: 'list' });
  let any = false;
  for (const k in UPGRADES) {
    const u = UPGRADES[k];
    if (u.phase > s.phase) continue;
    any = true;
    list.appendChild(h('div', { class: 'item' },
      h('div', { class: 'item-h' }, h('b', { text: u.label }), liveSpan(() => `Lv ${s.upgrades[k] || 0}`, 'dim')),
      h('div', { class: 'dim small', text: u.desc }),
      cBtn('Koupit', () => upgradeCost(s, k), () => A.buyUpgrade(s, k))));
  }
  wrap.appendChild(section('Vylepšení',
    autobuyToggle('Automaticky kupovat vylepšení', 'upgrades'),
    any ? list : h('div', { class: 'dim', text: 'Zatím nic.' })));
  return wrap;
}

function renderStations(s) {
  const wrap = h('div', {});
  const list = h('div', { class: 'list' });
  for (const loc of s.locations) {
    list.appendChild(h('div', { class: 'item' },
      h('div', { class: 'item-h' }, h('b', { text: loc.name }), h('span', { class: 'dim', text: locKind(loc).label })),
      liveSpan(() => `Kapacita +${fmt(locationCap(loc))} · úroveň ${loc.level} · hustota ${loc.density}`, 'dim small'),
      h('div', { class: 'btn-row' },
        cBtn('Rozšířit', () => A.costFor(s, 'expand', loc), () => A.buyExpand(s, loc.id)),
        loc.density < BALANCE.density.max ? cBtn('Hustota', () => A.costFor(s, 'density', loc), () => A.buyDensity(s, loc.id)) : h('span', { class: 'dim', text: 'hustota max' }))));
  }
  wrap.appendChild(section('Lokace',
    liveSpan(() => `Celková kapacita: ${fmt(totalPopulation(s))} / ${fmt(herdCapacity(s))} ovcí`, 'dim'),
    list));

  const buys = h('div', { class: 'btn-row' });
  if (s.phase >= 2) buys.appendChild(cBtn('+ Pastvina', () => A.costFor(s, 'newPasture'), () => A.buyNewPasture(s)));
  if (s.phase >= 6) {
    buys.appendChild(cBtn('+ Stanice (planeta)', () => A.costFor(s, 'station'), () => A.buyStation(s)));
    buys.appendChild(cBtn('+ Sklad', () => A.costFor(s, 'warehouse'), () => A.buyWarehouse(s)));
    buys.appendChild(cBtn('+ Kyslík', () => A.costFor(s, 'oxygen'), () => A.buyOxygen(s)));
  }
  wrap.appendChild(section('Expanze', buys,
    autobuyToggle('Automaticky rozšiřovat pozemky' + (s.phase >= 6 ? ' (+ stanice, sklad, kyslík)' : ' (louky, pastviny, hustota)'), 'land'),
    s.phase >= 6 ? liveSpan(() => `Kyslíková kapacita: ${fmt(s.buys.oxygen * BALANCE.oxygenPerLevel)} (pro Měsíc).`, 'dim small') : null));

  if (s.phase >= 7) {
    wrap.appendChild(section('Dysonova sféra',
      liveBar(() => s.projects.dyson.progress / dysonTarget(s), () => `${fmt(s.projects.dyson.progress)} / ${fmt(dysonTarget(s))}`, '#c9a227'),
      liveSpan(() => `Hotových sfér: ${s.projects.dyson.count} · stavitelů: ${s.projects.dyson.builders} · energie: ${fmt(s.resources.energy || 0)}`, 'dim small'),
      autobuyToggle('Automaticky stavět (stavitelé + dokončovat sféry)', 'sphere'),
      h('div', { class: 'btn-row' },
        cBtn('+ Stavitel', () => A.costFor(s, 'builder'), () => A.buyBuilder(s)),
        aBtn('Dokončit sféru!', () => sphereReady(s), () => A.doClaimSphere(s)),
        s.phase >= 8 ? cBtn('+ Laser', () => A.costFor(s, 'laser'), () => A.buyLaser(s)) : null)));
  }
  return wrap;
}

function renderStorage(s) {
  const wrap = h('div', {});
  wrap.appendChild(section('Společný sklad',
    liveBar(() => { const c = combinedCap(s); return c ? storedTradeTotal(s) / c : 0; }, () => `${fmt(storedTradeTotal(s))} / ${fmt(combinedCap(s))}`, '#5b8def'),
    h('div', { class: 'dim small', text: 'Pozor: jakýkoli nákup vyprázdní sklad.' })));
  const list = h('div', { class: 'list' });
  for (const k of TRADEABLE) {
    if (RESOURCES[k].phase > s.phase) continue;
    const frac = s.storage.autotrade[k] ?? 1;
    list.appendChild(h('div', { class: 'item' },
      h('div', { class: 'item-h' }, h('b', { text: RESOURCES[k].label }), liveSpan(() => fmt(s.resources[k] || 0), 'dim')),
      h('div', { class: 'ctl-row' },
        liveSpan(() => `Prodávat: ${((s.storage.autotrade[k] ?? 1) * 100).toFixed(0)} %`),
        h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: frac, oninput: e => { A.setAutotrade(s, k, +e.target.value); } }))));
  }
  wrap.appendChild(section('Autotrade (zbytek se střádá)', list));
  return wrap;
}

function renderManager(s) {
  const wrap = h('div', {});
  const list = h('div', { class: 'list' });
  for (const g of s.groups) {
    const loc = s.locations.find(l => l.id === g.locationId);
    list.appendChild(h('div', { class: 'item' },
      h('div', { class: 'item-h' }, h('b', { text: g.name }), liveSpan(() => `${fmt(totalCount(g))} ovcí`, 'dim')),
      liveSpan(() => `${loc ? loc.name : '?'} · skóre ${(breedingScore(g.genes, s.world.ceilingMult) * 100).toFixed(0)} %`, 'dim small'),
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
      aBtn('Zažehnout černou díru (RESET)', () => canIgnite(s), () => A.doIgnite(s)),
      singularityAvailable(s) ? aBtn('★ Dosáhnout singularity (NG+)', () => true, () => A.doSingularity(s)) : null));
  } else {
    const est = BALANCE.prestige.award(BALANCE.prestige.blackHoleBase, BALANCE.prestige.blackHoleBase, s.prestige.runs);
    wrap.appendChild(section('Černá díra — zatím nedostupné 🔒',
      h('div', { class: 'dim small' }, 'Odemkne se ve fázi 10. Nahromadíš tolik surovin, až se zhroutí v černou díru — a s ní přijde návrat v čase (reset).'),
      h('div', { class: 'dim small' }, `Odhad: první zažehnutí ti dá přibližně ${fmt(est)} Vědění.`),
      h('div', { class: 'dim small' }, 'Za Vědění pak kupuješ trvalé perky níže — každý další běh je rychlejší.')));
  }
  const perks = h('div', {});
  perks.appendChild(liveSpan(() => `Vědění: ${fmt(s.prestige.knowledge || 0)} · resetů: ${s.prestige.runs}`, 'dim'));
  for (const k in PERKS) {
    const p = PERKS[k];
    perks.appendChild(h('div', { class: 'item' },
      h('div', { class: 'item-h' }, h('b', { text: p.label }), liveSpan(() => `Lv ${s.prestige.perks[k] || 0}`, 'dim')),
      h('div', { class: 'dim small', text: p.desc }),
      aBtn(`Koupit`, () => (s.prestige.knowledge || 0) >= perkCost(s, k), () => A.buyPerk(s, k))));
  }
  wrap.appendChild(section('Vědění a perky', perks));
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
    ['Poraženo', () => fmt(s.stats.culled)],
    ['Vrchol populace', () => fmt(s.stats.peakPop)],
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
  return [activeTab, s.phase, s.groups.length, s.locations.length, s.activeGroupId,
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
function rebuildPanel() {
  if (!panelEl) return;
  let tab = TABS.find(t => t.id === activeTab) || TABS[0];
  if (!tab.avail(S)) { activeTab = 'herds'; tab = TABS[0]; }
  updaters = [];
  clear(panelEl);
  panelEl.appendChild(tab.render(S));
  structSig = structSigOf(S);
  refreshPanel();
}

// --- veřejné API -----------------------------------------------------------
export function initUI(state, mountId = 'app', actionCb = () => {}) {
  S = state; onAction = actionCb; activeTab = 'herds';
  root = document.getElementById(mountId);
  clear(root);
  hud = h('div', { class: 'hud', id: 'hud' });
  tabsBar = h('div', { class: 'tabs', id: 'tabs' });
  panelEl = h('div', { class: 'panel', id: 'panel' });
  bannerEl = h('div', { class: 'banner', id: 'banner', style: 'display:none' });
  root.appendChild(bannerEl); root.appendChild(hud); root.appendChild(tabsBar); root.appendChild(panelEl);
  lastTabSig = ''; structSig = '';
  modalEl = null; toastWrap = null; modalQueue.length = 0; visitedTabs.clear();
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

export function notifyPhase(phase) {
  const info = PHASE_INFO[phase];
  const name = (PHASES[phase] && PHASES[phase].name) || '';
  const content = h('div', {},
    h('div', { class: 'modal-tag', text: `Fáze ${phase}` }),
    h('h2', { text: name }),
    info ? h('div', { class: 'modal-lore', text: info.lore }) : null,
    info && info.unlocks ? h('div', {}, h('div', { class: 'dim small', text: 'Nově odemčeno:' }),
      h('ul', { class: 'unlocks' }, ...info.unlocks.map(u => h('li', { text: u })))) : null);
  modalQueue.push(content);
  showNextModal();
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
