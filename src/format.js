const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

// Počet ovcí: model je spojitý (float), ale hráči ukazujeme celé ovce (#18).
export const fmtCount = (n) => fmt(Math.round(Number(n) || 0));

export function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.floor(n).toString();
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier < SUFFIX.length) {
    const scaled = n / 1000 ** tier;
    return scaled.toFixed(scaled < 100 ? 2 : 0) + SUFFIX[tier];
  }
  return n.toExponential(2);
}
