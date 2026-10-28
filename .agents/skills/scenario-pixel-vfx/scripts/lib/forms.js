// Text to effect. A prompt is read for a form (explosion, slash, beam...),
// an element (fire, ice, lightning...) and modifiers (size, speed, colour,
// outline, palette). Forms build layered recipes; elements colour them and
// add their own accent layers. Unknown words still change the seed, so every
// prompt gives its own result.

// ---------- elements ----------
export const ELEMENTS = {
  fire: { label: 'Fire', ramps: { main: 'fire', alt: 'lava', smoke: 'smoke', spark: 'fire' }, accent: 'embers', form: 'flame',
    names: ['Inferno', 'Ember', 'Blaze', 'Cinder'], words: ['fire', 'flame', 'flames', 'fiery', 'burn', 'burning', 'blaze', 'inferno', 'ember', 'embers', 'pyro', 'hell', 'hellfire', 'heat', 'hot', 'scorch', 'ignite', 'fireball', 'firebolt', 'flamethrower'] },
  lava: { label: 'Lava', ramps: { main: 'lava', alt: 'fire', smoke: 'ash', spark: 'lava' }, accent: 'embers', form: 'pillar',
    names: ['Magma', 'Molten', 'Volcanic'], words: ['lava', 'magma', 'molten', 'volcano', 'volcanic', 'eruption', 'erupt'] },
  ice: { label: 'Ice', ramps: { main: 'ice', alt: 'frost', smoke: 'frost', spark: 'frost' }, accent: 'shards', form: 'spikes',
    names: ['Frost', 'Glacial', 'Rime', 'Frozen'], words: ['ice', 'icy', 'frost', 'frosty', 'freeze', 'freezing', 'frozen', 'cold', 'snow', 'glacier', 'glacial', 'cryo', 'blizzard', 'chill', 'winter', 'iceball', 'snowball', 'icicle', 'icicles'] },
  lightning: { label: 'Lightning', ramps: { main: 'lightning', alt: 'thunder', smoke: 'smoke', spark: 'lightning' }, accent: 'arcs', form: 'strike',
    names: ['Storm', 'Volt', 'Thunder', 'Static'], words: ['lightning', 'thunder', 'electric', 'electricity', 'shock', 'zap', 'volt', 'voltage', 'spark', 'sparks', 'storm', 'static', 'tesla', 'thunderbolt', 'plasma ball'] },
  poison: { label: 'Poison', ramps: { main: 'poison', alt: 'poison', smoke: 'poison', spark: 'poison' }, accent: 'bubbles', form: 'cloud',
    names: ['Venom', 'Toxic', 'Blight', 'Miasma'], words: ['poison', 'poisonous', 'toxic', 'venom', 'acid', 'gas', 'miasma', 'plague', 'blight', 'sludge', 'goo', 'slime', 'corrosive'] },
  holy: { label: 'Holy', ramps: { main: 'holy', alt: 'gold', smoke: 'white', spark: 'holy' }, accent: 'motes', form: 'pillar',
    names: ['Radiant', 'Divine', 'Sacred', 'Dawn'], words: ['holy', 'light', 'divine', 'radiant', 'angel', 'angelic', 'heaven', 'heavenly', 'sacred', 'blessing', 'bless', 'smite', 'sun', 'solar', 'celestial', 'paladin'] },
  dark: { label: 'Shadow', ramps: { main: 'dark', alt: 'void', smoke: 'shadow', spark: 'dark' }, accent: 'wisps', form: 'vortex',
    names: ['Shadow', 'Umbral', 'Abyssal', 'Night'], words: ['dark', 'darkness', 'shadow', 'shadows', 'void', 'abyss', 'abyssal', 'evil', 'demon', 'demonic', 'curse', 'cursed', 'necro', 'necrotic', 'death', 'doom', 'black'] },
  arcane: { label: 'Arcane', ramps: { main: 'arcane', alt: 'plasma', smoke: 'dark', spark: 'arcane' }, accent: 'glints', form: 'circle',
    names: ['Arcane', 'Mystic', 'Astral', 'Eldritch'], words: ['arcane', 'magic', 'magical', 'mystic', 'mana', 'spell', 'astral', 'cosmic', 'star', 'stars', 'galaxy', 'eldritch', 'wizard', 'sorcery', 'enchant'] },
  nature: { label: 'Nature', ramps: { main: 'nature', alt: 'nature', smoke: 'nature', spark: 'nature' }, accent: 'leaves', form: 'heal',
    names: ['Verdant', 'Wild', 'Bloom', 'Thorn'], words: ['nature', 'leaf', 'leaves', 'plant', 'vine', 'vines', 'thorn', 'thorns', 'forest', 'wood', 'druid', 'bloom', 'flower', 'petal', 'petals', 'life', 'grass'] },
  water: { label: 'Water', ramps: { main: 'water', alt: 'ice', smoke: 'frost', spark: 'water' }, accent: 'droplets', form: 'splash',
    names: ['Tidal', 'Aqua', 'Torrent', 'Abyssal'], words: ['water', 'aqua', 'wave', 'waves', 'tidal', 'tide', 'ocean', 'sea', 'rain', 'bubble', 'bubbles', 'torrent', 'hydro', 'liquid', 'droplet'] },
  blood: { label: 'Blood', ramps: { main: 'blood', alt: 'blood', smoke: 'blood', spark: 'blood' }, accent: 'splatter', form: 'splash',
    names: ['Crimson', 'Sanguine', 'Feral'], words: ['blood', 'bloody', 'gore', 'bleed', 'vampire', 'vampiric', 'crimson'] },
  earth: { label: 'Earth', ramps: { main: 'earth', alt: 'dust', smoke: 'dust', spark: 'earth' }, accent: 'debris', form: 'slam',
    names: ['Stone', 'Terra', 'Granite', 'Quake'], words: ['earth', 'rock', 'rocks', 'stone', 'boulder', 'ground', 'dirt', 'mud', 'sand', 'terra', 'crystal', 'crystals', 'geo', 'gravel'] },
  wind: { label: 'Wind', ramps: { main: 'wind', alt: 'white', smoke: 'white', spark: 'wind' }, accent: 'gusts', form: 'tornado',
    names: ['Gale', 'Zephyr', 'Cyclone', 'Sky'], words: ['wind', 'air', 'gust', 'gale', 'breeze', 'aero', 'zephyr', 'cyclone', 'sky', 'feather'] },
  plasma: { label: 'Plasma', ramps: { main: 'plasma', alt: 'arcane', smoke: 'dark', spark: 'plasma' }, accent: 'sparks', form: 'orb',
    names: ['Plasma', 'Neon', 'Ion', 'Laser'], words: ['plasma', 'neon', 'laser', 'ion', 'sci-fi', 'scifi', 'cyber', 'synth', 'tech', 'photon'] },
  gold: { label: 'Gold', ramps: { main: 'gold', alt: 'holy', smoke: 'white', spark: 'gold' }, accent: 'motes', form: 'coins',
    names: ['Golden', 'Gilded', 'Lucky'], words: ['gold', 'golden', 'coin', 'coins', 'money', 'treasure', 'loot', 'rich', 'jackpot', 'reward'] },
  steel: { label: 'Steel', ramps: { main: 'steel', alt: 'white', smoke: 'dust', spark: 'white' }, accent: 'sparks', form: 'slash',
    names: ['Steel', 'Iron', 'Razor', 'Keen'], words: ['steel', 'iron', 'metal', 'metallic', 'silver', 'razor', 'blade storm'] },
  energy: { label: 'Energy', ramps: { main: 'energy', alt: 'lightning', smoke: 'smoke', spark: 'energy' }, accent: 'sparks', form: 'shield',
    names: ['Pulse', 'Flux', 'Aether', 'Kinetic'], words: ['energy', 'force', 'kinetic', 'psychic', 'psionic', 'aether', 'ether', 'spirit', 'chakra', 'mana burst'] },
  smoke: { label: 'Smoke', ramps: { main: 'smoke', alt: 'dust', smoke: 'smoke', spark: 'white' }, accent: null, form: 'poof',
    names: ['Ashen', 'Misty', 'Smoky'], words: ['smoke', 'smoky', 'dust', 'dusty', 'fog', 'mist', 'steam', 'ash', 'cloud', 'vapor'] },
};

// ---------- colour words (OKLCH hues) ----------
const COLORS = {
  red: 26, crimson: 20, scarlet: 30, orange: 55, amber: 70, yellow: 100, lime: 125, green: 145, emerald: 155,
  teal: 185, aqua: 200, cyan: 205, turquoise: 190, blue: 255, azure: 240, sapphire: 262, indigo: 275,
  purple: 305, violet: 295, lavender: 300, magenta: 330, pink: 350, rose: 10, fuchsia: 335,
};
const RAMP_WORDS = { white: 'white', black: 'void', obsidian: 'void', rainbow: 'rainbow', prism: 'rainbow', prismatic: 'rainbow', golden: 'gold' };

