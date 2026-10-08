import { POINTS_CONFIG } from '../../config/game-config.js';

// Shared action-frequency assumptions and rounding used by score application
// and per-component statistics. Callers supply their established multiplier
// fallback so this extraction does not change either scoring path's behavior.
export const ACTION_PROBABILITY = Object.freeze({
  AUTO: 1.0,
  ATK: 0.518,
  TRANS: 0.243,
  CONVERT: 0.167,
  BURST: 0.035,
  BURST_ATK: 0.036,
  DIVIDEND: 1.0,
  PENALTY: 1.0
});

export function isNoRarityAction(actionType, scoringConfig = null) {
  const formalNoRarity = scoringConfig?.pointsConfig?.NO_RARITY_ACTIONS ?? POINTS_CONFIG?.NO_RARITY_ACTIONS ?? [];
  return Boolean(scoringConfig?.noRarityActions?.includes(actionType) || formalNoRarity.includes(actionType));
}

export function calculateRarityAdjustedScore(score, actionType, multiplier) {
  const probability = ACTION_PROBABILITY[actionType] || 0.5;
  const rarityBonus = score * (1 - probability) * multiplier;
  return Math.round(score + rarityBonus);
}
