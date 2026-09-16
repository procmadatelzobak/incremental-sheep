// ===========================================================================
//  Prestiž: zažehnutí černé díry (reset s přenosem Vědění) a singularita (NG+).
// ===========================================================================
import { BALANCE } from '../config.js';
import { newGame, prestigeCarry } from '../io/state.js';
import { updateStory } from './story.js';

export const canIgnite = (state) => state.phase === 10 && state.prestige.centralWarehouse >= state.prestige.threshold;

function replaceState(state, fresh) {
  for (const k in state) delete state[k];
  Object.assign(state, fresh);
}

// Zažehni černou díru: reset běhu, přenes Vědění + perky, příští běh rychlejší.
export function igniteBlackHole(state) {
  if (!canIgnite(state)) return 0;
  const award = BALANCE.prestige.award(state.prestige.centralWarehouse, BALANCE.prestige.blackHoleBase, state.prestige.runs);
  const carry = prestigeCarry(state);
  carry.knowledge += award;
  carry.knowledgeLifetime += award;
  carry.runs += 1;
  if (carry.knowledgeLifetime >= BALANCE.prestige.singularityKnowledge) carry.singularity = true;
  replaceState(state, newGame(carry));
  updateStory(state);
  return award;
}

export const singularityAvailable = state => state.prestige.singularity && state.phase === 10 && canIgnite(state);

// Revelation remains visible until the player explicitly starts New Game+.
export function triggerSingularity(state) {
  if (!singularityAvailable(state)) return false;
  state.phase = 11;
  state.flags.preludeUnlocked = true;
  state.meta.singularityAt = state.meta.totalGameTime;
  state.meta.epithet = 'Ten, Jenž Střihá';
  updateStory(state);
  return true;
}

export function startNewGamePlus(state) {
  if (state.phase !== 11) return false;
  const ngPlus = (state.meta.ngPlus || 0) + 1;
  const carry = prestigeCarry(state);
  carry.knowledge += 100;
  replaceState(state, newGame(carry));
  state.flags.preludeUnlocked = true;
  state.meta.ngPlus = ngPlus;
  return true;
}
