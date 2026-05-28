import { STAGE, ECON, INDIVIDUAL_CAP } from './config.js';
import { stageOf, stageBoundaries, qualityScore, makeSheep } from './sheep.js';
import { inherit } from './genetics.js';
import { penCapacity, woolMult, breedingMult, priceMult, fertilityBonus } from './economy.js';
import { toAggregate, stepAggregate } from './population.js';

export function meatFromSheep(genes, stage) {
  const mult = stage === STAGE.ADULT ? ECON.adultMeatMult
            : stage === STAGE.OLD ? ECON.oldMeatMult
            : ECON.childMeatMult;
  return genes.size * mult;
}

// Advance the whole game by dt game-seconds. Returns per-step deltas for the HUD.
export function step(state, dt) {
  if (state.aggregate) return stepAggregate(state, dt);

  const cap = penCapacity(state.penLevel);
  const wMult = woolMult(state);
  const bMult = breedingMult(state);
  const pMult = priceMult(state);
  const fBonus = fertilityBonus(state);

  let creditsGain = 0, woolGain = 0, meatGain = 0, born = 0, died = 0, slaughtered = 0;

  const survivors = [];
  const males = [];
  const femalesReady = [];
  let pregnantCount = 0;

  // pass 1: aging, wool production, natural death, gestation countdown
  for (const s of state.sheep) {
    s.age += dt;
    const { life } = stageBoundaries(s.genes);
    if (s.age >= life) { died++; continue; }       // dies of age, gives no meat
    const st = stageOf(s);
    if (st === STAGE.ADULT || st === STAGE.OLD) {
      const factor = st === STAGE.ADULT ? 1 : ECON.oldWoolMult;
      const wool = s.genes.woolRate * wMult * factor * dt;
      woolGain += wool;
      creditsGain += wool * ECON.woolPriceBase * qualityScore(s.genes) * pMult;
    }
    if (st === STAGE.ADULT) {
      if (s.sex === 'M') males.push(s);
      else if (s.pregnant) pregnantCount++;
      else femalesReady.push(s);
    }
    if (s.pregnant) s.gestationLeft -= dt;
    survivors.push(s);
  }

  // pass 2: births from finished pregnancies (blocked when pen is full)
  const newborns = [];
  for (const s of survivors) {
    if (s.pregnant && s.gestationLeft <= 0) {
      if (survivors.length + newborns.length < cap) {
        newborns.push(makeSheep({ sex: Math.random() < 0.5 ? 'M' : 'F', genes: inherit(s.genes, s.mateGenes) }));
        s.pregnant = false;
        s.mateGenes = null;
        born++;
      } else {
        s.gestationLeft = 0; // hold the lamb until space frees up
      }
    }
  }

  // pass 3: new impregnations — total slots = sum of male fertility minus already pregnant
  let capacityMale = 0;
  for (const m of males) capacityMale += Math.floor(m.genes.fertility + fBonus);
  let slots = capacityMale - pregnantCount;
  if (slots > 0 && males.length > 0) {
    for (const f of femalesReady) {
      if (slots <= 0) break;
      const m = males[(Math.random() * males.length) | 0];
      f.pregnant = true;
      f.gestationLeft = f.genes.gestation * bMult;
      f.mateGenes = m.genes;
      slots--;
    }
  }

  for (const nb of newborns) survivors.push(nb);

  // pass 4: auto-slaughter rules
  const a = state.autoSlaughter;
  const capFull = a.capCull && survivors.length >= cap;
  if (a.killOld || a.killMaleChildren || capFull) {
    const kept = [];
    for (const s of survivors) {
      const st = stageOf(s);
      let kill = false;
      if ((a.killOld || capFull) && st === STAGE.OLD) kill = true;
      if (a.killMaleChildren && s.sex === 'M' && st === STAGE.CHILD) kill = true;
      if (kill) { meatGain += meatFromSheep(s.genes, st); slaughtered++; }
      else kept.push(s);
    }
    state.sheep = kept;
  } else {
    state.sheep = survivors;
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

  if (state.sheep.length > INDIVIDUAL_CAP) {
    state.aggregate = toAggregate(state.sheep);
    state.sheep = [];
  }

  return { credits: creditsGain, wool: woolGain, meat: meatGain, born, died, slaughtered };
}

// Manual slaughter of one sheep by id (individual mode only).
export function slaughter(state, id) {
  const i = state.sheep.findIndex((s) => s.id === id);
  if (i < 0) return 0;
  const s = state.sheep[i];
  const meat = meatFromSheep(s.genes, stageOf(s));
  state.credits += meat * ECON.meatPriceBase * priceMult(state);
  state.stats.meatLifetime += meat;
  state.stats.credLifetime += meat * ECON.meatPriceBase * priceMult(state);
  state.stats.slaughtered++;
  state.sheep.splice(i, 1);
  return meat;
}
