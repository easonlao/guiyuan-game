// Pixel VFX Forge renderer. A recipe goes in, RGBA frames come out.
// Every layer writes a heat field; heat is cut into hard colour bands from the
// layer's ramp, then the frame gets outline, clean-up and palette passes.
// No DOM, so the same file runs in the page, in a worker and in Node.

import { resolveRamp, PALETTES, nearestInPalette, darken, hexToRgb, pack } from './color.js';

export const ENGINE_VERSION = 1;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const DARK = 1000; // heat value that forces the darkest ramp colour (void cores)

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const EASE = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  inCubic: (t) => t * t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outCubic: (t) => 1 - (1 - t) ** 3,
  outQuart: (t) => 1 - (1 - t) ** 4,
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutSine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  outBack: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
};
const ease = (name, t) => (EASE[name] || EASE.outCubic)(clamp(t));
const pair = (v, d) => (Array.isArray(v) ? [v[0], v[1] ?? v[0]] : v == null ? d : [v, v]);

// ---------- hashing, random, noise ----------
function hash(a, b = 0, c = 0, s = 0) {
  let h = (s ^ 0x9e3779b9) | 0;
  h = Math.imul(h ^ a, 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h ^ b, 0xc2b2ae35); h ^= h >>> 16;
  h = Math.imul(h ^ c, 0x27d4eb2f); h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1); h ^= h >>> 13;
  return h >>> 0;
}
const hash01 = (a, b, c, s) => hash(a, b, c, s) / 4294967296;
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GX = [1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0];
const GY = [1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1];
const GZ = [0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1];
const wrap = (i, p) => (p > 0 ? ((i % p) + p) % p : i);
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const grad = (ix, iy, iz, s, x, y, z) => {
  const g = hash(ix, iy, iz, s) % 12;
  return GX[g] * x + GY[g] * y + GZ[g] * z;
};

// Gradient noise with optional integer periods per axis, so loops can tile.
export function noise3(x, y, z, s, px = 0, py = 0, pz = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const x0 = wrap(xi, px), x1 = wrap(xi + 1, px);
  const y0 = wrap(yi, py), y1 = wrap(yi + 1, py);
  const z0 = wrap(zi, pz), z1 = wrap(zi + 1, pz);
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const a = lerp(grad(x0, y0, z0, s, xf, yf, zf), grad(x1, y0, z0, s, xf - 1, yf, zf), u);
  const b = lerp(grad(x0, y1, z0, s, xf, yf - 1, zf), grad(x1, y1, z0, s, xf - 1, yf - 1, zf), u);
  const c = lerp(grad(x0, y0, z1, s, xf, yf, zf - 1), grad(x1, y0, z1, s, xf - 1, yf, zf - 1), u);
  const d = lerp(grad(x0, y1, z1, s, xf, yf - 1, zf - 1), grad(x1, y1, z1, s, xf - 1, yf - 1, zf - 1), u);
  return lerp(lerp(a, b, v), lerp(c, d, v), w);
}

export function fbm(x, y, z, s, oct = 3, px = 0, py = 0, pz = 0) {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * noise3(x, y, z, s + o * 1013, px, py, pz);
    norm += amp;
    amp *= 0.5; x *= 2; y *= 2; z *= 2; px *= 2; py *= 2; pz *= 2;
  }
  return clamp(0.5 + (0.78 * sum) / norm);
}

// Precomputed per-angle values (silhouette wobble, ring breakup) for speed.
function angleTable(n, fn) {
  const t = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) t[i] = fn((i / n) * TAU);
  return t;
}
function lookup(t, a) {
  const n = t.length - 1;
  let f = ((a / TAU) % 1 + 1) % 1 * n;
  const i = Math.floor(f);
  f -= i;
  return t[i] * (1 - f) + t[i + 1] * f;
}

// ---------- raster helpers ----------
function plot(c, x, y, v) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = y * c.w + x;
  if (v > c.heat[i]) c.heat[i] = v;
}
const px = (c, u) => Math.round(c.w / 2 + u * c.S - 0.5);
const py = (c, v) => Math.round(c.h / 2 + v * c.S - 0.5);

function line(c, x0, y0, x1, y1, v0, v1 = v0, thick = 1) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  const n = Math.max(dx, dy) || 1;
  let err = dx - dy, x = x0, y = y0, k = 0;
  for (;;) {
    const v = lerp(v0, v1, k / n);
    plot(c, x, y, v);
    if (thick > 1) {
      if (dx > dy) plot(c, x, y + 1, v * 0.92); else plot(c, x + 1, y, v * 0.92);
      if (thick > 2) { if (dx > dy) plot(c, x, y - 1, v * 0.92); else plot(c, x - 1, y, v * 0.92); }
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    k++;
  }
}

function disc(c, cx, cy, r, v) {
  const ri = Math.ceil(r);
  for (let y = -ri; y <= ri; y++) for (let x = -ri; x <= ri; x++)
    if (x * x + y * y <= r * r + 0.3) plot(c, cx + x, cy + y, v * (1 - 0.25 * Math.hypot(x, y) / (r + 0.5)));
}

// Grow bright pixels outward in decaying steps: a pixel-art glow.
function dilate(c, passes, falloff) {
  const { w, h } = c;
  let src = c.heat;
  for (let p = 0; p < passes; p++) {
    const dst = new Float32Array(src);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let m = src[i];
      if (x > 0 && src[i - 1] * falloff > m) m = src[i - 1] * falloff;
      if (x < w - 1 && src[i + 1] * falloff > m) m = src[i + 1] * falloff;
      if (y > 0 && src[i - w] * falloff > m) m = src[i - w] * falloff;
      if (y < h - 1 && src[i + w] * falloff > m) m = src[i + w] * falloff;
      dst[i] = m >= DARK ? src[i] : m;
    }
    src = dst;
  }
  c.heat.set(src);
}

// Evaluate fn over the pixels near an anchor, in rotated and squashed local units.
function field(c, L, reach, fn, ax = L.x ?? 0, ay = L.y ?? 0, angle = L.angle ?? 0) {
  const { w, h, S, heat } = c;
  const sq = L.squash ?? 1;
  const ca = Math.cos(-angle * DEG), sa = Math.sin(-angle * DEG);
  const rr = reach * Math.max(1, sq);
  const x0 = Math.max(0, Math.floor(w / 2 + (ax - rr) * S)), x1 = Math.min(w - 1, Math.ceil(w / 2 + (ax + rr) * S));
  const y0 = Math.max(0, Math.floor(h / 2 + (ay - rr) * S)), y1 = Math.min(h - 1, Math.ceil(h / 2 + (ay + rr) * S));
  for (let y = y0; y <= y1; y++) {
    const v = (y + 0.5 - h / 2) / S - ay;
    for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - w / 2) / S - ax;
      const lx = u * ca - v * sa, ly = (u * sa + v * ca) / sq;
      const val = fn(lx, ly);
      const i = y * w + x;
      if (val > heat[i]) heat[i] = val;
    }
  }
}

// ---------- 3x5 pixel font ----------
export const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111',
  2: '110001010100111', 3: '110001010001110', 4: '101101111001001', 5: '111100110001110',
  6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
  '!': '010010010000010', '+': '000010111010000', '-': '000000111000000', '.': '000000000000010',
  '?': '110001010000010', ':': '000010000010000', '/': '001001010100100', ' ': '000000000000000',
  '>': '100010001010100', '<': '001010100010001', '_': '000000000000111', ',': '000000000010100',
  "'": '010010000000000', '(': '010100100100010', ')': '010001001001010', '=': '000111000111000', '*': '000101010101000',
};

// ---------- layer types ----------
export const TYPES = Object.create(null);

