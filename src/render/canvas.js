// ===========================================================================
//  Vizualizace stáda jako DIORAMA POSTUPU HRY.
//  Drop-in náhrada render/canvas.js. Krajina pod stádem se proměňuje podle fáze:
//  s postupem hry na obzoru přibývají stavby (stodola → větrný mlýn → vesnice →
//  továrna → raketa → družice → planety → Dysonův prstenec → černá díra) a obloha
//  i ovce přecházejí z louky do vesmíru (laděno s --cosmic). Dole legenda ♂/♀ + gen.
//
//  Signatura: drawHerd(canvas, group, ceilingMult, phase). `phase` je nepovinná —
//  když ji ui.js nepředá, odvodí se z --cosmic, takže zůstává zpětně kompatibilní.
// ===========================================================================
import { totalCount } from '../sim/cohort.js';
import { breedingScore } from '../sim/genetics.js';

// stabilní rozmístění ovcí (x,y ve frakcích plochy pastvy; fy 0.38=daleko, 0.99=blízko)
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

// --- krajinné prvky (siluety na obzoru) — přibývají s fází ------------------
function drawBarn(ctx, x, base, col) {
  const w = 26, hh = 15;
  ctx.fillStyle = col;
  ctx.fillRect(x, base - hh, w, hh);
  ctx.beginPath(); ctx.moveTo(x - 2, base - hh); ctx.lineTo(x + w / 2, base - hh - 9); ctx.lineTo(x + w + 2, base - hh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x + w / 2 - 2.5, base - 9, 5, 9); // vrata
}
function drawWindmill(ctx, x, base, col) {
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - 22); ctx.stroke();
  ctx.lineWidth = 2;
  for (const a of [0.5, 0.5 + Math.PI / 2, 0.5 + Math.PI, 0.5 - Math.PI / 2]) {
    ctx.beginPath(); ctx.moveTo(x, base - 22); ctx.lineTo(x + Math.cos(a) * 10, base - 22 + Math.sin(a) * 10); ctx.stroke();
  }
}
function drawHouse(ctx, x, base, col, w, hh) {
  ctx.fillStyle = col;
  ctx.fillRect(x, base - hh, w, hh);
  ctx.beginPath(); ctx.moveTo(x - 1, base - hh); ctx.lineTo(x + w / 2, base - hh - 6); ctx.lineTo(x + w + 1, base - hh); ctx.closePath(); ctx.fill();
}
function drawFactory(ctx, x, base, col, t) {
  ctx.fillStyle = col;
  ctx.fillRect(x, base - 15, 32, 15);
  ctx.fillRect(x + 6, base - 25, 4, 11);
  ctx.fillRect(x + 17, base - 30, 4, 16);
  // kouř (stoupá, jen v dýmajících fázích)
  ctx.fillStyle = mix('#8a8a8a', '#b3a8d6', t).replace('rgb', 'rgba').replace(')', ',0.45)');
  for (const [sx, sy, sr] of [[x + 8, base - 31, 2.6], [x + 11, base - 37, 3.4], [x + 19, base - 36, 2.8], [x + 23, base - 43, 3.6]]) {
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
  }
}
function drawRocket(ctx, x, base, col, flame) {
  ctx.fillStyle = col;
  ctx.fillRect(x, base - 32, 7, 32);
  ctx.beginPath(); ctx.moveTo(x, base - 32); ctx.lineTo(x + 3.5, base - 43); ctx.lineTo(x + 7, base - 32); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x, base - 6); ctx.lineTo(x - 4, base); ctx.lineTo(x, base); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + 7, base - 6); ctx.lineTo(x + 11, base); ctx.lineTo(x + 7, base); ctx.closePath(); ctx.fill();
  if (flame) {
    ctx.fillStyle = 'rgba(255,170,60,0.85)';
    ctx.beginPath(); ctx.moveTo(x + 1, base); ctx.lineTo(x + 3.5, base + 8); ctx.lineTo(x + 6, base); ctx.closePath(); ctx.fill();
  }
}
function drawSatellite(ctx, x, y, col) {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, 6, 4);
  ctx.fillRect(x - 7, y + 0.5, 5, 3);
  ctx.fillRect(x + 8, y + 0.5, 5, 3);
}
function drawPlanets(ctx, W, t) {
  const px = W * 0.15, py = 24, pr = 9;
  ctx.fillStyle = mix('#b48f6a', '#7a6cae', t);
  ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = mix('#c8aa78', '#beaaeb', t); ctx.lineWidth = 1.6;
  ctx.save(); ctx.translate(px, py); ctx.rotate(-0.4);
  ctx.beginPath(); ctx.ellipse(0, 0, pr + 5, (pr + 5) * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = mix('#cfc2a0', '#9a8fc0', t);
  ctx.beginPath(); ctx.arc(W * 0.30, 15, 3.2, 0, Math.PI * 2); ctx.fill();
}
function drawCelestial(ctx, cx, cy, r, t, phase) {
  if (phase >= 10) {
    // černá díra: akreční disk + tmavé jádro
    const g = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 2);
    g.addColorStop(0, '#000'); g.addColorStop(0.45, '#05030a');
    g.addColorStop(0.62, 'rgba(255,150,70,0.95)'); g.addColorStop(0.8, 'rgba(255,90,40,0.5)');
    g.addColorStop(1, 'rgba(120,40,20,0)');
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.92);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#04030a'; ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  // slunce / měsíc
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = mix('#f4dc79', '#d7c9ee', t);
  ctx.shadowColor = mix('rgba(244,220,121,0.9)', 'rgba(190,170,235,0.7)', t); ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0;
  if (phase >= 8) {
    // Dysonův prstenec kolem slunce (zlaté oblouky)
    ctx.strokeStyle = mix('#caa23a', '#ecc964', t); ctx.lineWidth = 2;
    ctx.save(); ctx.translate(cx, cy);
    for (const rot of [-0.55, 0.18]) {
      ctx.save(); ctx.rotate(rot);
      ctx.beginPath(); ctx.ellipse(0, 0, r + 7, (r + 7) * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

export function drawHerd(canvas, group, ceilingMult, phaseArg) {
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
  const phase = (typeof phaseArg === 'number' && phaseArg > 0) ? phaseArg : Math.round(1 + t * 9);

  // --- nebe ---
  ctx.clearRect(0, 0, W, H);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, mix('#bfe3f2', '#241a40', t));
  sky.addColorStop(0.55, mix('#cfeac2', '#1c1436', t));
  sky.addColorStop(1, mix('#a6cf8f', '#140e2a', t));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // hvězdy (houstnou s kosmem)
  if (t > 0.05) {
    ctx.fillStyle = `rgba(255,255,255,${0.85 * t})`;
    const stars = [[0.15,0.20],[0.40,0.12],[0.62,0.25],[0.80,0.16],[0.28,0.32],[0.90,0.34],[0.50,0.30],
      [0.07,0.40],[0.34,0.46],[0.70,0.40],[0.55,0.10],[0.22,0.10],[0.46,0.20],[0.86,0.46]];
    for (const [sx, sy] of stars) { ctx.beginPath(); ctx.arc(sx * W, sy * H, 0.9, 0, Math.PI * 2); ctx.fill(); }
  }

  // planety (pozdní fáze) + družice
  if (phase >= 8) drawPlanets(ctx, W, t);
  if (phase >= 7) drawSatellite(ctx, W * 0.80, H * 0.22, mix('#7f8aa0', '#cdd6ec', t));

  // slunce / měsíc / Dysonův prstenec / černá díra
  drawCelestial(ctx, W - 46, 26, 13, t, phase);

  // --- obzor + krajina ---
  const horizon = Math.round(H * 0.60);
  // vzdálené kopce (lehčí silueta těsně nad obzorem) — hloubka scény
  ctx.fillStyle = mix('#9cc17c', '#241c44', t);
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.quadraticCurveTo(W * 0.22, horizon - 16, W * 0.46, horizon - 2);
  ctx.quadraticCurveTo(W * 0.72, horizon - 22, W, horizon - 6);
  ctx.lineTo(W, horizon); ctx.closePath(); ctx.fill();

  // stavby na obzoru — přibývají, jak hra postupuje (siluety)
  const sil = mix('#5f7d49', '#2b2552', t);
  if (phase >= 1) drawBarn(ctx, W * 0.07, horizon, sil);
  if (phase >= 2) drawWindmill(ctx, W * 0.21, horizon, sil);
  if (phase >= 3) { drawHouse(ctx, W * 0.31, horizon, sil, 14, 11); drawHouse(ctx, W * 0.37, horizon, sil, 11, 8); }
  if (phase >= 5) drawFactory(ctx, W * 0.49, horizon, sil, t);
  if (phase >= 6) drawRocket(ctx, W * 0.66, horizon, sil, phase >= 7);

  // --- země ---
  const grnd = ctx.createLinearGradient(0, horizon, 0, H);
  grnd.addColorStop(0, mix('#9ec77f', '#181128', t));
  grnd.addColorStop(1, mix('#7fb267', '#0e0a20', t));
  ctx.fillStyle = grnd; ctx.fillRect(0, horizon, W, H - horizon);

  if (!group) return;
  const total = totalCount(group);

  // --- stádo (na louce/pastvině před obzorem) ---
  const padBot = 16;
  const gTop = horizon + 6, gBot = H - padBot;
  const n = total > 0 ? flockCount(total) : 0;
  const bodyCol = mix('#fbf7ec', '#dbe7f2', t);
  const headCol = mix('#473f33', '#2a2440', t);
  const minS = 1.3, maxS = 2.4;
  for (let i = 0; i < n; i++) {
    const [fx, fy] = POS[i];
    const fyN = (fy - 0.38) / (0.99 - 0.38);           // 0 = u obzoru (daleko), 1 = vepředu
    const x = 16 + fx * (W - 32);
    const y = gTop + fyN * (gBot - gTop);
    const s = minS + (maxS - minS) * fyN;               // bližší = větší
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
