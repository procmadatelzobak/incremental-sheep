// ===========================================================================
//  Behemot Emporio — Redesigned Garage Workshop
//  Strictly 3 once-items, physical barter, milk-to-energy turbine conversion,
//  and switchboard material substitution (bones / skin / cloth at 4:1).
// ===========================================================================
import { RESOURCES } from '../config.js';

// --- CATALOG ---------------------------------------------------------------
export const CATALOG = [
  {
    id: 'incubator',
    name: 'Inkubátor',
    minPhase: 2,
    cost: { wool: 250, milk: 100 },
    desc: 'Fyzická záloha stáda v tepelně izolované bedně. Udržuje oddělené záložní kusy.',
    once: true,
  },
  {
    id: 'turbine',
    name: 'Mlékoturbína',
    minPhase: 7,
    cost: { milk: 1500, cloth: 600 },
    desc: 'Převádí přebytečné nadojené mléko na energii v poměru 0.1 energie za jednotku mléka.',
    once: true,
  },
  {
    id: 'switchboard',
    name: 'Přepojovací rozvaděč',
    minPhase: 7,
    cost: { bones: 3000, skin: 2500 },
    desc: 'Svorkovnice pro materiálovou substituci: chybějící kosti, kůži či sukno lze nahradit v poměru 4:1 jiným z nich.',
    once: true,
  },
];

export const itemById = (id) => CATALOG.find((it) => it.id === id) || null;

// --- STATE MANAGEMENT ------------------------------------------------------
export function defaultBehemot(carry = null) {
  const inv = {};
  const c = carry?.behemot || carry;
  const carryInv = c?.inv || c?.owned;
  if (carryInv && typeof carryInv === 'object') {
    for (const it of CATALOG) {
      const val = carryInv[it.id];
      if (val && (val.qty > 0 || val === true || val.active !== undefined)) {
        inv[it.id] = { qty: 1, active: false };
      }
    }
  }
  return { inv, line: null, lineN: 0, visits: 0, turbineShare: 0.25 };
}

export function behemotPrestige(state) {
  const b = state?.behemot || state;
  const owned = {};
  if (b?.inv) {
    for (const it of CATALOG) {
      const entry = b.inv[it.id];
      if (entry && (entry.qty > 0 || entry === true)) {
        owned[it.id] = { qty: 1, active: false };
      }
    }
  }
  return { inv: owned };
}

const LEGACY_CONSUMABLE_COSTS = {
  radioaktivni_krmivo: { wool: 800, meat: 150 },
  uranove_pelety: { meat: 500 },
  zitrejsi_vlna: { wool: 6000, milk: 1200 },
  sajrajt_z_bedny: { bones: 800, brain: 400 },
  dimenzionalni_bedna: { brain: 12000, bones: 8000 },
};

const getPrice = (k) => RESOURCES?.[k]?.value ?? 1;

export function migrateBehemot(old) {
  if (!old) return { state: defaultBehemot(), refundCredits: 0 };
  const b = old.behemot || old;

  const isLegacy = Object.keys(b.inv || {}).some(id => !itemById(id)) || Boolean(
    b.rel !== undefined || b.buffs !== undefined || b.soldOut !== undefined ||
    b.wisdom !== undefined || b.persistent !== undefined || b.shop !== undefined ||
    b.stageSeen !== undefined || b.containment !== undefined || b.rebelling !== undefined
  );

  let refundCredits = 0;
  const newInv = {};

  if (isLegacy) {
    let hasOldOnce = Boolean(
      (b.persistent?.artifacts && Object.values(b.persistent.artifacts).some(Boolean)) ||
      (b.soldOut && Object.values(b.soldOut).some(Boolean))
    );

    const oldInv = b.inv || {};
    for (const [id, entry] of Object.entries(oldInv)) {
      const qty = typeof entry === 'number' ? entry : entry?.qty || 0;
      if (qty <= 0) continue;

      if (id in LEGACY_CONSUMABLE_COSTS) {
        let itemVal = 0;
        for (const [res, amt] of Object.entries(LEGACY_CONSUMABLE_COSTS[id])) {
          itemVal += amt * getPrice(res);
        }
        refundCredits += itemVal * qty;
      } else {
        hasOldOnce = true;
      }
    }

    if (hasOldOnce) {
      for (const it of CATALOG) {
        newInv[it.id] = { qty: 1, active: Boolean(oldInv[it.id]?.active) };
      }
    }
  } else {
    const srcInv = b.inv || b.owned || {};
    for (const it of CATALOG) {
      const e = srcInv[it.id];
      if (e && (e.qty > 0 || e === true)) {
        newInv[it.id] = { qty: 1, active: Boolean(e.active) };
      }
    }
  }

  const newState = {
    inv: newInv,
    line: b.line !== undefined ? b.line : null,
    lineN: b.lineN || 0,
    visits: b.visits || 0,
    turbineShare: typeof b.turbineShare === 'number' ? Math.max(0, Math.min(1, b.turbineShare)) : 0.25,
  };

  return { state: newState, refundCredits };
}

