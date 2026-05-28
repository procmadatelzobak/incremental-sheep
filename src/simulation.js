import { STAGE, GENES, ECON, INDIVIDUAL_CAP } from './config.js';
import { stageOf, stageBoundaries, qualityScore, makeSheep } from './sheep.js';
import { inherit, breedingScore } from './genetics.js';
import { penCapacity, woolMult, breedingMult, priceMult, fertilityBonus } from './economy.js';
import { toAggregate, stepAggregate } from './population.js';

export function meatFromSheep(genes, stage) {
  const mult = stage === STAGE.ADULT ? ECON.adultMeatMult
             : stage === STAGE.OLD   ? ECON.oldMeatMult
             :                         ECON.childMeatMult;
  return genes.size * mult;
}

function belowGeneFloor(genes, cull) {
  const spec = GENES[cull.geneFloorGene];
  if (!spec) return false;
  const minVal = spec.min + (spec.max - spec.min) * cull.geneFloorThreshold;
  return genes[cull.geneFloorGene] < minVal;
}

export function step(state, dt) {
  if (state.aggregate) return stepAggregate(state, dt);

  const cap   = penCapacity(state.penLevel);
  const wMult = woolMult(state);
  const bMult = breedingMult(state);
  const pMult = priceMult(state);
  const fBonus= fertilityBonus(state);
  const cull  = state.cull || {};

  let creditsGain = 0, woolGain = 0, meatGain = 0;
  let born = 0, died = 0, slaughtered = 0;

  const survivors   = [];
  const males       = [];         // adult males this tick
  const femalesReady= [];
  let pregnantCount = 0;

  // ── Pass 1: age, wool, death, gestation ────────────────────────────────────
  for (const s of state.sheep) {
    s.age += dt;
    const { life } = stageBoundaries(s.genes);

    // Clear stud if he dies
    if (s.age >= life) {
      if (cull.studId === s.id) cull.studId = null;
      died++;
      continue;
    }

    const st = stageOf(s);
    if (st === STAGE.ADULT || st === STAGE.OLD) {
      const factor = st === STAGE.ADULT ? 1 : ECON.oldWoolMult;
      const wool   = s.genes.woolRate * wMult * factor * dt;
      woolGain     += wool;
      creditsGain  += wool * ECON.woolPriceBase * qualityScore(s.genes) * pMult;
    }
    if (st === STAGE.ADULT) {
      if (s.sex === 'M') males.push(s);
      else if (s.pregnant) pregnantCount++;
      else femalesReady.push(s);
    }
    if (s.pregnant) s.gestationLeft -= dt;
    survivors.push(s);
  }

  // ── Pass 2: births (with optional gene-floor cull) ─────────────────────────
  const newborns = [];
  for (const s of survivors) {
    if (!s.pregnant || s.gestationLeft > 0) continue;
    if (survivors.length + newborns.length >= cap) {
      s.gestationLeft = 0;  // hold until space frees up
      continue;
    }
    const nb = makeSheep({
      sex: Math.random() < 0.5 ? 'M' : 'F',
      genes: inherit(s.genes, s.mateGenes),
    });
    s.pregnant = false;
    s.mateGenes = null;
    born++;
    // Gene floor: cull newborns below threshold immediately
    if (cull.geneFloorEnabled && cull.geneFloorUnlocked && belowGeneFloor(nb.genes, cull)) {
      meatGain += meatFromSheep(nb.genes, STAGE.CHILD);
      slaughtered++;
    } else {
      newborns.push(nb);
    }
  }

  // ── Pass 3: mating — stud gets priority up to his fertility cap ────────────
  let capacityMale = 0;
  for (const m of males) capacityMale += Math.floor(m.genes.fertility + fBonus);
  let slots = capacityMale - pregnantCount;

  if (slots > 0 && males.length > 0) {
    const stud       = cull.studId ? males.find(m => m.id === cull.studId) : null;
    let studSlots    = stud ? Math.max(0, Math.floor(stud.genes.fertility + fBonus)) : 0;

    for (const f of femalesReady) {
      if (slots <= 0) break;
      const m = (stud && studSlots > 0) ? (studSlots--, stud)
              : males[(Math.random() * males.length) | 0];
      f.pregnant       = true;
      f.gestationLeft  = f.genes.gestation * bMult;
      f.mateGenes      = m.genes;
      slots--;
    }
  }

  for (const nb of newborns) survivors.push(nb);

  // ── Pass 4: culling rules ──────────────────────────────────────────────────
  const kept = [];
  // Collect all adult males for max-males enforcement
  const adultMales = survivors.filter(s => s.sex === 'M' && stageOf(s) === STAGE.ADULT);
  // Males to protect from max-males cull (stud is always safe)
  const maxMalesSet = new Set();
  if (cull.maxMalesEnabled && adultMales.length > cull.maxMales) {
    const excess = adultMales
      .filter(m => m.id !== cull.studId)
      .sort((a, b) => breedingScore(a.genes) - breedingScore(b.genes)); // worst first
    const toCull = excess.slice(0, adultMales.length - cull.maxMales);
    for (const m of toCull) maxMalesSet.add(m.id);
  }

  let popAfterCull = survivors.length;
  for (const s of survivors) {
    const st = stageOf(s);
    let kill = false;

    if (maxMalesSet.has(s.id) && st === STAGE[cull.maleCullStage?.toUpperCase() || 'ADULT']) kill = true;
    if (cull.killOld && st === STAGE.OLD)                         kill = true;
    if (cull.killMaleChildren && s.sex === 'M' && st === STAGE.CHILD) kill = true;

    if (kill) { meatGain += meatFromSheep(s.genes, st); slaughtered++; popAfterCull--; }
    else kept.push(s);
  }

  // ── Pass 5: "when full" rule ───────────────────────────────────────────────
  if (cull.whenFullUnlocked && cull.whenFull !== 'none' && kept.length >= cap) {
    let victim = null;
    if (cull.whenFull === 'oldest') {
      victim = kept.reduce((a, b) => a.age > b.age ? a : b, null);
    } else if (cull.whenFull === 'worstMale') {
      const keptMales = kept.filter(s => s.sex === 'M' && s.id !== cull.studId);
      if (keptMales.length) victim = keptMales.reduce((a, b) =>
        breedingScore(a.genes) < breedingScore(b.genes) ? a : b, keptMales[0]);
    } else if (cull.whenFull === 'worst') {
      const cullable = kept.filter(s => s.id !== cull.studId);
      if (cullable.length) victim = cullable.reduce((a, b) =>
        breedingScore(a.genes) < breedingScore(b.genes) ? a : b, cullable[0]);
    }
    if (victim) {
      meatGain += meatFromSheep(victim.genes, stageOf(victim));
      slaughtered++;
      const vi = kept.indexOf(victim);
      if (vi >= 0) kept.splice(vi, 1);
    }
  }

  state.sheep = kept;

  creditsGain += meatGain * ECON.meatPriceBase * pMult;
  state.credits   += creditsGain;
  state.gameTime  += dt;
  state.stats.woolLifetime  += woolGain;
  state.stats.meatLifetime  += meatGain;
  state.stats.credLifetime  += creditsGain;
  state.stats.born          += born;
  state.stats.diedAge       += died;
  state.stats.slaughtered   += slaughtered;

  if (state.sheep.length > INDIVIDUAL_CAP) {
    state.aggregate = toAggregate(state.sheep);
    state.sheep = [];
  }

  return { credits: creditsGain, wool: woolGain, meat: meatGain, born, died, slaughtered };
}

export function slaughter(state, id) {
  const i = state.sheep.findIndex(s => s.id === id);
  if (i < 0) return 0;
  const s = state.sheep[i];
  if (state.cull?.studId === s.id) state.cull.studId = null;
  const meat = meatFromSheep(s.genes, stageOf(s));
  state.credits += meat * ECON.meatPriceBase * priceMult(state);
  state.stats.meatLifetime  += meat;
  state.stats.credLifetime  += meat * ECON.meatPriceBase * priceMult(state);
  state.stats.slaughtered++;
  state.sheep.splice(i, 1);
  return meat;
}
