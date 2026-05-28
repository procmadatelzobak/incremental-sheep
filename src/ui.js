import { GENES, UPGRADES, CULL_COSTS, ECON } from './config.js';
import {
  costRandomSheep, costPremiumSheep, costPenExpand, penCapacity, costUpgrade,
} from './economy.js';
import { stageOf } from './sheep.js';
import { aggCount, aggStageTotals } from './population.js';
import { breedingScore } from './genetics.js';
import { fmt } from './format.js';

const el = {};

// UI-only sex selection (not serialized to game state).
let _selectedSex = null;
export function getSelectedSex() { return _selectedSex; }

function mkButton(parent, id) {
  const b = document.createElement('button');
  b.id = id;
  parent.appendChild(b);
  return b;
}

function btnHTML(label, cost) {
  const c = cost == null ? '' : `<span class="cost">${fmt(cost)}</span>`;
  return `${label}${c}`;
}

// ── Sex toggle ─────────────────────────────────────────────────────────────
function buildSexToggle(parent) {
  const wrap = document.createElement('div');
  wrap.className = 'sex-toggle';
  const sexes = [
    { sex: 'M', label: '♂ Samec' },
    { sex: null, label: '? Náhodné' },
    { sex: 'F', label: '♀ Samice' },
  ];
  const btns = [];
  for (const { sex, label } of sexes) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = 'sex-btn' + (sex === null ? ' active' : '');
    b.onclick = () => {
      _selectedSex = sex;
      btns.forEach((bb, i) => bb.classList.toggle('active', sexes[i].sex === sex));
    };
    btns.push(b);
    wrap.appendChild(b);
  }
  parent.appendChild(wrap);
}