// Expanding fireball that cools and breaks into chunks.
TYPES.burst = (c, L) => {
  const k = c.lt, grow = L.grow ?? 0.5;
  const R = lerp(L.r0 ?? 0.08, L.r1 ?? 0.8, ease(L.ease || 'outCubic', k / grow)) *
    (1 + (L.drift ?? 0.12) * clamp((k - grow) / (1 - grow)));
  const freq = L.freq ?? 2.4, rough = L.rough ?? 0.55, z = k * (L.evolve ?? 1.6), s = c.seed;
  const coolK = 1 - (L.cool ?? 0.6) * ease('inOutSine', k);
  const er = (L.erode ?? 1) * smooth(L.erodeStart ?? 0.3, 1, k);
  const wob = L.wobble ?? 0.3, hollow = L.hollow ?? 0, gain = L.gain ?? 1;
  const tbl = angleTable(96, (a) => 1 + wob * (fbm(Math.cos(a) * 1.6 + 7, Math.sin(a) * 1.6, z * 0.6, s + 5, 2) - 0.5) * 2);
  field(c, L, R * (1 + wob) * 1.3 + 0.05, (x, y) => {
    const d0 = Math.hypot(x, y);
    const d = d0 / (R * lookup(tbl, Math.atan2(y, x)));
    if (d > 1.25) return 0;
    if (er > 0 && fbm(x * freq * 0.8 + 31, y * freq * 0.8, z * 0.7 + 3, s + 9, 2) < er) return 0;
    const n = fbm(x * freq, y * freq, z, s, 3);
    let v = (1 - d) * 1.35 + (n - 0.5) * rough * 2;
    if (hollow) v -= hollow * k * Math.max(0, 1 - d * 1.6);
    return v * coolK * gain;
  });
};

// Shockwave ring.
TYPES.ring = (c, L) => {
  const k = c.lt;
  const r = lerp(L.r0 ?? 0.1, L.r1 ?? 0.95, ease(L.ease || 'outQuart', k));
  const th = lerp(L.th ?? 0.2, L.thEnd ?? 0.03, k ** 0.7);
  const brk = (L.breakup ?? 0.7) * smooth(0.25, 1, k), freq = L.freq ?? 3, s = c.seed;
  const gain = (L.gain ?? 1) * (1 - (L.fade ?? 0.35) * k), inner = L.inner ?? 0;
  const tbl = brk > 0 ? angleTable(128, (a) => fbm(Math.cos(a) * freq, Math.sin(a) * freq, k * 2, s, 2)) : null;
  field(c, L, r + th + 0.05, (x, y) => {
    const d = Math.hypot(x, y);
    const dd = Math.abs(d - r) / th;
    let v = 0;
    if (dd <= 1 && !(tbl && lookup(tbl, Math.atan2(y, x)) < brk)) v = (1 - dd) ** 0.8 * gain * (d > r ? 1 : 0.85);
    if (inner && d < r) v = Math.max(v, inner * (d / r) ** 2 * gain);
    return v;
  });
};

// Rising flame; loops seamlessly. With hollow it becomes a body aura.
TYPES.flame = (c, L) => {
  const W = L.w ?? 0.42, H = L.hgt ?? 1.2, taper = L.taper ?? 1.1, freq = L.freq ?? 2.6, rough = L.rough ?? 0.75;
  const cyc = Math.max(1, Math.round(L.speed ?? 1)), P = 4, s = c.seed, hollow = L.hollow ?? 0;
  const flick = L.flick ?? 0.35, gain = L.gain ?? 1.05;
  let env = 1, hs = 1;
  if (!c.loop) { env = smooth(0, 0.14, c.lt) * (1 - smooth(0.6, 1, c.lt)); hs = 0.35 + 0.65 * env; }
  const scroll = c.ph * P * cyc;
  field(c, L, Math.max(W * 1.5, H) + 0.3, (x, y) => {
    const ly = -y / (H * hs);
    if (ly < -0.3 || ly > 1.15) return 0;
    const sway = noise3(ly * 1.3, 3.7, c.ph * 2 * cyc, s + 3, 0, 0, 2 * cyc);
    const lx = x / W - sway * flick * Math.max(0, ly) * 1.6;
    const prof = ly < 0 ? Math.sqrt(Math.max(0, 1 - (ly / 0.3) ** 2)) : (1 - Math.min(ly, 1)) ** taper;
    const sx = 1 - Math.abs(lx) / Math.max(prof, 0.02);
    if (sx < -0.6) return 0;
    const n = fbm(lx * freq * W * 1.6, ly * H * freq - scroll, 0.5, s, 3, 0, P, 0);
    let v = sx * 0.85 + (n - 0.5) * rough * 1.8 - Math.max(0, ly) * 0.5 + 0.3;
    if (hollow) v -= hollow * Math.max(0, 1 - Math.abs(lx) / 0.62) * (1 - Math.max(0, ly) * 0.55) * 1.4;
    return v * env * gain;
  });
};

// Straight beam with an origin flare.
TYPES.beam = (c, L) => {
  const len = L.len ?? 1.8, th = L.th ?? 0.16, cap = L.cap ?? 0.26, freq = L.freq ?? 3, wob = L.wob ?? 0.5;
  const cyc = Math.max(1, Math.round(L.speed ?? 2)), P = 8, s = c.seed, gain = L.gain ?? 1.05;
  let ext = 1, thick = th;
  if (!c.loop) {
    ext = ease('outCubic', c.lt / (L.grow ?? 0.15));
    thick = th * (1 - smooth(0.72, 1, c.lt)) * (0.75 + 0.25 * smooth(0, 0.2, c.lt));
  }
  thick *= 1 + 0.1 * Math.sin(TAU * c.ph * cyc * 2);
  const Lc = len * ext, scroll = c.ph * P * cyc, capR = cap * (thick / th);
  if (thick < 0.005) return;
  field(c, L, len + cap + 0.2, (a, b) => {
    let v = 0;
    if (a >= -0.05 && a <= Lc) {
      const n = fbm(a * freq - scroll, b * freq * 0.6, 0.3, s, 2, P, 0, 0);
      const T = thick * (1 + wob * (n - 0.5) * 1.6) * (1 - 0.25 * (a / len));
      const tip = clamp((Lc - a) / 0.12);
      const q = Math.abs(b) / Math.max(T * Math.sqrt(tip), 1e-3);
      if (q < 1) v = (1 - q ** 1.6) * 1.1 + (n - 0.5) * 0.35;
    }
    const d = Math.hypot(a, b) / Math.max(capR, 1e-3);
    if (d < 1) v = Math.max(v, (1 - d) * 1.25);
    return v * gain;
  });
};

// Crescent sword slash: the head sweeps the arc, then the crescent thins out.
TYPES.slash = (c, L) => {
  const R = L.r ?? 0.72, th = L.th ?? 0.2;
  const a0 = (L.a0 ?? -160) * DEG, span = ((L.a1 ?? 40) - (L.a0 ?? -160)) * DEG;
  const sweep = L.sweep ?? 0.3, trail = L.trail ?? 0.9, k = c.lt;
  const head = ease('outCubic', k / sweep);
  const after = smooth(sweep, 1, k);
  const tail = Math.max(0, head - trail * (1 - after));
  const thin = (1 - after) ** 0.6;
  const gain = L.gain ?? 1, s = c.seed, er = L.erode ?? 0.6, aspan = Math.abs(span);
  field(c, L, R + 0.15, (x, y) => {
    const rad = Math.hypot(x, y);
    if (rad > R + 0.06 || rad < R - 2.4 * th) return 0;
    let a = Math.atan2(y, x) - a0;
    if (span < 0) a = -a;
    a = ((a % TAU) + TAU) % TAU;
    const p = a / aspan;
    if (p < tail || p > head) return 0;
    const q = (p - tail) / Math.max(head - tail, 1e-4);
    const W = 2 * th * Math.sin(Math.PI * q ** 1.25) ** 0.7 * thin;
    if (W <= 0.008) return 0;
    const dr = R - rad;
    if (dr < -0.02 || dr > W) return 0;
    if (er > 0 && after > 0 && fbm(x * 5, y * 5, k * 2, s, 2) < er * (1 - q) * after) return 0;
    return (0.25 + 0.85 * (1 - dr / W)) * (0.55 + 0.45 * q) * gain;
  });
};

