import { phi, Phi, probit, erf, selectTruncate, mixNormal, selectStabilizing } from '../src/sim/distribution.js';

let pass = 0, fail = 0;
const approx = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
function check(name, cond) { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } }

// erf / Phi sanity
check('erf(0)=0', approx(erf(0), 0));
check('Phi(0)=0.5', approx(Phi(0), 0.5));
check('Phi(1.96)~0.975', approx(Phi(1.96), 0.975, 2e-3));
check('probit(0.975)~1.96', approx(probit(0.975), 1.96, 2e-3));
check('probit(0.5)=0', approx(probit(0.5), 0, 1e-6));
check('phi(0)~0.3989', approx(phi(0), 0.39894, 1e-4));

// selekce: useknutí spodních 50 % zvedne průměr a zmenší rozptyl
{
  const r = selectTruncate(10, 2, 0.5, false, 0.01);
  check('select raises mu', r.mu > 10);
  check('select lowers sigma', r.sigma < 2);
  // teoreticky: useknutí dolní 1/2 → mu+sigma*phi(0)/0.5 = 10 + 2*0.7979 = 11.596
  check('select mu value', approx(r.mu, 11.596, 0.05));
}
// lowerBetter: useknutí horních 50 % sníží průměr
{
  const r = selectTruncate(25, 4, 0.5, true, 0.01);
  check('select lowerBetter drops mu', r.mu < 25);
  check('select lowerBetter lowers sigma', r.sigma < 4);
}
// floor drží sigmu
{
  const r = selectTruncate(10, 0.005, 0.8, false, 0.1);
  check('sigma floor respected', r.sigma >= 0.1 - 1e-9);
}
// mix: stejné průměry → průměr stejný, rozptyl mezi
{
  const r = mixNormal(100, 5, 1, 100, 5, 1);
  check('mix equal means', approx(r.mu, 5));
  check('mix equal sigma', approx(r.sigma, 1, 1e-6));
}
{
  const r = mixNormal(0, 5, 1, 50, 8, 2);
  check('mix n=0 returns other', approx(r.mu, 8) && approx(r.sigma, 2));
}
{
  // 50 dětí s nižším mu vmícháno do 50 dospělých → mu mezi
  const r = mixNormal(50, 10, 1, 50, 8, 1);
  check('mix different means', approx(r.mu, 9) && r.sigma > 1);
}

// selectStabilizing (#40): μ zůstává, σ klesá s rostoucím p
{
  const r = selectStabilizing(10, 2, 0.5);
  check('stabilizing keeps mu', approx(r.mu, 10));
  check('stabilizing lowers sigma', r.sigma < 2);
}
{
  const r50 = selectStabilizing(5, 1, 0.5);
  const r90 = selectStabilizing(5, 1, 0.9);
  check('stabilizing higher p → lower sigma', r90.sigma < r50.sigma);
}
{
  const r = selectStabilizing(10, 0.05, 0.9, 0.1);
  check('stabilizing sigma floor respected', r.sigma >= 0.1 - 1e-9);
}

console.log(`distribution: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
