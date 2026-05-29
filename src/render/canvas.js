// ===========================================================================
//  Vizualizace stáda jako HEJNO OVCÍ (jako v prototypu redesignu).
//  Drop-in náhrada render/canvas.js — stejná signatura drawHerd(canvas, group,
//  ceilingMult), takže ui.js měnit nemusíš. Pozadí i ovce se ladí s --cosmic
//  (louka → vesmír). Dole kompaktní legenda: ♂/♀ a genetické skóre.
// ===========================================================================
import { totalCount } from '../sim/cohort.js';
import { breedingScore } from '../sim/genetics.js';

// stabilní rozmístění ovcí (x,y ve frakcích plochy pastvy)
const POS = [
  [0.08,0.86],[0.20,0.96],[0.32,0.82],[0.44,0.98],[0.56,0.86],[0.68,0.99],[0.80,0.84],[0.91,0.95],
  [0.14,0.64],[0.27,0.58],[0.40,0.68],[0.53,0.56],[0.66,0.66],[0.78,0.58],[0.89,0.65],
  [0.22,0.40],[0.36,0.46],[0.50,0.38],[0.63,0.46],[0.76,0.40],[0.10,0.46],
];
function flockCount(total) { return Math.min(POS.length, Math.max(5, Math.round(5 + Math.log10(total + 1) * 5))); }

function cosmic() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cosmic'));
  return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
// ostrý překlop pro TEXT/ovce — flipne rychle mezi fází 5 a 6, aby legenda
// ani ovce nikdy neuvázly v šedé (stejná logika jako --ms v CSS).
function cosmicSharp() {
  return Math.max(0, Math.min(1, (cosmic() - 0.36) * 7.7));
}
function mix(a, b, t) {
  const pa = [parseInt(a.slice(1,3),16),parseInt(a.slice(3,5),16),parseInt(a.slice(5,7),16)];
  const pb = [parseInt(b.slice(1,3),16),parseInt(b.slice(3,5),16),parseInt(b.slice(5,7),16)];
  const c = pa.map((x,i)=>Math.round(x+(pb[i]-x)*t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function drawSheep(ctx, x, y, s, bodyCol, headCol, glow) {
  // stín
  ctx.fillStyle = 'rgba(20,30,12,0.18)';
  ctx.beginPath(); ctx.ellipse(x, y + 1.5 * s, 8 * s, 2.4 * s, 0, 0, Math.PI * 2); ctx.fill();
  // nohy
  ctx.strokeStyle = headCol; ctx.lineWidth = Math.max(1, 1.1 * s);
  ctx.beginPath();
  ctx.moveTo(x - 3 * s, y + 1.5 * s); ctx.lineTo(x - 3 * s, y + 3.6 * s);
  ctx.moveTo(x + 2 * s, y + 1.5 * s); ctx.lineTo(x + 2 * s, y + 3.6 * s);
  ctx.stroke();
  // tělo (chomáč)
  if (glow > 0) { ctx.shadowColor = `rgba(150,210,255,${glow})`; ctx.shadowBlur = 7 * s; }
  ctx.fillStyle = bodyCol;
  ctx.beginPath(); ctx.ellipse(x, y - 1 * s, 7.5 * s, 5.2 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  // hlava
  ctx.fillStyle = headCol;
  ctx.beginPath(); ctx.ellipse(x + 6.5 * s, y - 1.5 * s, 3 * s, 2.7 * s, 0, 0, Math.PI * 2); ctx.fill();
  // ouško
  ctx.beginPath(); ctx.ellipse(x + 5 * s, y - 3.6 * s, 1.3 * s, 1 * s, -0.5, 0, Math.PI * 2); ctx.fill();
}

export function drawHerd(canvas, group, ceilingMult) {
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // ostré vykreslení v zobrazované velikosti
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = cw, H = ch;
  const t = cosmic();

  // --- nebe + země (laděné s motivem) ---
  ctx.clearRect(0, 0, W, H);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, mix('#bfe3f2', '#241a40', t));
  sky.addColorStop(0.55, mix('#cfeac2', '#1c1436', t));
  sky.addColorStop(1, mix('#a6cf8f', '#140e2a', t));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // hvězdy v kosmu
  if (t > 0.05) {
    ctx.fillStyle = `rgba(255,255,255,${0.8 * t})`;
    const stars = [[0.15,0.2],[0.4,0.12],[0.62,0.25],[0.8,0.16],[0.28,0.32],[0.9,0.34],[0.5,0.3]];
    for (const [sx, sy] of stars) { ctx.beginPath(); ctx.arc(sx * W, sy * H, 0.9, 0, Math.PI * 2); ctx.fill(); }
  }
  // slunce / měsíc
  ctx.beginPath(); ctx.arc(W - 26, 18, 11, 0, Math.PI * 2);
  ctx.fillStyle = mix('#f2d873', '#cdbfe6', t); ctx.shadowColor = mix('rgba(242,216,115,0.9)', 'rgba(180,160,230,0.7)', t); ctx.shadowBlur = 16; ctx.fill(); ctx.shadowBlur = 0;

  if (!group) return;
  const total = totalCount(group);

  // --- hejno ---
  const padTop = 8, padBot = 16;
  const n = total > 0 ? flockCount(total) : 0;
  const bodyCol = mix('#fbf7ec', '#dbe7f2', t);
  const headCol = mix('#473f33', '#2a2440', t);
  const minS = 1.4, maxS = 2.1;
  for (let i = 0; i < n; i++) {
    const [fx, fy] = POS[i];
    const x = 14 + fx * (W - 28);
    const y = padTop + fy * (H - padTop - padBot);
    const s = minS + (maxS - minS) * fy; // bližší (níž) = větší
    drawSheep(ctx, x, y, s, bodyCol, headCol, t * 0.9);
  }
  if (total === 0) return;

  // --- legenda dole ---
  const c = group.counts;
  const mTotal = c.M.child + c.M.adult + c.M.old;
  const fTotal = c.F.child + c.F.adult + c.F.old;
  const labelCol = mix('#4a4032', '#d8cfe8', cosmicSharp());
  ctx.font = '600 11px "Hanken Grotesk", system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = labelCol;
  ctx.fillText(`${fmtN(total)} ovcí`, 8, H - 5);
  ctx.textAlign = 'center';
  ctx.fillText(`\u2642 ${fmtN(mTotal)}   \u2640 ${fmtN(fTotal)}`, W / 2, H - 5);

  const score = breedingScore(group.genes, ceilingMult || 1);
  ctx.fillStyle = score > 0.66 ? '#5b9d4f' : score > 0.33 ? '#c9a227' : '#c0784a';
  ctx.textAlign = 'right';
  ctx.fillText(`Gen ${(score * 100).toFixed(0)} %`, W - 8, H - 5);
}

function fmtN(n) {
  if (n < 1000) return Math.round(n).toString();
  const u = ['k', 'M', 'mld']; let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return (n < 10 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
}