// ── Cull panel ─────────────────────────────────────────────────────────────
function buildCullPanel(cullSec, state, actions) {
  // Status display (updated every frame)
  const statusDiv = document.createElement('div');
  statusDiv.id = 'cull-status';
  statusDiv.className = 'cull-status';
  cullSec.appendChild(statusDiv);
  el.cullStatus = statusDiv;

  const sep = () => { const d = document.createElement('div'); d.className = 'cull-sep'; cullSec.appendChild(d); };

  // ── Stud section ──
  sep();
  const studHead = document.createElement('div');
  studHead.className = 'cull-head';
  studHead.textContent = 'Preferovaný samec (beran)';
  cullSec.appendChild(studHead);

  const studInfo = document.createElement('div');
  studInfo.id = 'stud-info';
  studInfo.className = 'stud-info';
  cullSec.appendChild(studInfo);
  el.studInfo = studInfo;

  const studHint = document.createElement('div');
  studHint.className = 'cull-hint';
  studHint.textContent = 'Klikni na samce v ohrádce pro připnutí (mimo porážecí mód)';
  cullSec.appendChild(studHint);

  const unStudBtn = document.createElement('button');
  unStudBtn.id = 'btn-unstud';
  unStudBtn.textContent = 'Odepnout samce';
  unStudBtn.onclick = () => actions.setStud(null);
  cullSec.appendChild(unStudBtn);
  el.unStudBtn = unStudBtn;

  // ── Max males section ──
  sep();
  const malesHead = document.createElement('div');
  malesHead.className = 'cull-head';
  malesHead.textContent = 'Správa samců';
  cullSec.appendChild(malesHead);

  const maxRow = document.createElement('label');
  maxRow.className = 'cull-row';
  const maxCheck = document.createElement('input');
  maxCheck.type = 'checkbox';
  maxCheck.checked = state.cull.maxMalesEnabled;
  maxCheck.onchange = () => actions.setCull('maxMalesEnabled', maxCheck.checked);
  const maxLabel = document.createElement('span');
  maxLabel.textContent = ' Max samců: ';
  const maxInput = document.createElement('input');
  maxInput.type = 'number';
  maxInput.min = 1; maxInput.max = 99;
  maxInput.value = state.cull.maxMales;
  maxInput.className = 'num-input';
  maxInput.onchange = () => actions.setCull('maxMales', Math.max(1, parseInt(maxInput.value) || 1));
  maxRow.append(maxCheck, maxLabel, maxInput);
  cullSec.appendChild(maxRow);

  const stageRow = document.createElement('div');
  stageRow.className = 'cull-indent';
  stageRow.innerHTML = 'Poraž přebytek v: ';
  const stageSelect = document.createElement('select');
  stageSelect.className = 'cull-select';
  [['child','Dětství'],['adult','Dospělosti']].forEach(([v,l]) => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = l;
    if (state.cull.maleCullStage === v) opt.selected = true;
    stageSelect.appendChild(opt);
  });
  stageSelect.onchange = () => actions.setCull('maleCullStage', stageSelect.value);
  stageRow.appendChild(stageSelect);
  cullSec.appendChild(stageRow);
  el.maxMalesRow = stageRow;

  // ── Basic rules ──
  sep();
  const rulesHead = document.createElement('div');
  rulesHead.className = 'cull-head';
  rulesHead.textContent = 'Automatické porážení';
  cullSec.appendChild(rulesHead);

  const addCheck = (labelText, stateKey) => {
    const row = document.createElement('label');
    row.className = 'cull-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.cull[stateKey];
    cb.onchange = () => actions.setCull(stateKey, cb.checked);
    row.append(cb, ' ', labelText);
    cullSec.appendChild(row);
    return cb;
  };
  addCheck('Poraž staré ovce', 'killOld');
  addCheck('Poraž samce-děti (jen na maso)', 'killMaleChildren');

  // ── When full ──
  sep();
  const fullHead = document.createElement('div');
  fullHead.className = 'cull-head';
  fullHead.textContent = 'Při plné ohrádce';
  cullSec.appendChild(fullHead);

  const fullBtn = document.createElement('button');
  fullBtn.id = 'btn-unlock-whenfull';
  fullBtn.onclick = () => actions.unlockCull('whenFull');
  cullSec.appendChild(fullBtn);
  el.fullBtn = fullBtn;

  const fullRow = document.createElement('div');
  fullRow.className = 'cull-indent';
  fullRow.innerHTML = 'Poraž: ';
  const fullSelect = document.createElement('select');
  fullSelect.className = 'cull-select';
  [['none','nic'],['oldest','nejstarší'],['worstMale','nejhorší samec'],['worst','nejhorší geny']].forEach(([v,l]) => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = l;
    if (state.cull.whenFull === v) opt.selected = true;
    fullSelect.appendChild(opt);
  });
  fullSelect.onchange = () => actions.setCull('whenFull', fullSelect.value);
  fullRow.appendChild(fullSelect);
  cullSec.appendChild(fullRow);
  el.fullRow = fullRow;

  // ── Gene floor ──
  sep();
  const gfHead = document.createElement('div');
  gfHead.className = 'cull-head';
  gfHead.textContent = 'Genetický filtr jehňat';
  cullSec.appendChild(gfHead);

  const gfBtn = document.createElement('button');
  gfBtn.id = 'btn-unlock-genefloor';
  gfBtn.onclick = () => actions.unlockCull('geneFloor');
  cullSec.appendChild(gfBtn);
  el.gfBtn = gfBtn;

  const gfBody = document.createElement('div');
  gfBody.id = 'gf-body';
  const gfCheck = document.createElement('label');
  gfCheck.className = 'cull-row';
  const gfCb = document.createElement('input');
  gfCb.type = 'checkbox';
  gfCb.checked = state.cull.geneFloorEnabled;
  gfCb.onchange = () => actions.setCull('geneFloorEnabled', gfCb.checked);
  gfCheck.append(gfCb, ' Porážet jehňata pod prahem');
  gfBody.appendChild(gfCheck);

  const gfGeneRow = document.createElement('div');
  gfGeneRow.className = 'cull-indent';
  gfGeneRow.innerHTML = 'Gen: ';
  const gfGeneSelect = document.createElement('select');
  gfGeneSelect.className = 'cull-select';
  for (const k in GENES) {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = GENES[k].label;
    if (state.cull.geneFloorGene === k) opt.selected = true;
    gfGeneSelect.appendChild(opt);
  }
  gfGeneSelect.onchange = () => actions.setCull('geneFloorGene', gfGeneSelect.value);
  gfGeneRow.appendChild(gfGeneSelect);

  gfGeneRow.append(' Min: ');
  const gfPct = document.createElement('input');
  gfPct.type = 'number';
  gfPct.min = 1; gfPct.max = 90;
  gfPct.value = Math.round(state.cull.geneFloorThreshold * 100);
  gfPct.className = 'num-input';
  gfPct.onchange = () => actions.setCull('geneFloorThreshold', Math.min(0.9, Math.max(0.01, (parseInt(gfPct.value) || 20) / 100)));
  gfGeneRow.append(gfPct, ' %');
  gfBody.appendChild(gfGeneRow);
  cullSec.appendChild(gfBody);
  el.gfBtn = gfBtn;
  el.gfBody = gfBody;
}

