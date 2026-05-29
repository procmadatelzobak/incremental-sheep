// ===========================================================================
//  Matematika normálního rozdělení (bez knihoven).
//  Jádro šlechtění: selekce = useknutý normál → μ nahoru, σ dolů.
// ===========================================================================

const SQRT2PI = Math.sqrt(2 * Math.PI);
const SQRT2 = Math.SQRT2;

// Hustota standardního normálu.
export function phi(x) {
  return Math.exp(-0.5 * x * x) / SQRT2PI;
}

// erf — Abramowitz & Stegun 7.1.26 (přesnost ~1e-7).
export function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}

// Kumulativní distribuční funkce standardního normálu.
export function Phi(x) {
  return 0.5 * (1 + erf(x / SQRT2));
}

// Inverzní CDF (probit) — Acklamova racionální aproximace.
export function probit(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const plow = 0.02425, phigh = 1 - plow;
  let q, r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= phigh) {
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

// Selekce: ponech horní (1-p) podíl rozdělení N(mu,sigma) → nové {mu,sigma}.
// lowerBetter: ponech dolní (1-p) podíl (usekni horní p).
// floor: minimální sigma (drží variabilitu, aby šlo šlechtit napořád).
export function selectTruncate(mu, sigma, p, lowerBetter = false, floor = 1e-9) {
  p = Math.max(0, Math.min(0.99, p));
  if (p <= 0 || sigma <= floor) return { mu, sigma: Math.max(sigma, floor) };
  const alpha = probit(p);              // dolní mez v z-jednotkách
  const lambda = phi(alpha) / (1 - p);  // inverzní Millsův poměr (horní tail)
  const varFactor = Math.max(0, 1 - lambda * (lambda - alpha));
  const newMu = lowerBetter ? mu - sigma * lambda : mu + sigma * lambda;
  const newSigma = Math.max(floor, sigma * Math.sqrt(varFactor));
  return { mu: newMu, sigma: newSigma };
}

// Stabilizační selekce: udržuje mu, zmenšuje sigma (usekne p/2 zdola i shora).
export function selectStabilizing(mu, sigma, p, floor = 1e-9) {
  p = Math.max(0, Math.min(0.99, p));
  if (p <= 0 || sigma <= floor) return { mu, sigma: Math.max(sigma, floor) };
  const z = probit(p / 2);
  const varFactor = Math.max(0, 1 + (2 * z * phi(z)) / (1 - p));
  const newSigma = Math.max(floor, sigma * Math.sqrt(varFactor));
  return { mu, sigma: newSigma };
}

// Sloučení dvou normálů vážené počty (n s {mu0,s0}, b s {mu1,s1}).
export function mixNormal(n, mu0, s0, b, mu1, s1) {
  const N = n + b;
  if (N <= 0) return { mu: mu0, sigma: s0 };
  if (n <= 0) return { mu: mu1, sigma: s1 };
  const mu = (n * mu0 + b * mu1) / N;
  const v = (n * (s0 * s0 + mu0 * mu0) + b * (s1 * s1 + mu1 * mu1)) / N - mu * mu;
  return { mu, sigma: Math.sqrt(Math.max(0, v)) };
}
