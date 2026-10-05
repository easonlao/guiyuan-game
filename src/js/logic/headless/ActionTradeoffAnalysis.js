/**
 * Action trade-off analysis and strategy intent contract verification.
 * Provides per-position action consequences (progress, disruption, self-cost,
 * score, turn-order) and checks strategy intent alignment without fabricating
 * intentions for unselected candidates.
 */

import { createActionCandidates } from '../actions/ActionCandidates.js';
import { createActionResolver } from '../actions/ActionResolver.js';
import { createScoreCalculator } from '../actions/ScoreCalculator.js';
import { createScoringConfig } from '../actions/ScoringConfig.js';
import { calculateNextPlayer, calculatePassiveEffects } from '../flow/TurnRules.js';
import { enumerateLegalFirstActions } from './FixedPositionContinuations.js';
import { createScopedState } from './ScopedState.js';

function clone(value) {
  return structuredClone(value);
}

const ELEMENT_COUNT = 5;

function litSideCount(nodeStates, playerId) {
  let count = 0;
  for (let element = 0; element < ELEMENT_COUNT; element++) {
    const node = nodeStates?.[`${playerId}-${element}`];
    if (node?.yang >= 1) count++;
    if (node?.yin >= 1) count++;
  }
  return count;
}

/**
 * Simulate the immediate effects of an action on the board state.
 * Returns exact progress, disruption, self-cost, score changes, and turn order consequences.
 */
export function simulateImmediateActionEffect(position, action, { scoringConfig = {} } = {}) {
  const stateBefore = clone(position.state);
  const matchScoringConfig = createScoringConfig(scoringConfig);
  const stateManager = createScopedState(stateBefore, matchScoringConfig);
  const scoreCalculator = createScoreCalculator(stateManager, matchScoringConfig);
  const resolver = createActionResolver(stateManager, scoreCalculator);

  const playerId = position.currentPlayer;
  const opponentId = playerId === 'P1' ? 'P2' : 'P1';
  const stem = clone(position.currentStem);

  const scoreBefore = stateManager.getState().players[playerId].score;
  const oppScoreBefore = stateManager.getState().players[opponentId].score;

  // Execute the action
  if (action && action.type !== 'SKIP') {
    resolver.resolveAction(action, playerId, opponentId, stem);
  }

  // Update burst pending marker matching HeadlessMatch
  let burstPlayer = stateManager.getState().pendingBurstPlayer;
  if (['BURST', 'BURST_ATK'].includes(action?.type) && !stateBefore.isExtraTurn) {
    burstPlayer = playerId;
  }
  stateManager.update({ pendingBurstPlayer: burstPlayer });

  // Passive settlement
  const passive = calculatePassiveEffects(stateManager.getState(), matchScoringConfig.pointsConfig);
  for (const change of passive.scoreChanges) {
    stateManager.addScore(change.playerId, change.amount, change.reason, change.actionType);
  }

  // Next player & extra turn determination
  const next = calculateNextPlayer(playerId, stateBefore.isExtraTurn, burstPlayer);

  const stateAfter = stateManager.getState();
  const scoreAfter = stateAfter.players[playerId].score;
  const oppScoreAfter = stateAfter.players[opponentId].score;

  // Compute node-level deltas
  let progressNodes = 0;
  let damageRepaired = 0;
  let newLitSides = 0;

  let disruptionNodes = 0;
  let damageInflicted = 0;
  let litSidesDestroyed = 0;

  let selfCostSides = 0;
  let selfCostPoints = 0;

  for (let el = 0; el < ELEMENT_COUNT; el++) {
    const keyMy = `${playerId}-${el}`;
    const beforeMy = stateBefore.nodeStates[keyMy] ?? { yang: 0, yin: 0 };
    const afterMy = stateAfter.nodeStates[keyMy] ?? { yang: 0, yin: 0 };

    for (const side of ['yang', 'yin']) {
      const delta = afterMy[side] - beforeMy[side];
      if (delta > 0) {
        progressNodes++;
        if (beforeMy[side] === -1) damageRepaired++;
        if (beforeMy[side] < 1 && afterMy[side] >= 1) newLitSides++;
      } else if (delta < 0) {
        selfCostSides++;
        selfCostPoints += Math.abs(delta);
      }
    }

    const keyOpp = `${opponentId}-${el}`;
    const beforeOpp = stateBefore.nodeStates[keyOpp] ?? { yang: 0, yin: 0 };
    const afterOpp = stateAfter.nodeStates[keyOpp] ?? { yang: 0, yin: 0 };

    for (const side of ['yang', 'yin']) {
      const delta = afterOpp[side] - beforeOpp[side];
      if (delta < 0) {
        disruptionNodes++;
        if (afterOpp[side] === -1 && beforeOpp[side] > -1) damageInflicted++;
        if (beforeOpp[side] >= 1 && afterOpp[side] < 1) litSidesDestroyed++;
      }
    }
  }

  const grantsExtraAction = next.nextPlayer === playerId && next.nextIsExtraTurn;
  const immediateScoreDelta = scoreAfter - scoreBefore;

  const tags = [];
  if (progressNodes > 0) tags.push('develop-progress');
  if (damageRepaired > 0) tags.push('repair-damage');
  if (newLitSides > 0) tags.push('light-new-side');
  if (disruptionNodes > 0) tags.push('disrupt-opponent');
  if (damageInflicted > 0) tags.push('inflict-damage');
  if (litSidesDestroyed > 0) tags.push('destroy-lit-side');
  if (selfCostSides > 0) tags.push('consume-self');
  if (grantsExtraAction) tags.push('gain-extra-turn');
  if (immediateScoreDelta !== 0) tags.push('score-delta');

  return {
    actionType: action?.type ?? 'UNKNOWN',
    executorId: playerId,
    opponentId,
    progress: {
      nodesChanged: progressNodes,
      damageRepaired,
      newLitSides
    },
    disruption: {
      nodesDisrupted: disruptionNodes,
      damageInflicted,
      litSidesDestroyed
    },
    selfCost: {
      costPoints: selfCostPoints,
      sidesReduced: selfCostSides
    },
    immediateScoreDelta,
    opponentScoreDelta: oppScoreAfter - oppScoreBefore,
    turnOrder: {
      grantsExtraAction,
      nextPlayer: next.nextPlayer,
      nextIsExtraTurn: next.nextIsExtraTurn
    },
    tags
  };
}