// ---------- accents ----------
const ACCENTS = {
  embers: (m, at) => [{ type: 'particles', mode: 'rise', ramp: '$spark', count: 10 * m.density, x: at.x, y: at.y, area: at.r * 0.8,
    speed: [0.6, 1.3], life: [0.4, 0.9], emit: m.loop ? 0 : 0.6, heat: [1, 0.35], wiggle: 0.07, t0: at.t0 ?? 0.1 }],
  shards: (m, at) => [
    { type: 'particles', mode: 'burst', ramp: '$main', count: 8 * m.density, x: at.x, y: at.y, speed: [1.4, 2.4], drag: 2.6, life: [0.35, 0.7],
      shape: 'shard', size: [3, 2], heat: [1, 0.55], t0: at.t0 ?? 0 },
    { type: 'particles', mode: 'ambient', ramp: '$spark', count: 5 * m.density, x: at.x, y: at.y, spanX: at.r * 1.4 / at.W, spanY: at.r * 1.2 / at.H,
      shape: 'star', size: [2, 1], life: [0.3, 0.6], emit: 0.7, heat: [1, 0.7], t0: at.t0 ?? 0.15 }],
  arcs: (m, at) => [{ type: 'bolt', mode: 'radial', ramp: '$main', count: Math.round(3 * m.density), len: at.r * 1.1, x: at.x, y: at.y,
    hold: 1, flicker: 0.3, jag: 0.45, depth: 4, branch: 0.2, glow: 1, glowFalloff: 0.45, fadeStart: 0.4, t0: at.t0 ?? 0, t1: m.loop ? 1 : 0.8 }],
  bubbles: (m, at) => [{ type: 'particles', mode: 'rise', ramp: '$main', count: 8 * m.density, x: at.x, y: at.y, area: at.r * 0.7,
    shape: 'bubble', size: [1, 2], speed: [0.4, 0.8], life: [0.5, 0.9], emit: m.loop ? 0 : 0.6, heat: [0.9, 0.6], wiggle: 0.08, t0: at.t0 ?? 0.1 }],
  motes: (m, at) => [{ type: 'particles', mode: 'rise', ramp: '$spark', count: 8 * m.density, x: at.x, y: at.y, area: at.r * 0.8,
    shape: 'star', size: [2, 1], speed: [0.4, 0.9], life: [0.45, 0.9], emit: m.loop ? 0 : 0.6, heat: [1.05, 0.6], twinkle: 2, t0: at.t0 ?? 0.1 }],
  wisps: (m, at) => [
    { type: 'puffs', ramp: '$smoke', count: 5, x: at.x, y: at.y, spread: at.r * 0.6, rise: 0.5, r0: 0.06, r1: 0.16, life: [0.5, 0.9],
      emit: 0.5, gain: 0.75, decay: 0.4, t0: at.t0 ?? 0.15, blend: 'under' },
    { type: 'particles', mode: 'rise', ramp: '$main', count: 6 * m.density, x: at.x, y: at.y, area: at.r * 0.7, speed: [0.5, 1], life: [0.4, 0.8],
      emit: m.loop ? 0 : 0.6, heat: [0.95, 0.4], wiggle: 0.05, t0: at.t0 ?? 0.1 }],
  glints: (m, at) => [{ type: 'particles', mode: 'burst', ramp: '$spark', count: 8 * m.density, x: at.x, y: at.y, speed: [0.6, 1.4], drag: 2,
    life: [0.4, 0.8], shape: 'star', size: [2, 1], heat: [1.05, 0.6], twinkle: 2, emit: m.loop ? 0 : 0.4, t0: at.t0 ?? 0.05 }],
  leaves: (m, at) => [{ type: 'particles', mode: 'burst', ramp: '$main', count: 9 * m.density, x: at.x, y: at.y, speed: [1, 1.8], drag: 2.2,
    gravity: 1.2, life: [0.5, 0.95], shape: 'leaf', size: 2, heat: [0.95, 0.55], emit: m.loop ? 0 : 0.2, t0: at.t0 ?? 0.05 }],
  droplets: (m, at) => [{ type: 'particles', mode: 'burst', dir: -90, spread: 150, ramp: '$main', count: 10 * m.density, x: at.x, y: at.y,
    speed: [1.4, 2.4], drag: 0.6, gravity: 5, life: [0.4, 0.75], shape: 'drop', size: 2, heat: [1, 0.6], t0: at.t0 ?? 0 }],
  splatter: (m, at) => [{ type: 'particles', mode: 'burst', ramp: '$main', count: 12 * m.density, x: at.x, y: at.y, speed: [1.4, 2.8],
    drag: 1, gravity: 4, life: [0.35, 0.7], shape: 'dot', size: [2, 1], heat: [0.95, 0.55], t0: at.t0 ?? 0 }],
  debris: (m, at) => [{ type: 'particles', mode: 'burst', dir: -90, spread: 160, ramp: '$main', count: 8 * m.density, x: at.x, y: at.y,
    speed: [1.4, 2.5], drag: 0.8, gravity: 5, life: [0.5, 0.85], shape: 'chunk', size: [3, 2], heat: [0.85, 0.55], t0: at.t0 ?? 0 }],
  gusts: (m, at) => [{ type: 'streaks', mode: 'flow', ramp: '$main', count: Math.round(5 * m.density), x: at.x, y: at.y, r: at.r, squash: 0.55,
    turns: 1, gain: 0.85, t0: at.t0 ?? 0 }],
  sparks: (m, at) => [{ type: 'particles', mode: 'burst', ramp: '$spark', count: 10 * m.density, x: at.x, y: at.y, speed: [1.6, 2.8], drag: 2.4,
    life: [0.3, 0.6], shape: 'streak', size: 2, heat: [1, 0.5], emit: m.loop ? 0 : 0.3, t0: at.t0 ?? 0 }],
};

function accent(E, m, at) {
  if (!E.accent || m.noAccent) return [];
  return ACCENTS[E.accent](m, at).map((l) => ({ ...l, count: l.count ? Math.max(1, Math.round(l.count)) : l.count, role: 'accent' }));
}

// ---------- forms ----------
// Each form returns a partial recipe. Units: 1 = half the shorter canvas side.
// pivot is the canvas point (0..1) that sits on the stage anchor.
const FORMS = {};
const f = (id, def) => { FORMS[id] = def; return def; };

f('explosion', { label: 'Explosion', place: 'target', words: ['explosion', 'explode', 'explodes', 'exploding', 'blast', 'boom', 'kaboom', 'detonate', 'detonation', 'bomb', 'grenade', 'burst', 'combust', 'combustion', 'nuke', 'kamikaze'],
  build: (E, m) => ({ w: 64, h: 64, frames: 18, fps: 15, layers: [
    { type: 'puffs', ramp: '$smoke', t0: 0.22, count: 7, spread: 0.36, rise: 0.4, r0: 0.16, r1: 0.4, life: [0.5, 0.78], emit: 0.18, gain: 0.62, y: 0.05 },
    { type: 'burst', ramp: '$main', r0: 0.1, r1: 0.74 * m.power, grow: 0.42, rough: 0.55, erode: 1, cool: 0.62, wobble: 0.32, t1: 0.86 },
    { type: 'ring', ramp: '$main', t1: 0.55, r0: 0.25, r1: 0.96, th: 0.12, thEnd: 0.02, breakup: 0.85, gain: 0.9 },
    { type: 'particles', ramp: '$spark', mode: 'burst', count: Math.round(14 * m.density), speed: [1.6, 2.8], drag: 2.2, life: [0.35, 0.7], shape: 'streak', size: 2, heat: [1, 0.5] },
    { type: 'flash', ramp: '$main', r: 0.46, dur: 0.1 },
    ...accent(E, m, { x: 0, y: 0, r: 0.6, t0: 0.12, W: 2, H: 2 }),
  ] }) });

f('impact', { label: 'Impact', place: 'target', words: ['impact', 'hit', 'hits', 'punch', 'kick', 'smash', 'strike hit', 'hitspark', 'hit spark', 'bonk', 'pow', 'crash', 'clash', 'parry', 'block'],
  build: (E, m) => ({ w: 48, h: 48, frames: 10, fps: 18, layers: [
    { type: 'ring', ramp: '$main', r0: 0.2, r1: 0.92, th: 0.12, thEnd: 0.03, breakup: 0.5, t1: 0.65 },
    { type: 'star', ramp: '$main', points: 7, r: 0.9 * m.power, inner: 0.3, sharp: 1.15, pop: 0.25, hollow: 0.92, jitter: 0.55 },
    { type: 'particles', ramp: '$spark', mode: 'burst', count: Math.round(8 * m.density), speed: [2, 3.2], drag: 3, life: [0.3, 0.6], shape: 'streak', size: 2, heat: [1, 0.55] },
    { type: 'flash', ramp: '$main', r: 0.36, dur: 0.15 },
  ] }) });

f('slash', { label: 'Slash', place: 'target', words: ['slash', 'slashes', 'swipe', 'cut', 'sword', 'blade', 'swing', 'cleave', 'katana', 'sever', 'slice', 'saber', 'sabre', 'axe', 'scythe'],
  build: (E, m) => {
    const n = Math.min(4, m.count), spin = m.spin;
    const layers = [];
    const base = [
      { a0: -150, a1: 50, angle: -12 }, { a0: -30, a1: -230, angle: 18 }, { a0: -200, a1: 0, angle: 75 }, { a0: 20, a1: -180, angle: -60 },
    ];
    for (let i = 0; i < n; i++) {
      const b = base[i];
      layers.push({ type: 'slash', ramp: '$main', r: 0.56 * m.power, th: 0.1, a0: spin ? -180 : b.a0 + (b.a1 > b.a0 ? 25 : -25), a1: spin ? 180 : b.a1, sweep: spin ? 0.4 : 0.32,
        trail: spin ? 0.6 : 0.8, squash: 0.85, angle: b.angle, gain: 0.8, t0: i * 0.16 + 0.03, t1: Math.min(1, 0.6 + i * 0.16), seed: 3 });
      layers.push({ type: 'slash', ramp: '$main', r: 0.76 * m.power, th: 0.24, a0: spin ? -180 : b.a0, a1: spin ? 180 : b.a1, sweep: spin ? 0.4 : 0.3,
        trail: spin ? 0.7 : 0.95, squash: 0.85, angle: b.angle, t0: i * 0.16, t1: Math.min(1, 0.7 + i * 0.16) });
      const end = (b.a1 * Math.PI) / 180, ex = Math.cos(end) * 0.7, ey = Math.sin(end) * 0.6;
      layers.push({ type: 'particles', ramp: '$spark', mode: 'burst', count: Math.round(5 * m.density), x: ex, y: ey, dir: b.a1 + (b.a1 > b.a0 ? 90 : -90),
        spread: 70, speed: [1.2, 2.2], drag: 3, life: [0.3, 0.55], shape: 'streak', size: 2, heat: [1, 0.5], t0: i * 0.16 + 0.12, t1: Math.min(1, 0.75 + i * 0.16) });
    }
    if (E.accent) layers.push(...accent(E, { ...m, density: m.density * 0.6 }, { x: 0, y: 0, r: 0.6, t0: 0.15, W: 2, H: 2 }));
    return { w: 64, h: 64, frames: 12 + (n - 1) * 3, fps: 18, layers };
  } });