// Energy orb with swirling interior; loops.
TYPES.orb = (c, L) => {
  const r = L.r ?? 0.32, freq = L.freq ?? 2.8, pulse = L.pulse ?? 0.08, spin = Math.round(L.spin ?? 1);
  const s = c.seed, gain = L.gain ?? 1, rim = L.rim ?? 0.35;
  let env = 1;
  if (!c.loop) env = ease('outBack', c.lt / (L.grow ?? 0.2)) * (1 - smooth(0.75, 1, c.lt));
  const R = r * env * (1 + pulse * Math.sin(TAU * c.ph * Math.max(1, Math.round(L.pulseRate ?? 2))));
  if (R <= 0.01) return;
  const ang = TAU * c.ph * spin, ca = Math.cos(ang), sa = Math.sin(ang);
  field(c, L, R * (1 + rim) + 0.05, (x, y) => {
    const d = Math.hypot(x, y) / R;
    if (d > 1 + rim) return 0;
    const rx = x * ca - y * sa, ry = x * sa + y * ca;
    const n = fbm((rx / r) * freq * 0.5 + 5, (ry / r) * freq * 0.5, 0.7, s, 3);
    if (d <= 1) return ((1 - d * d) * 1.05 + (n - 0.5) * 0.7 + 0.15) * gain;
    return (1 - (d - 1) / rim) * 0.35 * (n > 0.45 ? 1 : 0.45) * gain;
  });
};

// Projectile head with a streaming tail. Optional path makes it travel.
TYPES.comet = (c, L) => {
  const r = L.r ?? 0.2, len = L.len ?? 1.1, freq = L.freq ?? 3, rough = L.rough ?? 0.6;
  const cyc = Math.max(1, Math.round(L.speed ?? 2)), P = 8, s = c.seed, gain = L.gain ?? 1;
  let ax = L.x ?? 0, ay = L.y ?? 0, angle = L.angle ?? 0, vis = 1;
  if (L.from) {
    const until = L.until ?? 0.45, e = ease('inQuad', c.lt / until);
    if (c.lt > until) return;
    ax = lerp(L.from[0], L.x ?? 0, e); ay = lerp(L.from[1], L.y ?? 0, e);
    angle = (Math.atan2((L.y ?? 0) - L.from[1], (L.x ?? 0) - L.from[0]) / DEG);
    vis = 1;
  } else if (!c.loop) vis = smooth(0, 0.1, c.lt) * (1 - smooth(0.8, 1, c.lt));
  const scroll = c.ph * P * cyc;
  field(c, L, len + r + 0.2, (a, b) => {
    const dh = Math.hypot(a, b) / r;
    let v = dh < 1.3 ? (1 - dh) * 1.3 + 0.12 : 0;
    if (a < 0.05) {
      const t = -a / len;
      if (t <= 1) {
        const n = fbm(a * freq + scroll, b * freq, 0.2, s, 3, P, 0, 0);
        const wid = r * (1 - t) ** 0.7 * (0.85 + 1.2 * (n - 0.5));
        const q = Math.abs(b) / Math.max(wid, 1e-3);
        if (q < 1) v = Math.max(v, (1 - q) * (1 - t) * 1.15 + (n - 0.5) * rough);
      }
    }
    return v * gain * vis;
  }, ax, ay, angle);
};

// Spiral vortex or portal; core can be a void.
TYPES.vortex = (c, L) => {
  const R = L.r ?? 0.85, rIn = L.rIn ?? 0.18, arms = Math.max(1, Math.round(L.arms ?? 3)), twist = L.twist ?? 2.2;
  const spin = (Math.round(L.spin ?? 1) || 1) * (L.dir ?? 1), freq = L.freq ?? 2.2, s = c.seed, gain = L.gain ?? 1;
  let env = 1;
  if (!c.loop) env = ease('outBack', c.lt / 0.25) * (1 - smooth(0.75, 1, c.lt));
  const Rr = R * env;
  if (Rr < 0.02) return;
  const rot = TAU * c.ph * spin, cr = Math.cos(rot), sr = Math.sin(rot);
  field(c, L, Rr + 0.05, (x, y) => {
    const rad = Math.hypot(x, y) / Rr;
    if (rad > 1) return 0;
    if (rad < rIn) return L.core === 'dark' ? DARK : (1 - rad / rIn) * 0.5 + 0.9;
    const th = Math.atan2(y, x) - rot;
    const stripe = 0.5 + 0.5 * Math.cos(TAU * (arms * th / TAU + twist * rad));
    const rx = x * cr + y * sr, ry = -x * sr + y * cr;
    const n = fbm((rx / R) * freq * 1.5, (ry / R) * freq * 1.5, 0.4, s, 2);
    const m = smooth(rIn, rIn + 0.15, rad) * (1 - rad) ** 0.6;
    const edge = L.core === 'dark' ? (1 - smooth(rIn, rIn + 0.1, rad)) * 1.0 : 0;
    return Math.max((0.25 + 0.95 * stripe * (0.5 + n)) * m * gain, edge * gain);
  });
};

// Vertical column of energy rising from a base glow.
TYPES.pillar = (c, L) => {
  const W = L.w ?? 0.28, H = L.hgt ?? 1.8, freq = L.freq ?? 3, rough = L.rough ?? 0.5;
  const cyc = Math.max(1, Math.round(L.speed ?? 2)), P = 8, s = c.seed, gain = L.gain ?? 1;
  let grow = 1, wid = 1;
  if (!c.loop) {
    grow = ease('outCubic', c.lt / (L.grow ?? 0.18));
    wid = (1 - smooth(0.55, 1, c.lt)) * (0.6 + 0.4 * smooth(0, 0.1, c.lt));
  }
  const Hc = Math.max(H * grow, 0.02), Wc = W * wid, scroll = c.ph * P * cyc;
  if (Wc < 0.01) return;
  field(c, L, H + 0.3, (x, y) => {
    const ly = -y / Hc;
    let v = 0;
    if (ly >= 0 && ly <= 1) {
      const n = fbm(x * freq * 1.5, ly * Hc * freq - scroll, 0.6, s, 3, 0, P, 0);
      const wv = Wc * (1 + 0.35 * (n - 0.5)) * (1 - 0.15 * ly);
      const q = Math.abs(x) / wv;
      if (q < 1) v = (1 - q * q) * (1 - ly ** 3) * 1.15 + (n - 0.5) * rough;
    }
    const bd = Math.hypot(x / (Wc * 1.8), y / (Wc * 0.55));
    if (bd < 1) v = Math.max(v, (1 - bd) * 1.1);
    return v * gain;
  });
};

// Radial light rays.
TYPES.rays = (c, L) => {
  const n = Math.max(2, Math.round(L.count ?? 10)), R = L.r ?? 0.9, wdt = L.width ?? 0.2, jit = L.jitter ?? 0.45;
  const s = c.seed, gain = L.gain ?? 1, inner = L.inner ?? 0.08, twk = Math.max(1, Math.round(L.twinkle ?? 1));
  let env = 1, rot = 0;
  if (c.loop) rot = Math.round(L.spin ?? 0) * c.ph;
  else { env = ease('outCubic', c.lt / 0.25) * (1 - smooth(0.6, 1, c.lt)); rot = (L.spin ?? 0.08) * c.lt; }
  const Rc = R * (c.loop ? 1 : 0.5 + 0.5 * env);
  field(c, L, R + 0.1, (x, y) => {
    const rad = Math.hypot(x, y);
    const a = (((Math.atan2(y, x) / TAU + rot) % 1) + 1) % 1 * n;
    const i = Math.floor(a), f = a - i - 0.5;
    const len = Rc * (1 - jit * hash01(i, 0, 0, s)) * (1 + 0.18 * Math.sin(TAU * (c.ph * twk + hash01(i, 1, 0, s))));
    if (rad > len || rad < inner) return 0;
    const tw = wdt * (1 - rad / len) + 0.02;
    if (Math.abs(f) > tw) return 0;
    return (1 - rad / len) * 1.15 * (1 - (Math.abs(f) / tw) * 0.5) * env * gain;
  });
};