// ── initUI ──────────────────────────────────────────────────────────────────
export function initUI(state, actions) {
  el.credits  = document.getElementById('hud-credits');
  el.income   = document.getElementById('hud-income');
  el.wool     = document.getElementById('hud-wool');
  el.meat     = document.getElementById('hud-meat');
  el.pop      = document.getElementById('hud-pop');
  el.sexHud   = document.getElementById('hud-sex');
  el.stages   = document.getElementById('hud-stages');

  const buy = document.getElementById('buy-section');
  buildSexToggle(buy);
  el.random  = mkButton(buy, 'btn-random');
  el.premium = mkButton(buy, 'btn-premium');
  el.random.onclick  = () => actions.buyRandom(_selectedSex);
  el.premium.onclick = () => actions.buyPremium(_selectedSex);

  const upg = document.getElementById('upgrade-section');
  el.upg = {};
  for (const key in UPGRADES) {
    el.upg[key] = mkButton(upg, `btn-upg-${key}`);
    el.upg[key].onclick = () => actions.upgrade(key);
  }

  const penSec = document.getElementById('pen-section');
  el.pen = mkButton(penSec, 'btn-pen');
  el.pen.onclick = () => actions.expandPen();

  buildCullPanel(document.getElementById('cull-section'), state, actions);

  el.genes    = document.getElementById('genes-section');
  el.saveMsg  = document.getElementById('save-msg');
  const ta    = document.getElementById('save-string');
  document.getElementById('btn-export').onclick = () => {
    ta.value = actions.exportSave();
    ta.select();
    el.saveMsg.textContent = 'Save zkopíruj z pole výše.';
  };
  document.getElementById('btn-import').onclick = () => {
    const r = actions.importSave(ta.value);
    el.saveMsg.textContent = r.ok ? 'Načteno.' : `Chyba: ${r.error}`;
  };
  document.getElementById('btn-reset').onclick = () => {
    if (confirm('Opravdu smazat veškerý postup?')) {
      actions.reset();
      el.saveMsg.textContent = 'Hra resetována.';
    }
  };
}

// ── herd statistics helper ──────────────────────────────────────────────────
function herdStats(state) {
  if (state.aggregate) {
    const t = aggStageTotals(state.aggregate);
    const agg = state.aggregate;
    return {
      count: aggCount(agg), male: t.male, female: t.female,
      child: t.child, adult: t.adult, old: t.old,
      adultMale: agg.counts.M.adult, adultFemale: agg.counts.F.adult,
      avg: agg.mean, avgScore: breedingScore(agg.mean), hasHerd: true,
    };
  }
  const c = { child: 0, adult: 0, old: 0 };
  let male = 0, female = 0, adultMale = 0, adultFemale = 0, scoreSum = 0;
  const sum = {};
  for (const k in GENES) sum[k] = 0;
  for (const s of state.sheep) {
    const st = stageOf(s);
    c[st]++;
    if (s.sex === 'M') { male++; if (st === 'adult') adultMale++; }
    else               { female++; if (st === 'adult') adultFemale++; }
    for (const k in GENES) sum[k] += s.genes[k];
    scoreSum += breedingScore(s.genes);
  }
  const n = state.sheep.length || 1;
  const avg = {};
  for (const k in GENES) avg[k] = sum[k] / n;
  return {
    count: state.sheep.length, male, female, adultMale, adultFemale,
    child: c.child, adult: c.adult, old: c.old,
    avg, avgScore: scoreSum / n, hasHerd: state.sheep.length > 0,
  };
}

