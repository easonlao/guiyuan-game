import { ActionType } from '../core/types/domain.js';

/** Bounded, deterministic brushwork: option identity is conveyed by shape, not element recoloring. */
export function drawActionAura(
  ctx: CanvasRenderingContext2D,
  action: ActionType,
  progress: number,
  radius: number,
  color: string,
  impact = false,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = action === ActionType.BURST_ATK ? 2.5 : 1.5;
  const turn = progress * Math.PI * 2;
  const ring = (r: number, start = 0, sweep = Math.PI * 2): void => {
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0.1, r), start, start + sweep);
    ctx.stroke();
  };
  switch (action) {
    case ActionType.AUTO:
      ring(radius * (impact ? 1 - progress * 0.65 : 0.8), -turn, Math.PI * 1.6);
      for (let i = 0; i < 6; i++) {
        const a = turn + (i * Math.PI) / 3;
        const r = radius * (1 - progress * 0.75);
        ctx.fillRect(Math.cos(a) * r - 1, Math.sin(a) * r - 1, 2, 2);
      }
      break;
    case ActionType.CONVERT:
      ring(radius * 0.8, turn, Math.PI * 0.8);
      ring(radius * 0.8, turn + Math.PI, Math.PI * 0.8);
      ring(radius * 0.42, -turn, Math.PI * 1.5);
      break;
    case ActionType.TRANS:
      for (let i = 0; i < 5; i++) {
        const a = turn * 0.35 + (i * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(
          Math.cos(a + 0.5) * radius,
          Math.sin(a + 0.5) * radius,
          Math.cos(a) * radius,
          Math.sin(a) * radius,
        );
        ctx.stroke();
      }
      break;
    case ActionType.BURST:
      ring(radius);
      ring(radius * 0.62, turn, Math.PI * 1.75);
      ring(radius * 0.3);
      break;
    case ActionType.ATK:
    case ActionType.BURST_ATK: {
      const count = action === ActionType.BURST_ATK ? 8 : 4;
      for (let i = 0; i < count; i++) {
        const a = (i * Math.PI * 2) / count + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * radius * 0.2, Math.sin(a) * radius * 0.2);
        ctx.lineTo(Math.cos(a + 0.16) * radius * 0.62, Math.sin(a + 0.16) * radius * 0.62);
        ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
        ctx.stroke();
      }
      if (action === ActionType.BURST_ATK) {
        ring(radius * 0.72);
        if (impact && progress > 0.35) ring(radius * ((progress - 0.35) / 0.65));
      }
      break;
    }
    case ActionType.DISSIPATE:
    case ActionType.PASS:
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + turn * 0.15;
        const r = radius * (0.35 + progress * 0.65);
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5);
        ctx.stroke();
      }
      break;
  }
  ctx.restore();
}
