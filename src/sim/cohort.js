// ===========================================================================
//  Kohortový model: stárnutí (tok mezi stádii) a porody (agregovaně).
// ===========================================================================
import { GENES } from '../config.js';
import { clamp } from '../rng.js';
import { mixNormal } from './distribution.js';

export const STAGES = ['child', 'adult', 'old'];
export const SEXES = ['M', 'F'];

export function emptyCounts() {
  return { M: { child: 0, adult: 0, old: 0 }, F: { child: 0, adult: 0, old: 0 } };
}

export function totalCount(group) {
  const c = group.counts;
  return c.M.child + c.M.adult + c.M.old + c.F.child + c.F.adult + c.F.old;
}
export const totalPopulation = (state) => state.groups.reduce((t, g) => t + totalCount(g), 0);
export function adultCount(group) { return group.counts.M.adult + group.counts.F.adult; }
export function stageTotal(group, stage) { return group.counts.M[stage] + group.counts.F[stage]; }

// Hranice stádií z průměrných genů (stáří vždy ≥ 10 % života).
export function stageBoundaries(genes) {
  const life = genes.lifespan.mu;
  const childFrac = genes.childhoodFrac.mu;
  const adultFrac = Math.min(genes.adultFrac.mu, 0.9 - childFrac);
  const childDur = life * childFrac;
  const adultDur = life * adultFrac;
  const oldDur = Math.max(life * 0.05, life - childDur - adultDur);
  return { childDur, adultDur, oldDur, life };
}

const flow = (n, d, dt) => (d > 0 ? Math.min(n, (n / d) * dt) : n);

// Stárnutí: child→adult→old→smrt. Vrací počet uhynulých stářím (bez masa).
export function aging(group, dt) {
  const b = stageBoundaries(group.genes);
  let deaths = 0;
  for (const s of SEXES) {
    const c = group.counts[s];
    const c2a = flow(c.child, b.childDur, dt);
    const a2o = flow(c.adult, b.adultDur, dt);
    const o2d = flow(c.old, b.oldDur, dt);
    c.child = Math.max(0, c.child - c2a);
    c.adult = Math.max(0, c.adult + c2a - a2o);
    c.old = Math.max(0, c.old + a2o - o2d);
    deaths += o2d;
  }
  return deaths;
}

// Porody: limitované plodností samců, dospělými samicemi, březostí a kapacitou.
// ctx: { fertBonus, breedMult, birthMult }. headroom = volné místo (sdílené přes
// všechny pozemky). Vrací počet narozených (pro statistiky).
export function births(group, headroom, dt, ctx) {
  const g = group.genes, c = group.counts;
  const total = totalCount(group);
  const fert = Math.max(0, g.fertility.mu + (ctx.fertBonus || 0));
  const gest = Math.max(1, g.gestation.mu * (ctx.breedMult || 1));
  const maleCap = c.M.adult * fert;
  const mated = Math.min(c.F.adult, maleCap);
  let b = (mated / gest) * dt * (ctx.birthMult || 1);
  b = Math.min(b, Math.max(0, headroom));
  if (b > 0) {
    c.M.child += b / 2;
    c.F.child += b / 2;
    for (const k in g) {
      const spec = GENES[k];
      const sChild = Math.sqrt((g[k].sigma * g[k].sigma) / 2 + spec.mut * spec.mut);
      const mixed = mixNormal(total, g[k].mu, g[k].sigma, b, g[k].mu, sChild);
      g[k].mu = mixed.mu;
      g[k].sigma = mixed.sigma;
    }
  }
  // Mléko: podíl oplodněných samic se ratchetuje k 1 (přikázání fáze 2).
  if (c.F.adult > 1e-9) {
    const newly = Math.min(1, mated / c.F.adult);
    group.bredFracF = clamp(group.bredFracF + newly * (dt / gest) * (1 - group.bredFracF), 0, 1);
  }
  return b;
}
