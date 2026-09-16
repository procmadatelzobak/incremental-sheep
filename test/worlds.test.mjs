import { newGame } from '../src/io/state.js';
import { totalCount } from '../src/sim/cohort.js';
import { createGroup, moveGroup, mergeGroups } from '../src/sim/groups.js';
import { cullProfileWeights, selectedNewbornDist } from '../src/sim/genetics.js';
import { herdCapacity, worldCapacity, worldPopulation, worldSupportFactor } from '../src/content/locations.js';

let pass = 0, fail = 0;
function check(name, value) { if (value) pass++; else { fail++; console.error('  FAIL:', name); } }
const near = (a, b, eps = 1e-8) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

// Local capacity respects each planet's own land, soil and support.  New-game
// state intentionally has no industry shape yet: level zero is a valid default.
{
  const s = newGame();
  s.phase = 6;
  s.land.worlds.moon.counts = { 0: 1 };
  const rawEarth = worldCapacity(s, 'earth');
  const moon = worldCapacity(s, 'moon');
  check('phase 6 capacity is local', rawEarth > 0 && moon > 0 && herdCapacity(s) >= rawEarth + moon - 1e-6);
  check('world support is bounded', worldSupportFactor(s, 'earth') >= 0 && worldSupportFactor(s, 'earth') <= 1);
  s.industry = { worlds: { earth: { level: 1, work: 0 } } };
  check('habitat level increases usable earth capacity', worldCapacity(s, 'earth') >= rawEarth);
}

// Partial transfer creates a second local herd without creating or losing sheep.
{
  const s = newGame(); s.phase = 6;
  s.land.worlds.moon.counts = { 0: 1 };
  s.groups[0].counts.M.adult = 10; s.groups[0].counts.F.adult = 30;
  const before = totalCount(s.groups[0]);
  const moved = moveGroup(s, s.groups[0].id, 'moon', 0.25);
  check('partial move creates local herd', !!moved && moved.worldId === 'moon' && s.groups.length === 2);
  check('move conserves headcount', near(totalCount(s.groups[0]) + totalCount(moved), before));
  check('world population follows moved herd', near(worldPopulation(s, 'moon'), totalCount(moved)));
  check('move is unavailable before Exodus', moveGroup(Object.assign(newGame(), { phase: 5 }), 1, 'moon') === null);
  const empty = newGame(); empty.phase = 6;
  check('move rejects an unowned destination', moveGroup(empty, empty.groups[0].id, 'moon') === null);
  check('move cannot split a herd without changing world', moveGroup(s, s.groups[0].id, 'earth', 0.5) === null);
  check('move rejects an infinitesimal transfer', moveGroup(s, s.groups[0].id, 'moon', 0.001) === null);
}

// A merge preserves count and carries between-herd variance into sigma.
{
  const s = newGame(); s.phase = 6;
  const a = s.groups[0]; a.counts.M.adult = 10; a.counts.F.adult = 10; a.genes.woolRate = { mu: 1, sigma: 0.1 };
  a.bredFracF = 0.2; a.soil.q = 0.2;
  const b = createGroup(s); b.counts.M.adult = 10; b.counts.F.adult = 30; b.genes.woolRate = { mu: 3, sigma: 0.1 }; b.bredFracF = 0.8; b.soil.q = 0.8;
  const before = totalCount(a) + totalCount(b);
  const merged = mergeGroups(s, b.id, a.id);
  check('same-world merge succeeds', merged === a && s.groups.length === 1);
  check('merge conserves headcount', near(totalCount(a), before));
  check('merge uses weighted mean', near(a.genes.woolRate.mu, 7 / 3));
  check('merge retains between-herd sigma', a.genes.woolRate.sigma > 0.9);
  check('merge weights lactation by adult females', near(a.bredFracF, 0.65));
  check('merge weights soil by herd headcount', near(a.soil.q, 0.6));
}

// Profiles normalise their power and cannot select genes that have not been
// discovered in the current phase.
{
  const textile = cullProfileWeights('profile:textile', 1);
  const norm = Math.sqrt(Object.values(textile).reduce((sum, w) => sum + w * w, 0));
  check('profile weights are normalised', near(norm, 1));
  check('textile profile chooses slow maturation', textile.maturity < 0);
  check('compute profile excludes locked intelligence', !Object.hasOwn(cullProfileWeights('profile:compute', 4), 'intelligence'));
  const noIntel = selectedNewbornDist('intelligence', 1, 1, { enabled: true, gene: 'profile:compute', cutFrac: 0.5 }, 1, 1, 4);
  check('locked profile leaves intelligence unchanged', near(noIntel.mu, 1) && near(noIntel.sigma, 1));
  const yesIntel = selectedNewbornDist('intelligence', 1, 1, { enabled: true, gene: 'profile:compute', cutFrac: 0.5 }, 1, 1, 5);
  check('unlocked profile selects intelligence', yesIntel.mu > 1 && yesIntel.sigma < 1);
  const lockedSingle = selectedNewbornDist('intelligence', 1, 1, { enabled: true, gene: 'intelligence', cutFrac: 0.5 }, 1, 1, 4);
  check('locked single-gene selection is inert', near(lockedSingle.mu, 1) && near(lockedSingle.sigma, 1));
}

console.log(`worlds: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
