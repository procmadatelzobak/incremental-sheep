import { STAGE } from './config.js';
import { nextId, randomGenes } from './genetics.js';

export function makeSheep({ sex, genes, age = 0 }) {
  return {
    id: nextId(),
    sex,                // 'M' | 'F'
    genes,
    age,               // game-seconds lived
    pregnant: false,
    gestationLeft: 0,
    mateGenes: null,   // genes of the male that impregnated this female
    x: Math.random(),  // normalized position in pen (for rendering)
    y: Math.random(),
  };
}

// Stage boundaries in game-seconds. adultFrac is clamped so old stage keeps >=10% of life.
export function stageBoundaries(genes) {
  const life = genes.lifespan;
  const childFrac = genes.childhoodFrac;
  const adultFrac = Math.min(genes.adultFrac, 0.9 - childFrac);
  return { childEnd: life * childFrac, adultEnd: life * (childFrac + adultFrac), life };
}

export function stageOf(sheep) {
  const { childEnd, adultEnd } = stageBoundaries(sheep.genes);
  if (sheep.age < childEnd) return STAGE.CHILD;
  if (sheep.age < adultEnd) return STAGE.ADULT;
  return STAGE.OLD;
}

// Age that lands a fresh sheep just inside the adult stage (bought sheep arrive grown).
export function adultAge(genes) {
  return stageBoundaries(genes).childEnd + 0.5;
}

// Longer childhood yields higher-quality wool.
export function qualityScore(genes) {
  return genes.woolQuality * (0.75 + genes.childhoodFrac);
}

export function randomSheep(quality = 0, sex = null, grown = false) {
  const genes = randomGenes(quality);
  return makeSheep({
    sex: sex || (Math.random() < 0.5 ? 'M' : 'F'),
    genes,
    age: grown ? adultAge(genes) : 0,
  });
}