// Magic circle: rings, ticks, a star polygon and runes, drawn on then spinning.
TYPES.glyph = (c, L) => {
  const R = (L.r ?? 0.8) * c.S, sq = L.squash ?? 1;
  const cx = c.w / 2 + (L.x ?? 0) * c.S - 0.5, cy = c.h / 2 + (L.y ?? 0) * c.S - 0.5;
  const drawT = c.loop ? 1 : ease('outQuad', c.lt / (L.draw ?? 0.35));
  const env = c.loop ? 1 : 1 - smooth(0.75, 1, c.lt);
  const rot = c.loop ? TAU * c.ph * Math.round(L.spin ?? 1) : TAU * c.lt * (L.spin ?? 0.25);
  const gain = (L.gain ?? 1) * env * (0.92 + 0.08 * hash01(c.f, 9, 0, c.seed));
  if (gain <= 0.02) return;
  const rings = L.rings ?? [1, 0.84, 0.5];
  const pt = (a, r, v) => plot(c, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * sq), v);
  rings.forEach((rr, i) => {
    const rp = R * rr, N = Math.ceil(TAU * rp * 1.6) + 8, dir = i % 2 ? -1 : 1;
    const lim = N * drawT;
    for (let k = 0; k < lim; k++) pt(-Math.PI / 2 + dir * (k / N) * TAU + dir * rot, rp, gain * (i === 0 ? 0.82 : 0.66));
  });
  if (rings.length > 1) {
    const T = L.ticks ?? 24, r0 = R * rings[1], r1 = R * rings[0];
    for (let k = 0; k < T * drawT; k++) {
      const a = -Math.PI / 2 - rot + (k / T) * TAU;
      line(c, Math.round(cx + Math.cos(a) * r0), Math.round(cy + Math.sin(a) * r0 * sq),
        Math.round(cx + Math.cos(a) * (r0 + (r1 - r0) * 0.6)), Math.round(cy + Math.sin(a) * (r0 + (r1 - r0) * 0.6) * sq), gain * 0.58);
    }
  }
  const P = Math.round(L.star ?? 5), step = Math.round(L.step ?? 2);
  if (P >= 3) {
    const rs = R * (rings[rings.length - 1] ?? 0.5);
    const vtx = (j) => {
      const a = -Math.PI / 2 + (j / P) * TAU + rot * 0.5;
      return [Math.round(cx + Math.cos(a) * rs), Math.round(cy + Math.sin(a) * rs * sq)];
    };
    const edges = Math.ceil(P * drawT);
    for (let j = 0; j < edges; j++) {
      const [x0, y0] = vtx(j * step), [x1, y1] = vtx((j + 1) * step);
      line(c, x0, y0, x1, y1, gain * 0.86);
    }
  }
  const runes = Math.round(L.runes ?? 8);
  if (runes && rings.length > 2) {
    const rm = R * (rings[1] + rings[2]) / 2;
    for (let j = 0; j < runes * drawT; j++) {
      const a = -Math.PI / 2 + (j / runes) * TAU - rot;
      const gx = Math.round(cx + Math.cos(a) * rm) - 1, gy = Math.round(cy + Math.sin(a) * rm * sq) - 1;
      let bits = hash(j, 77, 0, c.seed) & 511;
      if ((bits & 0x10) === 0) bits |= 0x10 | 0x101;
      for (let b = 0; b < 9; b++) if (bits & (1 << b)) plot(c, gx + (b % 3), gy + Math.floor(b / 3), gain * 1.02);
    }
  }
  if (L.fill) {
    const r2 = R * R;
    for (let y = Math.floor(cy - R * sq); y <= cy + R * sq; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const dx = x - cx, dy = (y - cy) / sq;
      if (dx * dx + dy * dy < r2) plot(c, x, y, L.fill * gain);
    }
  }
};

// Soft puffs: smoke, dust, gas, or a breath cone when given a direction and speed.
TYPES.puffs = (c, L) => {
  const n = Math.round(L.count ?? 7), s = c.seed, rand = rng(s);
  const spread = L.spread ?? 0.4, rise = L.rise ?? 0.5, r0 = L.r0 ?? 0.12, r1 = L.r1 ?? 0.3;
  const [lfA, lfB] = pair(L.life, [0.55, 1]), [spA, spB] = pair(L.speed, [0, 0]);
  const emit = L.emit ?? 0.25, dir = (L.dir ?? -90) * DEG, cone = (L.cone ?? 0) * DEG;
  const freq = L.freq ?? 3.2, gain = L.gain ?? 0.6, diss = L.dissolve ?? 1, decay = L.decay ?? 0.5;
  for (let i = 0; i < n; i++) {
    const q = [rand(), rand(), rand(), rand(), rand(), rand(), rand()];
    const life = lerp(lfA, lfB, q[0]);
    const birth = c.loop ? (i + q[1] * 0.5) / n : q[1] * emit;
    let age = c.loop ? ((((c.ph - birth) % 1) + 1) % 1) / life : (c.lt - birth) / life;
    if (age < 0 || age > 1) continue;
    const e = ease('outCubic', age), ang = dir + (q[2] - 0.5) * cone, sp = lerp(spA, spB, q[3]);
    const cxu = (L.x ?? 0) + (q[4] - 0.5) * 2 * spread + Math.cos(ang) * sp * e + (q[5] - 0.5) * (L.drift ?? 0.3) * age;
    const cyu = (L.y ?? 0) + (q[6] - 0.5) * spread * (L.flat ?? 0.6) + Math.sin(ang) * sp * e - rise * e;
    const R = (r0 + (r1 - r0) * e) * (0.8 + 0.4 * q[0]);
    const thr = age ** 1.4 * diss;
    const hm = gain * (1 - decay * age);
    const pcx = c.w / 2 + cxu * c.S, pcy = c.h / 2 + cyu * c.S, pr = R * c.S;
    for (let y = Math.max(0, Math.floor(pcy - pr)); y <= Math.min(c.h - 1, Math.ceil(pcy + pr)); y++)
      for (let x = Math.max(0, Math.floor(pcx - pr)); x <= Math.min(c.w - 1, Math.ceil(pcx + pr)); x++) {
        const d = Math.hypot(x + 0.5 - pcx, y + 0.5 - pcy) / pr;
        if (d > 1) continue;
        const nn = fbm((x / c.S) * freq + i * 7.1, (y / c.S) * freq, age * 1.5, s, 2);
        if (nn < thr) continue;
        const v = ((1 - d) * 0.8 + (nn - 0.5) * 0.8 + 0.3) * hm;
        const j = y * c.w + x;
        if (v > c.heat[j]) c.heat[j] = v;
      }
  }
};

// Particle shapes, drawn in pixel space.
function shape(c, kind, x, y, size, v, vx, vy, age, r) {
  const X = Math.round(x), Y = Math.round(y);
  switch (kind) {
    case 'square':
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) plot(c, X + i, Y + j, v);
      break;
    case 'plus': case 'cross': {
      const a = Math.max(1, size);
      plot(c, X, Y, v);
      for (let k = 1; k <= a; k++) {
        const vv = kind === 'plus' ? v * (1 - (k / (a + 1)) * 0.5) : v;
        plot(c, X + k, Y, vv); plot(c, X - k, Y, vv); plot(c, X, Y + k, vv); plot(c, X, Y - k, vv);
      }
      if (kind === 'cross' && size >= 3) { plot(c, X + 1, Y + 1, v * 0.7); plot(c, X - 1, Y - 1, v * 0.7); plot(c, X + 1, Y - 1, v * 0.7); plot(c, X - 1, Y + 1, v * 0.7); }
      break;
    }
    case 'star': {
      const a = Math.max(1, Math.round(size * Math.sin(Math.PI * clamp(age))));
      plot(c, X, Y, v * 1.1);
      for (let k = 1; k <= a; k++) {
        const vv = v * (1 - k / (a + 1));
        plot(c, X + k, Y, vv); plot(c, X - k, Y, vv); plot(c, X, Y + k, vv); plot(c, X, Y - k, vv);
      }
      break;
    }
    case 'diamond':
      for (let j = -size; j <= size; j++) for (let i = -size; i <= size; i++)
        if (Math.abs(i) + Math.abs(j) <= size) plot(c, X + i, Y + j, v * (1 - (Math.abs(i) + Math.abs(j)) / (size + 1) * 0.4));
      break;
    case 'ring': case 'bubble': {
      const R = Math.max(1, size);
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * TAU;
        plot(c, Math.round(X + Math.cos(a) * R), Math.round(Y + Math.sin(a) * R), v);
      }
      if (kind === 'bubble' && R >= 2) plot(c, X - 1, Y - 1, v * 1.15);
      break;
    }
    case 'streak': case 'drop': {
      const sp = Math.hypot(vx, vy) || 1;
      const len = kind === 'drop' ? 1 : Math.max(1, Math.round(size * sp * 0.6));
      const x1 = Math.round(X - (vx / sp) * len), y1 = Math.round(Y - (vy / sp) * len);
      line(c, X, Y, x1, y1, v, v * 0.45);
      break;
    }
    case 'shard': {
      const a = r * Math.PI + age * 6;
      const l = Math.max(1, size);
      line(c, X, Y, Math.round(X + Math.cos(a) * l), Math.round(Y + Math.sin(a) * l), v, v * 0.7);
      break;
    }
    case 'leaf': case 'petal': {
      const flip = Math.floor(age * 8 + r * 4) % 2;
      plot(c, X, Y, v);
      plot(c, X + (flip ? 1 : -1), Y + (flip ? 0 : 1), v * 0.8);
      if (size > 1) plot(c, X + (flip ? 1 : -1), Y + 1, v * 0.6);
      break;
    }
    case 'chevron': {
      const a = Math.max(2, size);
      for (let k = 0; k <= a; k++) { plot(c, X - k, Y + k, v); plot(c, X + k, Y + k, v); }
      break;
    }
    case 'coin': {
      const wd = Math.max(0, Math.round(Math.abs(Math.cos(age * TAU * 2 + r * TAU)) * size));
      for (let j = -size; j <= size; j++) for (let i = -wd; i <= wd; i++)
        if ((i * i) / ((wd + 0.5) ** 2) + (j * j) / ((size + 0.5) ** 2) <= 1) plot(c, X + i, Y + j, v * (i < 0 && j < 0 ? 1.1 : 0.8));
      break;
    }
    case 'chunk': {
      const rot = Math.floor(age * 10 + r * 4) % 2;
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        if (rot && size > 2 && (i + j === 0 || i + j === 2 * size - 2)) continue;
        plot(c, X + i, Y + j, v * (i === 0 && j === 0 ? 1.15 : 0.8));
      }
      break;
    }
    case 'circle':
      disc(c, X, Y, Math.max(0.5, size / 2), v);
      break;
    default: // dot
      if (size <= 1) plot(c, X, Y, v);
      else disc(c, X, Y, size / 2, v);
  }
}