f('claw', { label: 'Claw', place: 'target', words: ['claw', 'claws', 'scratch', 'rake', 'maul', 'talon', 'talons', 'wolverine', 'feral'],
  build: (E, m) => ({ w: 64, h: 64, frames: 12, fps: 18, outline: 'outside', layers: [
    { type: 'streaks', mode: 'claw', ramp: '$main', count: 3 + (m.count > 1 ? 1 : 0), angle: 58, len: 1.45 * m.power, gap: 0.24, curve: 0.2, th: 2.4 },
    { type: 'particles', ramp: '$spark', mode: 'burst', count: Math.round(6 * m.density), dir: 58, spread: 80, speed: [1.2, 2], drag: 3, life: [0.3, 0.5], shape: 'streak', size: 2, t0: 0.1 },
    ...accent(E, { ...m, density: m.density * 0.6 }, { x: 0, y: 0, r: 0.5, t0: 0.1, W: 2, H: 2 }),
  ] }) });

f('nova', { label: 'Nova', place: 'target', words: ['nova', 'shockwave', 'shock wave', 'pulse', 'ring', 'wave', 'blastwave', 'emp', 'aoe', 'outburst', 'radial'],
  build: (E, m) => {
    const g = m.ground;
    const sq = g ? 0.38 : 1, y = g ? 0.5 : 0;
    return { w: g ? 96 : 64, h: 64, frames: 16, fps: 15, pivot: g ? [0.5, (32 + y * 32) / 64] : null, layers: [
      { type: 'rays', ramp: '$main', count: 12, r: 0.9, width: 0.22, t1: 0.6, gain: 0.7, squash: sq, y },
      { type: 'ring', ramp: '$main', r0: 0.1, r1: (g ? 1.4 : 0.96) * m.power, th: 0.22, breakup: 0.6, squash: sq, y },
      { type: 'ring', ramp: '$main', t0: 0.18, r0: 0.05, r1: (g ? 1 : 0.7) * m.power, th: 0.12, gain: 0.8, squash: sq, y },
      { type: 'particles', ramp: '$spark', mode: 'burst', count: Math.round(16 * m.density), speed: [2, 3.2], drag: 2.4, life: [0.35, 0.7], shape: 'streak', size: 2, heat: [1, 0.5], squash: sq, y },
      { type: 'flash', ramp: '$main', r: 0.4, dur: 0.1, squash: sq, y },
      ...accent(E, m, { x: 0, y, r: 0.6, t0: 0.1, W: 2, H: 2 }),
    ] };
  } });

f('beam', { label: 'Beam', place: 'from-caster', words: ['beam', 'laser', 'ray', 'kamehameha', 'hadouken', 'cannon', 'blaster', 'stream', 'lance', 'railgun', 'deathray', 'death ray', 'breath beam'],
  build: (E, m) => {
    // long enough to cross the stage from the staff to the target
    const w = 176, S = 24, x0 = -(w / 2) / S + 0.55;
    return { w, h: 48, frames: 16, fps: 15, loop: m.oneShot ? false : true, pivot: [(w / 2 + x0 * S) / w, 0.5], layers: [
      { type: 'beam', ramp: '$main', x: x0, len: 6.6, th: 0.36 * m.power, cap: 0.5 * m.power, wob: 0.55, speed: 3, gain: 1.05 },
      { type: 'particles', ramp: '$spark', mode: 'burst', x: x0 + 0.25, y: 0, area: 0.15, dir: 0, spread: 16, speed: [5, 8], drag: 0, life: [0.3, 0.6],
        count: Math.round(18 * m.density), shape: 'streak', size: 2, heat: [1, 0.6], emit: m.oneShot ? 0.7 : 0 },
      { type: 'orb', ramp: '$main', x: x0, r: 0.42 * m.power, pulse: 0.12, spin: 1 },
      ...accent(E, { ...m, density: m.density * 0.7 }, { x: 0.4, y: 0, r: 1.2, t0: 0, W: w / S, H: 2 }),
    ] };
  } });

f('projectile', { label: 'Projectile', place: 'projectile', words: ['projectile', 'fireball', 'missile', 'bullet', 'shot', 'bolt', 'arrow', 'dart', 'comet', 'rocket', 'throw', 'thrown', 'spear', 'javelin', 'meteorite', 'snowball', 'iceball', 'shuriken'],
  build: (E, m) => ({ w: 64, h: 32, frames: 8, fps: 12, loop: true, pivot: [0.78, 0.5], layers: [
    { type: 'particles', ramp: '$spark', mode: 'burst', x: 1.0, y: 0, area: 0.15, dir: 180, spread: 50, speed: [1.6, 3], drag: 1, life: [0.35, 0.7],
      count: Math.round(10 * m.density), shape: 'dot', size: [2, 1], heat: [1, 0.4] },
    { type: 'comet', ramp: '$main', x: 1.0, r: 0.5 * m.power, len: 2.6, speed: 2, rough: 0.6 },
    ...accent(E, { ...m, density: m.density * 0.6, loop: true }, { x: 0.2, y: 0, r: 0.5, t0: 0, W: 4, H: 2 }),
  ] }) });

f('orb', { label: 'Orb', place: 'caster-hand', words: ['orb', 'sphere', 'ball', 'core', 'globe', 'energy ball', 'spirit bomb', 'wisp', 'soul', 'crystal ball'],
  build: (E, m) => ({ w: 48, h: 48, frames: 12, fps: 12, loop: true, layers: [
    { type: 'rays', ramp: '$main', count: 8, r: 0.95, width: 0.16, gain: 0.55, twinkle: 1 },
    { type: 'orb', ramp: '$main', r: 0.46 * m.power, pulse: 0.1, spin: 1, rim: 0.3 },
    { type: 'particles', ramp: '$spark', mode: 'orbit', count: Math.round(6 * m.density), orbitR: 0.78, squash: 0.45, turns: 1, life: 1, shape: 'star', size: 1, heat: [1, 1] },
    ...accent(E, { ...m, density: m.density * 0.5, loop: true }, { x: 0, y: 0, r: 0.6, W: 2, H: 2 }),
  ] }) });

f('aura', { label: 'Aura', place: 'caster-ground', depth: 'behind', words: ['aura', 'power up', 'powerup', 'powering up', 'buff', 'rage', 'berserk', 'super saiyan', 'saiyan', 'awaken', 'awakening', 'enrage', 'empower', 'transform', 'transformation', 'charged up', 'overdrive', 'haste'],
  build: (E, m) => ({ w: 96, h: 112, frames: 16, fps: 12, loop: true, pivot: [0.5, (56 + 1.0 * 48) / 112], layers: [
    { type: 'flame', ramp: '$main', y: 1.0, w: 0.62 * m.power, hgt: 2.05 * m.power, taper: 0.4, hollow: 0.8, flick: 0.4, freq: 2.8, speed: 2, gain: 1.15 },
    { type: 'particles', ramp: '$spark', mode: 'rise', count: Math.round(14 * m.density), x: 0, y: 0.9, area: 0.55, areaY: 0.25, speed: [1, 1.9], life: [0.4, 0.8], size: [2, 1], heat: [1.05, 0.4], wiggle: 0.05 },
    ...accent(E, { ...m, density: m.density * 0.6, loop: true }, { x: 0, y: 0.3, r: 0.6, W: 2, H: 2.3 }),
  ] }) });

f('tornado', { label: 'Tornado', place: 'target-ground', words: ['tornado', 'cyclone', 'whirlwind', 'twister', 'vortex wind', 'hurricane', 'typhoon', 'dust devil', 'firestorm', 'fire tornado'],
  build: (E, m) => ({ w: 64, h: 96, frames: 16, fps: 12, loop: true, pivot: [0.5, (48 + 1.35 * 32) / 96], layers: [
    { type: 'puffs', ramp: '$smoke', count: 6, x: 0, y: 1.32, spread: 0.55, flat: 0.15, rise: 0.15, r0: 0.12, r1: 0.26, life: [0.6, 1], gain: 0.55 },
    { type: 'tornado', ramp: '$main', y: 1.35, hgt: 2.7, w0: 0.1, w1: 0.78 * m.power, twist: 3, spin: 2, sway: 0.14 },
    { type: 'particles', ramp: '$alt', mode: 'orbit', count: Math.round(8 * m.density), y: 0.4, orbitR: 0.62, squash: 0.25, turns: 2, life: 1, shape: 'chunk', size: 2, heat: [0.8, 0.8] },
    ...accent(E, { ...m, density: m.density * 0.6, loop: true }, { x: 0, y: 0.5, r: 0.6, W: 2, H: 3 }),
  ] }) });

