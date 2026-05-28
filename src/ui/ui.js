// ===========================================================================
//  UI: HUD + záložky + panely. Dashboard-first, plátno jen jako akcent.
//  Panely se překreslují celé (na akci / přepnutí / pomalý refresh).
// ===========================================================================
import { fmt } from '../format.js';
import * as A from '../econ/actions.js';
import { upgradeCost, perkCost } from '../econ/economy.js';
import { UPGRADES, PERKS, GENES, RESOURCES, BALANCE } from '../config.js';
import { totalCount, adultCount } from '../sim/cohort.js';
import { locationCap, locKind } from '../content/locations.js';
import { phaseName, phaseHint } from '../content/phases.js';
import { breedingScore, geneMin, geneMax } from '../sim/genetics.js';
import { combinedCap, storedTradeTotal, TRADEABLE, storageEnabled } from '../econ/storage.js';
import { sphereReady, dysonTarget } from '../content/projects.js';
import { canIgnite, singularityAvailable } from '../content/prestige.js';
import { drawHerd } from '../render/canvas.js';

let root, hud, tabsBar, panelEl, bannerEl, activeTab = 'herds';
let onAction = () => {};   // callback, aby main mohl po akci uložit

// --- DOM helpers -----------------------------------------------------------
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
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

// tlačítko akce — po kliknutí provede akci, překreslí panel a uloží
function btn(label, enabled, fn) {
  return h('button', {
    class: 'act', disabled: enabled ? false : 'disabled',
    onclick: () => { if (fn() !== false) { onAction(); rebuild(); updateHud(S); } },
  }, label);
}

function bar(frac, label, color = '#6aa84f') {
  frac = Math.max(0, Math.min(1, frac || 0));
  return h('div', { class: 'bar' },
    h('div', { class: 'barfill', style: `width:${(frac * 100).toFixed(1)}%;background:${color}` }),
    h('span', { class: 'barlabel', text: label || '' }));
}

// lišta genu: track [min..max], σ pruh kolem μ, μ marker, hodnota
function geneBar(group, key, ceilingMult) {
  const spec = GENES[key], d = group.genes[key];
  const lo = geneMin(key, ceilingMult), hi = geneMax(key, ceilingMult);
  const span = (hi - lo) || 1;
  const muF = Math.max(0, Math.min(1, (d.mu - lo) / span));
  const sigF = Math.max(0.005, Math.min(0.5, d.sigma / span));
  const good = spec.lowerBetter ? (1 - muF) : muF;
  const col = good > 0.66 ? '#6aa84f' : good > 0.33 ? '#c9a227' : '#b06a3a';
  return h('div', { class: 'gene' },
    h('div', { class: 'gene-h' }, h('span', { text: spec.label }), h('span', { class: 'dim', text: d.mu.toFixed(spec.dec) })),
    h('div', { class: 'gene-track' },
      h('div', { class: 'gene-sigma', style: `left:${Math.max(0, (muF - sigF) * 100)}%;width:${Math.min(100, sigF * 200)}%` }),
      h('div', { class: 'gene-mu', style: `left:${muF * 100}%;background:${col}` })));
}

const aff = (s, c) => (s.resources.credits || 0) >= c;
const costBtn = (s, label, cost, fn) => btn(`${label} (${fmt(cost)})`, aff(s, cost), fn);