// Particle emitters: burst, spray, fountain, rise, fall, ambient, orbit, implode.
TYPES.particles = (c, L) => {
  const n = Math.round(L.count ?? 16), s = c.seed, rand = rng(s);
  const mode = L.mode || 'burst';
  const [spA, spB] = pair(L.speed, [0.8, 1.6]), [lfA, lfB] = pair(L.life, [0.5, 1]);
  const [szA, szB] = pair(L.size, [1, 1]), [h0, h1] = pair(L.heat, [1, 0.35]);
  const grav = L.gravity ?? 0, drag = L.drag ?? 1.5, emit = L.emit ?? 0;
  const dir = (L.dir ?? 0) * DEG, spread = (L.spread ?? 360) * DEG, area = L.area ?? 0.05;
  const kind = L.shape || 'dot', gain = L.gain ?? 1, sq = L.squash ?? 1;
  const ax = L.x ?? 0, ay = L.y ?? 0, Wu = c.w / c.S, Hu = c.h / c.S;
  for (let i = 0; i < n; i++) {
    const q = [rand(), rand(), rand(), rand(), rand(), rand(), rand()];
    const life = lerp(lfA, lfB, q[0]), sp = lerp(spA, spB, q[1]);
    let age, tau;
    if (c.loop) {
      const ph0 = (i + q[2] * (L.jitter ?? 0.8)) / n;
      age = ((((c.ph - ph0) % 1) + 1) % 1) / life;
      tau = age * life;
    } else { tau = c.lt - q[2] * emit; age = tau / life; }
    if (age < 0 || age > 1) continue;
    const ang = dir + (q[3] - 0.5) * spread, ca = Math.cos(ang), sa = Math.sin(ang);
    const sAng = q[4] * TAU, sR = Math.sqrt(q[5]) * area;
    const x0 = ax + Math.cos(sAng) * sR * (L.areaX ?? 1), y0 = ay + Math.sin(sAng) * sR * sq * (L.areaY ?? 1);
    let x, y, vx = 0, vy = 0;
    switch (mode) {
      case 'rise': {
        const wig = (L.wiggle ?? 0.06) * Math.sin(TAU * (age * (L.wiggleRate ?? 1.5) + q[6]));
        x = x0 + wig + ca * sp * tau * 0.2; y = y0 - sp * tau; vx = 0; vy = -sp;
        break;
      }
      case 'fall': {
        const xs = (q[4] - 0.5) * Wu * 1.15, ys = -Hu / 2 - 0.08, dist = Hu + 0.2;
        const drift = (L.driftX ?? 0.15) * (0.5 + q[1]);
        const wig = (L.wiggle ?? 0) * Math.sin(TAU * (age * (L.wiggleRate ?? 2) + q[6]));
        x = xs + drift * age + wig; y = ys + age * dist * (L.fallScale ?? 1) * (0.85 + 0.3 * q[5]);
        vx = drift; vy = dist;
        break;
      }
      case 'ambient': {
        const xs = (q[4] - 0.5) * Wu * (L.spanX ?? 1), ys = (q[5] - 0.5) * Hu * (L.spanY ?? 1) + ay;
        const wx = (L.wiggle ?? 0.08) * Math.sin(TAU * (age + q[6])), wy = (L.wiggle ?? 0.08) * Math.cos(TAU * (age * 0.7 + q[0]));
        x = xs + wx; y = ys + wy - sp * tau * 0.25;
        break;
      }
      case 'orbit': {
        const R = (L.orbitR ?? 0.6) * lerp(0.75, 1.1, q[5]);
        const turns = Math.round(L.turns ?? 1) || 1, sign = L.both && q[6] < 0.5 ? -1 : 1;
        const a = q[3] * TAU + sign * TAU * turns * (c.loop ? c.ph : c.lt);
        x = ax + Math.cos(a) * R; y = ay + Math.sin(a) * R * sq; vx = -Math.sin(a) * sign; vy = Math.cos(a) * sq * sign;
        break;
      }
      case 'implode': {
        const R = (L.implodeR ?? 0.9) * lerp(0.6, 1, q[5]);
        const e = ease('inCubic', age), a = q[3] * TAU + (L.swirl ?? 0.6) * e;
        x = ax + Math.cos(a) * R * (1 - e); y = ay + Math.sin(a) * R * (1 - e) * sq;
        vx = -Math.cos(a) * 2; vy = -Math.sin(a) * 2 * sq;
        break;
      }
      default: {
        const D = drag > 0 ? (1 - Math.exp(-drag * tau)) / drag : tau, Dv = Math.exp(-drag * tau);
        x = x0 + ca * sp * D; y = y0 + sa * sp * D * sq + 0.5 * grav * tau * tau;
        vx = ca * sp * Dv; vy = sa * sp * Dv * sq + grav * tau;
        if (L.ground != null && y > L.ground) { y = L.ground; vy = 0; }
      }
    }
    let v = lerp(h0, h1, age) * gain;
    if (L.twinkle) v *= 0.55 + 0.45 * Math.abs(Math.sin(TAU * (age * L.twinkle + q[6])));
    if (L.fadeIn) v *= smooth(0, L.fadeIn, age);
    const size = Math.max(1, Math.round(lerp(szA, szB, age)));
    shape(c, kind, c.w / 2 + x * c.S - 0.5, c.h / 2 + y * c.S - 0.5, size, v, vx, vy, age, q[6]);
  }
};

