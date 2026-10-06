/**
 * Turn-order diagnostic control.
 * Compares formal rules against an isolated diagnostic control that preserves
 * all board progress, disruption, self-cost, and scoring effects but suppresses
 * the extra-action grant from burst actions.
 *
 * This isolates the pure tempo/turn-order contribution from node modifications.
 * The diagnostic variant is strictly quarantined from formal baseline statistics.
 */

import { createActionCandidates } from '../actions/ActionCandidates.js';
import { createActionResolver } from '../actions/ActionResolver.js';
import { createScoreCalculator } from '../actions/ScoreCalculator.js';
import { createScoringConfig } from '../actions/ScoringConfig.js';
import { calculateNextPlayer, calculatePassiveEffects, decideTerminal } from '../flow/TurnRules.js';
import { enumerateLegalFirstActions } from './FixedPositionContinuations.js';
import { createScopedState } from './ScopedState.js';
import { runSeededMatch } from './SeededMatch.js';

function clone(value) {
  return structuredClone(value);
}

function outcomeValue(terminalResult, playerId) {
  if (terminalResult.winner === 'DRAW') return 0.5;
  if (terminalResult.winner === playerId) return 1.0;
  return 0.0;
}

/**
 * Execute the first action from a fixed position, with or without extra action grant.
 */
function createPostFirstActionState(position, action, suppressExtraAction, scoringConfig) {
  const matchScoringConfig = createScoringConfig(scoringConfig);
  const stateManager = createScopedState(clone(position.state), matchScoringConfig);
  const scoreCalculator = createScoreCalculator(stateManager, matchScoringConfig);
  const resolver = createActionResolver(stateManager, scoreCalculator);

  const playerId = position.currentPlayer;
  const opponentId = playerId === 'P1' ? 'P2' : 'P1';
  const stem = clone(position.currentStem);
  const stateBefore = position.state;

  if (action && action.type !== 'SKIP') {
    resolver.resolveAction(action, playerId, opponentId, stem);
  }

  let burstPlayer = stateManager.getState().pendingBurstPlayer;
  if (!suppressExtraAction && ['BURST', 'BURST_ATK'].includes(action?.type) && !stateBefore.isExtraTurn) {
    burstPlayer = playerId;
  } else if (suppressExtraAction) {
    burstPlayer = null;
  }
  stateManager.update({ pendingBurstPlayer: burstPlayer });

  const passive = calculatePassiveEffects(stateManager.getState(), matchScoringConfig.pointsConfig);
  for (const change of passive.scoreChanges) {
    stateManager.addScore(change.playerId, change.amount, change.reason, change.actionType);
  }

  const next = calculateNextPlayer(playerId, stateBefore.isExtraTurn, burstPlayer);
  stateManager.update({
    phase: 'STEM_GENERATION',
    currentPlayer: next.nextPlayer,
    isExtraTurn: next.nextIsExtraTurn,
    pendingBurstPlayer: next.pendingBurstPlayer,
    currentStem: null,
    turnScoreChanges: { P1: 0, P2: 0 },
    lastAction: clone(action)
  });

  return stateManager.getState();
}

/**
 * Run diagnostic turn-order continuations across all legal first actions for a position.
 */
export function runTurnOrderDiagnostic({ position, strategies, seeds, scoringConfig = {} } = {}) {
  const enumeration = enumerateLegalFirstActions(position, { scoringConfig });
  const actions = enumeration.actions;

  const formalResults = [];
  const diagnosticResults = [];
  const turnOrderContributions = [];

  for (const action of actions) {
    const isBurst = ['BURST', 'BURST_ATK'].includes(action?.type);

    // 1. Formal continuation
    const formalPostState = createPostFirstActionState(position, action, false, scoringConfig);
    const formalTerminal = decideTerminal(formalPostState);
    let formalValues = [];

    if (formalTerminal) {
      const val = outcomeValue(formalTerminal, position.currentPlayer);
      formalValues = seeds.map(() => val);
    } else {
      formalValues = seeds.map(seed => {
        const match = runSeededMatch({
          initialState: clone(formalPostState),
          seed,
          strategies,
          scoringConfig
        });
        return outcomeValue(match.terminalResult, position.currentPlayer);
      });
    }

    const formalMean = formalValues.reduce((sum, v) => sum + v, 0) / (formalValues.length || 1);
    formalResults.push({ action: clone(action), values: formalValues, meanValue: formalMean });

    // 2. Diagnostic continuation (suppress extra action if burst)
    const diagnosticPostState = createPostFirstActionState(position, action, true, scoringConfig);
    const diagnosticTerminal = decideTerminal(diagnosticPostState);
    let diagnosticValues = [];

    if (diagnosticTerminal) {
      const val = outcomeValue(diagnosticTerminal, position.currentPlayer);
      diagnosticValues = seeds.map(() => val);
    } else {
      diagnosticValues = seeds.map(seed => {
        const match = runSeededMatch({
          initialState: clone(diagnosticPostState),
          seed,
          strategies,
          scoringConfig
        });
        return outcomeValue(match.terminalResult, position.currentPlayer);
      });
    }

    const diagnosticMean = diagnosticValues.reduce((sum, v) => sum + v, 0) / (diagnosticValues.length || 1);
    diagnosticResults.push({ action: clone(action), values: diagnosticValues, meanValue: diagnosticMean });

    const turnOrderDelta = formalMean - diagnosticMean;
    let interpretation = '该动作为非强化类动作，无额外行动次序加成。';
    if (isBurst) {
      if (position.state.isExtraTurn) {
        interpretation = '当前已处于连动回合，正式规则亦不重复授予额外行动，次序加成为 0。';
      } else if (seeds.length < 6) {
        interpretation = `证据不足：样本量低于门槛（n=${seeds.length} < 6），不输出方向性结论（当前点估计差值 ${turnOrderDelta.toFixed(3)}）。`;
      } else if (turnOrderDelta > 0) {
        interpretation = `强化获得的额外行动提供了 +${turnOrderDelta.toFixed(3)} 的净胜势价值提升。`;
      } else if (turnOrderDelta < 0) {
        interpretation = `在当前局势下，连续行动导致负面价值变化 (${turnOrderDelta.toFixed(3)})。`;
      } else {
        interpretation = '在测试的样本种子中，额外行动未改变最终胜负走向（差值为 0）。';
      }
    }

    turnOrderContributions.push({
      action: clone(action),
      isBurst,
      formalValue: formalMean,
      diagnosticValue: diagnosticMean,
      turnOrderValueDelta: turnOrderDelta,
      interpretation
    });
  }

  return {
    schemaVersion: 1,
    variant: 'diagnostic-no-extra-action',
    ruleIdentity: 'diagnostic-control-only-isolated-from-formal-rules',
    positionId: position.id,
    classification: position.classification,
    turnCount: position.state.turnCount,
    currentPlayer: position.currentPlayer,
    seeds: clone(seeds),
    formalComparison: { actions: formalResults },
    diagnosticComparison: { actions: diagnosticResults },
    turnOrderContributions,
    inferenceBoundary: '该对照仅用于定量分离强化动作中「额外行动次序」与「棋盘节点改动」的独立影响；诊断结果严格与正式游戏规则隔离。'
  };
}
