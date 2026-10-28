#!/usr/bin/env node
// Render a pixel VFX recipe (or a plain-language prompt) to a sprite sheet,
// an atlas, a GIF and optional single frames, all locally and for free.
import fs from 'node:fs';
import path from 'node:path';
import { render, LAYER_TYPES } from './lib/engine.js';
import { interpret, parse, FORM_LIST, SUGGESTED_WORDS } from './lib/forms.js';
import { RAMPS, PALETTES } from './lib/color.js';
import { encodePNG, decodePNG, encodeGIF } from './lib/node-image.js';

const USAGE = `Usage:
  node render.mjs <recipe.json> [options]
  node render.mjs --prompt "huge purple lightning nova" [--seed 7] [options]

Options:
  --out <dir>        output folder (default: ./vfx-out)
  --name <stem>      file name stem (default: the recipe name)
  --scale <n>        GIF scale, 1 to 12 (default: 4)
  --frames           also write one PNG per frame
  --backdrop <png>   also write a preview GIF over this image (a character or scene)
  --at <x,y>         backdrop pixel where the effect pivot sits (default: centre)
  --save-recipe      write the recipe JSON next to the outputs (always on with --prompt)
  --describe         print how a prompt is read, then exit
  --list             list layer types, colour ramps, palettes and forms, then exit
  --force            overwrite existing files
  -h, --help         show this help`;

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (['--frames', '--save-recipe', '--describe', '--list', '--force'].includes(a)) o[a.slice(2)] = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else o._.push(a);
  }
  return o;
}

const opt = args(process.argv.slice(2));
if (opt.help || (!opt._.length && !opt.prompt && !opt.list)) { console.log(USAGE); process.exit(opt.help ? 0 : 1); }
if (opt.list) {
  console.log('Layer types: ' + LAYER_TYPES.join(', '));
  console.log('Ramps: ' + Object.keys(RAMPS).join(', ') + ', or "hue:<0-360>", or a list of hex colours');
  console.log('Palettes: ' + Object.keys(PALETTES).join(', '));
  console.log('Prompt forms: ' + FORM_LIST.join(', '));
  process.exit(0);
}

let recipe;
if (opt.prompt) {
  if (!interpret(opt.prompt).matched) {
    console.error(`No effect word in "${opt.prompt}". Add a form or an element, such as ${SUGGESTED_WORDS.join(', ')} (all forms: --list), or write a recipe.`);
    process.exit(1);
  }
  if (opt.describe) {
    const p = parse(opt.prompt);
    const { recipe: r, chips } = interpret(opt.prompt, opt.seed != null ? Number(opt.seed) : undefined);
    console.log(JSON.stringify({ read: chips.map((c) => `${c.kind}:${c.label}`), forms: p.forms, elements: p.elements, size: [r.w, r.h], frames: r.frames, fps: r.fps, loop: r.loop, layers: r.layers.map((l) => l.type) }, null, 2));
    process.exit(0);
  }
  recipe = interpret(opt.prompt, opt.seed != null ? Number(opt.seed) : undefined).recipe;
  opt['save-recipe'] = true;
} else {
  try { recipe = JSON.parse(fs.readFileSync(opt._[0], 'utf8')); }
  catch (e) { console.error(`Could not read recipe ${opt._[0]}: ${e.message}`); process.exit(1); }
  if (opt.seed != null) recipe.seed = Number(opt.seed);
}
if (!Array.isArray(recipe.layers) || !recipe.layers.length) { console.error('The recipe has no layers.'); process.exit(1); }
const unknown = recipe.layers.filter((l) => !LAYER_TYPES.includes(l.type)).map((l) => l.type);
if (unknown.length) console.warn(`Skipping unknown layer types: ${[...new Set(unknown)].join(', ')}`);

const out = path.resolve(opt.out || 'vfx-out');
const stem = (opt.name || recipe.name || 'effect').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'effect';
const scale = Math.max(1, Math.min(12, Math.round(Number(opt.scale) || 4)));
fs.mkdirSync(out, { recursive: true });
const written = [];
function write(name, data) {
  const file = path.join(out, name);
  if (fs.existsSync(file) && !opt.force) { console.error(`Refusing to overwrite ${file} (use --force).`); process.exit(1); }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  written.push(name);
}

const t0 = Date.now();
const res = render(recipe);
const { w, h, fps, frames } = res;
const n = frames.length;
const cols = n * w <= 4096 ? n : Math.ceil(Math.sqrt((n * h) / w));
const rows = Math.ceil(n / cols);
const sheet = new Uint8ClampedArray(cols * w * rows * h * 4);
frames.forEach((f, i) => {
  const ox = (i % cols) * w, oy = Math.floor(i / cols) * h;
  for (let y = 0; y < h; y++) sheet.set(f.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * cols * w + ox) * 4);
});
write(`${stem}.png`, encodePNG(cols * w, rows * h, sheet));
write(`${stem}.json`, JSON.stringify({
  frames: frames.map((_, i) => ({ filename: `${stem}_${String(i).padStart(2, '0')}`, frame: { x: (i % cols) * w, y: Math.floor(i / cols) * h, w, h }, duration: Math.round(1000 / fps) })),
  meta: { image: `${stem}.png`, size: { w: cols * w, h: rows * h }, fps, loop: res.loop, impactFrame: res.impact, pivot: recipe.pivot || [0.5, 0.5] },
}, null, 2));
write(`${stem}@${scale}x.gif`, encodeGIF(frames, w, h, fps, scale));
if (opt.frames) frames.forEach((f, i) => write(`frames/${stem}_${String(i).padStart(2, '0')}.png`, encodePNG(w, h, f)));
if (opt['save-recipe']) write(`${stem}.recipe.json`, JSON.stringify(recipe, null, 2));

if (opt.backdrop) {
  const bd = decodePNG(fs.readFileSync(opt.backdrop));
  const pv = recipe.pivot || [0.5, 0.5];
  const [ax, ay] = opt.at ? opt.at.split(',').map(Number) : [bd.w / 2, bd.h / 2];
  const ex = Math.round(ax - pv[0] * w), ey = Math.round(ay - pv[1] * h);
  const comp = frames.map((f) => {
    const c = new Uint8ClampedArray(bd.rgba);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = ex + x, Y = ey + y;
      if (X < 0 || Y < 0 || X >= bd.w || Y >= bd.h) continue;
      const s = (y * w + x) * 4;
      if (!f[s + 3]) continue;
      const d = (Y * bd.w + X) * 4;
      c[d] = f[s]; c[d + 1] = f[s + 1]; c[d + 2] = f[s + 2]; c[d + 3] = 255;
    }
    return c;
  });
  write(`${stem}-preview@${scale}x.gif`, encodeGIF(comp, bd.w, bd.h, fps, scale));
}

console.log(`${recipe.name || stem}: ${n} frames, ${w}x${h}, ${fps} fps, ${res.loop ? 'loop' : 'one-shot'}, impact frame ${res.impact} (${Date.now() - t0} ms)`);
console.log(`Wrote to ${out}:`);
const frameFiles = written.filter((f) => f.startsWith('frames/'));
for (const f of written) if (!f.startsWith('frames/')) console.log('  ' + f);
if (frameFiles.length) console.log(`  frames/ (${frameFiles.length} PNGs)`);