// Jagged lightning, regenerated every few frames.
TYPES.bolt = (c, L) => {
  if (L.flicker && hash01(c.f, 3, 0, c.seed) < L.flicker) return;
  const hold = Math.max(1, Math.round(L.hold ?? 2));
  const rand = rng(c.seed + Math.floor(c.f / hold) * 7919);
  const env = c.loop ? 1 : 1 - smooth(L.fadeStart ?? 0.5, 1, c.lt);
  const gain = (L.gain ?? 1) * env;
  if (gain < 0.05) return;
  const ax = L.x ?? 0, ay = L.y ?? 0, mode = L.mode || 'radial', count = Math.round(L.count ?? 4);
  const jag = L.jag ?? 0.35, depth = Math.round(L.depth ?? 5), branch = L.branch ?? 0.3, thick = L.thick ?? 1;
  const paths = [];
  if (mode === 'radial') {
    const reach = (L.len ?? 0.9) * (c.loop ? 1 : 0.4 + 0.6 * ease('outCubic', c.lt / 0.2));
    for (let k = 0; k < count; k++) {
      const a = (k / count + (rand() - 0.5) * 0.7 / count) * TAU + (L.angle ?? 0) * DEG;
      const ln = reach * lerp(0.55, 1, rand());
      paths.push([ax, ay, ax + Math.cos(a) * ln, ay + Math.sin(a) * ln * (L.squash ?? 1)]);
    }
  } else if (mode === 'strike') {
    const top = -c.h / c.S / 2 - 0.05;
    const reach = ease('outExpo', c.lt / 0.12);
    for (let k = 0; k < count; k++) {
      const sx = ax + (rand() - 0.5) * (L.spread ?? 0.35);
      paths.push([sx, top, lerp(sx, ax, reach), lerp(top, ay, reach)]);
    }
  } else {
    for (let k = 0; k < count; k++) paths.push([L.x0 ?? -0.8, L.y0 ?? 0, L.x1 ?? 0.8, L.y1 ?? 0]);
  }
  const drawPath = (pts, v, th) => {
    for (let k = 0; k < pts.length - 1; k++)
      line(c, px(c, pts[k][0]), py(c, pts[k][1]), px(c, pts[k + 1][0]), py(c, pts[k + 1][1]), v, v, th);
  };
  const displace = (a, b, dpt, j) => {
    let pts = [a, b];
    for (let d = 0; d < dpt; d++) {
      const nx = [pts[0]];
      for (let k = 0; k < pts.length - 1; k++) {
        const p = pts[k], q = pts[k + 1], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
        const off = (rand() - 0.5) * j * len;
        nx.push([(p[0] + q[0]) / 2 - (dy / len) * off, (p[1] + q[1]) / 2 + (dx / len) * off], q);
      }
      pts = nx;
    }
    return pts;
  };
  for (const [x0, y0, x1, y1] of paths) {
    const pts = displace([x0, y0], [x1, y1], depth, jag);
    drawPath(pts, gain, thick);
    for (let k = 2; k < pts.length - 2; k += 3) {
      if (rand() > branch) continue;
      const p = pts[k], q = pts[Math.min(pts.length - 1, k + 2)];
      const a = Math.atan2(q[1] - p[1], q[0] - p[0]) + (rand() < 0.5 ? -1 : 1) * lerp(0.35, 0.9, rand());
      const ln = Math.hypot(x1 - x0, y1 - y0) * lerp(0.15, 0.35, rand());
      drawPath(displace(p, [p[0] + Math.cos(a) * ln, p[1] + Math.sin(a) * ln], 3, jag), gain * 0.72, 1);
    }
  }
};

// Ground cracks spreading from the impact point.
TYPES.cracks = (c, L) => {
  const n = Math.round(L.count ?? 6), rand = rng(c.seed), len = (L.len ?? 0.9) * c.S, sq = L.squash ?? 0.4;
  const grow = ease('outCubic', c.lt / (L.grow ?? 0.2)), env = 1 - smooth(L.fadeStart ?? 0.55, 1, c.lt);
  const gain = (L.gain ?? 1) * env, cx = c.w / 2 + (L.x ?? 0) * c.S - 0.5, cy = c.h / 2 + (L.y ?? 0) * c.S - 0.5;
  if (gain < 0.05) return;
  const walk = (x, y, a, steps, v) => {
    let px0 = Math.round(x), py0 = Math.round(y);
    for (let k = 0; k < steps; k++) {
      a += (rand() - 0.5) * 0.9;
      x += Math.cos(a) * 1.3; y += Math.sin(a) * 1.3 * sq;
      const nx = Math.round(x), ny = Math.round(y);
      line(c, px0, py0, nx, ny, v * (1 - (k / steps) * 0.55));
      px0 = nx; py0 = ny;
      if (rand() < 0.08 && steps - k > 4) walk(x, y, a + (rand() < 0.5 ? -0.8 : 0.8), Math.floor((steps - k) * 0.4), v * 0.8);
    }
  };
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (rand() - 0.5) * 0.8;
    const steps = Math.floor((len / 1.3) * lerp(0.6, 1, rand()) * grow);
    walk(cx, cy, a, steps, gain);
  }
};

// Crystal or rock spikes erupting from the ground, two-tone faceted.
TYPES.spikes = (c, L) => {
  const n = Math.max(1, Math.round(L.count ?? 5)), rand = rng(c.seed), spread = L.spread ?? 0.75;
  const [hA, hB] = pair(L.hgt, [0.55, 1.0]), [wA, wB] = pair(L.width, [0.1, 0.17]);
  const grow = L.grow ?? 0.22, hold = L.hold ?? 0.55, gain = L.gain ?? 1, s = c.seed;
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : lerp(-1, 1, i / (n - 1)) * spread + (rand() - 0.5) * 0.12;
    const H = lerp(hA, hB, rand()) * (1 - (0.35 * Math.abs(off)) / Math.max(spread, 0.01));
    const W = lerp(wA, wB, rand());
    const lean = (rand() - 0.5) * 2 * (L.lean ?? 12) + (off / Math.max(spread, 0.01)) * (L.fan ?? 14);
    const delay = (Math.abs(off) / Math.max(spread, 0.01)) * 0.12 + rand() * 0.05;
    const g = c.loop ? 1 : ease('outBack', (c.lt - delay) / grow);
    if (g <= 0) continue;
    const shat = c.loop ? 0 : smooth(hold, 1, c.lt);
    const Hc = H * g * (1 - 0.3 * shat);
    field(c, { ...L, squash: 1 }, Hc + W + 0.05, (x, y) => {
      const a = -y;
      if (a < 0 || a > Hc) return 0;
      const hw = W * (1 - a / Hc);
      if (Math.abs(x) > hw) return 0;
      if (shat > 0 && fbm(x * 8 + i, y * 8, shat * 3, s, 2) < shat * 1.05) return 0;
      let v = 0.45 + 0.5 * (a / Hc);
      if (x < 0) v -= 0.22;
      if (x > 0 && hw - x < 0.05) v += 0.25;
      return v * gain;
    }, (L.x ?? 0) + off, L.y ?? 0, lean);
  }
};

// Anime-style impact star that pops and hollows out.
TYPES.star = (c, L) => {
  const k = c.lt, pts = Math.max(3, Math.round(L.points ?? 8)), R = L.r ?? 0.75, inner = L.inner ?? 0.22;
  const sharp = L.sharp ?? 1.6, jit = L.jitter ?? 0.45, pop = L.pop ?? 0.22, s = c.seed, gain = L.gain ?? 1.1;
  const sc = ease('outBack', k / pop) * (1 - 0.25 * smooth(pop, 1, k));
  const hole = (L.hollow ?? 0.9) * ease('outQuad', smooth(pop * 0.9, 1, k));
  if (sc <= 0.01) return;
  const rot = L.angle ?? hash01(1, 2, 3, s) * 360;
  field(c, L, R * 1.35, (x, y) => {
    const rad = Math.hypot(x, y);
    const a = (((Math.atan2(y, x) / TAU) % 1) + 1) % 1 * pts;
    const i = Math.round(a) % pts, f = Math.abs(a - Math.round(a));
    const len = R * (1 - jit * hash01(i, 5, 0, s)) * sc;
    const rs = len * inner + (len - len * inner) * Math.max(0, 1 - f * 2) ** sharp;
    if (rad > rs || rad < hole * len) return 0;
    return (1 - (rad / rs) * 0.6) * gain;
  }, L.x ?? 0, L.y ?? 0, rot);
};