// ── updateUI ─────────────────────────────────────────────────────────────────
export function updateUI(state) {
  const st   = herdStats(state);
  const cap  = penCapacity(state.penLevel);
  const cred = state.credits;
  const afford = x => cred >= x;
  const cull = state.cull;

  // HUD
  el.credits.textContent = fmt(cred);
  el.income.textContent  = fmt(state.income.credits);
  el.wool.textContent    = fmt(state.income.wool);
  el.meat.textContent    = fmt(state.income.meat);
  el.pop.textContent     = `${fmt(st.count)} / ${fmt(cap)}`;
  el.sexHud.textContent  = `${fmt(st.male)} / ${fmt(st.female)}`;
  el.stages.textContent  = `${fmt(st.child)} / ${fmt(st.adult)} / ${fmt(st.old)}`;

  // Buy section
  const penFull = st.count >= cap;
  const sexMult = _selectedSex !== null ? ECON.sexSelectMult : 1;
  const cRandom  = Math.ceil(costRandomSheep(state.purchaseCount.random) * sexMult);
  const cPremium = Math.ceil(costPremiumSheep(state.purchaseCount.premium) * sexMult);
  el.random.innerHTML  = btnHTML('Koupit ovci', cRandom);
  el.random.disabled   = !!state.aggregate || penFull || !afford(cRandom);
  el.premium.innerHTML = btnHTML('Koupit lepší ovci', cPremium);
  el.premium.disabled  = !!state.aggregate || penFull || !afford(cPremium);

  // Upgrades
  for (const key in UPGRADES) {
    const lvl  = state.upgrades[key];
    const cost = costUpgrade(key, lvl);
    el.upg[key].innerHTML = `${UPGRADES[key].label} <span class="lvl">Lv ${lvl}</span><span class="cost">${fmt(cost)}</span>`;
    el.upg[key].disabled  = !afford(cost);
  }

  // Pen
  const cPen = costPenExpand(state.penLevel);
  el.pen.innerHTML = btnHTML(`Rozšířit → ${fmt(penCapacity(state.penLevel + 1))} míst`, cPen);
  el.pen.disabled  = !afford(cPen);

  // ── Cull panel status ──
  if (el.cullStatus) {
    const pct = (st.avgScore * 100).toFixed(1);
    el.cullStatus.innerHTML =
      `<span class="cull-stat">♂ ${fmt(st.male)} (${fmt(st.adultMale)} dospělí)</span>` +
      `<span class="cull-stat">♀ ${fmt(st.female)} (${fmt(st.adultFemale)} dospělé)</span>` +
      `<span class="cull-stat score">Breeding score: <b>${pct}%</b></span>`;
  }

  // Stud info
  if (el.studInfo) {
    const stud = cull.studId ? state.sheep.find(s => s.id === cull.studId) : null;
    if (stud) {
      const score = (breedingScore(stud.genes) * 100).toFixed(1);
      el.studInfo.textContent = `#${stud.id} — score ${score}%`;
      el.studInfo.style.color = '#ffd700';
    } else {
      el.studInfo.textContent = 'žádný';
      el.studInfo.style.color = '';
    }
    el.unStudBtn.disabled = !cull.studId;
  }

  // When full unlock
  if (el.fullBtn) {
    if (cull.whenFullUnlocked) {
      el.fullBtn.style.display = 'none';
      el.fullRow.style.display = '';
    } else {
      el.fullBtn.style.display = '';
      el.fullRow.style.display = 'none';
      el.fullBtn.innerHTML = btnHTML(`Odemknout: při přeplnění`, CULL_COSTS.whenFull);
      el.fullBtn.disabled = !afford(CULL_COSTS.whenFull);
    }
  }

  // Gene floor unlock
  if (el.gfBtn) {
    if (cull.geneFloorUnlocked) {
      el.gfBtn.style.display = 'none';
      el.gfBody.style.display = '';
    } else {
      el.gfBtn.style.display = '';
      el.gfBody.style.display = 'none';
      el.gfBtn.innerHTML = btnHTML('Odemknout: genetický filtr', CULL_COSTS.geneFloor);
      el.gfBtn.disabled = !afford(CULL_COSTS.geneFloor);
    }
  }

  // Genes table
  let rows = '<table>';
  for (const k in GENES) {
    if (!st.hasHerd) {
      rows += `<tr><td class="gname">${GENES[k].label}</td><td class="mid">—</td></tr>`;
      continue;
    }
    const spec = GENES[k];
    const val  = st.avg[k];
    const mid  = (spec.min + spec.max) / 2;
    const cls  = (spec.lowerBetter ? val < mid : val > mid) ? 'up' : 'down';
    rows += `<tr><td class="gname">${spec.label}</td><td class="${cls}">${val.toFixed(spec.dec)}</td></tr>`;
  }
  rows += '</table>';
  el.genes.innerHTML = rows;
}
