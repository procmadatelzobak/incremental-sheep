import { GENES, UPGRADES, AUTO_SLAUGHTER } from './config.js';
import {
  costRandomSheep, costPremiumSheep, costPenExpand, penCapacity, costUpgrade,
} from './economy.js';
import { stageOf } from './sheep.js';
import { aggCount, aggStageTotals } from './population.js';
import { fmt } from './format.js';

const AUTO = [
  { id: 'killOld',          cfg: 'killOld',          on: 'killOld',          un: 'killOldUnlocked' },
  { id: 'killMaleChildren', cfg: 'killMaleChildren', on: 'killMaleChildren', un: 'killMaleChildrenUnlocked' },
  { id: 'capCull',          cfg: 'capThreshold',     on: 'capCull',          un: 'capCullUnlocked' },
];

const el = {};

function mkButton(parent, id) {
  const b = document.createElement('button');
  b.id = id;
  parent.appendChild(b);
  return b;
}

function btn(label, costOrNull, affordable) {
  const cost = costOrNull == null ? '' : `<span class="cost">${fmt(costOrNull)}</span>`;
  return `${label}${cost}`;
}

export function initUI(state, actions) {
  const hud = (id) => document.getElementById(id);
  el.credits = hud('hud-credits');
  el.income = hud('hud-income');
  el.wool = hud('hud-wool');
  el.meat = hud('hud-meat');
  el.pop = hud('hud-pop');
  el.sex = hud('hud-sex');
  el.stages = hud('hud-stages');

  const buy = document.getElementById('buy-section');
  el.starter = mkButton(buy, 'btn-starter');
  el.random = mkButton(buy, 'btn-random');
  el.premium = mkButton(buy, 'btn-premium');
  el.starter.onclick = () => actions.buyStarter();
  el.random.onclick = () => actions.buyRandom();
  el.premium.onclick = () => actions.buyPremium();

  const upg = document.getElementById('upgrade-section');
  el.upg = {};
  for (const key in UPGRADES) {
    el.upg[key] = mkButton(upg, `btn-upg-${key}`);
    el.upg[key].onclick = () => actions.upgrade(key);
  }

  const penSec = document.getElementById('pen-section');
  el.pen = mkButton(penSec, 'btn-pen');
  el.pen.onclick = () => actions.expandPen();

  const autoSec = document.getElementById('auto-section');
  el.auto = {};
  for (const def of AUTO) {
    const wrap = document.createElement('div');
    wrap.className = 'auto-row';
    const unlockBtn = document.createElement('button');
    unlockBtn.onclick = () => actions.unlockAuto(def.id);
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.onchange = () => actions.toggleAuto(def.id, checkbox.checked);
    const text = document.createElement('span');
    text.textContent = AUTO_SLAUGHTER[def.cfg].label;
    label.appendChild(checkbox);
    label.appendChild(text);
    wrap.appendChild(unlockBtn);
    wrap.appendChild(label);
    autoSec.appendChild(wrap);
    el.auto[def.id] = { unlockBtn, label, checkbox };
  }

  el.genes = document.getElementById('genes-section');
  el.saveMsg = document.getElementById('save-msg');
  const ta = document.getElementById('save-string');
  document.getElementById('btn-export').onclick = () => {
    ta.value = actions.exportSave();
    ta.select();
    el.saveMsg.textContent = 'Save zkopíruj z pole výše.';
  };
  document.getElementById('btn-import').onclick = () => {
    const res = actions.importSave(ta.value);
    el.saveMsg.textContent = res.ok ? 'Načteno.' : `Chyba: ${res.error}`;
  };
  document.getElementById('btn-reset').onclick = () => {
    if (confirm('Opravdu smazat veškerý postup?')) {
      actions.reset();
      el.saveMsg.textContent = 'Hra resetována.';
    }
  };
}

