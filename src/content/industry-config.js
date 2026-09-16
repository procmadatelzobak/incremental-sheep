// ===========================================================================
//  Incremental Sheep — Průmysl a Strukturální Projekty (Konfigurace)
//  Všechny laditelné konstanty a parametry průmyslového jádra hry.
// ===========================================================================

export const INDUSTRY = {
  // Základní nastavení
  defaultShare: 0.5,
  staffThreshold: 1000, // dospělých pro 100% využití kapacity pracovní síly

  // Pracovní propustnost je omezená obsazeností, ne globálními bonusy.
  labor: {
    qualityFloor: 0.35,
    qualityScale: 0.65,
  },

  prestige: { runBonus: 5.0, cosmosBonus: 0.25 },
  construction: { builderDivisor: 8, laserScale: 0.2 },

  // Infrastrukturní podpora světů (upgradeSupport)
  support: {
    baseCost: 1e5,
    costGrowth: 8.0,
    targetBase: 1800,
    targetGrowth: 1.3,
    spareLaborFraction: 0.2,
    mainLaborFraction: 0.8,
    worldPremiums: {
      earth: 1,
      moon: 2,
      mars: 4,
      jupiter: 8,
      sphere: 16,
    },
    maxLimitBase: 4,
    maxLevel: 12,
    maxLimitPhaseOffset: 6,
    maxLimitPhaseScale: 2,
    recipe: { bones: 2, skin: 1, compute: 10 },
  },

  // Definice projektů jednotlivých fází
  jobs: {
    breeding: {
      id: 'breeding',
      phase: 2,
      label: 'Šlechtitelský program',
      target: 9000,
      recipe: { milk: 1 },
      profile: 'growth',
      worldId: 'earth',
    },
    commerce: {
      id: 'commerce',
      phase: 3,
      label: 'Obchodní síť',
      target: 14400,
      recipe: { cloth: 2, cheese: 1 },
      profile: 'textile',
      worldId: 'earth',
    },
    elixir: {
      id: 'elixir',
      phase: 4,
      label: 'Elixír nesmrtelnosti',
      target: 14400,
      recipe: { milk: 4 },
      profile: 'textile',
      worldId: 'earth',
    },
    research: {
      id: 'research',
      phase: 5,
      label: 'Výzkum vědomí',
      target: 16200,
      recipe: { compute: 100 },
      profile: 'compute',
      worldId: 'earth',
    },
    colonization: {
      phase: 6,
      target: 12000,
      recipe: { bones: 2, skin: 1, compute: 20 },
      profile: 'materials',
      sequence: ['moon', 'mars', 'jupiter'],
      labels: {
        moon: 'Kolonizace Měsíce',
        mars: 'Kolonizace Marsu',
        jupiter: 'Kolonizace Jupiteru',
      },
    },
    sphere: {
      phaseMin: 7,
      phaseMax: 8,
      label: 'Dysonova sféra',
      firstTarget: 108000,
      subsequentBaseTarget: 36000,
      targetGrowth: 0.5,
      maxCount: 5,
      energyPerSphere: 100,
      firstRecipe: { bones: 4, skin: 2, cloth: 2 },
      subsequentRecipe: { bones: 4, skin: 2, cloth: 2, energy: 24 },
      profile: 'materials',
    },
    judges: {
      id: 'judges',
      phase: 9,
      label: 'Soudci stád',
      target: 75000,
      recipe: { compute: 50, cloth: 2, bones: 2 },
      minOccupiedWorlds: 3,
      distinctProfiles: ['compute', 'textile', 'materials'],
    },
    blackhole: {
      phase: 10,
      label: 'Centrální sklad',
      profile: 'materials',
      timeDivisor: 36000,
    },
  },

  // Prodejní komodity pro sekvenční odsávání černé díry (Fáze 10)
  sellResources: [
    { key: 'wool', value: 1.0 },
    { key: 'milk', value: 2.7 },
    { key: 'meat', value: 6.0 },
    { key: 'cloth', value: 3.0 },
    { key: 'cheese', value: 5.0 },
    { key: 'bones', value: 4.0 },
    { key: 'skin', value: 5.0 },
    { key: 'brain', value: 22.0 },
  ],
};

// Knowledge accelerates both construction and the energy supply it needs.
export const projectMemory = state => (1 + INDUSTRY.prestige.runBonus * (state.prestige.runs || 0)) * (1 + INDUSTRY.prestige.cosmosBonus * (state.prestige.perks?.cosmos || 0));
