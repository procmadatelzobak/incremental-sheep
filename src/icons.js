// ===========================================================================
//  Centrální mapa ikon. Používá se cíleně (zdroje, fáze, záložky, nákupy),
//  ne jako náhodná ozdoba.
// ===========================================================================
export const ICONS = {
  credits: '💰', sheep: '🐑', wool: '🧶', milk: '🥛', meat: '🥩', genes: '🧬',
  pasture: '🌾', processing: '🏭', station: '🚀', moon: '🌕', mars: '🔴', jupiter: '🪐',
  sphere: '☀️', compute: '🧠', knowledge: '📚', blackHole: '🕳️', singularity: '✨',
  builder: '🏗️', laser: '🔦', immortality: '🧪', storage: '📦', manager: '🧑‍🌾',
  prestige: '🕳️', stats: '📊', kronika: '📜', upgrades: '🛠️', energy: '⚡', lab: '🔬',
  soil: '🌱', bobky: '💩',
};

// ikona fáze (1–11)
export const PHASE_ICONS = {
  1: '🌱', 2: '🍼', 3: '👑', 4: '🧪', 5: '🧠', 6: '🚀', 7: '☀️', 8: '🌌', 9: '⚖️', 10: '🕳️', 11: '✨',
};

// ikona druhu lokace
export const KIND_ICONS = {
  meadow: '🌿', pasture: '🌾', moon: '🌕', mars: '🔴', jupiter: '🪐', sphere: '☀️',
};

// ikona zdroje (klíč = klíč v RESOURCES)
export const RES_ICONS = {
  credits: '💰', wool: '🧶', meat: '🥩', milk: '🥛', cloth: '🧵', cheese: '🧀',
  bones: '🦴', skin: '🟫', brain: '🧠', compute: '🧠', energy: '⚡', knowledge: '📚',
  bobky: '💩',
};
