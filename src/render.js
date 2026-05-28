import { STAGE } from './config.js';
import { stageOf } from './sheep.js';
import { penCapacity } from './economy.js';
import { aggCount } from './population.js';
import { fmt } from './format.js';

const STAGE_COLOR = {
  [STAGE.CHILD]: '#a8e6a1',
  [STAGE.ADULT]: '#f5f0e1',
  [STAGE.OLD]: '#9aa0a6',
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function render(ctx, state) {
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

  const innerX = pad + 8, innerY = pad + 8, innerW = penW - 16, innerH = penH - 16;
  const n = state.sheep.length;
  const marker = Math.max(3, Math.min(18, Math.sqrt((innerW * innerH) / Math.max(1, n)) * 0.32));

  for (const s of state.sheep) {
    const cx = innerX + s.x * innerW;
    const cy = innerY + s.y * innerH;
    const st = stageOf(s);
    const r = marker * (0.7 + 0.3 * Math.min(2, s.genes.size));
    s._sx = cx; s._sy = cy; s._sr = r; // cached for click hit-testing

    ctx.fillStyle = STAGE_COLOR[st];
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
  ctx.fillText('populační režim (heatmapa)', pad + penW / 2, pad + penH / 2 + 26);
  ctx.textAlign = 'left';
}