f('vortex', { label: 'Vortex', place: 'target', words: ['vortex', 'black hole', 'blackhole', 'singularity', 'whirlpool', 'maelstrom', 'gravity well', 'implosion', 'spiral', 'swirl'],
  build: (E, m) => ({ w: 64, h: 64, frames: 16, fps: 12, loop: !m.oneShot, layers: [
    { type: 'vortex', ramp: '$main', r: 0.86 * m.power, rIn: 0.2, arms: 3, twist: 2.4, spin: 1, core: 'dark' },
    { type: 'particles', ramp: '$spark', mode: 'implode', count: Math.round(14 * m.density), implodeR: 1.0, life: [0.5, 1], shape: 'dot', size: 1, heat: [0.6, 1.05], swirl: 1.4 },
    ...accent(E, { ...m, density: m.density * 0.5, loop: true }, { x: 0, y: 0, r: 0.7, W: 2, H: 2 }),
  ] }) });

f('portal', { label: 'Portal', place: 'between', words: ['portal', 'rift', 'gate', 'gateway', 'wormhole', 'warp gate', 'dimension', 'tear', 'doorway', 'stargate'],
  build: (E, m) => {
    const g = m.ground;
    return { w: 64, h: 64, frames: 16, fps: 12, loop: true, pivot: g ? [0.5, (32 + 0.55 * 32) / 64] : [0.5, 0.75], layers: [
      { type: 'vortex', ramp: '$main', r: g ? 0.95 : 0.6, squash: g ? 0.4 : 1.55, y: g ? 0.55 : 0, rIn: 0.28, arms: 2, twist: 1.8, spin: 1, core: 'dark' },
      { type: 'particles', ramp: '$spark', mode: 'implode', count: Math.round(12 * m.density), implodeR: g ? 1.1 : 0.85, squash: g ? 0.4 : 1.5, y: g ? 0.55 : 0, life: [0.5, 1], shape: 'dot', heat: [0.6, 1.05], swirl: 1.2 },
      { type: 'particles', ramp: '$spark', mode: 'rise', count: Math.round(6 * m.density), y: g ? 0.55 : 0.6, area: 0.6, areaY: g ? 0.3 : 0.2, speed: [0.5, 1], life: [0.4, 0.8], shape: 'star', size: [2, 1], heat: [1, 0.5] },
    ] };
  } });

f('pillar', { label: 'Pillar', place: 'target-ground', words: ['pillar', 'column', 'geyser', 'tower', 'eruption', 'pillar of light', 'skybeam', 'judgement', 'judgment', 'smite', 'flame pillar', 'beacon'],
  build: (E, m) => ({ w: 48, h: 96, frames: 20, fps: 15, pivot: [0.5, (48 + 1.72 * 24) / 96], layers: [
    { type: 'ring', ramp: '$main', y: 1.72, squash: 0.3, r0: 0.3, r1: 1.0 * m.power, th: 0.22, breakup: 0.5, t1: 0.7 },
    { type: 'pillar', ramp: '$main', y: 1.72, hgt: 3.7, w: 0.42 * m.power, speed: 2, grow: 0.16, rough: 0.45 },
    { type: 'particles', ramp: '$spark', mode: 'rise', count: Math.round(16 * m.density), y: 1.6, area: 0.42, areaY: 0.2, speed: [1.6, 3], life: [0.35, 0.7], emit: 0.55, heat: [1, 0.4] },
    { type: 'flash', ramp: '$main', y: 1.6, r: 0.55, dur: 0.12, squash: 0.6 },
    ...accent(E, m, { x: 0, y: 0.6, r: 0.6, t0: 0.1, W: 2, H: 4 }),
  ] }) });

f('strike', { label: 'Strike', place: 'target-ground', words: ['strike', 'lightning strike', 'thunderbolt', 'thunder strike', 'smite', 'zap', 'bolt from the sky', 'call lightning', 'chain lightning', 'thor'],
  build: (E, m) => ({ w: 64, h: 96, frames: 16, fps: 18, pivot: [0.5, (48 + 1.25 * 32) / 96], layers: [
    { type: 'puffs', ramp: '$smoke', t0: 0.2, count: 5, x: 0, y: 1.2, spread: 0.45, flat: 0.25, rise: 0.25, r0: 0.12, r1: 0.28, life: [0.55, 0.8], emit: 0.15, gain: 0.55 },
    { type: 'ring', ramp: '$main', t0: 0.04, t1: 0.65, y: 1.25, squash: 0.32, r0: 0.2, r1: 0.95 * m.power, th: 0.2, breakup: 0.6 },
    { type: 'burst', ramp: '$main', t0: 0.04, t1: 0.7, y: 1.12, squash: 0.75, r0: 0.08, r1: 0.42 * m.power, grow: 0.4, erode: 1, cool: 0.5 },
    { type: 'bolt', ramp: '$main', mode: 'strike', x: 0, y: 1.2, count: m.count > 1 ? m.count : 2, hold: 1, jag: 0.32, depth: 6, branch: 0.45, thick: 2, glow: 1, glowFalloff: 0.5, fadeStart: 0.3, t1: 0.75 },
    { type: 'particles', ramp: '$spark', mode: 'burst', t0: 0.04, x: 0, y: 1.2, dir: -90, spread: 130, speed: [1.6, 2.8], drag: 1, gravity: 4, life: [0.3, 0.6], count: Math.round(12 * m.density), shape: 'streak', size: 2, heat: [1, 0.5] },
    { type: 'flash', ramp: '$main', y: 1.1, r: 0.6, dur: 0.14 },
  ] }) });

f('heal', { label: 'Heal', place: 'caster-ground', words: ['heal', 'healing', 'cure', 'regen', 'regenerate', 'regeneration', 'restore', 'revive', 'recovery', 'potion', 'medic', 'hp', 'health', 'rejuvenate'],
  build: (E, m) => ({ w: 48, h: 64, frames: 20, fps: 15, pivot: [0.5, (32 + 1.2 * 24) / 64], layers: [
    { type: 'ring', ramp: '$main', y: 1.2, squash: 0.35, r0: 0.3, r1: 0.95, th: 0.12, breakup: 0.3, gain: 0.85 },
    { type: 'pillar', ramp: '$main', y: 1.2, hgt: 2.3, w: 0.5, gain: 0.45, speed: 1, grow: 0.25, rough: 0.3, dither: 1 },
    { type: 'particles', ramp: '$main', mode: 'rise', count: Math.round(9 * m.density), y: 1.05, area: 0.65, areaY: 0.25, speed: [0.8, 1.5], life: [0.5, 0.85], emit: 0.5,
      shape: 'cross', size: 1, heat: [1.05, 0.65] },
    { type: 'particles', ramp: '$spark', mode: 'rise', count: Math.round(8 * m.density), y: 1.0, area: 0.7, areaY: 0.3, speed: [0.5, 1], life: [0.4, 0.8], emit: 0.6, shape: 'star', size: [2, 1], twinkle: 2 },
  ] }) });

f('levelup', { label: 'Level Up', place: 'caster-ground', words: ['level up', 'levelup', 'lvl up', 'rank up', 'upgrade', 'evolve', 'evolution', 'promotion', 'ding'],
  build: (E, m) => ({ w: 64, h: 80, frames: 24, fps: 15, pivot: [0.5, (40 + 1.15 * 32) / 80], layers: [
    { type: 'rays', ramp: '$main', y: 0.3, count: 12, r: 1.05, width: 0.2, gain: 0.6, t1: 0.8 },
    { type: 'pillar', ramp: '$main', y: 1.15, hgt: 2.4, w: 0.5, gain: 0.7, speed: 2, grow: 0.15 },
    { type: 'ring', ramp: '$main', y: 1.15, squash: 0.32, r0: 0.3, r1: 1.0, th: 0.16, breakup: 0.4, t1: 0.6 },
    { type: 'particles', ramp: '$spark', mode: 'rise', count: Math.round(7 * m.density), y: 1.0, area: 0.6, areaY: 0.2, speed: [1, 1.8], life: [0.45, 0.8], emit: 0.5, shape: 'chevron', size: 2, heat: [1.05, 0.6] },
    { type: 'particles', ramp: '$spark', mode: 'rise', count: Math.round(8 * m.density), y: 0.9, area: 0.8, areaY: 0.4, speed: [0.5, 1], life: [0.4, 0.8], emit: 0.7, shape: 'star', size: [2, 1], twinkle: 2 },
    { type: 'text', ramp: '$main', text: 'LEVEL UP', y: -0.8, rise: 0.25, t0: 0.12, gain: 1.05 },
  ] }) });

f('teleport', { label: 'Teleport', place: 'caster-ground', words: ['teleport', 'teleportation', 'blink', 'warp', 'spawn', 'respawn', 'summon', 'summoning', 'appear', 'vanish', 'beam me up', 'recall', 'disappear'],
  build: (E, m) => ({ w: 48, h: 80, frames: 20, fps: 15, pivot: [0.5, (40 + 1.3 * 24) / 80], layers: [
    { type: 'glyph', ramp: '$main', y: 1.3, r: 0.95, squash: 0.32, rings: [1, 0.78], star: 0, ticks: 16, runes: 0, draw: 0.3, t1: 0.9 },
    { type: 'particles', ramp: '$spark', mode: 'implode', count: Math.round(14 * m.density), y: 0.5, implodeR: 1.1, squash: 1.2, life: [0.6, 1], t1: 0.45, heat: [0.6, 1.05] },
    { type: 'pillar', ramp: '$main', y: 1.3, hgt: 3.2, w: 0.28, t0: 0.3, speed: 3, grow: 0.1 },
    { type: 'flash', ramp: '$main', y: 0.4, r: 0.7, squash: 1.6, t0: 0.32, dur: 0.12 },
    { type: 'particles', ramp: '$spark', mode: 'burst', count: Math.round(8 * m.density), y: 0.4, t0: 0.35, speed: [1, 2], drag: 2.5, life: [0.3, 0.6], shape: 'star', size: [2, 1], heat: [1, 0.6] },
  ] }) });

