// ===========================================================================
//  Produkce skupiny za tik: vlna, mléko, výpočet (z μ genů a počtů).
//  Maso a části vznikají jen z porážky (viz groups.js).
//  ctx.env = produkční prostředí (vážený průměr světů dle podílu rozlohy).
// ===========================================================================
import { childFracOf } from './cohort.js';

export function produce(group, dt, ctx, state) {
  const g = group.genes, c = group.counts, env = ctx.env || {};
  const adults = c.M.adult + c.F.adult;
  const olds = c.M.old + c.F.old;
  const out = {};

  // VLNA: dospělí plně, staří 50 %; kvalita (z woolQuality + delšího dětství) škáluje přímo.
  // Pomalejší dospívání (delší dětství) = vyšší kvalita vlny → tradeoff s rychlostí dospívání.
  const woolPop = adults + olds * 0.5;
  const quality = g.woolQuality.mu * (0.75 + childFracOf(g));
  out.wool = woolPop * g.woolRate.mu * quality * ctx.woolMult * (env.woolMult || 1) * dt;

  // MLÉKO (fáze 2+): jen laktující samice (po prvním oplodnění).
  if (state.phase >= 2) {
    const lact = c.F.adult * group.bredFracF;
    out.milk = lact * g.milkRate.mu * ctx.milkMult * (env.milkMult || 1) * dt;
  }

  // VÝPOČET (fáze 5+): chytré ovce.
  if (state.phase >= 5) {
    out.compute = adults * g.intelligence.mu * ctx.computeMult * 0.05 * dt;
  }
  return out;
}