// --- HUD -------------------------------------------------------------------
let hudChips = {};
function buildHud() {
  clear(hud);
  const title = h('div', { class: 'hud-title' },
    h('b', { id: 'hud-epithet', text: '' }), h('span', { class: 'dim', id: 'hud-phase', text: '' }));
  const hint = h('div', { class: 'hud-hint', id: 'hud-hint', text: '' });
  const chips = h('div', { class: 'chips' });
  hudChips = {};
  const defs = [
    ['credits', 'Kredity'], ['pop', 'Ovce'], ['wool', 'Vlna/s'], ['milk', 'Mléko/s'],
    ['meat', 'Maso/s'], ['compute', 'Výpočet/s'], ['knowledge', 'Vědění'],
  ];
  for (const [k, lab] of defs) {
    const val = h('span', { class: 'chip-v', text: '0' });
    const chip = h('div', { class: 'chip' }, h('span', { class: 'chip-l', text: lab }), val);
    hudChips[k] = { chip, val };
    chips.appendChild(chip);
  }
  hud.appendChild(title); hud.appendChild(hint); hud.appendChild(chips);
}
function updateHud(s) {
  if (!hud) return;
  hud.querySelector('#hud-epithet').textContent = s.meta.epithet;
  hud.querySelector('#hud-phase').textContent = `  •  Fáze ${s.phase}: ${phaseName(s)}`;
  hud.querySelector('#hud-hint').textContent = '› ' + phaseHint(s);
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
  { id: 'prestige', label: 'Prestiž', avail: s => s.phase >= 10 || (s.prestige.knowledge || 0) > 0 || s.prestige.runs > 0, render: renderPrestige },
  { id: 'stats', label: 'Staty', avail: () => true, render: renderStats },
];
function buildTabs() {
  clear(tabsBar);
  for (const t of TABS) {
    const b = h('button', {
      class: 'tab' + (t.id === activeTab ? ' active' : ''),
      'data-tab': t.id,
      onclick: () => { activeTab = t.id; buildTabs(); rebuild(); },
    }, t.label);
    if (!t.avail(S)) b.style.display = 'none';
    tabsBar.appendChild(b);
  }
}

// --- PANELY ----------------------------------------------------------------
function section(title, ...kids) { return h('div', { class: 'sect' }, h('h3', { text: title }), ...kids); }

