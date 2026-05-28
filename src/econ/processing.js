// ===========================================================================
//  Zpracování (fáze 3+): Tkalcovny mění část syrové vlny na sukno a mléka na
//  sýr — dražší zboží. Bez Tkalcoven se nezpracovává nic; podíl roste s úrovní.
// ===========================================================================
import { BALANCE, UPGRADES } from '../config.js';

// Podíl syrové produkce, který se zpracuje (0 bez Tkalcoven, strop 90 %).
export const processFraction = (state) =>
  Math.min(0.9, UPGRADES.looms.per * (state.upgrades.looms || 0));

// Přemění část vyrobených surovin na zpracované (in-place v `produced`).
export function applyProcessing(produced, state) {
  if (state.phase < 3) return;
  const frac = processFraction(state);
  if (frac <= 0) return;
  for (const raw in BALANCE.processing) {
    const avail = produced[raw] || 0;
    if (avail <= 0) continue;
    const rec = BALANCE.processing[raw];
    const conv = avail * frac;
    produced[raw] = avail - conv;
    produced[rec.to] = (produced[rec.to] || 0) + conv * (rec.ratio || 1);
  }
}
