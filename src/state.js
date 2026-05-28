export function newGame() {
  return {
    version: 1,
    credits: 0,
    upgrades: { woolRate: 0, breedingSpeed: 0, salePrice: 0, fertility: 0 },
    penLevel: 0,
    purchaseCount: { random: 0, premium: 0 },
    autoSlaughter: {
      killOld: false, killOldUnlocked: false,
      killMaleChildren: false, killMaleChildrenUnlocked: false,
      capCull: false, capCullUnlocked: false,
    },
    sheep: [],
    aggregate: null,        // populated when herd exceeds INDIVIDUAL_CAP
    stats: { woolLifetime: 0, meatLifetime: 0, credLifetime: 0, born: 0, diedAge: 0, slaughtered: 0 },
    gameTime: 0,
    startedPair: false,
    lastSaved: Date.now(),
    income: { credits: 0, wool: 0, meat: 0 }, // per-second display, recomputed at runtime
  };
}