function herdStats(state) {
  if (state.aggregate) {
    const t = aggStageTotals(state.aggregate);
    return { count: aggCount(state.aggregate), male: t.male, female: t.female, child: t.child, adult: t.adult, old: t.old, avg: state.aggregate.mean, hasHerd: true };
  }
  const c = { child: 0, adult: 0, old: 0 };
  let male = 0, female = 0;
  const sum = {};
  for (const k in GENES) sum[k] = 0;
  for (const s of state.sheep) {
    c[stageOf(s)]++;
    if (s.sex === 'M') male++; else female++;
    for (const k in GENES) sum[k] += s.genes[k];
  }
  const n = state.sheep.length || 1;
  const avg = {};
  for (const k in GENES) avg[k] = sum[k] / n;
  return { count: state.sheep.length, male, female, child: c.child, adult: c.adult, old: c.old, avg, hasHerd: state.sheep.length > 0 };
}

export function updateUI(state) {
  const st = herdStats(state);
  const cap = penCapacity(state.penLevel);
  const cred = state.credits;
  const afford = (x) => cred >= x;

  el.credits.textContent = fmt(cred);
  el.income.textContent = fmt(state.income.credits);
  el.wool.textContent = fmt(state.income.wool);
  el.meat.textContent = fmt(state.income.meat);
  el.pop.textContent = `${fmt(st.count)} / ${fmt(cap)}`;
  el.sex.textContent = `${fmt(st.male)} / ${fmt(st.female)}`;
  el.stages.textContent = `${fmt(st.child)} / ${fmt(st.adult)} / ${fmt(st.old)}`;

  // starter
  if (state.startedPair) {
    el.starter.innerHTML = 'První pár pořízen ✓';
    el.starter.disabled = true;
  } else {
    el.starter.innerHTML = btn('Koupit první pár — zdarma', null);
    el.starter.disabled = false;
  }

  const penFull = st.count >= cap;
  const cRandom = costRandomSheep(state.purchaseCount.random);
  const cPremium = costPremiumSheep(state.purchaseCount.premium);
  el.random.innerHTML = btn('Koupit ovci (náhodné geny)', cRandom);
  el.random.disabled = !!state.aggregate || penFull || !afford(cRandom);
  el.premium.innerHTML = btn('Koupit lepší ovci', cPremium);
  el.premium.disabled = !!state.aggregate || penFull || !afford(cPremium);

  for (const key in UPGRADES) {
    const lvl = state.upgrades[key];
    const cost = costUpgrade(key, lvl);
    el.upg[key].innerHTML = `${UPGRADES[key].label} <span class="lvl">Lv ${lvl}</span>${`<span class="cost">${fmt(cost)}</span>`}`;
    el.upg[key].disabled = !afford(cost);
  }

  const cPen = costPenExpand(state.penLevel);
  el.pen.innerHTML = btn(`Rozšířit → ${fmt(penCapacity(state.penLevel + 1))} míst`, cPen);
  el.pen.disabled = !afford(cPen);

  for (const def of AUTO) {
    const ref = el.auto[def.id];
    const unlocked = state.autoSlaughter[def.un];
    if (unlocked) {
      ref.unlockBtn.style.display = 'none';
      ref.label.style.display = 'flex';
      ref.checkbox.checked = state.autoSlaughter[def.on];
    } else {
      ref.label.style.display = 'none';
      ref.unlockBtn.style.display = 'block';
      const cost = AUTO_SLAUGHTER[def.cfg].cost;
      ref.unlockBtn.innerHTML = btn(`Odemknout: ${AUTO_SLAUGHTER[def.cfg].label}`, cost);
      ref.unlockBtn.disabled = !afford(cost);
    }
  }

  let rows = '<table>';
  for (const k in GENES) {
    const v = st.hasHerd ? st.avg[k].toFixed(GENES[k].dec) : '—';
    rows += `<tr><td class="gname">${GENES[k].label}</td><td>${v}</td></tr>`;
  }
  rows += '</table>';
  el.genes.innerHTML = rows;
}