function renderHerds(s) {
  const mults = { ceilingMult: s.world.ceilingMult };
  const g = s.groups.find(x => x.id === s.activeGroupId) || s.groups[0];
  const wrap = h('div', {});

  // výběr stáda (fáze 9 / víc skupin)
  if (s.groups.length > 1) {
    const sel = h('select', { onchange: e => { s.activeGroupId = +e.target.value; rebuild(); } },
      ...s.groups.map(x => h('option', { value: x.id, ...(x.id === g.id ? { selected: 'selected' } : {}) }, `${x.name} (${fmt(totalCount(x))})`)));
    wrap.appendChild(section('Stádo', sel));
  }

  const loc = s.locations.find(l => l.id === g.locationId) || s.locations[0];
  const cap = locationCap(loc);
  const c = g.counts;
  const cv = h('canvas', { class: 'herdcanvas', width: 280, height: 90 });

  wrap.appendChild(section(`${g.name} — ${loc.name}`,
    cv,
    h('div', { class: 'stat-row' },
      h('span', {}, `Ovcí: ${fmt(totalCount(g))} / ${fmt(cap)}`),
      h('span', {}, `Skóre: ${(breedingScore(g.genes, s.world.ceilingMult) * 100).toFixed(0)} %`)),
    h('div', { class: 'stat-row dim' },
      h('span', {}, `Děti ${fmt(c.M.child + c.F.child)}`),
      h('span', {}, `Dospělí ${fmt(c.M.adult + c.F.adult)}`),
      h('span', {}, `Staří ${fmt(c.M.old + c.F.old)}`)),
    bar(totalCount(g) / cap, `naplnění ohrady`),
    costBtn(s, '+ Ovce', A.costFor(s, 'addSheep'), () => A.buyAddSheep(s))));

  // genové lišty
  const genes = h('div', { class: 'genes' });
  for (const k in GENES) {
    if (GENES[k].phase > s.phase) continue;
    genes.appendChild(geneBar(g, k, s.world.ceilingMult));
  }
  wrap.appendChild(section('Geny (μ • rozptyl σ)', genes));

  // selekce (od fáze 2)
  if (s.phase >= 2) {
    const cull = g.policy.cull;
    const geneOpts = [h('option', { value: 'breedingScore', ...(cull.gene === 'breedingScore' ? { selected: 'selected' } : {}) }, 'Celkové skóre'),
      ...Object.keys(GENES).filter(k => GENES[k].phase <= s.phase).map(k => h('option', { value: k, ...(cull.gene === k ? { selected: 'selected' } : {}) }, GENES[k].label))];
    const stageOpts = ['adult', 'old', 'child'].map(st => h('option', { value: st, ...(cull.stage === st ? { selected: 'selected' } : {}) }, { adult: 'dospělí', old: 'staří', child: 'děti' }[st]));
    wrap.appendChild(section('Šlechtění (selekce)',
      h('label', { class: 'ck' }, h('input', { type: 'checkbox', ...(cull.enabled ? { checked: 'checked' } : {}), onchange: () => { A.setCull(s, g.id, { enabled: !cull.enabled }); onAction(); rebuild(); } }), ' Zapnout selekci'),
      h('div', { class: 'ctl-row' }, 'Cíl: ', h('select', { onchange: e => { A.setCull(s, g.id, { gene: e.target.value }); } }, ...geneOpts),
        ' ve stádiu ', h('select', { onchange: e => { A.setCull(s, g.id, { stage: e.target.value }); } }, ...stageOpts)),
      h('div', { class: 'ctl-row' }, `Useknout nejhorších: ${(cull.cutFrac * 100).toFixed(0)} %`,
        h('input', { type: 'range', min: 0, max: BALANCE.maxCutFrac, step: 0.05, value: cull.cutFrac, oninput: e => { A.setCull(s, g.id, { cutFrac: +e.target.value }); } })),
      h('div', { class: 'dim small' }, 'Selekce zvedá μ a utahuje σ; mutace σ doplňuje → šlechtit lze napořád.')));

    // automatická pravidla
    wrap.appendChild(section('Automatika',
      h('label', { class: 'ck' }, h('input', { type: 'checkbox', ...(g.policy.killOld ? { checked: 'checked' } : {}), onchange: () => { A.togglePolicy(s, g.id, 'killOld'); onAction(); rebuild(); } }), ' Porážet staré (maso)'),
      h('label', { class: 'ck' }, h('input', { type: 'checkbox', ...(g.policy.killMaleChildren ? { checked: 'checked' } : {}), onchange: () => { A.togglePolicy(s, g.id, 'killMaleChildren'); onAction(); rebuild(); } }), ' Porážet samce-děti'),
      h('div', { class: 'ctl-row' }, 'Max samců (0 = bez limitu): ',
        h('input', { type: 'number', min: 0, value: g.policy.maxMales, style: 'width:80px', onchange: e => { A.setMaxMales(s, g.id, +e.target.value); } }))));
  }

  // nesmrtelnost (fáze 4)
  if (s.phase === 4 && !s.flags.immortal) {
    wrap.appendChild(section('Nápoj nesmrtelnosti',
      h('div', { class: 'dim' }, 'Z ovčího mléka. Po vypití získáš čas na pokročilou genetiku.'),
      costBtn(s, 'Vyrobit nápoj nesmrtelnosti', A.costFor(s, 'immortality'), () => A.craftImmortality(s))));
  }

  setTimeout(() => drawHerd(cv, g), 0);
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
    const cost = upgradeCost(s, k), lvl = s.upgrades[k] || 0;
    list.appendChild(h('div', { class: 'item' },
      h('div', { class: 'item-h' }, h('b', { text: u.label }), h('span', { class: 'dim', text: `Lv ${lvl}` })),
      h('div', { class: 'dim small', text: u.desc }),
      costBtn(s, 'Koupit', cost, () => A.buyUpgrade(s, k))));
  }
  wrap.appendChild(section('Vylepšení', any ? list : h('div', { class: 'dim', text: 'Zatím nic.' })));
  return wrap;
}