f('circle', { label: 'Magic Circle', place: 'caster-ground', words: ['magic circle', 'circle', 'rune', 'runes', 'sigil', 'glyph', 'pentagram', 'ritual', 'seal', 'summoning circle', 'mandala', 'array'],
  build: (E, m) => ({ w: 96, h: 48, frames: 24, fps: 12, loop: !m.oneShot, pivot: [0.5, 0.6], layers: [
    { type: 'glyph', ramp: '$main', y: 0.2, r: 1.62, squash: 0.42, rings: [1, 0.84, 0.55], star: 6, step: 2, ticks: 32, runes: 10, spin: 1, fill: 0.14, dither: 0.8, glow: 1, glowFalloff: 0.5 },
    { type: 'particles', ramp: '$spark', mode: 'rise', count: Math.round(10 * m.density), y: 0.2, area: 1.4, areaY: 0.3, speed: [0.5, 1.1], life: [0.5, 0.9], shape: 'dot', heat: [1, 0.4] },
    ...accent(E, { ...m, density: m.density * 0.5, loop: true }, { x: 0, y: -0.3, r: 0.6, W: 4, H: 2 }),
  ] }) });

f('charge', { label: 'Charge', place: 'caster-hand', words: ['charge', 'charging', 'charge up', 'gather', 'gathering', 'channel', 'channeling', 'focus', 'absorb', 'drain', 'siphon', 'build up', 'chi', 'ki'],
  build: (E, m) => ({ w: 48, h: 48, frames: 16, fps: 15, loop: true, layers: [
    { type: 'ring', ramp: '$main', r0: 0.95, r1: 0.35, th: 0.06, thEnd: 0.1, breakup: 0, fade: 0, ease: 'inQuad', gain: 0.7 },
    { type: 'orb', ramp: '$main', r: 0.3 * m.power, pulse: 0.15, pulseRate: 2, spin: 1 },
    { type: 'particles', ramp: '$spark', mode: 'implode', count: Math.round(18 * m.density), implodeR: 1.0, life: [0.5, 0.9], shape: 'streak', size: 1, heat: [0.6, 1.05], swirl: 0.8 },
  ] }) });

f('shield', { label: 'Shield', place: 'caster', words: ['shield', 'barrier', 'bubble shield', 'ward', 'force field', 'forcefield', 'protect', 'protection', 'dome', 'guard', 'aegis', 'invincible'],
  build: (E, m) => ({ w: 64, h: 64, frames: 16, fps: 12, loop: true, layers: [
    { type: 'bubble', ramp: '$main', r: 0.86, th: 0.06, hex: 0.42, fill: 0.15, shimmer: 1, dither: 0.9 },
    { type: 'particles', ramp: '$spark', mode: 'orbit', count: Math.round(5 * m.density), orbitR: 0.86, turns: 1, life: 1, shape: 'star', size: 1, heat: [1, 1], both: true },
  ] }) });

f('poof', { label: 'Poof', place: 'target', words: ['poof', 'puff', 'smoke bomb', 'smokebomb', 'dust cloud', 'cloud', 'vanish', 'disappear', 'despawn', 'steam'],
  build: (E, m) => ({ w: 48, h: 48, frames: 14, fps: 15, layers: [
    { type: 'puffs', ramp: '$smoke', count: Math.round(8 * m.density), spread: 0.3, rise: 0.22, r0: 0.2, r1: 0.44 * m.power, life: [0.6, 1], emit: 0.1, gain: 0.8, decay: 0.45, flat: 0.8 },
    { type: 'ring', ramp: '$smoke', r0: 0.2, r1: 0.9, th: 0.1, t1: 0.5, gain: 0.7 },
    { type: 'particles', ramp: '$spark', mode: 'burst', count: 4, speed: [0.8, 1.4], drag: 2, life: [0.35, 0.6], shape: 'star', size: 2, t0: 0.1 },
  ] }) });

f('flame', { label: 'Flame', place: 'target-ground', words: ['flame', 'campfire', 'bonfire', 'torch', 'candle', 'fire loop', 'burning ground', 'brazier', 'hearth', 'wildfire'],
  build: (E, m) => ({ w: 32, h: 48, frames: 12, fps: 12, loop: true, pivot: [0.5, (24 + 1.3 * 16) / 48], layers: [
    { type: 'puffs', ramp: '$smoke', count: 3, x: 0, y: -0.6, spread: 0.2, rise: 0.8, r0: 0.08, r1: 0.22, life: [0.5, 0.9], gain: 0.45, decay: 0.5 },
    { type: 'flame', ramp: '$main', y: 1.3, w: 0.78 * m.power, hgt: 2.45 * m.power, speed: 2, flick: 0.4, rough: 0.8 },
    { type: 'particles', ramp: '$spark', mode: 'rise', count: Math.round(6 * m.density), y: 0.2, area: 0.4, speed: [0.8, 1.5], life: [0.4, 0.8], heat: [1, 0.35], wiggle: 0.08 },
  ] }) });

f('weather', { label: 'Ambient', place: 'screen', words: ['rain', 'raining', 'snow', 'snowing', 'snowfall', 'blizzard', 'falling leaves', 'leaves falling', 'petals', 'cherry blossom', 'sakura', 'fireflies', 'firefly', 'embers rising', 'ash falling', 'ashfall', 'weather', 'ambient', 'atmosphere', 'particles', 'dust motes', 'starfield', 'bubbles rising', 'confetti'],
  build: (E, m, words) => {
    const has = (w) => words.some((x) => x.startsWith(w));
    let layer;
    if (has('rain')) layer = { type: 'particles', ramp: 'water', mode: 'fall', count: 46, shape: 'streak', size: 3, driftX: -0.25, life: [0.5, 0.7], fallScale: 1, heat: [0.9, 0.7] };
    else if (has('snow') || has('blizzard')) layer = { type: 'particles', ramp: 'frost', mode: 'fall', count: has('blizzard') ? 70 : 44, shape: 'dot', size: [2, 1], driftX: has('blizzard') ? -0.9 : -0.15, wiggle: 0.08, life: [0.85, 1], heat: [1, 0.85] };
    else if (has('lea')) layer = { type: 'particles', ramp: 'nature', mode: 'fall', count: 18, shape: 'leaf', size: 2, driftX: -0.5, wiggle: 0.12, life: [0.85, 1], heat: [0.95, 0.75] };
    else if (has('peta') || has('cherr') || has('sakura')) layer = { type: 'particles', ramp: 'hue:350', mode: 'fall', count: 34, shape: 'petal', size: 2, driftX: -0.5, wiggle: 0.1, life: [0.85, 1], heat: [1, 0.8] };
    else if (has('firef')) layer = { type: 'particles', ramp: 'hue:120', mode: 'ambient', count: 18, shape: 'star', size: [2, 1], wiggle: 0.14, life: [0.7, 1], twinkle: 2, heat: [1.1, 0.6], glow: 1, glowFalloff: 0.4 };
    else if (has('ember')) layer = { type: 'particles', ramp: 'fire', mode: 'rise', count: 34, y: 1.05, area: 1, areaX: 1.4, areaY: 0.02, speed: [1.6, 2.6], life: [0.6, 1], wiggle: 0.1, size: [2, 1], heat: [1.05, 0.3] };
    else if (has('ash')) layer = { type: 'particles', ramp: 'ash', mode: 'fall', count: 30, shape: 'dot', size: 1, driftX: 0.2, wiggle: 0.1, life: [0.9, 1], fallScale: 0.8, heat: [0.9, 0.7] };
    else if (has('bubb')) layer = { type: 'particles', ramp: 'water', mode: 'rise', count: 22, y: 1.05, area: 1, areaX: 1.4, areaY: 0.02, shape: 'bubble', size: [1, 2], speed: [1.6, 2.4], life: [0.8, 1], wiggle: 0.08 };
    else if (has('confet')) layer = { type: 'particles', ramp: 'rainbow', mode: 'fall', count: 40, shape: 'square', size: 2, driftX: 0.1, wiggle: 0.15, life: [0.8, 1], heat: [1.1, 0.2] };
    else layer = { type: 'particles', ramp: '$spark', mode: 'ambient', count: 26, shape: 'star', size: [2, 1], wiggle: 0.1, life: [0.6, 1], twinkle: 2, heat: [1.05, 0.5] };
    if (m.colored && layer.ramp !== '$spark') layer.ramp = '$main';
    layer.count = Math.round(layer.count * m.density);
    return { w: 128, h: 96, frames: 24, fps: 12, loop: true, layers: [layer] };
  } });

f('meteor', { label: 'Meteor', place: 'target-ground', words: ['meteor', 'meteor strike', 'meteor shower', 'asteroid', 'falling star', 'comet strike', 'orbital strike', 'airstrike', 'air strike', 'nuke strike'],
  build: (E, m) => ({ w: 96, h: 96, frames: 26, fps: 15, impact: 0.36, pivot: [0.5 + 0.2 / 2, (48 + 0.62 * 48) / 96], layers: [
    { type: 'comet', ramp: '$main', from: [-0.85, -0.95], x: 0.2, y: 0.55, until: 0.36, r: 0.17 * m.power, len: 0.95, speed: 3 },
    { type: 'puffs', ramp: '$smoke', t0: 0.42, count: 8, x: 0.2, y: 0.5, spread: 0.5, flat: 0.3, rise: 0.35, r0: 0.12, r1: 0.3, life: [0.5, 0.8], emit: 0.15, gain: 0.6 },
    { type: 'cracks', ramp: '$alt', t0: 0.36, x: 0.2, y: 0.62, count: 7, len: 0.8, squash: 0.3, grow: 0.15 },
    { type: 'burst', ramp: '$main', t0: 0.36, x: 0.2, y: 0.5, squash: 0.8, r0: 0.1, r1: 0.55 * m.power, grow: 0.35, erode: 1, cool: 0.6 },
    { type: 'ring', ramp: '$main', t0: 0.36, t1: 0.8, x: 0.2, y: 0.62, squash: 0.32, r0: 0.2, r1: 1.0, th: 0.16, breakup: 0.7 },
    { type: 'particles', ramp: '$alt', mode: 'burst', t0: 0.36, x: 0.2, y: 0.55, dir: -90, spread: 150, speed: [1.2, 2.2], drag: 0.6, gravity: 4, life: [0.35, 0.6], count: Math.round(10 * m.density), shape: 'chunk', size: [2, 1], heat: [0.9, 0.6] },
    { type: 'flash', ramp: '$main', t0: 0.36, x: 0.2, y: 0.5, r: 0.45, dur: 0.1 },
  ] }) });

