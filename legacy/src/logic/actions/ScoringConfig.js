import { POINTS_CONFIG } from '../../config/game-config.js';

export const SCORING_CONFIG_VERSION = 1;

const BOOLEAN_OPTION_KEYS = ['noSelfCostReward', 'burstActionScoreOnce', 'disableRarityBonus'];

const OPTION_DEFAULTS = Object.freeze({
  noSelfCostReward: false,
  burstActionScoreOnce: false,
  disableRarityBonus: false,
  noRarityActions: Object.freeze([]),
  attackScoreMultiplier: 1
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
  for (const key of BOOLEAN_OPTION_KEYS) {
    if (Object.hasOwn(input, key) && typeof input[key] !== 'boolean') {
      throw new TypeError(`scoringConfig.${key} must be a boolean`);
    }
  }
  if (Object.hasOwn(input, 'noRarityActions')) {
    if (!Array.isArray(input.noRarityActions) || !input.noRarityActions.every(item => typeof item === 'string')) {
      throw new TypeError('scoringConfig.noRarityActions must be an array of strings');
    }
  }
  if (Object.hasOwn(input, 'attackScoreMultiplier')) {
    if (typeof input.attackScoreMultiplier !== 'number' || !Number.isFinite(input.attackScoreMultiplier) || input.attackScoreMultiplier <= 0) {
      throw new TypeError('scoringConfig.attackScoreMultiplier must be a positive finite number');
    }
  }
  return input;
}

/**
 * Validate the experimental switches and capture an immutable, match-local
 * snapshot of the formal points table. The input intentionally exposes only
 * the ticketed changes; point values are recorded, not overridden.
 */
export function createScoringConfig(input) {
  const options = validateInput(input);
  const switches = Object.fromEntries(
    Object.keys(OPTION_DEFAULTS).map(key => [
      key,
      options[key] !== undefined ? copyValue(options[key]) : copyValue(OPTION_DEFAULTS[key])
    ])
  );
  const isDefault =
    !switches.noSelfCostReward &&
    !switches.burstActionScoreOnce &&
    !switches.disableRarityBonus &&
    switches.noRarityActions.length === 0 &&
    switches.attackScoreMultiplier === 1;

  const configuration = {
    version: SCORING_CONFIG_VERSION,
    name: isDefault ? 'formal-baseline' : 'experimental',
    ...switches,
    pointsConfig: copyValue(POINTS_CONFIG)
  };
  return deepFreeze(configuration);
}

export default createScoringConfig;
