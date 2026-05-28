export function cullDefaults() {
  return {
    // Male cap
    maxMalesEnabled: false,
    maxMales: 2,
    maleCullStage: 'adult',      // 'child' | 'adult'

    // Basic rules (always free)
    killOld: false,
    killMaleChildren: false,

    // When full (unlockable)
    whenFullUnlocked: false,
    whenFull: 'none',            // 'none' | 'oldest' | 'worstMale' | 'worst'

    // Gene floor (unlockable)
    geneFloorUnlocked: false,
    geneFloorEnabled: false,
    geneFloorGene: 'woolRate',
    geneFloorThreshold: 0.20,    // cull lamb if gene < min + range*threshold

    // Preferred stud (adult male id; null = none)
    studId: null,
  };
}

export function newGame() {
  return {
    version: 2,
    credits: 25,
    upgrades: { woolRate: 0, breedingSpeed: 0, salePrice: 0, fertility: 0 },
    penLevel: 0,
    purchaseCount: { random: 0, premium: 0 },
    cull: cullDefaults(),
    sheep: [],
    aggregate: null,
    stats: { woolLifetime: 0, meatLifetime: 0, credLifetime: 0, born: 0, diedAge: 0, slaughtered: 0 },
    gameTime: 0,
    startedPair: false,
    lastSaved: Date.now(),
    income: { credits: 0, wool: 0, meat: 0 },
  };
}