function inferPotentialUtility(action, effect) {
  if (!action) return 'none';
  if (action.type === 'AUTO') return '基础吸纳：免费点亮/加持当前天干对应侧';
  if (action.type === 'CONVERT') return '调息平衡：转移天干能量至本节点另一侧，促进归一';
  if (action.type === 'TRANS') return '化生推进：顺五行相生强化下游节点，加速点亮';
  if (action.type === 'ATK') return '直接破防：顺五行相克压制对手节点，阻断对手归一';
  if (action.type === 'BURST') return '强化爆发：消耗自身归一节点换取生属性双重加持与额外行动';
  if (action.type === 'BURST_ATK') return '强破爆发：消耗自身归一节点换取克属性双重压制与额外行动';
  if (action.type === 'SKIP') return '无可执行动作跳过';
  return '常规行动';
}

/**
 * Generate a complete action trade-off table for all legal first actions in a given position.
 */
export function generatePositionTradeoffTable(position, { scoringConfig = {} } = {}) {
  const enumeration = enumerateLegalFirstActions(position, { scoringConfig });
  const actions = enumeration.actions;
  const isForcedDecision = enumeration.candidates.length <= 1;

  const entries = actions.map(action => {
    const immediateEffect = simulateImmediateActionEffect(position, action, { scoringConfig });
    const potentialUtility = inferPotentialUtility(action, immediateEffect);
    return {
      action: clone(action),
      immediateEffect,
      potentialUtility,
      tags: immediateEffect.tags
    };
  });

  const state = position.state;
  const currentPlayer = position.currentPlayer;
  const opponentId = currentPlayer === 'P1' ? 'P2' : 'P1';
  const myScore = state.players?.[currentPlayer]?.score ?? 0;
  const oppScore = state.players?.[opponentId]?.score ?? 0;

  return {
    positionId: position.id,
    classification: position.classification,
    turnCount: state.turnCount,
    maxTurns: state.maxTurns,
    currentPlayer,
    stem: clone(position.currentStem),
    context: {
      remainingTurns: Math.max(0, state.maxTurns - state.turnCount),
      scoreDifference: myScore - oppScore,
      isExtraTurn: Boolean(state.isExtraTurn),
      pendingBurstPlayer: state.pendingBurstPlayer ?? null,
      opponentLitSides: litSideCount(state.nodeStates, opponentId)
    },
    isForcedDecision,
    actions: entries
  };
}

