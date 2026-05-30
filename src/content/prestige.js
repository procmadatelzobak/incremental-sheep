// ===========================================================================
//  Prestiž: zažehnutí černé díry (reset s přenosem Vědění) a singularita (NG+).
// ===========================================================================
import { BALANCE } from '../config.js';
import { newGame, prestigeCarry } from '../io/state.js';
import { behemotPrestige } from './behemot.js';

export const canIgnite = (state) => state.phase >= 10 && state.prestige.centralWarehouse >= state.prestige.threshold;

function replaceState(state, fresh) {
  for (const k in state) delete state[k];
  Object.assign(state, fresh);
}

// Zažehni černou díru: reset běhu, přenes Vědění + perky, příští běh rychlejší.
export function igniteBlackHole(state) {
  if (!canIgnite(state)) return 0;
  const award = BALANCE.prestige.award(state.prestige.centralWarehouse, BALANCE.prestige.blackHoleBase, state.prestige.runs);
  behemotPrestige(state);                 // artefakty přežijí, Moudrost roste (Etapa 5)
  const carry = prestigeCarry(state);
  carry.knowledge += award;
  carry.knowledgeLifetime += award;
  carry.runs += 1;
  if (carry.knowledgeLifetime >= BALANCE.prestige.singularityKnowledge) carry.singularity = true;
  replaceState(state, newGame(carry));
  return award;
}

export const singularityAvailable = (state) => state.prestige.singularity && state.phase >= 10;

// Singularita = New Game+ smyčka (odemče Předmluvu, bonus Vědění).
export function triggerSingularity(state) {
  if (!singularityAvailable(state)) return false;
  behemotPrestige(state);                 // artefakty přežijí, Moudrost roste (Etapa 5)
  const carry = prestigeCarry(state);
  carry.knowledge += 100;
  carry.runs += 1;
  replaceState(state, newGame(carry));
  state.flags.preludeUnlocked = true;
  state.meta.ngPlus = carry.runs;
  return true;
}
