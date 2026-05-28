// ===========================================================================
//  RNG a drobné matematické pomůcky.
// ===========================================================================

export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Box-Muller normální vzorek (z původní genetics.js).
export function gaussian(mean = 0, sd = 1) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Deterministický seedovaný RNG (mulberry32) pro eventy/seedování — aby šlo testovat.
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
