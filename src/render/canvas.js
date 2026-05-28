// ===========================================================================
//  Dashboard vizualizace stáda: fáze (child/adult/old) × pohlaví (M/F).
//  REDESIGN: pozadí a popisky se ladí s motivem (louka → vesmír) podle --cosmic.
//  Jediná změna oproti originálu jsou barvy závislé na motivu; logika je stejná.
// ===========================================================================
import { totalCount } from '../sim/cohort.js';
import { breedingScore } from '../sim/genetics.js';

const STAGE_COLORS = {
  child: { M: '#5ba34b', F: '#8ed27a' },
  adult: { M: '#c9a227', F: '#e7dcc0' },
  old:   { M: '#8a9096', F: '#b6bcc2' },
};
const STAGE_LABELS = { child: 'Mláďata', adult: 'Dospělí', old: 'Staří' };

// --- motivové barvy --------------------------------------------------------
function cosmic() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cosmic'));
  return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
function mix(a, b, t) { // hex lerp
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const c = pa.map((x, i) => Math.round(x + (pb[i] - x) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function drawHerd(canvas, group, ceilingMult) {
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const t = cosmic();
  // motivové barvy
  const bgTop = mix('#cfe6c0', '#3a2a55', t);
  const bgBot = mix('#a9cf94', '#181030', t);
  const labelCol = mix('#46603a', '#d6cce8', t);
  const numCol = mix('#5c6b50', '#a99fc2', t);

  ctx.clearRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, bgTop); grad.addColorStop(1, bgBot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  if (!group) return;
  const total = totalCount(group);
  if (total <= 0) return;

  const c = group.counts;
  const stages = ['child', 'adult', 'old'];

  const pad = 6;
  const barAreaTop = pad;
  const barAreaH = H - pad * 2 - 16;
  const barH = Math.floor((barAreaH - (stages.length - 1) * 3) / stages.length);
  const barLeft = 70;
  const barMaxW = W - barLeft - pad - 40;

  ctx.font = '10px "Hanken Grotesk", monospace';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < stages.length; i++) {
    const st = stages[i];
    const mCount = c.M[st], fCount = c.F[st];
    const stTotal = mCount + fCount;
    const y = barAreaTop + i * (barH + 3);

    ctx.fillStyle = labelCol;
    ctx.textAlign = 'right';
    ctx.fillText(STAGE_LABELS[st], barLeft - 4, y + barH / 2);

    const mW = total > 0 ? (mCount / total) * barMaxW : 0;
    const fW = total > 0 ? (fCount / total) * barMaxW : 0;

    // jemné pozadí dráhy
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(barLeft, y, barMaxW, barH);

    ctx.fillStyle = STAGE_COLORS[st].M;
    ctx.fillRect(barLeft, y, mW, barH);
    ctx.fillStyle = STAGE_COLORS[st].F;
    ctx.fillRect(barLeft + mW, y, fW, barH);

    ctx.fillStyle = numCol;
    ctx.textAlign = 'left';
    const label = stTotal >= 1000 ? (stTotal / 1000).toFixed(1) + 'k' : Math.round(stTotal).toString();
    ctx.fillText(label, barLeft + mW + fW + 3, y + barH / 2);
  }

  const legendY = H - 12;
  ctx.font = '9px "Hanken Grotesk", monospace';
  ctx.textAlign = 'left';
  const mTotal = c.M.child + c.M.adult + c.M.old;
  const fTotal = c.F.child + c.F.adult + c.F.old;

  ctx.fillStyle = STAGE_COLORS.adult.M;
  ctx.fillRect(pad, legendY - 4, 8, 8);
  ctx.fillStyle = labelCol;
  ctx.fillText(`♂ ${Math.round(mTotal)}`, pad + 10, legendY);

  const fX = pad + 70;
  ctx.fillStyle = STAGE_COLORS.adult.F;
  ctx.fillRect(fX, legendY - 4, 8, 8);
  ctx.fillStyle = labelCol;
  ctx.fillText(`♀ ${Math.round(fTotal)}`, fX + 10, legendY);

  const score = breedingScore(group.genes, ceilingMult || 1);
  const scoreCol = score > 0.66 ? '#5b9d4f' : score > 0.33 ? '#c9a227' : '#c0784a';
  ctx.fillStyle = scoreCol;
  ctx.textAlign = 'right';
  ctx.fillText(`Gen: ${(score * 100).toFixed(0)}%`, W - pad, legendY);
}
