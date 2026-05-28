// ===========================================================================
//  Dashboard vizualizace stáda: fáze (child/adult/old) × pohlaví (M/F).
//  Zobrazuje horizontální sloupcový graf rozložení populace a genetický skóre.
// ===========================================================================
import { totalCount } from '../sim/cohort.js';
import { breedingScore } from '../sim/genetics.js';

const STAGE_COLORS = {
  child: { M: '#5ba34b', F: '#7ec96a' },
  adult: { M: '#b8a040', F: '#e7dcc0' },
  old:   { M: '#6e7478', F: '#9aa0a6' },
};
const STAGE_LABELS = { child: 'Mláďata', adult: 'Dospělí', old: 'Staří' };

export function drawHerd(canvas, group, ceilingMult) {
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1b2a1b';
  ctx.fillRect(0, 0, W, H);
  if (!group) return;
  const total = totalCount(group);
  if (total <= 0) return;

  const c = group.counts;
  const stages = ['child', 'adult', 'old'];

  // --- Horizontální sloupcový graf: fáze × pohlaví ---
  const pad = 6;
  const barAreaTop = pad;
  const barAreaH = H - pad * 2 - 16; // nechej prostor dole pro legendu
  const barH = Math.floor((barAreaH - (stages.length - 1) * 3) / stages.length);
  const barLeft = 70;
  const barMaxW = W - barLeft - pad - 40;

  ctx.font = '10px monospace';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < stages.length; i++) {
    const st = stages[i];
    const mCount = c.M[st];
    const fCount = c.F[st];
    const stTotal = mCount + fCount;
    const y = barAreaTop + i * (barH + 3);

    // Popisek vlevo
    ctx.fillStyle = '#ccc';
    ctx.textAlign = 'right';
    ctx.fillText(STAGE_LABELS[st], barLeft - 4, y + barH / 2);

    // Pruhy proporcionální k celkovému počtu
    const mW = total > 0 ? (mCount / total) * barMaxW : 0;
    const fW = total > 0 ? (fCount / total) * barMaxW : 0;

    // Samci
    ctx.fillStyle = STAGE_COLORS[st].M;
    ctx.fillRect(barLeft, y, mW, barH);

    // Samice
    ctx.fillStyle = STAGE_COLORS[st].F;
    ctx.fillRect(barLeft + mW, y, fW, barH);

    // Počet vpravo
    ctx.fillStyle = '#aaa';
    ctx.textAlign = 'left';
    const label = stTotal >= 1000 ? (stTotal / 1000).toFixed(1) + 'k' : Math.round(stTotal).toString();
    ctx.fillText(label, barLeft + mW + fW + 3, y + barH / 2);
  }

  // --- Spodní legenda: pohlaví + skóre ---
  const legendY = H - 12;
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';

  const mTotal = c.M.child + c.M.adult + c.M.old;
  const fTotal = c.F.child + c.F.adult + c.F.old;

  // Samci indikátor
  ctx.fillStyle = STAGE_COLORS.adult.M;
  ctx.fillRect(pad, legendY - 4, 8, 8);
  ctx.fillStyle = '#ccc';
  ctx.fillText(`♂ ${Math.round(mTotal)}`, pad + 10, legendY);

  // Samice indikátor
  const fX = pad + 70;
  ctx.fillStyle = STAGE_COLORS.adult.F;
  ctx.fillRect(fX, legendY - 4, 8, 8);
  ctx.fillStyle = '#ccc';
  ctx.fillText(`♀ ${Math.round(fTotal)}`, fX + 10, legendY);

  // Genetické skóre
  const score = breedingScore(group.genes, ceilingMult || 1);
  const scoreX = W - pad - 80;
  const scoreCol = score > 0.66 ? '#6aa84f' : score > 0.33 ? '#c9a227' : '#b06a3a';
  ctx.fillStyle = scoreCol;
  ctx.textAlign = 'right';
  ctx.fillText(`Gen: ${(score * 100).toFixed(0)}%`, W - pad, legendY);
}