// Claw marks, speed lines and wind gusts.
TYPES.streaks = (c, L) => {
  const mode = L.mode || 'claw', n = Math.round(L.count ?? 3), rand = rng(c.seed), gain = L.gain ?? 1;
  const ax = L.x ?? 0, ay = L.y ?? 0;
  if (mode === 'claw') {
    const ang = (L.angle ?? 55) * DEG, len = L.len ?? 1.4, gap = L.gap ?? 0.22, curve = L.curve ?? 0.18, th = L.th ?? 2;
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    for (let i = 0; i < n; i++) {
      const lt = c.lt - i * (L.stagger ?? 0.04);
      const head = ease('outCubic', lt / 0.22), tail = smooth(0.12, 0.8, lt);
      if (head <= tail) continue;
      const off = (i - (n - 1) / 2) * gap;
      const P0 = [ax - (dx * len) / 2 + nx * off, ay - (dy * len) / 2 + ny * off];
      const P2 = [ax + (dx * len) / 2 + nx * off, ay + (dy * len) / 2 + ny * off];
      const P1 = [ax + nx * (off + curve), ay + ny * (off + curve)];
      const steps = Math.ceil(len * c.S * 1.5);
      for (let m = 0; m <= steps; m++) {
        const t = lerp(tail, head, m / steps), u = 1 - t;
        const bx = u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0], by = u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1];
        const prof = Math.sin(Math.PI * (m / steps));
        const r = Math.max(0.5, th * prof * (1 - smooth(0.4, 1, c.lt) * 0.6));
        disc(c, Math.round(c.w / 2 + bx * c.S - 0.5), Math.round(c.h / 2 + by * c.S - 0.5), r * 0.6, gain * (0.55 + 0.45 * prof));
      }
    }
  } else if (mode === 'speed') {
    const Wu = c.w / c.S, cyc = Math.max(1, Math.round(L.speed ?? 2)), dirx = Math.cos((L.angle ?? 180) * DEG), diry = Math.sin((L.angle ?? 180) * DEG);
    for (let i = 0; i < n; i++) {
      const yy = ay + (rand() - 0.5) * (L.spanY ?? 0.8), ln = lerp(0.2, 0.7, rand()) * (L.len ?? 1), off = rand();
      const t = c.loop ? ((off + c.ph * cyc) % 1) : ((off * 0.3 + c.lt * cyc) % 1);
      const xx = lerp(-Wu / 2 - ln, Wu / 2 + ln, t) * -dirx;
      const v = gain * lerp(0.5, 1, rand());
      line(c, px(c, xx), py(c, yy), px(c, xx - dirx * ln), py(c, yy - diry * ln), v, v * 0.3);
    }
  } else {
    const turns = Math.round(L.turns ?? 1) || 1;
    for (let i = 0; i < n; i++) {
      const R = lerp(0.3, 1, rand()) * (L.r ?? 0.8), a0 = rand() * TAU, span = lerp(0.6, 1.6, rand());
      const head = a0 + TAU * turns * (c.loop ? c.ph : c.lt) * (L.dir ?? 1);
      const steps = Math.ceil(R * c.S * span);
      for (let m = 0; m <= steps; m++) {
        const a = head - (m / steps) * span * (L.dir ?? 1);
        plot(c, px(c, ax + Math.cos(a) * R), py(c, ay + Math.sin(a) * R * (L.squash ?? 0.5)), gain * (1 - (m / steps) * 0.7));
      }
    }
  }
};

function hexEdge(x, y, size) {
  const q = ((Math.sqrt(3) / 3) * x - y / 3) / size, r = ((2 / 3) * y) / size;
  const cx = q, cz = r, cy = -cx - cz;
  let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
  const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return Math.max(Math.abs(rx - cx), Math.abs(ry - cy), Math.abs(rz - cz)) * 2;
}

// Shield bubble with hex cells and a travelling highlight; loops.
TYPES.bubble = (c, L) => {
  const R = L.r ?? 0.8, th = L.th ?? 0.07, hex = L.hex ?? 0.4, fill = L.fill ?? 0.16, cell = L.cell ?? 0.17;
  const sh = Math.round(L.shimmer ?? 1) || 1, gain = L.gain ?? 1;
  let env = 1;
  if (!c.loop) env = ease('outBack', c.lt / 0.2) * (1 - smooth(0.8, 1, c.lt));
  const Rr = R * env, hl = TAU * c.ph * sh - Math.PI / 2;
  if (Rr < 0.02) return;
  field(c, L, Rr + th + 0.05, (x, y) => {
    const d = Math.hypot(x, y);
    if (d > Rr + th) return 0;
    if (d > Rr - th) return 0.95 * gain;
    let da = Math.atan2(y, x) - hl;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (d > Rr * 0.7 && Math.abs(da) < 0.45) return (0.45 + 0.5 * (1 - Math.abs(da) / 0.45)) * gain;
    if (hex && hexEdge(x, y, cell) > 0.84) return hex * gain * (0.7 + 0.3 * (d / Rr));
    return fill * gain * (0.6 + 0.6 * (d / Rr) ** 2);
  });
};

// One or two frames of white-hot flash at the impact.
TYPES.flash = (c, L) => {
  const dur = L.dur ?? 0.12;
  if (c.lt > dur) return;
  const k = c.lt / dur, R = (L.r ?? 0.6) * (0.7 + 0.3 * k), gain = L.gain ?? 1.3;
  field(c, L, R + 0.05, (x, y) => {
    const d = Math.hypot(x, y) / R;
    return d > 1 ? 0 : (1 - d ** 4) * gain * (1 - 0.4 * k);
  });
};

// Pixel-font text that pops and floats: damage numbers, CRIT!, LEVEL UP.
TYPES.text = (c, L) => {
  const str = String(L.text ?? 'CRIT!').toUpperCase().slice(0, 14);
  const k = c.lt, base = Math.max(1, Math.round(L.scale ?? 1));
  const sc = k < 0.1 && L.pop !== false ? base + 1 : base;
  const rise = ease('outCubic', k) * (L.rise ?? 0.35);
  const wpx = str.length * 4 * sc - sc, hpx = 5 * sc;
  const x0 = Math.round(c.w / 2 + (L.x ?? 0) * c.S - wpx / 2), y0 = Math.round(c.h / 2 + ((L.y ?? 0) - rise) * c.S - hpx / 2);
  const gain = L.gain ?? 1, fadeAt = L.fadeStart ?? 0.7;
  for (let ci = 0; ci < str.length; ci++) {
    const g = FONT[str[ci]] || FONT['?'];
    for (let r = 0; r < 5; r++) for (let col = 0; col < 3; col++) {
      if (g[r * 3 + col] !== '1') continue;
      for (let yy = 0; yy < sc; yy++) for (let xx = 0; xx < sc; xx++) {
        const X = x0 + ci * 4 * sc + col * sc + xx, Y = y0 + r * sc + yy;
        if (k > fadeAt && hash01(X, Y, 1, c.seed) < smooth(fadeAt, 1, k)) continue;
        plot(c, X, Y, gain * (0.62 + 0.38 * (1 - r / 4)));
      }
    }
  }
};

// Funnel tornado with bands wrapping round the cylinder; loops.
TYPES.tornado = (c, L) => {
  const w0 = L.w0 ?? 0.12, w1 = L.w1 ?? 0.6, H = L.hgt ?? 1.8, twist = L.twist ?? 3;
  const spin = Math.round(L.spin ?? 2) || 1, freq = L.freq ?? 3, rough = L.rough ?? 0.5, sway = L.sway ?? 0.08;
  const s = c.seed, gain = L.gain ?? 1, P = 8;
  let env = 1;
  if (!c.loop) env = ease('outCubic', c.lt / 0.25) * (1 - smooth(0.75, 1, c.lt));
  if (env < 0.02) return;
  field(c, L, H + w1 + 0.2, (x, y) => {
    const ly = -y / H;
    if (ly < 0 || ly > env) return 0;
    const cx = sway * Math.sin(TAU * (ly * 0.8 + c.ph));
    const hw = (w0 + (w1 - w0) * ly ** 1.3) * env;
    const lx = (x - cx) / hw;
    if (Math.abs(lx) > 1) return 0;
    const wrapA = Math.asin(clamp(lx, -1, 1)) / Math.PI;
    const stripe = 0.5 + 0.5 * Math.cos(TAU * (ly * twist * 2 + wrapA * 2 - c.ph * spin));
    const n = fbm(lx * 2, ly * H * freq - c.ph * P * spin, 0.3, s, 2, 0, P, 0);
    const body = 0.32 + 0.75 * stripe * (0.55 + 0.9 * (n - 0.5) * rough * 2);
    return body * (1 - lx * lx * 0.55) * (1 - smooth(0.85, 1, ly / env)) * gain;
  });
};