// --- HELPER QUERIES & BARTER -----------------------------------------------
const isUnlocked = (state, resKey) => (RESOURCES?.[resKey]?.phase ?? 1) <= (state?.phase ?? 1);

export function itemAvailable(state, item) {
  const it = typeof item === 'string' ? itemById(item) : item;
  if (!it || (it.minPhase && (state?.phase ?? 1) < it.minPhase)) return false;
  for (const k in it.cost) {
    if (!isUnlocked(state, k)) return false;
  }
  return true;
}

export function barterCost(state, item) {
  const it = typeof item === 'string' ? itemById(item) : item;
  return it?.cost ? { ...it.cost } : {};
}

export function canBarter(state, item) {
  const it = typeof item === 'string' ? itemById(item) : item;
  if (!it || !state) return false;
  const b = state.behemot;
  if (b?.inv?.[it.id] && (b.inv[it.id].qty > 0 || b.inv[it.id] === true)) return false;
  if (!itemAvailable(state, it)) return false;
  const cost = barterCost(state, it);
  const res = state.resources || {};
  for (const [k, amt] of Object.entries(cost)) {
    if ((res[k] || 0) < amt) return false;
  }
  return true;
}

export function barter(state, id) {
  const it = typeof id === 'string' ? itemById(id) : id;
  if (!it || !state || !canBarter(state, it)) {
    behemotSay(state, 'cant');
    return false;
  }
  const cost = barterCost(state, it);
  for (const [k, amt] of Object.entries(cost)) {
    state.resources[k] -= amt;
  }
  if (!state.behemot) state.behemot = defaultBehemot();
  if (!state.behemot.inv) state.behemot.inv = {};
  state.behemot.inv[it.id] = { qty: 1, active: false };
  behemotSay(state, 'barter');
  return true;
}

export function toggleItem(state, id) {
  const it = typeof id === 'string' ? itemById(id) : id;
  if (!it || !state?.behemot?.inv) return false;
  const entry = state.behemot.inv[it.id];
  if (!entry || entry.qty <= 0 || !itemAvailable(state, it)) return false;
  entry.active = !entry.active;
  return true;
}

export function toolActive(state, id) {
  const it = typeof id === 'string' ? itemById(id) : id;
  const itemId = it ? it.id : id;
  const entry = state?.behemot?.inv?.[itemId];
  if (!entry?.active || (entry.qty || 0) <= 0) return false;
  return it ? itemAvailable(state, it) : true;
}

export function effectText(item) {
  const it = typeof item === 'string' ? itemById(item) : item;
  if (!it) return '';
  if (it.id === 'incubator') return 'Oddělí 10 % skutečného stáda do líhně s vlastní selekcí. Zkoušej přísnější šlechtění bez změny hlavního chovu; líheň sdílí jeho kapacitu.';
  if (it.id === 'turbine') return 'Převádí podíl nadojeného mléka na energii v poměru 0.1 za jednotku mléka.';
  if (it.id === 'switchboard') return 'Nouzová substituce: při spotřebě receptu nahrazuje chybějící kosti, kůži či sukno v poměru 4:1 jiným z nich.';
  return it.desc || '';
}

// --- BEHEMOT TERSE LINES ---------------------------------------------------
const LINES = {
  garage: ['nešahej na to.', 'kredity si nech na pouť.', 'všecko fungovalo, nežs na to sáhl.', 'kabel drží, motor běží.', 'do racku se neleze.'],
  barter: ['vem si to a vypadni.', 'materiál beru, krám je tvůj.', 'funguje to. když ne, tvoje chyba.', 'přepájeno, zabaleno.'],
  cant: ['nemáš na to suroviny ani oprávnění.', 'na tohle ještě nemáš fázi.', 'dvakrát měř, jednou neotravuj.', 'zavřeno, chybí materiál.'],
  incubator: ['ovce v bedně. topí to, dej jim pokoj.', 'rezerva je zapojená, nevypínej jistič.'],
  turbine: ['mlíko teče, turbína píská, proud je.', 'hlavně do toho nelij vodu.'],
  switchboard: ['čtyři ku jedné. fyzika brečí, ale svorky drží.', 'přepojeno. na dráty nešahej.'],
  default: ['nešahej na to.', 'neruš, pájím.', 'co zas.'],
};

export function behemotSay(state, key = 'default') {
  const b = state?.behemot || state;
  if (!b) return 'nešahej na to.';
  b.lineN = (b.lineN || 0) + 1;
  const list = LINES[key] || LINES.default;
  const text = list[(b.lineN - 1) % list.length];
  b.line = { key, text };
  return text;
}

// --- TICK SIMULATION HOOKS -------------------------------------------------
export function stepBehemot(state, dt, produced = {}) {
  if (state?.behemot && toolActive(state, 'turbine')) {
    const milk = produced.milk || 0;
    if (milk > 0) {
      const rawShare = state.behemot.turbineShare !== undefined ? state.behemot.turbineShare : 0.25;
      const share = Math.max(0, Math.min(1, rawShare));
      const milkToConvert = milk * share;
      if (milkToConvert > 0) {
        produced.milk -= milkToConvert;
        produced.energy = (produced.energy || 0) + milkToConvert * 0.1;
      }
    }
  }
  return produced;
}