function renderStations(s) {
  const wrap = h('div', {});
  const list = h('div', { class: 'list' });
  for (const loc of s.locations) {
    const cap = locationCap(loc);
    const pop = s.groups.filter(g => g.locationId === loc.id).reduce((t, g) => t + totalCount(g), 0);
    list.appendChild(h('div', { class: 'item' },
      h('div', { class: 'item-h' }, h('b', { text: `${loc.name}` }), h('span', { class: 'dim', text: locKind(loc).label })),
      h('div', { class: 'dim small', text: `Ovcí ${fmt(pop)} / ${fmt(cap)} · hustota ${loc.density}` }),
      h('div', { class: 'btn-row' },
        costBtn(s, 'Rozšířit', A.costFor(s, 'expand', loc), () => A.buyExpand(s, loc.id)),
        loc.density < BALANCE.density.max ? costBtn(s, 'Hustota', A.costFor(s, 'density', loc), () => A.buyDensity(s, loc.id)) : h('span', { class: 'dim', text: 'hustota max' }))));
  }
  wrap.appendChild(section('Lokace', list));

  const buys = h('div', { class: 'btn-row' });
  if (s.phase >= 2) buys.appendChild(costBtn(s, '+ Pastvina', A.costFor(s, 'newPasture'), () => A.buyNewPasture(s)));
  if (s.phase >= 6) {
    buys.appendChild(costBtn(s, '+ Stanice (planeta)', A.costFor(s, 'station'), () => A.buyStation(s)));
    buys.appendChild(costBtn(s, '+ Sklad', A.costFor(s, 'warehouse'), () => A.buyWarehouse(s)));
    buys.appendChild(costBtn(s, '+ Kyslík', A.costFor(s, 'oxygen'), () => A.buyOxygen(s)));
  }
  wrap.appendChild(section('Expanze', buys,
    s.phase >= 6 ? h('div', { class: 'dim small', text: `Kyslíková kapacita: ${fmt(s.buys.oxygen * BALANCE.oxygenPerLevel)} (pro Měsíc).` }) : null));

  // Dysonova sféra (fáze 7+)
  if (s.phase >= 7) {
    const d = s.projects.dyson;
    const sec = section('Dysonova sféra',
      bar(d.progress / dysonTarget(s), `${fmt(d.progress)} / ${fmt(dysonTarget(s))}`, '#c9a227'),
      h('div', { class: 'dim small', text: `Hotových sfér: ${d.count} · stavitelů: ${d.builders} · energie: ${fmt(s.resources.energy || 0)}` }),
      h('div', { class: 'btn-row' },
        costBtn(s, '+ Stavitel', A.costFor(s, 'builder'), () => A.buyBuilder(s)),
        sphereReady(s) ? btn('Dokončit sféru!', true, () => A.doClaimSphere(s)) : null,
        s.phase >= 8 ? costBtn(s, '+ Laser', A.costFor(s, 'laser'), () => A.buyLaser(s)) : null));
    wrap.appendChild(sec);
  }
  return wrap;
}

