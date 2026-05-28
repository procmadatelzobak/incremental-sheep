// ===========================================================================
//  Lehké plátno-akcenty: hustotní "blob" stáda. Defenzivní (no-op bez canvasu).
// ===========================================================================
import { totalCount } from '../sim/cohort.js';

const STAGE_COLOR = { child: '#7ec96a', adult: '#e7dcc0', old: '#9aa0a6' };

export function drawHerd(canvas, group) {
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
  // počet teček škáluje logaritmicky; barva dle převažujícího stádia
  const dots = Math.min(400, Math.max(6, Math.round(12 * Math.log10(total + 10))));
  const c = group.counts;
  const stages = ['child', 'adult', 'old'];
  const weights = stages.map(s => (c.M[s] + c.F[s]) / total);
  let seed = 1234;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < dots; i++) {
    const r = rnd();
    let st = 'adult', acc = 0;
    for (let k = 0; k < 3; k++) { acc += weights[k]; if (r <= acc) { st = stages[k]; break; } }
    const x = rnd() * (W - 8) + 4;
    const y = rnd() * (H - 8) + 4;
    ctx.fillStyle = STAGE_COLOR[st];
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(x, y, 2.5 + group.genes.size.mu * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