f('splash', { label: 'Splash', place: 'target-ground', words: ['splash', 'splat', 'splatter', 'spray', 'droplets', 'drip', 'puddle', 'geyser splash', 'water drop', 'slime splat'],
  build: (E, m) => ({ w: 64, h: 64, frames: 16, fps: 15, pivot: [0.5, (32 + 0.78 * 32) / 64], layers: [
    { type: 'ring', ramp: '$main', y: 0.78, squash: 0.3, r0: 0.25, r1: 1.0 * m.power, th: 0.12, breakup: 0.5, t1: 0.8 },
    { type: 'burst', ramp: '$main', y: 0.55, squash: 1.25, r0: 0.06, r1: 0.36 * m.power, grow: 0.3, erode: 1, cool: 0.2, rough: 0.8, wobble: 0.45, t1: 0.55 },
    { type: 'particles', ramp: '$main', mode: 'burst', y: 0.62, dir: -90, spread: 120, speed: [1.2, 2.5], drag: 0.3, gravity: 4.5, life: [0.55, 0.95], count: Math.round(22 * m.density),
      shape: 'dot', size: [2, 1], heat: [1, 0.75], ground: 0.82 },
    { type: 'particles', ramp: '$spark', mode: 'burst', y: 0.6, dir: -90, spread: 60, speed: [2.2, 3], drag: 0.2, gravity: 5, life: [0.4, 0.7], count: Math.round(6 * m.density), shape: 'drop', size: 2, heat: [1.05, 0.8] },
  ] }) });

f('spikes', { label: 'Spikes', place: 'target-ground', words: ['spikes', 'spike', 'ice spikes', 'spikes erupting', 'earth spikes', 'shard', 'shards', 'icicle', 'icicles', 'stalagmite', 'crystals erupting', 'thorns erupting', 'spear wall', 'impale', 'eruption spikes', 'freeze', 'frozen'],
  build: (E, m) => ({ w: 96, h: 64, frames: 18, fps: 15, pivot: [0.5, (32 + 0.88 * 32) / 64], outline: 'outside', layers: [
    { type: 'puffs', ramp: '$smoke', count: 6, y: 0.85, spread: 0.85, flat: 0.12, rise: 0.15, r0: 0.1, r1: 0.22, life: [0.5, 0.8], emit: 0.15, gain: 0.55 },
    { type: 'spikes', ramp: '$main', y: 0.88, count: Math.max(3, 5 + (m.count - 1) * 2), spread: 1.05 * m.power, hgt: [0.9 * m.power, 1.5 * m.power], width: [0.15, 0.24], grow: 0.2, hold: 0.6 },
    { type: 'particles', ramp: '$main', mode: 'burst', y: 0.85, dir: -90, spread: 140, speed: [1, 2], drag: 0.8, gravity: 4, life: [0.35, 0.65], count: Math.round(10 * m.density), shape: 'chunk', size: [2, 1], heat: [0.9, 0.6], t0: 0.02 },
    ...accent(E, { ...m, density: m.density * 0.5 }, { x: 0, y: 0.2, r: 0.8, t0: 0.2, W: 3, H: 2 }),
  ] }) });

f('slam', { label: 'Ground Slam', place: 'target-ground', words: ['slam', 'ground slam', 'quake', 'earthquake', 'stomp', 'ground pound', 'tremor', 'shockwave ground', 'fissure', 'crater', 'impact crater', 'seismic'],
  build: (E, m) => ({ w: 96, h: 64, frames: 18, fps: 15, pivot: [0.5, (32 + 0.72 * 32) / 64], layers: [
    { type: 'puffs', ramp: '$smoke', count: Math.round(8 * m.density), y: 0.65, spread: 1.0, flat: 0.15, rise: 0.25, r0: 0.12, r1: 0.3, life: [0.55, 0.9], emit: 0.15, gain: 0.6 },
    { type: 'cracks', ramp: '$main', y: 0.72, count: 7, len: 1.25 * m.power, squash: 0.3, grow: 0.18 },
    { type: 'ring', ramp: '$main', y: 0.72, squash: 0.3, r0: 0.2, r1: 1.45 * m.power, th: 0.26, breakup: 0.6 },
    { type: 'ring', ramp: '$main', t0: 0.15, y: 0.72, squash: 0.3, r0: 0.1, r1: 1.0 * m.power, th: 0.14, gain: 0.8 },
    { type: 'particles', ramp: '$main', mode: 'burst', y: 0.68, dir: -90, spread: 150, speed: [1.4, 2.6], drag: 0.6, gravity: 5, life: [0.4, 0.75], count: Math.round(12 * m.density), shape: 'chunk', size: [3, 2], heat: [0.9, 0.6] },
    { type: 'flash', ramp: '$main', y: 0.6, r: 0.45, squash: 0.6, dur: 0.1 },
  ] }) });

f('dash', { label: 'Dash', place: 'caster', words: ['dash', 'speed', 'rush', 'zoom', 'sprint', 'charge forward', 'lunge', 'speed lines', 'afterimage', 'zip', 'swoosh', 'whoosh', 'blitz'],
  build: (E, m) => ({ w: 64, h: 48, frames: 10, fps: 18, layers: [
    { type: 'puffs', ramp: '$smoke', count: 4, x: -1.0, y: 0.75, spread: 0.3, flat: 0.2, rise: 0.15, r0: 0.08, r1: 0.2, life: [0.5, 0.8], emit: 0.25, gain: 0.6, dir: 180, speed: [0.3, 0.6] },
    { type: 'streaks', mode: 'speed', ramp: '$main', count: Math.round(10 * m.density), spanY: 1.3, len: 1.2, speed: 2, angle: 180 },
  ] }) });

f('coins', { label: 'Loot', place: 'target-ground', words: ['coins', 'coin', 'loot', 'treasure', 'reward', 'jackpot', 'money', 'gold drop', 'item drop', 'chest', 'gems', 'gem', 'collect', 'pickup'],
  build: (E, m) => ({ w: 48, h: 64, frames: 24, fps: 15, pivot: [0.5, (32 + 1.1 * 24) / 64], layers: [
    { type: 'rays', ramp: '$main', y: 0.9, count: 10, r: 0.9, width: 0.18, gain: 0.5, t1: 0.7 },
    { type: 'particles', ramp: '$main', mode: 'burst', y: 0.9, dir: -90, spread: 70, speed: [2.6, 3.6], drag: 0.3, gravity: 6.5, life: [0.6, 1], count: Math.round(12 * m.density), emit: 0.3,
      shape: 'coin', size: 3, heat: [1, 0.9], ground: 1.15 },
    { type: 'particles', ramp: '$spark', mode: 'burst', y: 0.6, speed: [0.6, 1.4], drag: 1.6, life: [0.35, 0.7], count: 8, emit: 0.6, shape: 'star', size: [2, 1], twinkle: 2 },
  ] }) });

f('cloud', { label: 'Cloud', place: 'target', words: ['gas cloud', 'poison cloud', 'toxic cloud', 'miasma cloud', 'fog cloud', 'storm cloud', 'thundercloud', 'smog', 'spores', 'stink'],
  build: (E, m) => ({ w: 64, h: 64, frames: 16, fps: 12, loop: true, layers: [
    { type: 'puffs', ramp: '$main', count: 9, spread: 0.55, flat: 0.7, rise: 0.25, r0: 0.18, r1: 0.4 * m.power, life: [0.7, 1], gain: 0.62, decay: 0.35, dither: 0.6 },
    ...accent(E, { ...m, loop: true }, { x: 0, y: 0.2, r: 0.6, W: 2, H: 2 }),
  ] }) });

f('sparkle', { label: 'Sparkle', place: 'target', words: ['sparkle', 'sparkles', 'twinkle', 'glitter', 'shine', 'shiny', 'glint', 'gleam', 'stars', 'magic dust', 'fairy dust', 'pixie dust'],
  build: (E, m) => ({ w: 32, h: 32, frames: 12, fps: 12, loop: true, layers: [
    { type: 'particles', ramp: '$spark', mode: 'ambient', count: Math.round(6 * m.density), spanX: 0.8, spanY: 0.8, shape: 'star', size: [3, 2], life: [0.5, 1], twinkle: 1, heat: [1.05, 0.6] },
  ] }) });

f('damage', { label: 'Damage Number', place: 'target', words: ['damage', 'damage number', 'critical hit', 'crit hit', 'crit', 'critical', 'miss', 'dmg', 'combo', 'ko', 'k.o.', 'number popup', 'popup', 'score'],
  build: (E, m, words, raw) => {
    const num = (raw.match(/\d{1,6}/) || [])[0];
    let text = num || (words.includes('miss') ? 'MISS' : words.includes('ko') ? 'K.O.' : 'CRIT!');
    if (num && /crit/.test(raw)) text = num + '!';
    return { w: Math.max(32, text.length * 8 + 12), h: 32, frames: 16, fps: 15, outline: 'outside', layers: [
      { type: 'text', ramp: '$main', text, scale: text.length > 5 ? 1 : 2, y: 0.3, rise: 0.55 },
      { type: 'particles', ramp: '$spark', mode: 'burst', y: 0.2, count: 6, speed: [1, 1.8], drag: 2.5, life: [0.3, 0.5], shape: 'star', size: 1 },
    ] };
  } });