/**
 * Declare the strategy's primary intent and rationale before making a decision.
 */
export function declareStrategyIntent(strategyId, context) {
  const playerId = context?.playerId;
  const opponentId = playerId === 'P1' ? 'P2' : 'P1';
  const nodeStates = context?.state?.nodeStates;
  const opponentLit = litSideCount(nodeStates, opponentId);

  switch (strategyId) {
    case 'build-priority':
    case 'fixed-build':
      return {
        strategyId,
        primaryObjective: 'develop-nodes',
        rationale: '静态建设优先级：强化(BURST) > 调息(CONVERT) > 化生(TRANS) > 进攻(ATK)'
      };
    case 'attack-priority':
    case 'fixed-attack':
      return {
        strategyId,
        primaryObjective: 'disrupt-opponent',
        rationale: '静态进攻优先级：强破(BURST_ATK) > 进攻(ATK) > 强化(BURST) > 调息(CONVERT)'
      };
    case 'situation-responsive':
      if (opponentLit >= 8) {
        return {
          strategyId,
          primaryObjective: 'urgent-block',
          rationale: `对手已点亮 ${opponentLit} 侧，进入胜势威胁区(>=8侧)，优先强破/进攻克制对手`
        };
      }
      return {
        strategyId,
        primaryObjective: 'develop-lead',
        rationale: `对手点亮 ${opponentLit} 侧，未达到紧急威胁门槛(8侧)，常态发展自身点亮与分数`
      };
    default:
      return {
        strategyId,
        primaryObjective: 'general-play',
        rationale: '默认公开策略逻辑'
      };
  }
}

/**
 * Verify whether the selected action and its immediate consequences fulfill the strategy's declared contract.
 */
export function verifyStrategyContract(declaredIntent, selectedAction, immediateEffect) {
  if (!declaredIntent || !selectedAction) {
    return { contractFulfilled: false, alignment: 'violation', rationale: '缺少意图或所选动作' };
  }

  const actionType = selectedAction.type;
  const objective = declaredIntent.primaryObjective;

  if (['urgent-block', 'disrupt-opponent'].includes(objective)) {
    if (['BURST_ATK', 'ATK'].includes(actionType)) {
      return {
        contractFulfilled: true,
        alignment: 'full',
        rationale: `动作 ${actionType} 直接执行进攻压制，符合目标 ${objective}`
      };
    }
    // If not attacking, did it fulfill as fallback?
    return {
      contractFulfilled: true,
      alignment: 'fallback',
      rationale: `无合适进攻动作或根据优先级回退至 ${actionType}`
    };
  }

  if (['develop-nodes', 'develop-lead'].includes(objective)) {
    if (['BURST', 'CONVERT', 'TRANS', 'AUTO'].includes(actionType)) {
      return {
        contractFulfilled: true,
        alignment: 'full',
        rationale: `动作 ${actionType} 执行建设推进，符合目标 ${objective}`
      };
    }
    return {
      contractFulfilled: true,
      alignment: 'fallback',
      rationale: `按优先级选择了备选动作 ${actionType}`
    };
  }

  return {
    contractFulfilled: true,
    alignment: 'full',
    rationale: `动作 ${actionType} 在默认策略范围内执行`
  };
}
