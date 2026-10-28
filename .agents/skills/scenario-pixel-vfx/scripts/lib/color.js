// Colour ramps, palettes and OKLab helpers. Ramps run dark to light, and the
// renderer maps heat onto them in hard bands, which is what makes VFX read as
// pixel art instead of a blurred glow.

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);

export function hexToRgb(hex) {
  let h = String(hex).replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = ([r, g, b]) =>
  '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
export const pack = ([r, g, b]) => (r << 16) | (g << 8) | b;
export const unpack = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

const toLin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function rgbToOklab([r, g, b]) {
  r = toLin(r); g = toLin(g); b = toLin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (lin) => lin.every((c) => c >= -0.0005 && c <= 1.0005);
const linToByte = (c) => {
  c = clamp(c);
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(clamp(s) * 255);
};

// OKLCH to sRGB, reducing chroma until the colour fits the gamut.
export function oklch(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  let lo = 0, hi = C, lin = oklabToLinear([L, C * Math.cos(h), C * Math.sin(h)]);
  if (!inGamut(lin)) {
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklabToLinear([L, mid * Math.cos(h), mid * Math.sin(h)]))) lo = mid;
      else hi = mid;
    }
    lin = oklabToLinear([L, lo * Math.cos(h), lo * Math.sin(h)]);
  }
  return lin.map(linToByte);
}

export function toOklch(rgb) {
  const [L, a, b] = rgbToOklab(rgb);
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

const hueToward = (h, target, amt) => {
  const d = ((target - h + 540) % 360) - 180;
  return h + d * amt;
};

// A hue-shifted ramp in the way pixel artists build them: shadows lean cool,
// highlights lean warm and the brightest step is almost white.
export function rampFromHue(hue, n = 7, sat = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const L = 0.2 + 0.77 * t ** 0.95;
    let C = sat * 0.2 * Math.sin(Math.PI * (0.12 + 0.72 * t)) * (1 - 0.8 * t ** 5);
    let h = hue;
    h = t < 0.5 ? hueToward(h, 285, 0.32 * (1 - t * 2)) : hueToward(h, 95, 0.22 * (t * 2 - 1));
    if (t === 1) C *= 0.4;
    out.push(rgbToHex(oklch(L, C, h)));
  }
  return out;
}

export function shiftRamp(hexes, deg = 0, sat = 1) {
  if (!deg && sat === 1) return hexes;
  return hexes.map((hx) => {
    const [L, C, h] = toOklch(hexToRgb(hx));
    return rgbToHex(oklch(L, C * sat, h + deg));
  });
}

// Hand-tuned element ramps, dark to light.
export const RAMPS = {
  fire: ['#2a0b1c', '#6b1328', '#b3261e', '#e8541c', '#f99a1b', '#ffd84a', '#fff6c9'],
  lava: ['#1c0606', '#4c0b0a', '#9c1d0b', '#e3470f', '#ff8f1f', '#ffd25c', '#fff3b8'],
  ice: ['#0d1638', '#1b347e', '#2a63c8', '#43a3ec', '#86e0ff', '#cdf7ff', '#ffffff'],
  frost: ['#1d2547', '#3b4f8a', '#6a8fc9', '#a2c9ec', '#d5ecfa', '#ffffff'],
  lightning: ['#100b36', '#24208c', '#3a56ec', '#5cb2ff', '#a7efff', '#ffffff'],
  thunder: ['#1e1206', '#6d3b0d', '#cf8212', '#ffcf3a', '#fff4a3', '#ffffff'],
  poison: ['#140c1e', '#2b2148', '#2f5a2a', '#4f9a24', '#93d82c', '#d8ff7a', '#f6ffd6'],
  holy: ['#33200e', '#7d4f12', '#c99322', '#f6cf4a', '#fff1a6', '#fffbe8', '#ffffff'],
  dark: ['#06030b', '#160a28', '#2d1150', '#4f1d88', '#8338cc', '#c482ff', '#f0dcff'],
  void: ['#000000', '#0c0517', '#200b3a', '#40166c', '#7c2fc4', '#d8a8ff'],
  arcane: ['#190731', '#42106c', '#7a1db6', '#c13ae6', '#ff78ee', '#ffd2f8', '#ffffff'],
  nature: ['#0b1d13', '#145526', '#2b8f35', '#64c845', '#b6ee72', '#efffcc'],
  water: ['#071833', '#0d376b', '#1563ad', '#259fdc', '#73d6f3', '#d9faff', '#ffffff'],
  blood: ['#12030a', '#420914', '#7f0f22', '#c11d2f', '#f24848', '#ff9a8a'],
  earth: ['#170f0a', '#38261a', '#644429', '#946a42', '#c39c68', '#ead6a6'],
  smoke: ['#0f0c14', '#26212d', '#433d4d', '#6a6274', '#9a92a3', '#cfc8d6'],
  dust: ['#1d1610', '#3f3226', '#665443', '#91806a', '#bdae95', '#e6dcc6'],
  ash: ['#141216', '#2c2930', '#4a464f', '#716c76', '#a39da8'],
  wind: ['#0c2627', '#195852', '#33a093', '#73dcc4', '#c9fbea', '#ffffff'],
  plasma: ['#1a0420', '#55095a', '#b81488', '#ff3caa', '#ff98d6', '#ffe6f6', '#ffffff'],
  energy: ['#041e29', '#0a4757', '#0f8798', '#2dd2cd', '#9cfff0', '#ffffff'],
  gold: ['#291505', '#6b3c09', '#b5720d', '#f0b31b', '#ffe16b', '#fffadf'],
  solar: ['#2a1204', '#7a2e05', '#d65d0a', '#ff9f1c', '#ffe066', '#ffffff'],
  shadow: ['#000000', '#08070c', '#141019', '#211b29', '#352c40'],
  steel: ['#1b2233', '#3a4a66', '#6d84a8', '#a9c1dd', '#e3eefa', '#ffffff'],
  white: ['#5a6378', '#9aa4b8', '#d4dbe8', '#ffffff'],
  rainbow: ['#3a0ca3', '#4361ee', '#4cc9f0', '#80ed99', '#ffd166', '#ff7f50', '#ffffff'],
};