f('breath', { label: 'Breath', place: 'from-caster', words: ['breath', 'fire breath', 'dragon breath', 'flamethrower', 'flame thrower', 'spew', 'exhale', 'cone', 'spray cone', 'jet'],
  build: (E, m) => ({ w: 96, h: 48, frames: 16, fps: 15, loop: true, pivot: [0.1, 0.5], layers: [
    { type: 'puffs', ramp: '$smoke', count: 5, x: -0.4, y: -0.1, spread: 0.1, rise: 0.4, r0: 0.08, r1: 0.25, life: [0.5, 0.9], gain: 0.45, dir: 0, speed: [1.4, 2], cone: 20 },
    { type: 'puffs', ramp: '$main', count: Math.round(36 * m.density), x: -1.6, y: 0, spread: 0.02, flat: 0.5, rise: 0.05, r0: 0.1, r1: 0.44 * m.power, life: [0.5, 0.62], gain: 1.08, decay: 0.45,
      dir: 0, cone: 12, speed: [2.5, 2.75], dissolve: 0.5, freq: 2.6 },
    { type: 'particles', ramp: '$spark', mode: 'burst', x: -1.55, dir: 0, spread: 40, speed: [2.5, 4], drag: 0.5, life: [0.3, 0.6], count: Math.round(10 * m.density), shape: 'dot', size: [2, 1] },
  ] }) });

f('fireworks', { label: 'Fireworks', place: 'screen', words: ['fireworks', 'firework', 'celebration', 'celebrate', 'party', 'victory', 'win', 'confetti burst', 'new year'],
  build: (E, m) => {
    const layers = [];
    const spots = [[-0.55, -0.6, 0], [0.5, -0.8, 0.25], [0.05, -0.25, 0.5]];
    spots.forEach(([x, y, t0], i) => {
      layers.push({ type: 'particles', ramp: '$spark', mode: 'burst', x, y: y + 1.6, dir: -90, spread: 6, speed: [3.2, 3.2], drag: 3, life: [0.2, 0.2], count: 1, shape: 'streak', size: 2, t0, t1: t0 + 0.25, seed: i });
      layers.push({ type: 'particles', ramp: i === 1 ? '$alt' : '$main', mode: 'burst', x, y, count: Math.round(34 * m.density), speed: [1.3, 1.9], drag: 2.4, gravity: 0.7, life: [0.6, 1], shape: 'star', size: [2, 1], twinkle: 3, heat: [1.15, 0.5], t0: t0 + 0.18, t1: Math.min(1, t0 + 0.68), seed: i + 10 });
      layers.push({ type: 'flash', ramp: '$main', x, y, r: 0.18, dur: 0.12, t0: t0 + 0.18, t1: Math.min(1, t0 + 0.68) });
    });
    return { w: 96, h: 96, frames: 32, fps: 15, layers };
  } });

export const FORM_LIST = Object.keys(FORMS);
export const FORM_LABELS = Object.fromEntries(FORM_LIST.map((k) => [k, FORMS[k].label]));

// ---------- prompt parsing ----------
const MODS = {
  tiny: { size: 0.5 }, mini: { size: 0.5 }, small: { size: 0.75 }, little: { size: 0.75 }, compact: { size: 0.75 },
  big: { size: 1.5 }, large: { size: 1.5 }, huge: { size: 2 }, giant: { size: 2 }, massive: { size: 2, density: 1.3 }, enormous: { size: 2 },
  gigantic: { size: 2 }, colossal: { size: 2 }, epic: { size: 1.5, density: 1.4 }, mega: { size: 1.5, density: 1.3 }, ultimate: { size: 2, density: 1.5 },
  fast: { speed: 1.3 }, quick: { speed: 1.3 }, rapid: { speed: 1.4 }, snappy: { speed: 1.4 }, slow: { speed: 0.7 }, lingering: { speed: 0.65 },
  intense: { density: 1.5, power: 1.1 }, violent: { density: 1.6, power: 1.15 }, chaotic: { density: 1.7 }, crazy: { density: 1.8, power: 1.15 },
  insane: { density: 1.9, power: 1.2 }, wild: { density: 1.5 }, powerful: { power: 1.15, density: 1.3 }, strong: { power: 1.1 }, heavy: { power: 1.15, density: 1.2 },
  dense: { density: 1.6 }, many: { density: 1.6 }, subtle: { density: 0.6, power: 0.85 }, soft: { density: 0.7 }, gentle: { density: 0.65 },
  calm: { density: 0.6 }, minimal: { density: 0.5 }, light: {}, weak: { power: 0.8, density: 0.7 },
  double: { count: 2 }, twin: { count: 2 }, dual: { count: 2 }, two: { count: 2 }, triple: { count: 3 }, three: { count: 3 }, combo: { count: 3 },
  quad: { count: 4 }, four: { count: 4 }, multi: { count: 3 },
  spinning: { spin: true }, spin: { spin: true }, whirling: { spin: true }, '360': { spin: true }, cyclone: { spin: true },
  ground: { ground: true }, floor: { ground: true }, aoe: { ground: true }, area: { ground: true }, underfoot: { ground: true }, 'top-down': { ground: true }, topdown: { ground: true },
  loop: { loop: true }, looping: { loop: true }, idle: { loop: true }, continuous: { loop: true }, ambient: { loop: true },
  once: { oneShot: true }, 'one-shot': { oneShot: true }, oneshot: { oneShot: true },
  outline: { outline: 'outside' }, outlined: { outline: 'outside' }, bold: { outline: 'outside' }, cartoon: { outline: 'outside' }, toon: { outline: 'outside' },
  inline: { outline: 'inside' }, shaded: { outline: 'inside' },
  dither: { dither: 0.7 }, dithered: { dither: 0.7 }, retro: { dither: 0.5 }, 'old-school': { dither: 0.5 },
  pico: { palette: 'pico8' }, 'pico-8': { palette: 'pico8' }, pico8: { palette: 'pico8' }, gameboy: { palette: 'gameboy' }, 'game boy': { palette: 'gameboy' },
  sweetie: { palette: 'sweetie16' }, endesga: { palette: 'endesga32' }, '1-bit': { palette: 'onebit' }, '1bit': { palette: 'onebit' }, monochrome: { palette: 'onebit' },
  left: { flip: true }, leftward: { flip: true },
  'hd': { size: 1.5 }, detailed: { size: 1.5 }, chunky: { size: 0.75 }, '8-bit': { size: 0.75, dither: 0.4 }, '16-bit': {},
};

export function tokenize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9!+\-.' ]+/g, ' ').split(/\s+/).filter(Boolean);
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function findPhrase(text, list) {
  let best = null;
  for (const w of list) {
    const re = new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
    const m = re.exec(text);
    if (m && (!best || w.length > best.len || (w.length === best.len && m.index < best.idx))) best = { w, len: w.length, idx: m.index };
  }
  return best;
}

