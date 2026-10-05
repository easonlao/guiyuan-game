import { STEMS_LIST } from '../../config/game-config.js';

export const SEEDED_RANDOM_VERSION = 'mulberry32-fnv1a-v1';

function normalizeSeed(seed) {
  if (typeof seed === 'string' && seed.length > 0) return `string:${seed}`;
  if (Number.isSafeInteger(seed)) return `number:${seed}`;
  throw new TypeError('seed must be a non-empty string or safe integer');
}

function hashText(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Create a reproducible [0, 1) random stream isolated by its stream name. */
export function createSeededRandom(seed, streamName = 'default') {
  if (typeof streamName !== 'string' || streamName.length === 0) {
    throw new TypeError('streamName must be a non-empty string');
  }
  let state = hashText(`${normalizeSeed(seed)}\u0000${streamName}`);

  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

/**
 * Sample the formal game stem list with the same uniform index distribution as
 * STEMS_LIST[Math.floor(Math.random() * STEMS_LIST.length)].
 */
export function createSeededStemGenerator(seed) {
  const nextStem = createSeededRandom(seed, 'heavenly-stems');
  return function nextCanonicalStem() {
    const index = Math.floor(nextStem() * STEMS_LIST.length);
    return { ...STEMS_LIST[index] };
  };
}

export function createSeededStemSequence(seed, count) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new TypeError('count must be a non-negative safe integer');
  }
  const nextStem = createSeededStemGenerator(seed);
  return Array.from({ length: count }, nextStem);
}
