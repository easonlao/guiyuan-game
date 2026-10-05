import { POINTS_CONFIG } from '../../config/game-config.js';

export const SCORING_CONFIG_VERSION = 1;

const OPTION_DEFAULTS = Object.freeze({
  noSelfCostReward: false,
  burstActionScoreOnce: false,
  disableRarityBonus: false
});
const ALLOWED_INPUT_KEYS = new Set(['version', ...Object.keys(OPTION_DEFAULTS)]);

function copyValue(value) {
  if (Array.isArray(value)) return value.map(copyValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, copyValue(nested)]));
  }
  return value;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested, seen);
  }
  return value;
}

function validateInput(input) {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('scoringConfig must be an object');
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('scoringConfig must be a plain object');
  }
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !ALLOWED_INPUT_KEYS.has(key)) {
      throw new TypeError(`scoringConfig contains unsupported key ${String(key)}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`scoringConfig.${key} must be an enumerable data property`);
    }
  }
  if (Object.hasOwn(input, 'version') && input.version !== SCORING_CONFIG_VERSION) {
    throw new TypeError(`scoringConfig.version must be ${SCORING_CONFIG_VERSION}`);
  }
  for (const key of Object.keys(OPTION_DEFAULTS)) {
    if (Object.hasOwn(input, key) && typeof input[key] !== 'boolean') {
      throw new TypeError(`scoringConfig.${key} must be a boolean`);
    }
  }
  return input;
}

/**
 * Validate the experimental switches and capture an immutable, match-local
 * snapshot of the formal points table. The input intentionally exposes only
 * the three ticketed changes; point values are recorded, not overridden.
 */
export function createScoringConfig(input) {
  const options = validateInput(input);
  const switches = Object.fromEntries(
    Object.keys(OPTION_DEFAULTS).map(key => [key, options[key] ?? OPTION_DEFAULTS[key]])
  );
  const configuration = {
    version: SCORING_CONFIG_VERSION,
    name: Object.values(switches).every(value => !value) ? 'formal-baseline' : 'experimental',
    ...switches,
    pointsConfig: copyValue(POINTS_CONFIG)
  };
  return deepFreeze(configuration);
}

export default createScoringConfig;