export const LAYER_TYPES = Object.keys(TYPES);
// Layer types are looked up in a Map, so a recipe can only reach the functions defined above.
const TYPE_MAP = new Map(Object.entries(TYPES));
const STAMPS = new Set(['particles', 'bolt', 'glyph', 'cracks', 'streaks', 'text']);

// ---------- recipe ----------
export const DEFAULTS = {
  name: 'Untitled effect', w: 64, h: 64, frames: 16, fps: 15, loop: false, seed: 1,
  outline: 'none', outlineColor: null, dither: 0, palette: null, cleanup: true, hue: 0, sat: 1,
  ramps: { main: 'fire', alt: 'fire', smoke: 'smoke', spark: 'white' },
};

const clampInt = (v, a, b, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d;
};

export function normalize(recipe = {}) {
  const R = { ...DEFAULTS, ...recipe, ramps: { ...DEFAULTS.ramps, ...(recipe.ramps || {}) } };
  R.w = clampInt(R.w, 8, 512, 64);
  R.h = clampInt(R.h, 8, 512, 64);
  R.frames = clampInt(R.frames, 1, 120, 16);
  R.fps = clampInt(R.fps, 1, 60, 15);
  R.seed = clampInt(R.seed, 0, 2 ** 31 - 1, 1);
  R.dither = clamp(Number(R.dither) || 0);
  R.layers = (Array.isArray(recipe.layers) ? recipe.layers : [])
    .filter((l) => l && TYPE_MAP.has(l.type))
    .map((l) => {
      let spec = l.ramp ?? '$main';
      if (typeof spec === 'string' && spec.startsWith('$')) spec = R.ramps[spec.slice(1)] ?? 'fire';
      return { ...l, _ramp: resolveRamp(spec, (R.hue || 0) + (l.hue || 0), R.sat ?? 1) };
    });
  return R;
}

// Render one frame into an RGBA buffer. st holds reusable scratch buffers.
export function renderFrame(R, f, st) {
  const { w, h } = R, N = w * h;
  if (!st || st.n !== N) {
    st = { n: N, heat: new Float32Array(N), color: new Int32Array(N), owner: new Int16Array(N), kind: new Uint8Array(N) };
  }
  const { heat, color, owner, kind } = st;
  color.fill(-1); owner.fill(-1); kind.fill(0);
  const t = R.loop ? f / R.frames : R.frames > 1 ? f / (R.frames - 1) : 0;
  const S = Math.min(w, h) / 2;
  R.layers.forEach((L, li) => {
    if (L.hidden) return;
    const t0 = L.t0 ?? 0, t1 = L.t1 ?? 1;
    const lt = (t - t0) / Math.max(t1 - t0, 1e-4);
    if (lt < 0 || lt > 1) return;
    heat.fill(0);
    const c = { w, h, S, f, t, lt, ph: R.loop ? t : lt, loop: !!R.loop, frames: R.frames, heat,
      seed: (R.seed * 7919 + li * 104729 + (L.seed || 0) * 15485863) >>> 0 };
    if (TYPE_MAP.has(L.type)) TYPE_MAP.get(L.type)(c, L);
    if (L.glow) dilate(c, Math.min(4, Math.round(L.glow)), L.glowFalloff ?? 0.5);
    paint(c, L, li, R, color, owner, kind);
  });
  post(R, color, owner, kind);
  const out = new Uint8ClampedArray(N * 4);
  let covered = 0;
  for (let i = 0; i < N; i++) {
    const col = color[i];
    if (col < 0) continue;
    covered++;
    out[i * 4] = (col >> 16) & 255; out[i * 4 + 1] = (col >> 8) & 255; out[i * 4 + 2] = col & 255; out[i * 4 + 3] = 255;
  }
  return { rgba: out, covered, st };
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function paint(c, L, li, R, color, owner, kind) {
  const { w, h, heat } = c, ramp = L._ramp, n = ramp.length, cut = L.cut ?? 0.1;
  const dith = L.dither ?? R.dither, gamma = L.gamma ?? 1, under = L.blend === 'under';
  const bs = n / (1 - cut), stamp = STAMPS.has(L.type) ? 1 : 0;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    let v = heat[i];
    if (v <= 0 || (under && color[i] >= 0)) continue;
    let idx;
    if (v >= DARK) idx = 0;
    else {
      if (gamma !== 1) v = v ** gamma;
      if (dith) v += ((BAYER[(x & 3) + ((y & 3) << 2)] - 0.5) * dith) / bs;
      if (v < cut) continue;
      idx = Math.floor((v - cut) * bs);
      if (idx >= n) idx = n - 1;
    }
    color[i] = ramp[idx]; owner[i] = li; kind[i] = stamp;
  }
}

function post(R, color, owner, kind) {
  const { w, h } = R, N = w * h;
  if (R.cleanup) {
    const rm = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (color[i] < 0 || kind[i]) continue;
      let nb = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h && color[Y * w + X] >= 0) nb++;
      }
      if (nb === 0) rm.push(i);
    }
    for (const i of rm) color[i] = -1;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (color[i] >= 0) continue;
      const a = color[i - 1], b = color[i + 1], u = color[i - w], d = color[i + w];
      if (a >= 0 && b >= 0 && u >= 0 && d >= 0 && owner[i - 1] === owner[i + 1] && owner[i - w] === owner[i + w]) {
        color[i] = a; owner[i] = owner[i - 1];
      }
    }
  }
  const mode = R.outline;
  if (mode && mode !== 'none') {
    const fixed = R.outlineColor ? pack(hexToRgb(R.outlineColor)) : null;
    const layers = R.layers;
    const pick = (j) => fixed ?? darken(layers[owner[j]]?._ramp[0] ?? 0, 0.55);
    if (mode === 'inside') {
      const edge = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (color[i] < 0) continue;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || color[i - 1] < 0 || color[i + 1] < 0 || color[i - w] < 0 || color[i + w] < 0) edge.push(i);
      }
      for (const i of edge) color[i] = fixed ?? layers[owner[i]]?._ramp[0] ?? color[i];
    } else {
      const diag = mode === 'outside8', add = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (color[i] >= 0) continue;
        let src = -1;
        if (x > 0 && color[i - 1] >= 0) src = i - 1;
        else if (x < w - 1 && color[i + 1] >= 0) src = i + 1;
        else if (y > 0 && color[i - w] >= 0) src = i - w;
        else if (y < h - 1 && color[i + w] >= 0) src = i + w;
        else if (diag) {
          for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const X = x + dx, Y = y + dy;
            if (X >= 0 && Y >= 0 && X < w && Y < h && color[Y * w + X] >= 0) { src = Y * w + X; break; }
          }
        }
        if (src >= 0) add.push(i, src);
      }
      for (let k = 0; k < add.length; k += 2) { color[add[k]] = pick(add[k + 1]); owner[add[k]] = owner[add[k + 1]]; }
    }
  }
  if (R.palette) {
    const pal = Array.isArray(R.palette) ? R.palette : PALETTES[R.palette];
    if (pal && pal.length) {
      const packed = pal.map((h) => pack(hexToRgb(h)));
      for (let i = 0; i < N; i++) if (color[i] >= 0) color[i] = nearestInPalette(color[i], packed);
    }
  }
}

// Render every frame. Returns frames plus the frame with the biggest jump in
// coverage, which the stage uses to time hit flashes and screen shake.
export function render(recipe, onFrame) {
  const R = normalize(recipe);
  const frames = [];
  let st = null, prev = 0, impact = 0, best = -1;
  for (let f = 0; f < R.frames; f++) {
    const r = renderFrame(R, f, st);
    st = r.st;
    frames.push(r.rgba);
    const jump = r.covered - prev;
    if (f < Math.ceil(R.frames * 0.6) && jump > best) { best = jump; impact = f; }
    prev = r.covered;
    if (onFrame) onFrame(f, r.rgba);
  }
  if (recipe.impact != null) impact = Math.round(recipe.impact * (R.frames - 1));
  return { w: R.w, h: R.h, fps: R.fps, loop: !!R.loop, frames, impact, name: R.name };
}
