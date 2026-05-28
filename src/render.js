import { STAGE, GENES } from './config.js';
import { stageOf, stageBoundaries } from './sheep.js';
import { breedingScore } from './genetics.js';
import { aggCount } from './population.js';
import { fmt } from './format.js';

const STAGE_COLOR = {
  [STAGE.CHILD]: '#a8e6a1',
  [STAGE.ADULT]: '#f5f0e1',
  [STAGE.OLD]:   '#9aa0a6',
};
const STAGE_LABEL = { child: 'dítě', adult: 'dospělec', old: 'starý' };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function render(ctx, state, mousePos) {
  const cv = ctx.canvas;
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);

  const pad = 14;
  const penW = W - pad * 2, penH = H - pad * 2;

  ctx.fillStyle = '#3b7a3b';
  roundRect(ctx, pad, pad, penW, penH, 14);
  ctx.fill();
  ctx.strokeStyle = '#2c5d2c';
  ctx.lineWidth = 4;
  ctx.stroke();

  if (state.aggregate) {
    renderAggregate(ctx, state, pad, penW, penH);
    return;
  }

  if (state.sheep.length === 0) {
    drawEmptyHint(ctx, pad, penW, penH, !state.startedPair);
    drawLegend(ctx, pad, penH);
    return;
  }

  const innerX = pad + 8, innerY = pad + 8, innerW = penW - 16, innerH = penH - 16;
  const n = state.sheep.length;
  const marker = Math.max(3, Math.min(18, Math.sqrt((innerW * innerH) / Math.max(1, n)) * 0.32));

  for (const s of state.sheep) {
    const cx = innerX + s.x * innerW;
    const cy = innerY + s.y * innerH;
    const st = stageOf(s);
    const r = marker * (0.7 + 0.3 * Math.min(2, s.genes.size));
    s._sx = cx; s._sy = cy; s._sr = r;

    ctx.fillStyle = STAGE_COLOR[st];
    const isStud = s.id === (state.cull?.studId);
    if (s.sex === 'F') {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      if (s.pregnant) {
        ctx.strokeStyle = '#ff7eb6';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else {
      const half = r * 0.5;
      ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
    }
    // Star indicator on pinned stud
    if (isStud) {
      ctx.fillStyle = '#ffd700';
      ctx.font = `bold ${Math.max(8, r * 1.1)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('★', cx, cy - r * 0.6 - 2);
      ctx.textAlign = 'left';
    }
  }

  drawLegend(ctx, pad, penH);
  if (mousePos) drawTooltip(ctx, state, mousePos, W, H);
}

function drawEmptyHint(ctx, pad, penW, penH, showBuy) {
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText(
    showBuy ? 'Koupit první pár →' : 'Ohrádka prázdná',
    pad + penW / 2, pad + penH / 2
  );
  ctx.textAlign = 'left';
}

function drawLegend(ctx, pad, penH) {
  const items = [
    { label: 'dítě',      color: STAGE_COLOR[STAGE.CHILD] },
    { label: 'dospělec',  color: STAGE_COLOR[STAGE.ADULT] },
    { label: 'starý',     color: STAGE_COLOR[STAGE.OLD]   },
  ];
  const x0 = pad + 10, y0 = pad + penH - 10;
  ctx.font = '11px system-ui, sans-serif';
  let x = x0;
  for (const it of items) {
    ctx.fillStyle = it.color;
    ctx.beginPath();
    ctx.arc(x + 5, y0 - 5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(it.label, x + 13, y0);
    x += 13 + ctx.measureText(it.label).width + 10;
  }
  // ○ = samice, □ = samec
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('○ samice  □ samec', x, y0);
}

function drawTooltip(ctx, state, { x, y }, W, H) {
  for (const s of state.sheep) {
    if (s._sx == null) continue;
    const dx = x - s._sx, dy = y - s._sy;
    if (dx * dx + dy * dy > (s._sr + 5) ** 2) continue;

    const st = stageOf(s);
    const { life } = stageBoundaries(s.genes);
    const score = (breedingScore(s.genes) * 100).toFixed(1);
    const isStud = s.id === (state.cull?.studId);

    const lines = [
      `${s.sex === 'F' ? '♀ Samice' : '♂ Samec'} — ${STAGE_LABEL[st]}${isStud ? ' ★' : ''}`,
      `Věk: ${s.age.toFixed(0)} / ${life.toFixed(0)} s`,
      `Breeding score: ${score}%`,
      ...(s.pregnant ? [`  Březost: ${Math.max(0, s.gestationLeft).toFixed(0)} s`] : []),
      '',
    ];
    for (const k in GENES) {
      lines.push(`${GENES[k].label}: ${s.genes[k].toFixed(GENES[k].dec)}`);
    }

    const TW = 240, lh = 17, tp = 9;
    const TH = lines.filter(l => l !== '').length * lh + tp * 2 + lh * 0.4;
    let tx = x + 14, ty = y - TH / 2;
    if (tx + TW > W - 4) tx = x - TW - 10;
    if (ty < 4) ty = 4;
    if (ty + TH > H - 4) ty = H - TH - 4;

    ctx.fillStyle = 'rgba(18,22,28,0.93)';
    roundRect(ctx, tx, ty, TW, TH, 7);
    ctx.fill();
    ctx.strokeStyle = '#5a9d5f';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    let row = 0;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (ln === '') { row += 0.5; continue; }
      if (i === 0) { ctx.fillStyle = '#7bc47f'; ctx.font = 'bold 12px system-ui, sans-serif'; }
      else { ctx.fillStyle = '#c8d0da'; ctx.font = '12px system-ui, sans-serif'; }
      ctx.fillText(ln, tx + tp, ty + tp + row * lh + 11);
      row++;
    }
    break;
  }
}

function renderAggregate(ctx, state, pad, penW, penH) {
  const total = aggCount(state.aggregate);
  const density = Math.min(1, total / 5000);
  ctx.fillStyle = `rgba(245,240,225,${0.12 + 0.55 * density})`;
  ctx.fillRect(pad + 8, pad + 8, penW - 16, penH - 16);

  ctx.fillStyle = '#1c2128';
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText(`${fmt(total)} ovcí`, pad + penW / 2, pad + penH / 2);
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('populační režim', pad + penW / 2, pad + penH / 2 + 26);
  ctx.textAlign = 'left';
}