export const RAMP_LABELS = {
  fire: 'Fire', lava: 'Lava', ice: 'Ice', frost: 'Frost', lightning: 'Lightning',
  thunder: 'Thunder', poison: 'Poison', holy: 'Holy', dark: 'Dark', void: 'Void',
  arcane: 'Arcane', nature: 'Nature', water: 'Water', blood: 'Blood', earth: 'Earth',
  smoke: 'Smoke', dust: 'Dust', ash: 'Ash', wind: 'Wind', plasma: 'Plasma',
  energy: 'Energy', gold: 'Gold', solar: 'Solar', shadow: 'Shadow', steel: 'Steel', white: 'White',
  rainbow: 'Prism',
};

// Fixed palettes an effect can be locked to, for projects with a set palette.
export const PALETTES = {
  pico8: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
    '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
  sweetie16: ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
    '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'],
  endesga32: ['#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633',
    '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e',
    '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
    '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569'],
  gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  onebit: ['#0b0b10', '#f4f1e8'],
};

export const PALETTE_LABELS = {
  pico8: 'PICO-8', sweetie16: 'Sweetie 16', endesga32: 'Endesga 32', gameboy: 'Game Boy', onebit: '1-bit',
};

const rampCache = new Map();
// Resolve a ramp spec (name, "hue:200", or a list of hex colours) to packed ints.
export function resolveRamp(spec, hue = 0, sat = 1) {
  const key = JSON.stringify([spec, hue, sat]);
  if (rampCache.has(key)) return rampCache.get(key);
  let hexes;
  if (Array.isArray(spec) && spec.length) hexes = spec;
  else if (typeof spec === 'string' && spec.startsWith('hue:')) hexes = rampFromHue(parseFloat(spec.slice(4)) || 0);
  else hexes = RAMPS[spec] || RAMPS.fire;
  hexes = shiftRamp(hexes, hue, sat);
  const out = Int32Array.from(hexes.map((h) => pack(hexToRgb(h))));
  if (rampCache.size > 400) rampCache.clear();
  rampCache.set(key, out);
  return out;
}

const labCache = new Map();
export function nearestInPalette(c, palette) {
  const key = palette.join() + c;
  const hit = labCache.get(key);
  if (hit !== undefined) return hit;
  const lab = rgbToOklab(unpack(c));
  let best = 0, bd = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const pl = rgbToOklab(unpack(p));
    const d = (lab[0] - pl[0]) ** 2 * 1.4 + (lab[1] - pl[1]) ** 2 + (lab[2] - pl[2]) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  if (labCache.size > 20000) labCache.clear();
  labCache.set(key, best);
  return best;
}

export function darken(c, k = 0.6) {
  const [r, g, b] = unpack(c);
  return pack([Math.round(r * k), Math.round(g * k), Math.round(b * k * 1.08 > 255 ? 255 : b * k * 1.08)]);
}
