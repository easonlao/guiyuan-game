import { POINTS_CONFIG } from '../config/game-config.js';
import { calculateRarityAdjustedScore } from '../logic/actions/RarityScoring.js';

const PASSIVE_ACTIONS = ['DIVIDEND', 'DAMAGE_PENALTY', 'FINAL_PENALTY'];
const STATE_REASONS = ['点亮', '修复道损', '加持', '致阳道损', '致阴道损', '破阳点亮', '破阴点亮', '削弱加持'];

function cleanReason(reason) {
  const match = reason.match(/^([^(]+)/);
  return match ? match[1].trim() : reason;
}

export function rarityAdjustedScore(score, actionType, scoringConfig = null) {
  if (scoringConfig?.disableRarityBonus) return score;
  if (scoringConfig?.noRarityActions?.includes(actionType)) return score;
  return calculateRarityAdjustedScore(
    score,
    actionType,
    scoringConfig?.pointsConfig?.RARITY_MULTIPLIER || POINTS_CONFIG?.RARITY_MULTIPLIER || 1.5
  );
}

function actionScore(actionType, scoringConfig = null) {
  const pointsConfig = scoringConfig?.pointsConfig ?? POINTS_CONFIG;
  return pointsConfig?.ACTION?.[actionType] || 0;
}

function stateScore(stateName, scoringConfig = null) {
  const changes = (scoringConfig?.pointsConfig ?? POINTS_CONFIG)?.STATE_CHANGE;
  if (!changes) return 0;
  if (stateName === '点亮') return changes.LIGHT_UP || 0;
  if (stateName === '加持') return changes.BLESSING || 0;
  if (stateName === '修复道损') return changes.REPAIR_DMG?.yang || 0;
  if (stateName === '致阳道损') return changes.CAUSE_DMG?.yang || 0;
  if (stateName === '致阴道损') return changes.CAUSE_DMG?.yin || 0;
  if (stateName === '破阳点亮') return changes.BREAK_LIGHT?.yang || 0;
  if (stateName === '破阴点亮') return changes.BREAK_LIGHT?.yin || 0;
  if (stateName === '削弱加持') return changes.WEAKEN || 0;
  return 0;
}

function recordStat(targetState, playerId, statType, reason, amount) {
  const prefix = statType === 'state' ? 'state' : statType === 'passive' ? 'passive' : 'action';
  const stats = targetState[`${prefix}Stats`][playerId];
  const scores = targetState[`${prefix}Scores`][playerId];
  if (stats[reason] !== undefined) {
    stats[reason]++;
    scores[reason] += amount;
  }
}

/** Record a score using the same public scoring/statistics rules for any isolated state value. */
export function recordScoreByReason(targetState, playerId, reason, actionType, amount, scoringConfig = null, scoreBreakdown = null) {
  const clean = cleanReason(reason);
  if (PASSIVE_ACTIONS.includes(actionType)) {
    recordStat(targetState, playerId, 'passive', clean, amount);
    return;
  }

  if (clean.includes('·')) {
    const [actionName, stateName] = clean.split('·');
    const behaviorScore = scoreBreakdown?.baseActionScore ?? actionScore(actionType, scoringConfig);
    const awardedBehaviorScore = scoreBreakdown?.actionScore ?? behaviorScore;
    const changedStateScore = scoreBreakdown?.stateScore ?? stateScore(stateName, scoringConfig);
    if (behaviorScore > 0 && targetState.actionStats[playerId][actionName] !== undefined) {
      targetState.actionStats[playerId][actionName]++;
      targetState.actionScores[playerId][actionName] += rarityAdjustedScore(awardedBehaviorScore, actionType, scoringConfig);
    }
    if (changedStateScore > 0 && targetState.stateStats[playerId][stateName] !== undefined) {
      targetState.stateStats[playerId][stateName]++;
      targetState.stateScores[playerId][stateName] += rarityAdjustedScore(changedStateScore, actionType, scoringConfig);
    }
    return;
  }

  const statType = PASSIVE_ACTIONS.includes(actionType)
    ? 'passive'
    : STATE_REASONS.includes(clean) ? 'state' : 'action';
  recordStat(targetState, playerId, statType, clean, amount);
}

/** Apply a score and its statistics to a scoped state without emitting global events. */
export function applyScoreChangeToState(targetState, playerId, amount, reason = '', actionType = null, scoringConfig = null, scoreBreakdown = null) {
  if (amount === 0) return targetState;

  const currentScore = targetState.players[playerId].score;
  const currentTurnChange = targetState.turnScoreChanges[playerId];
  const nextState = {
    ...targetState,
    players: {
      ...targetState.players,
      [playerId]: { ...targetState.players[playerId], score: currentScore + amount }
    },
    turnScoreChanges: {
      ...targetState.turnScoreChanges,
      [playerId]: currentTurnChange + amount
    }
  };
  recordScoreByReason(nextState, playerId, reason, actionType, amount, scoringConfig, scoreBreakdown);
  return nextState;
}