function renderStorage(s) {
  const wrap = h('div', {});
  const cap = combinedCap(s), used = storedTradeTotal(s);
  wrap.appendChild(section('Společný sklad',
    bar(cap ? used / cap : 0, `${fmt(used)} / ${fmt(cap)}`, '#5b8def'),
    h('div', { class: 'dim small', text: 'Pozor: jakýkoli nákup vyprázdní sklad.' })));
  const list = h('div', { class: 'list' });
  for (const k of TRADEABLE) {
    if (RESOURCES[k].phase > s.phase) continue;
    const frac = s.storage.autotrade[k] ?? 1;
    list.appendChild(h('div', { class: 'item' },
      h('div', { class: 'item-h' }, h('b', { text: RESOURCES[k].label }), h('span', { class: 'dim', text: fmt(s.resources[k] || 0) })),
      h('div', { class: 'ctl-row' }, `Prodávat: ${(frac * 100).toFixed(0)} %`,
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
      h('div', { class: 'item-h' }, h('b', { text: g.name }), h('span', { class: 'dim', text: `${fmt(totalCount(g))} ovcí` })),
      h('div', { class: 'dim small', text: `${loc ? loc.name : '?'} · skóre ${(breedingScore(g.genes, s.world.ceilingMult) * 100).toFixed(0)} %` }),
      h('div', { class: 'btn-row' },
        btn('Vybrat', s.activeGroupId !== g.id, () => { s.activeGroupId = g.id; activeTab = 'herds'; buildTabs(); }),
        btn('Rozdělit', totalCount(g) > 4, () => A.doSplitGroup(s, g.id)))));
  }
  wrap.appendChild(section('Stáda', list, btn('+ Nové stádo', true, () => A.addGroup(s))));
  return wrap;
}

function renderPrestige(s) {
  const wrap = h('div', {});
  if (s.phase >= 10) {
    wrap.appendChild(section('Černá díra',
      h('div', { class: 'dim small', text: 'Nasávej surovou produkci do centrálního skladu, dokud nevznikne černá díra.' }),
      h('label', { class: 'ck' }, h('input', { type: 'checkbox', ...(s.prestige.armed ? { checked: 'checked' } : {}), onchange: () => { A.armBlackHole(s); onAction(); rebuild(); } }), ' Nasávat produkci do skladu'),
      bar(s.prestige.centralWarehouse / s.prestige.threshold, `${fmt(s.prestige.centralWarehouse)} / ${fmt(s.prestige.threshold)}`, '#8a5bef'),
      btn('Zažehnout černou díru (RESET)', canIgnite(s), () => A.doIgnite(s)),
      singularityAvailable(s) ? btn('★ Dosáhnout singularity (NG+)', true, () => A.doSingularity(s)) : null));
  }
  wrap.appendChild(section('Vědění a perky',
    h('div', { class: 'dim' }, `Vědění: ${fmt(s.prestige.knowledge || 0)} · resetů: ${s.prestige.runs}`),
    ...Object.keys(PERKS).map(k => {
      const p = PERKS[k], cost = perkCost(s, k), lvl = s.prestige.perks[k] || 0;
      return h('div', { class: 'item' },
        h('div', { class: 'item-h' }, h('b', { text: p.label }), h('span', { class: 'dim', text: `Lv ${lvl}` })),
        h('div', { class: 'dim small', text: p.desc }),
        btn(`Koupit (${fmt(cost)} vědění)`, (s.prestige.knowledge || 0) >= cost, () => A.buyPerk(s, k)));
    })));
  return wrap;
}

function renderStats(s) {
  const hrs = (x) => (x / 3600).toFixed(2) + ' h';
  const rows = [
    ['Fáze', `${s.phase} — ${phaseName(s)}`],
    ['Čas v běhu', hrs(s.meta.gameTime)],
    ['Čas celkem (všechny běhy)', hrs(s.meta.totalGameTime)],
    ['Resetů (černá díra)', s.prestige.runs],
    ['Vlna celkem', fmt(s.stats.woolLifetime)],
    ['Mléko celkem', fmt(s.stats.milkLifetime)],
    ['Maso celkem', fmt(s.stats.meatLifetime)],
    ['Kredity celkem', fmt(s.stats.credLifetime)],
    ['Poraženo', fmt(s.stats.culled)],
    ['Vrchol populace', fmt(s.stats.peakPop)],
  ];
  return section('Statistiky', h('table', { class: 'stats' },
    ...rows.map(([a, b]) => h('tr', {}, h('td', { class: 'dim', text: a }), h('td', { text: String(b) })))));
}

// --- veřejné API -----------------------------------------------------------
let S;
export function initUI(state, mountId = 'app', actionCb = () => {}) {
  S = state; onAction = actionCb;
  root = document.getElementById(mountId);
  clear(root);
  hud = h('div', { class: 'hud', id: 'hud' });
  tabsBar = h('div', { class: 'tabs', id: 'tabs' });
  panelEl = h('div', { class: 'panel', id: 'panel' });
  bannerEl = h('div', { class: 'banner', id: 'banner', style: 'display:none' });
  root.appendChild(bannerEl); root.appendChild(hud); root.appendChild(tabsBar); root.appendChild(panelEl);
  buildHud(); buildTabs(); updateHud(state); rebuild();
}

export function rebuild() {
  if (!panelEl) return;
  const tab = TABS.find(t => t.id === activeTab) || TABS[0];
  if (!tab.avail(S)) { activeTab = 'herds'; buildTabs(); }
  clear(panelEl);
  panelEl.appendChild((TABS.find(t => t.id === activeTab) || TABS[0]).render(S));
}

// volá main každý frame (full=true → překreslit panel; jinak jen HUD)
export function updateUI(state, full) {
  S = state;
  updateHud(state);
  buildTabs(); // zobrazí nově odemčené záložky
  if (full) {
    // nepřekresluj, pokud uživatel právě ovládá vstup v panelu
    const a = document.activeElement;
    if (a && panelEl && panelEl.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT')) return;
    rebuild();
  }
}

export function showBanner(text) {
  if (!bannerEl) return;
  bannerEl.textContent = text;
  bannerEl.style.display = '';
  setTimeout(() => { if (bannerEl) bannerEl.style.display = 'none'; }, 6000);
}
