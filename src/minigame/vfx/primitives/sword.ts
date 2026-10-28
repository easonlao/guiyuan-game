import type { ActionRecipe, MaterialRecipe } from '../engine/events.js';

export interface SwordStyle {
  readonly bladeLife: number;
  readonly starLife: number;
  readonly debrisLife: number;
  readonly duration: number;
  readonly hold: number;
  readonly fade: number;
  readonly radius: number;
  readonly width: number;
  readonly starDuration: number;
  readonly starHold: number;
  readonly starFade: number;
  readonly starRadius: number;
  readonly rays: number;
  readonly count: number;
  readonly spread: number;
  readonly speedMin: number;
  readonly speedMax: number;
  readonly particleLifeMin: number;
  readonly particleLifeMax: number;
  readonly gravity: number;
  readonly trail: number;
  readonly impactAge: number;
  readonly startDegrees: number;
  readonly sweepDegrees: number;
  readonly gap: number;
  readonly lineWidth: number;
  readonly aspectRatio: number;
  readonly echoDelay: number;
  readonly echoRadiusScale: number;
  readonly echoWidthScale: number;
  readonly speedLineCount: number;
  readonly speedLineDrift: number;
  readonly speedLineLength: number;
  readonly speedLineWidth: number;
  readonly starWidthRatio: number;
  readonly starRotationDegrees: number;
  readonly starShortRayScale: number;
  readonly starLongWidthScale: number;
  readonly starShortWidthScale: number;
  readonly starCoreScale: number;
  readonly starRingScale: number;
  readonly starRingWidth: number;
  readonly debrisWidth: number;
}
export interface SwordMaterial extends MaterialRecipe {
  readonly widthMultiplier: number;
  readonly debrisMultiplier: number;
}
export interface SwordRecipe extends ActionRecipe {
  readonly material: SwordMaterial;
  readonly normal: SwordStyle;
  readonly heavy: SwordStyle;
}
export interface SwordEffect {
  readonly kind: 'blade' | 'star' | 'debris';
  age: number;
  readonly life: number;
  readonly angle: number;
  readonly hit: number;
  readonly style: SwordStyle;
}
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const deg = (v: number): number => (v * Math.PI) / 180;
// [ported from combat-vfx-demo: vfx/pixel_slash.gd — PolyForm Noncommercial, 商用前需重写]
// 经 prototype-action-vfx.html:252-267 移植的 ease_swing / lens / 固定种子粒子随机。
const easeSwing = (t: number): number => 1 - Math.pow(1 - clamp01(t), 2.4);
const lens = (t: number): number => Math.pow(Math.sin(Math.PI * clamp01(t)), 0.6);
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// [ported from combat-vfx-demo: vfx/pixel_slash.gd:555-605 — PolyForm Noncommercial, 商用前需重写]
// prototype-action-vfx.html:269-331：四层 crescent、张开/保持/侵蚀、echo 与 speed lines。
export function drawCrescent(
  ctx: CanvasRenderingContext2D,
  f: SwordEffect,
  mat: SwordMaterial,
): void {
  const p = mat.ramp,
    s = f.style;
  const radius = s.radius,
    width = s.width * mat.widthMultiplier;
  const start = deg(s.startDegrees),
    sweep = deg(s.sweepDegrees),
    gap = s.gap,
    lineWidth = s.lineWidth;
  const open = easeSwing(f.age / s.duration);
  const fade = clamp01((f.age - s.duration - s.hold) / s.fade);
  const from = Math.pow(fade, 0.8),
    thick = width * (1 - fade * 0.6);
  const ct = Math.cos(f.angle),
    st = Math.sin(f.angle);
  const point = (angle: number, distance: number): readonly [number, number] => {
    const x = Math.cos(angle) * distance,
      y = Math.sin(angle) * distance * s.aspectRatio;
    return [x * ct - y * st, x * st + y * ct];
  };
  const layer = (
    a: number,
    b: number,
    r: number,
    thickness: number,
    inner: number,
    color: string,
  ): void => {
    if (b - a <= 0.0005 || thickness * inner < 0.5) return;
    const steps = Math.max(2, Math.ceil((Math.abs(sweep) * (b - a)) / deg(3)));
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const along = a + ((b - a) * i) / steps;
      const [x, y] = point(start + sweep * along, r);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i--) {
      const along = a + ((b - a) * i) / steps;
      const [x, y] = point(start + sweep * along, r - thickness * inner * lens(along));
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };
  layer(
    from,
    easeSwing((f.age - s.echoDelay) / s.duration),
    radius * s.echoRadiusScale,
    thick * s.echoWidthScale,
    1,
    p[3],
  );
  layer(from, open, radius, thick, 1, p[2]);
  if (fade < 0.7) layer(from, open, radius, thick, 0.62, p[1]);
  if (fade < 0.35) layer(from, open, radius, thick, 0.28, p[0]);
  if (f.age > s.duration * 0.5 && fade < 0.85)
    layer(
      from,
      open * 0.96,
      radius + gap + lineWidth,
      lineWidth / Math.max(lens(0.5), 0.01),
      1,
      fade < 0.4 ? p[1] : p[2],
    );
  if (fade > 0)
    for (let k = 0; k < s.speedLineCount; k++) {
      const along = (k + 0.5) / s.speedLineCount;
      if (along < from) continue;
      const angle = start + sweep * along,
        r = radius + gap * 2 + s.speedLineDrift * fade;
      const [x0, y0] = point(angle, r),
        [x1, y1] = point(angle, r + s.speedLineLength * (1 - fade) * lens(along));
      if (Math.hypot(x1 - x0, y1 - y0) < 2) continue;
      ctx.strokeStyle = fade < 0.5 ? p[1] : p[2];
      ctx.lineWidth = s.speedLineWidth;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
}

// [ported from combat-vfx-demo: vfx/pixel_slash.gd:607-629 — PolyForm Noncommercial, 商用前需重写]
// prototype-action-vfx.html:333-367：长短交替星形射线、白核与早消细环。
export function drawStar(ctx: CanvasRenderingContext2D, f: SwordEffect, mat: SwordMaterial): void {
  const p = mat.ramp,
    s = f.style,
    width = s.starRadius * s.starWidthRatio;
  const open = easeSwing(f.age / s.starDuration);
  const fade = clamp01((f.age - s.starDuration - s.starHold) / s.starFade);
  for (let i = 0; i < s.rays; i++) {
    const isLong = i % 2 === 0,
      angle = deg(s.starRotationDegrees * f.hit) + (Math.PI * 2 * i) / s.rays;
    const dx = Math.cos(angle),
      dy = Math.sin(angle);
    const length = s.starRadius * open * (isLong ? 1 : s.starShortRayScale) * (1 - fade * 0.6);
    const base = width * (1 - fade) * (isLong ? s.starLongWidthScale : s.starShortWidthScale);
    if (length < 2 || base < 0.7) continue;
    ctx.fillStyle = fade < 0.4 ? (isLong ? p[0] : p[1]) : p[2];
    ctx.beginPath();
    ctx.moveTo(-dy * base, dx * base);
    ctx.lineTo(dx * length, dy * length);
    ctx.lineTo(dy * base, -dx * base);
    ctx.closePath();
    ctx.fill();
  }
  const core = width * s.starCoreScale * (1 - fade);
  if (core >= 2) {
    ctx.fillStyle = p[0];
    ctx.beginPath();
    ctx.arc(0, 0, core, 0, 7);
    ctx.fill();
  }
  if (fade < 0.4) {
    ctx.strokeStyle = p[1];
    ctx.lineWidth = s.starRingWidth;
    ctx.beginPath();
    ctx.arc(0, 0, s.starRadius * s.starRingScale * open * (0.9 + fade * 0.5), 0, 7);
    ctx.stroke();
  }
}

// [ported from combat-vfx-demo: vfx/pixel_slash.gd:516-548 — PolyForm Noncommercial, 商用前需重写]
// prototype-action-vfx.html:369-392：固定种子扇形碎屑、重力抛落和短拖痕。
export function drawDebris(
  ctx: CanvasRenderingContext2D,
  f: SwordEffect,
  mat: SwordMaterial,
): void {
  const s = f.style,
    p = mat.ramp,
    rng = mulberry32(f.hit * 1000 + 7);
  for (let i = 0; i < Math.round(s.count * mat.debrisMultiplier); i++) {
    const angle = (rng() * 2 - 1) * s.spread;
    const speed = s.speedMin + rng() * (s.speedMax - s.speedMin);
    const life = s.particleLifeMin + rng() * (s.particleLifeMax - s.particleLifeMin);
    if (f.age >= life) continue;
    const fraction = f.age / life;
    const point = (t: number): readonly [number, number] => [
      Math.cos(angle) * speed * t,
      Math.sin(angle) * speed * t + (s.gravity * t * t) / 2,
    ];
    const [hx, hy] = point(f.age),
      [tx, ty] = point(Math.max(f.age - s.trail, 0));
    ctx.strokeStyle = fraction < 0.3 ? p[0] : fraction < 0.65 ? p[1] : p[2];
    ctx.lineWidth = s.debrisWidth;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx, hy);
    ctx.stroke();
  }
}
