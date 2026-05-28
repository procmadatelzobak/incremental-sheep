import { GENES, ECON } from './config.js';
import { stageBoundaries, qualityScore } from './sheep.js';
import { penCapacity, woolMult, breedingMult, priceMult, fertilityBonus } from './economy.js';

// Convert an individual herd into statistical cohorts (counts per sex/stage + mean genes).
// One-way for v1: once the herd is huge we stay in aggregate mode (the late-game).
export function toAggregate(sheep) {
  const mean = {};
  for (const k in GENES) mean[k] = 0;
  const counts = { M: { child: 0, adult: 0, old: 0 }, F: { child: 0, adult: 0, old: 0 } };
  for (const s of sheep) {
    for (const k in GENES) mean[k] += s.genes[k];
    const { childEnd, adultEnd } = stageBoundaries(s.genes);
    const st = s.age < childEnd ? 'child' : s.age < adultEnd ? 'adult' : 'old';
    counts[s.sex][st]++;
  }
  const n = sheep.length || 1;
  for (const k in GENES) mean[k] /= n;
  return { mean, counts };
}

export function aggCount(agg) {
  const c = agg.counts;
  return c.M.child + c.M.adult + c.M.old + c.F.child + c.F.adult + c.F.old;
}

export function aggStageTotals(agg) {
  const c = agg.counts;
  return {
    child: c.M.child + c.F.child,
    adult: c.M.adult + c.F.adult,
    old: c.M.old + c.F.old,
    male: c.M.child + c.M.adult + c.M.old,
    female: c.F.child + c.F.adult + c.F.old,
  };
}

// Approximate cohort-flow simulation: O(1) regardless of herd size.
export function stepAggregate(state, dt) {
  const agg = state.aggregate;
  const g = agg.mean;
  const { childEnd, adultEnd, life } = stageBoundaries(g);
  const childDur = childEnd, adultDur = adultEnd - childEnd, oldDur = life - adultEnd;
  const wMult = woolMult(state), bMult = breedingMult(state), pMult = priceMult(state), fBonus = fertilityBonus(state);
  const cap = penCapacity(state.penLevel);
  const c = agg.counts;

  const flow = (count, dur) => (dur > 0 ? Math.min(count, (count / dur) * dt) : count);

  let born = 0, died = 0, slaughtered = 0, meatGain = 0;

  // age cohorts forward
  for (const sex of ['M', 'F']) {
    const cs = c[sex];
    const c2a = flow(cs.child, childDur);
    const a2o = flow(cs.adult, adultDur);
    const o2d = flow(cs.old, oldDur);
    cs.child = Math.max(0, cs.child - c2a);
    cs.adult = Math.max(0, cs.adult + c2a - a2o);
    cs.old = Math.max(0, cs.old + a2o - o2d);
    died += o2d; // natural death, no meat
  }

  // wool from all adults + olds
  const adults = c.M.adult + c.F.adult;
  const olds = c.M.old + c.F.old;
  const woolGain = (adults + olds * ECON.oldWoolMult) * g.woolRate * wMult * dt;
  let creditsGain = woolGain * ECON.woolPriceBase * qualityScore(g) * pMult;

  // births limited by male capacity, female adults, and pen space
  const maleCap = c.M.adult * (g.fertility + fBonus);
  const gestation = g.gestation * bMult;
  const space = Math.max(0, cap - aggCount(agg));
  let births = gestation > 0 ? (Math.min(c.F.adult, maleCap) / gestation) * dt : 0;
  births = Math.min(births, space);
  c.M.child += births / 2;
  c.F.child += births / 2;
  born += births;

  // auto-slaughter as cohort flows
  if (state.autoSlaughter.killOld || state.autoSlaughter.capCull) {
    for (const sex of ['M', 'F']) { meatGain += c[sex].old * ECON.oldMeatMult * g.size; slaughtered += c[sex].old; c[sex].old = 0; }
  }
  if (state.autoSlaughter.killMaleChildren) {
    meatGain += c.M.child * ECON.childMeatMult * g.size; slaughtered += c.M.child; c.M.child = 0;
  }
  creditsGain += meatGain * ECON.meatPriceBase * pMult;

  state.credits += creditsGain;
  state.gameTime += dt;
  state.stats.woolLifetime += woolGain;
  state.stats.meatLifetime += meatGain;
  state.stats.credLifetime += creditsGain;
  state.stats.born += born;
  state.stats.diedAge += died;
  state.stats.slaughtered += slaughtered;

  return { credits: creditsGain, wool: woolGain, meat: meatGain, born, died, slaughtered };
}