// --- SWITCHBOARD RECIPE CONSUMPTION ----------------------------------------
const TRIAD = ['bones', 'skin', 'cloth'];
const isTriad = (k) => k === 'bones' || k === 'skin' || k === 'cloth';

export function consumeRecipe(state, produced = {}, recipe = {}, desiredWork = 0, share = 0.5) {
  if (!recipe || typeof desiredWork !== 'number' || !Number.isFinite(desiredWork) || desiredWork <= 0) return 0;
  const effShare = typeof share === 'number' && Number.isFinite(share) ? Math.max(0, Math.min(1, share)) : 0.5;
  const activeSwitch = toolActive(state, 'switchboard');

  const prodAvail = {};
  for (const k in recipe) {
    prodAvail[k] = Math.max(0, (produced?.[k] || 0) * effShare);
  }
  if (activeSwitch) {
    for (const k of TRIAD) {
      if (!(k in prodAvail)) prodAvail[k] = Math.max(0, (produced?.[k] || 0) * effShare);
    }
  }

  const getAvailTotal = (k) => (prodAvail[k] || 0) + Math.max(0, state?.resources?.[k] || 0);

  let maxWork = desiredWork;
  for (const [k, req] of Object.entries(recipe)) {
    if (req > 0 && (!activeSwitch || !isTriad(k))) {
      maxWork = Math.min(maxWork, getAvailTotal(k) / req);
    }
  }
  if (maxWork <= 1e-12) return 0;

  const debit = (k, amt) => {
    if (amt <= 1e-12) return;
    const pAvail = prodAvail[k] || 0;
    const fromProd = Math.min(amt, pAvail);
    prodAvail[k] = pAvail - fromProd;
    if (produced) {
      produced[k] = (produced[k] || 0) - fromProd;
      if (Math.abs(produced[k]) < 1e-11) produced[k] = 0;
    }
    const fromStock = amt - fromProd;
    if (state?.resources) {
      state.resources[k] = (state.resources[k] || 0) - fromStock;
      if (Math.abs(state.resources[k]) < 1e-11) state.resources[k] = 0;
    }
    if (state?.industry?.spent) {
      state.industry.spent[k] = (state.industry.spent[k] || 0) + amt;
    }
  };

  if (!activeSwitch) {
    for (const [k, req] of Object.entries(recipe)) {
      if (req > 0) debit(k, maxWork * req);
    }
    return maxWork;
  }

  const A = {}, r = {};
  let totalTriadReq = 0;
  for (const k of TRIAD) {
    A[k] = getAvailTotal(k);
    r[k] = recipe[k] || 0;
    totalTriadReq += r[k];
  }

  let actualWork = maxWork;
  if (totalTriadReq > 0) {
    const fAt = (w) => {
      let surplus = 0, deficit = 0;
      for (const k of TRIAD) {
        const net = A[k] - w * r[k];
        if (net >= 0) surplus += net;
        else deficit += -net;
      }
      return surplus - 4 * deficit;
    };

    if (fAt(maxWork) < 0) {
      const breakPoints = [0, maxWork];
      for (const k of TRIAD) {
        if (r[k] > 0) {
          const bp = A[k] / r[k];
          if (bp > 0 && bp < maxWork) breakPoints.push(bp);
        }
      }
      breakPoints.sort((a, b) => a - b);

      let solved = false;
      for (let idx = 0; idx < breakPoints.length - 1; idx++) {
        const w0 = breakPoints[idx], w1 = breakPoints[idx + 1];
        if (fAt(w0) >= 0 && fAt(w1) < 0) {
          const wMid = (w0 + w1) / 2;
          let C = 0, K = 0;
          for (const k of TRIAD) {
            if (A[k] - wMid * r[k] >= 0) {
              C += A[k];
              K += r[k];
            } else {
              C += 4 * A[k];
              K += 4 * r[k];
            }
          }
          actualWork = K > 0 ? C / K : w0;
          solved = true;
          break;
        }
      }
      if (!solved) actualWork = 0;
    }
  }

  actualWork = Math.min(maxWork, Math.max(0, actualWork));
  if (actualWork <= 1e-12) return 0;

  for (const [k, req] of Object.entries(recipe)) {
    if (req > 0 && !isTriad(k)) debit(k, actualWork * req);
  }

  const surplus = {}, deficit = {};
  for (const k of TRIAD) {
    const needed = actualWork * (recipe[k] || 0);
    const direct = Math.min(needed, A[k]);
    deficit[k] = needed - direct;
    surplus[k] = A[k] - direct;
    debit(k, direct);
  }

  for (const defKey of TRIAD) {
    let subNeeded = deficit[defKey] * 4;
    if (subNeeded <= 1e-12) continue;
    for (const surKey of TRIAD) {
      if (surKey === defKey) continue;
      const availSub = surplus[surKey];
      if (availSub <= 1e-12) continue;
      const take = Math.min(subNeeded, availSub);
      surplus[surKey] -= take;
      subNeeded -= take;
      debit(surKey, take);
      if (subNeeded <= 1e-12) break;
    }
  }

  return actualWork;
}