// Read a prompt into its parts. Exposed so the UI can show what was understood.
export function parse(prompt) {
  const raw = String(prompt || '').toLowerCase();
  const text = ' ' + raw.replace(/[^a-z0-9!+\-.' ]+/g, ' ') + ' ';
  const words = tokenize(raw);
  // forms: longest phrase wins, earlier wins ties; keep up to two
  const formHits = [];
  for (const id of FORM_LIST) {
    const hit = findPhrase(text, FORMS[id].words);
    if (hit) formHits.push({ id, ...hit });
  }
  formHits.sort((a, b) => b.len - a.len || a.idx - b.idx);
  const forms = [], spans = [];
  for (const h of formHits) {
    if (forms.includes(h.id) || forms.length >= 2) continue;
    const a = h.idx, b = h.idx + h.len + 1;
    if (spans.some(([x, y]) => a < y && b > x)) continue;
    forms.push(h.id); spans.push([a, b]);
  }
  const elHits = [];
  for (const id of Object.keys(ELEMENTS)) {
    const hit = findPhrase(text, ELEMENTS[id].words);
    if (hit) elHits.push({ id, ...hit });
  }
  elHits.sort((a, b) => a.idx - b.idx);
  const elements = elHits.map((e) => e.id).slice(0, 2);
  const mods = {};
  const chips = [];
  for (const [w, m] of Object.entries(MODS)) {
    if (findPhrase(text, [w])) {
      for (const [k, v] of Object.entries(m)) mods[k] = typeof v === 'number' && mods[k] ? mods[k] * v : v;
      chips.push({ kind: 'mod', label: w });
    }
  }
  let color = null;
  for (const [w, hue] of Object.entries(COLORS)) if (findPhrase(text, [w])) { color = { word: w, ramp: 'hue:' + hue }; break; }
  if (!color) for (const [w, r] of Object.entries(RAMP_WORDS)) if (findPhrase(text, [w]) && !(w === 'golden' && elements.includes('gold'))) { color = { word: w, ramp: r }; break; }
  return { raw, words, forms, elements, mods, color, chips };
}

const pick = (arr, seed) => arr[((seed >>> 0) % arr.length)];

// Build a recipe from a prompt. seed varies the result; same prompt + seed is stable.
export function interpret(prompt, seed) {
  const P = parse(prompt);
  const h = hashStr(P.raw.trim());
  seed = seed == null ? h % 100000 : seed;
  let forms = P.forms.slice();
  let elements = P.elements.slice();
  if (!forms.length && elements.length) forms = [ELEMENTS[elements[0]].form];
  if (!forms.length) forms = [pick(['explosion', 'slash', 'nova', 'impact', 'orb', 'pillar'], h)];
  if (!elements.length) {
    const byForm = { heal: 'nature', levelup: 'gold', coins: 'gold', poof: 'smoke', dash: 'wind', circle: 'arcane', teleport: 'arcane', portal: 'arcane',
      vortex: 'dark', shield: 'energy', charge: 'arcane', orb: 'arcane', strike: 'lightning', tornado: 'wind', spikes: 'ice', slam: 'earth', splash: 'water',
      flame: 'fire', breath: 'fire', meteor: 'fire', cloud: 'poison', sparkle: 'holy', damage: 'fire', aura: 'fire', weather: 'arcane', fireworks: 'arcane',
      projectile: 'fire', slash: 'steel', claw: 'blood', nova: 'arcane', impact: 'energy', explosion: 'fire', beam: 'energy', pillar: 'holy' };
    elements = [byForm[forms[0]] && ELEMENTS[byForm[forms[0]]] ? byForm[forms[0]] : pick(['fire', 'ice', 'lightning', 'arcane', 'holy', 'poison'], h >> 3)];
  }
  const E = ELEMENTS[elements[0]];
  const E2 = elements[1] ? ELEMENTS[elements[1]] : null;
  const mods = P.mods;
  const m = {
    density: Math.min(2.5, mods.density ?? 1), power: Math.min(1.3, mods.power ?? 1), count: mods.count ?? 1,
    spin: !!mods.spin, ground: !!mods.ground, oneShot: !!mods.oneShot, loop: !!mods.loop, colored: !!P.color,
  };
  const F = FORMS[forms[0]];
  const base = F.build(E, m, P.words, P.raw);
  let layers = base.layers.map((l) => ({ ...l }));
  // a second form joins as extra layers, offset in time for one-shots
  if (forms[1] && forms[1] !== forms[0] && !['weather', 'damage', 'fireworks'].includes(forms[1])) {
    const second = FORMS[forms[1]].build(E2 || E, { ...m, density: m.density * 0.7 }, P.words, P.raw);
    const sx = base.w / second.w, sy = base.h / second.h;
    const k = Math.min(sx, sy, 1);
    const off = base.loop || second.loop ? 0 : 0.18;
    for (const l of second.layers) {
      if (l.type === 'flash' && layers.some((x) => x.type === 'flash')) continue;
      const nl = { ...l, t0: Math.min(0.9, (l.t0 ?? 0) * (1 - off) + off), t1: l.t1 ?? 1, seed: (l.seed || 0) + 31 };
      if (k < 1) for (const key of ['r', 'r0', 'r1', 'len', 'hgt', 'w', 'th', 'spread', 'area', 'implodeR', 'orbitR']) if (typeof nl[key] === 'number') nl[key] *= k;
      layers.splice(Math.max(0, layers.length - 1), 0, nl);
    }
  }
  // second element tints the accent and spark layers
  const ramps = { ...E.ramps };
  if (E2) { ramps.spark = E2.ramps.main; ramps.alt = E2.ramps.main; }
  if (P.color) { ramps.main = P.color.ramp; if (!E2) ramps.spark = P.color.ramp; }
  let loop = base.loop ?? false;
  if (m.loop && !['explosion', 'impact', 'slash', 'claw', 'strike', 'meteor', 'pillar', 'teleport', 'levelup', 'splash', 'slam', 'spikes', 'damage', 'fireworks', 'poof', 'heal', 'coins', 'nova', 'dash'].includes(forms[0])) loop = true;
  if (m.oneShot) loop = false;
  const sizeMul = mods.size ?? 1;
  const snap = (v) => Math.max(16, Math.min(320, Math.round((v * sizeMul) / 8) * 8));
  const speed = mods.speed ?? 1;
  let frames = Math.round(base.frames / Math.sqrt(speed));
  let fps = Math.round(base.fps * Math.sqrt(speed));
  if (!loop && base.loop) frames = Math.round(frames * 1.25);
  if (mods.flip) layers = layers.map((l) => flipLayer(l));
  const name = `${pick(E.names, seed)} ${F.label}`;
  const recipe = {
    name, prompt: String(prompt || '').trim(), w: snap(base.w), h: snap(base.h), frames: Math.max(4, Math.min(64, frames)), fps: Math.max(6, Math.min(30, fps)),
    loop, seed, outline: mods.outline ?? base.outline ?? 'none', dither: mods.dither ?? 0, palette: mods.palette ?? null, cleanup: true,
    ramps, place: F.place, depth: F.depth ?? 'front', pivot: base.pivot ?? [0.5, 0.5], impact: base.impact, layers,
  };
  if (mods.flip && recipe.pivot) recipe.pivot = [1 - recipe.pivot[0], recipe.pivot[1]];
  const chips = [
    { kind: 'form', label: F.label },
    ...(forms[1] ? [{ kind: 'form', label: FORMS[forms[1]].label }] : []),
    { kind: 'element', label: E.label },
    ...(E2 ? [{ kind: 'element', label: E2.label }] : []),
    ...(P.color ? [{ kind: 'color', label: P.color.word }] : []),
    ...P.chips,
  ];
  // matched is false when no form or element word was read; the recipe then
  // falls back to a template picked from the prompt's hash.
  return { recipe, chips, parsed: P, matched: P.forms.length > 0 || P.elements.length > 0 };
}

function flipLayer(l) {
  const n = { ...l };
  if (typeof n.x === 'number') n.x = -n.x;
  if (typeof n.angle === 'number') n.angle = 180 - n.angle;
  else if (['beam', 'comet'].includes(n.type)) n.angle = 180;
  if (typeof n.dir === 'number') n.dir = 180 - n.dir;
  if (n.from) n.from = [-n.from[0], n.from[1]];
  if (n.type === 'slash') { n.a0 = 180 - (n.a0 ?? -160); n.a1 = 180 - (n.a1 ?? 40); }
  return n;
}

// ---------- library ----------
export const LIBRARY = [
  { cat: 'Combat', prompt: 'big fire explosion', seed: 7 },
  { cat: 'Combat', prompt: 'electric impact hit', seed: 3 },
  { cat: 'Combat', prompt: 'crescent sword slash', seed: 2 },
  { cat: 'Combat', prompt: 'triple slash combo with blue energy', seed: 5 },
  { cat: 'Combat', prompt: 'feral claw scratch blood', seed: 1 },
  { cat: 'Combat', prompt: 'ground slam quake', seed: 4 },
  { cat: 'Combat', prompt: 'meteor strike', seed: 9 },
  { cat: 'Combat', prompt: 'spinning wind slash', seed: 6 },
  { cat: 'Combat', prompt: 'critical hit damage 999', seed: 1 },
  { cat: 'Combat', prompt: 'dash speed lines', seed: 2 },
  { cat: 'Magic', prompt: 'arcane magic circle', seed: 3 },
  { cat: 'Magic', prompt: 'purple black hole vortex', seed: 4 },
  { cat: 'Magic', prompt: 'dimensional portal', seed: 2 },
  { cat: 'Magic', prompt: 'holy pillar of light', seed: 5 },
  { cat: 'Magic', prompt: 'teleport blink', seed: 1 },
  { cat: 'Magic', prompt: 'charge up energy', seed: 8 },
  { cat: 'Magic', prompt: 'plasma orb', seed: 2 },
  { cat: 'Magic', prompt: 'hex shield barrier', seed: 1 },
  { cat: 'Magic', prompt: 'blue energy beam', seed: 2 },
  { cat: 'Magic', prompt: 'dark shadow aura', seed: 3 },
  { cat: 'Elements', prompt: 'fireball projectile', seed: 1 },
  { cat: 'Elements', prompt: 'lightning strike from the sky', seed: 4 },
  { cat: 'Elements', prompt: 'ice spikes erupting', seed: 3 },
  { cat: 'Elements', prompt: 'poison gas cloud', seed: 2 },
  { cat: 'Elements', prompt: 'water splash', seed: 1 },
  { cat: 'Elements', prompt: 'fire tornado', seed: 2 },
  { cat: 'Elements', prompt: 'campfire', seed: 1 },
  { cat: 'Elements', prompt: 'dragon fire breath', seed: 3 },
  { cat: 'Elements', prompt: 'frost nova', seed: 4 },
  { cat: 'Elements', prompt: 'lava eruption pillar', seed: 2 },
  { cat: 'Feedback', prompt: 'healing with rising crosses', seed: 2 },
  { cat: 'Feedback', prompt: 'level up', seed: 1 },
  { cat: 'Feedback', prompt: 'gold coins loot drop', seed: 2 },
  { cat: 'Feedback', prompt: 'smoke poof', seed: 3 },
  { cat: 'Feedback', prompt: 'sparkle twinkle', seed: 2 },
  { cat: 'Feedback', prompt: 'fireworks celebration', seed: 4 },
  { cat: 'Ambient', prompt: 'snow falling', seed: 1 },
  { cat: 'Ambient', prompt: 'rain', seed: 1 },
  { cat: 'Ambient', prompt: 'embers rising', seed: 2 },
  { cat: 'Ambient', prompt: 'fireflies', seed: 1 },
  { cat: 'Ambient', prompt: 'cherry blossom petals', seed: 3 },
  { cat: 'Ambient', prompt: 'falling leaves', seed: 2 },
];

// Offered when a prompt holds no effect word: six forms and three elements.
export const SUGGESTED_WORDS = ['explosion', 'slash', 'beam', 'portal', 'heal', 'tornado', 'fire', 'ice', 'lightning'];

export const EXAMPLE_PROMPTS = [
  'a huge purple lightning nova',
  'ice spikes erupting from the ground',
  'holy heal with rising crosses',
  'fire tornado',
  'triple slash combo with blue energy',
  'black hole that swallows everything',
  'pink plasma beam',
  'meteor strike',
  'toxic poison cloud, dithered',
  'golden level up',
  'dragon fire breath',
  'critical hit damage 999',
];
