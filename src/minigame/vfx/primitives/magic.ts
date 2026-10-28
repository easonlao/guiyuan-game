import type { SwordMaterial } from './sword.js';

export interface MagicStyle {
  readonly duration: number;
  readonly tail: number;
  readonly radius: number;
  readonly heavyRadius: number;
  readonly width: number;
  readonly heavyWidth: number;
  readonly spikes: number;
  readonly spikeScale: number;
  readonly segments: number;
  readonly chargeRadius: number;
  readonly chargeShrink: number;
  readonly chargeWidth: number;
  readonly projectileRadius: number;
  readonly projectileCore: number;
  readonly trailCount: number;
  readonly trailGap: number;
}
/** Prototype charge / fire projectile. Coordinates and tuning supplied by the caller. */
export function drawMagic(
  ctx: CanvasRenderingContext2D,
  effect: { kind: 'charge' | 'bolt' | 'burst'; age: number; life: number; heavy: boolean },
  mat: SwordMaterial,
  s: MagicStyle,
): void {
  const q = Math.min(1, effect.age / effect.life);
  const p = mat.ramp;
  if (effect.kind === 'charge') {
    ctx.globalAlpha *= 0.4 + 0.6 * q;
    ctx.strokeStyle = p[1];
    ctx.lineWidth = s.chargeWidth;
    ctx.beginPath();
    ctx.arc(0, 0, s.chargeRadius - s.chargeShrink * q, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  if (effect.kind === 'bolt') {
    ctx.fillStyle = p[2];
    ctx.beginPath();
    ctx.arc(0, 0, s.projectileRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p[1];
    ctx.beginPath();
    ctx.arc(0, 0, s.projectileCore, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 1; k <= s.trailCount; k++) {
      ctx.globalAlpha *= 0.5;
      ctx.fillStyle = p[2];
      ctx.beginPath();
      ctx.arc(-s.trailGap * k * q, Math.sin(q * 12 + k) * 3, 7 - k * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  // [ported from combat-vfx-demo: vfx/pixel_slash.gd:430-451 — PolyForm Noncommercial, 商用前需重写]
  // Approved prototype drawBurst: expanding segmented ring and shrinking outer spikes.
  const t = Math.min(1, effect.age / s.duration);
  const fade = Math.max(0, Math.min(1, (effect.age - s.duration) / s.tail));
  const radius = effect.heavy ? s.heavyRadius : s.radius;
  const r = radius * (1 - (1 - t) ** 2.4);
  const thick = Math.max((effect.heavy ? s.heavyWidth : s.width) * (1 - fade) * (1 - 0.5 * t), 1.5);
  ctx.fillStyle = fade < 0.3 ? p[0] : fade < 0.66 ? p[1] : p[2];
  for (let i = 0; i < s.segments; i++) {
    const a = (Math.PI * 2 * i) / s.segments,
      b = (Math.PI * 2 * (i + 1)) / s.segments;
    const inner = Math.max(0, r - thick);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(b) * r, Math.sin(b) * r);
    ctx.lineTo(Math.cos(b) * inner, Math.sin(b) * inner);
    ctx.closePath();
    ctx.fill();
  }
  for (let i = 0; i < s.spikes; i++) {
    const a = (Math.PI * 2 * (i + 0.5)) / s.spikes,
      dx = Math.cos(a),
      dy = Math.sin(a);
    const x = dx * (r + 6),
      y = dy * (r + 6),
      side = Math.max(3, thick / 2);
    const length = radius * s.spikeScale * (1 - fade);
    ctx.beginPath();
    ctx.moveTo(x - dy * side, y + dx * side);
    ctx.lineTo(x + dx * length, y + dy * length);
    ctx.lineTo(x + dy * side, y - dx * side);
    ctx.closePath();
    ctx.fill();
  }
}
