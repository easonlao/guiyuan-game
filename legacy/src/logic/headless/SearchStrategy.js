/**
 * Expectimax Search Strategy for Guiyuan Headless Matches.
 * Supports depth 1 and depth 2 with chance node enumeration over the 10 formal heavenly stems.
 * Non-terminal state evaluation combines normalized score difference and lit progress difference.
 */

import { STEMS_LIST, STEMS_MAP } from '../../config/game-config.js';
import { createInitialGameState } from '../../state/StateManager.js';
import { createActionCandidates } from '../actions/ActionCandidates.js';
import { createActionResolver } from '../actions/ActionResolver.js';
import { createScoreCalculator } from '../actions/ScoreCalculator.js';
import { createScoringConfig } from '../actions/ScoringConfig.js';
import { calculateNextPlayer, calculatePassiveEffects, decideTerminal } from '../flow/TurnRules.js';
import { createScopedState } from './ScopedState.js';

function clone(value) {
  return structuredClone(value);
}

export const SEARCH_WEIGHTS = Object.freeze({
  'search-score@1': Object.freeze({ id: 'search-score@1', version: 1, w_score: 0.8, w_lit: 0.2 }),
  'search-lit@1': Object.freeze({ id: 'search-lit@1', version: 1, w_score: 0.2, w_lit: 0.8 })
});

function countLitSides(nodeStates, playerId) {
  let count = 0;
  for (let el = 0; el < 5; el++) {
    const node = nodeStates?.[`${playerId}-${el}`] ?? { yang: 0, yin: 0 };
    if (node.yang >= 1) count++;
    if (node.yin >= 1) count++;
  }
  return count;
}

/**
 * Non-terminal heuristic evaluation from perspective of rootPlayer.
 * Bounded strictly within [-0.8, 0.8] so terminal win (+1.0) and loss (-1.0) strictly dominate.
 */
export function evaluateNonTerminalState(state, rootPlayer, weights) {
  const opponentId = rootPlayer === 'P1' ? 'P2' : 'P1';
  const rootScore = state.players?.[rootPlayer]?.score ?? state.scores?.[rootPlayer] ?? 0;
  const oppScore = state.players?.[opponentId]?.score ?? state.scores?.[opponentId] ?? 0;
  const scoreDiff = rootScore - oppScore;
  const normalizedScoreDiff = Math.max(-1, Math.min(1, scoreDiff / 500));

  const rootLit = countLitSides(state.nodeStates, rootPlayer);
  const oppLit = countLitSides(state.nodeStates, opponentId);
  const litProgressDiff = (rootLit - oppLit) / 10;

  const rawHeuristic = weights.w_score * normalizedScoreDiff + weights.w_lit * litProgressDiff;
  return 0.8 * Math.max(-1, Math.min(1, rawHeuristic));
}

function evaluateTerminalState(term, rootPlayer) {
  if (term.winner === rootPlayer) return 1.0;
  if (term.winner === 'DRAW') return 0.0;
  return -1.0;
}

function fastCloneState(state) {
  const nodeStates = {};
  for (const p of ['P1', 'P2']) {
    for (let el = 0; el < 5; el++) {
      const key = `${p}-${el}`;
      const n = state.nodeStates?.[key];
      nodeStates[key] = n ? { yang: n.yang, yin: n.yin } : { yang: 0, yin: 0 };
    }
  }
  return {
    phase: state.phase ?? 'DECISION',
    turnCount: state.turnCount ?? 0,
    maxTurns: state.maxTurns ?? 60,
    currentPlayer: state.currentPlayer ?? 'P1',
    isExtraTurn: state.isExtraTurn ?? false,
    currentStem: state.currentStem,
    pendingBurstPlayer: state.pendingBurstPlayer ?? null,
    players: {
      P1: { score: state.players?.P1?.score ?? state.scores?.P1 ?? 0 },
      P2: { score: state.players?.P2?.score ?? state.scores?.P2 ?? 0 }
    },
    turnScoreChanges: {
      P1: state.turnScoreChanges?.P1 ?? 0,
      P2: state.turnScoreChanges?.P2 ?? 0
    },
    actionStats: {
      P1: state.actionStats?.P1 ? { ...state.actionStats.P1 } : {},
      P2: state.actionStats?.P2 ? { ...state.actionStats.P2 } : {}
    },
    actionScores: {
      P1: state.actionScores?.P1 ? { ...state.actionScores.P1 } : {},
      P2: state.actionScores?.P2 ? { ...state.actionScores.P2 } : {}
    },
    stateStats: {
      P1: state.stateStats?.P1 ? { ...state.stateStats.P1 } : {},
      P2: state.stateStats?.P2 ? { ...state.stateStats.P2 } : {}
    },
    stateScores: {
      P1: state.stateScores?.P1 ? { ...state.stateScores.P1 } : {},
      P2: state.stateScores?.P2 ? { ...state.stateScores.P2 } : {}
    },
    passiveStats: {
      P1: state.passiveStats?.P1 ? { ...state.passiveStats.P1 } : {},
      P2: state.passiveStats?.P2 ? { ...state.passiveStats.P2 } : {}
    },
    passiveScores: {
      P1: state.passiveScores?.P1 ? { ...state.passiveScores.P1 } : {},
      P2: state.passiveScores?.P2 ? { ...state.passiveScores.P2 } : {}
    },
    nodeStates
  };
}

function applyAction(state, action, playerId, stem, scoringConfig) {
  const normalized = fastCloneState(state);
  const stateManager = createScopedState(normalized, scoringConfig);
  const scoreCalculator = createScoreCalculator(stateManager, scoringConfig);
  const resolver = createActionResolver(stateManager, scoreCalculator);
  const opponentId = playerId === 'P1' ? 'P2' : 'P1';

  if (action && action.type !== 'SKIP') {
    resolver.resolveAction(action, playerId, opponentId, stem);
  }

  let burstPlayer = stateManager.getState().pendingBurstPlayer;
  if (['BURST', 'BURST_ATK'].includes(action?.type) && !state.isExtraTurn) {
    burstPlayer = playerId;
  }
  stateManager.update({ pendingBurstPlayer: burstPlayer });

  const passive = calculatePassiveEffects(stateManager.getState(), scoringConfig.pointsConfig);
  for (const change of passive.scoreChanges) {
    stateManager.addScore(change.playerId, change.amount, change.reason, change.actionType);
  }

  const next = calculateNextPlayer(playerId, state.isExtraTurn, burstPlayer);
  const nextState = stateManager.getState();
  nextState.currentPlayer = next.nextPlayer;
  nextState.isExtraTurn = next.nextIsExtraTurn;
  nextState.pendingBurstPlayer = next.pendingBurstPlayer;
  return nextState;
}

function getLegalActions(state, playerId, stem, scoringConfig) {
  const isYang = STEMS_MAP[stem.element].yang === stem.name;
  const node = state.nodeStates?.[`${playerId}-${stem.element}`] ?? { yang: 0, yin: 0 };
  const sideValue = isYang ? node.yang : node.yin;

  if (sideValue < 1) {
    return [{ type: 'AUTO', executorId: playerId, playerId, stem: clone(stem), isYang }];
  }

  const stateManager = createScopedState(state, scoringConfig);
  const calculator = createActionCandidates(stateManager);
  const candidates = calculator.getAvailableActions(playerId, stem.element, isYang).actions;
  if (candidates.length === 0) {
    return [{ type: 'SKIP' }];
  }
  return candidates;
}

/**
 * Expectimax evaluation of a state across remaining depth.
 */
function evaluateChanceNode(state, remainingDepth, rootPlayer, weights, scoringConfig) {
  let expectedValue = 0;
  const prob = 1 / STEMS_LIST.length; // 0.1

  for (const stem of STEMS_LIST) {
    const nextState = fastCloneState(state);
    nextState.currentStem = stem;
    if (!nextState.isExtraTurn) {
      nextState.turnCount++;
    }

    const termAtTurnStart = decideTerminal(nextState);
    if (termAtTurnStart) {
      expectedValue += prob * evaluateTerminalState(termAtTurnStart, rootPlayer);
      continue;
    }

    const actingPlayer = nextState.currentPlayer;
    const isMax = (actingPlayer === rootPlayer);
    const actions = getLegalActions(nextState, actingPlayer, stem, scoringConfig);

    if (remainingDepth === 0) {
      // Depth 1 leaf after chance draw: evaluate heuristic or immediate terminal
      let bestLeafVal = isMax ? -Infinity : Infinity;
      for (const act of actions) {
        const postState = applyAction(nextState, act, actingPlayer, stem, scoringConfig);
        const term = decideTerminal(postState);
        const val = term ? evaluateTerminalState(term, rootPlayer) : evaluateNonTerminalState(postState, rootPlayer, weights);
        if (isMax) {
          if (val > bestLeafVal) bestLeafVal = val;
        } else {
          if (val < bestLeafVal) bestLeafVal = val;
        }
      }
      expectedValue += prob * bestLeafVal;
    } else {
      // Depth 2: full opponent or player decision node
      let bestSubVal = isMax ? -Infinity : Infinity;
      for (const act of actions) {
        const postState = applyAction(nextState, act, actingPlayer, stem, scoringConfig);
        const term = decideTerminal(postState);
        let val;
        if (term) {
          val = evaluateTerminalState(term, rootPlayer);
        } else {
          val = evaluateChanceNode(postState, remainingDepth - 1, rootPlayer, weights, scoringConfig);
        }
        if (isMax) {
          if (val > bestSubVal) bestSubVal = val;
        } else {
          if (val < bestSubVal) bestSubVal = val;
        }
      }
      expectedValue += prob * bestSubVal;
    }
  }

  return expectedValue;
}

/**
 * Execute expectimax decision for root player candidates.
 */
export function decideExpectimax(context, { depth = 1, weights = 'search-score@1', scoringConfig = {} } = {}, random = () => 0) {
  if (!context || !Array.isArray(context.candidates)) {
    throw new TypeError('strategy context must contain a candidates array');
  }
  if (context.candidates.length === 0) return null;
  if (context.candidates.length === 1) return context.candidates[0];

  const resolvedWeights = typeof weights === 'string'
    ? (SEARCH_WEIGHTS[weights] ?? SEARCH_WEIGHTS['search-score@1'])
    : weights;

  const matchScoringConfig = createScoringConfig(scoringConfig);
  const rootPlayer = context.playerId;
  const currentStem = context.stem;

  let bestScore = -Infinity;
  let bestCandidates = [];

  for (const candidate of context.candidates) {
    const postState = applyAction(context.state, candidate, rootPlayer, currentStem, matchScoringConfig);
    const immediateTerminal = decideTerminal(postState);

    let candidateValue;
    if (immediateTerminal) {
      candidateValue = evaluateTerminalState(immediateTerminal, rootPlayer);
    } else {
      // Depth 1 searches 0 remaining depth after chance node; Depth 2 searches 1 remaining depth
      candidateValue = evaluateChanceNode(postState, depth - 1, rootPlayer, resolvedWeights, matchScoringConfig);
    }

    if (candidateValue > bestScore + 1e-9) {
      bestScore = candidateValue;
      bestCandidates = [candidate];
    } else if (Math.abs(candidateValue - bestScore) <= 1e-9) {
      bestCandidates.push(candidate);
    }
  }

  if (bestCandidates.length === 1) return bestCandidates[0];
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) return bestCandidates[0];
  return bestCandidates[Math.floor(draw * bestCandidates.length)];
}

/**
 * Factory to create a versioned search strategy compatible with HeadlessMatch.
 */
export function createSearchStrategy({
  id = 'search-score-d1',
  version = 1,
  depth = 1,
  weights = 'search-score@1',
  scoringConfig = {}
} = {}) {
  const stats = {
    totalDecisionTimeMs: 0,
    decisionCount: 0,
    lastDecisionTimeMs: 0
  };

  return {
    id,
    version,
    depth,
    weights,
    get stats() {
      return { ...stats };
    },
    decide(context, random = () => 0) {
      const start = performance.now();
      const decision = decideExpectimax(context, { depth, weights, scoringConfig }, random);
      const elapsed = performance.now() - start;
      stats.lastDecisionTimeMs = elapsed;
      stats.totalDecisionTimeMs += elapsed;
      stats.decisionCount++;
      return decision;
    }
  };
}

export const SEARCH_STRATEGIES = Object.freeze({
  'search-score-d1': createSearchStrategy({ id: 'search-score-d1', version: 1, depth: 1, weights: 'search-score@1' }),
  'search-score-d2': createSearchStrategy({ id: 'search-score-d2', version: 1, depth: 2, weights: 'search-score@1' }),
  'search-lit-d1': createSearchStrategy({ id: 'search-lit-d1', version: 1, depth: 1, weights: 'search-lit@1' }),
  'search-lit-d2': createSearchStrategy({ id: 'search-lit-d2', version: 1, depth: 2, weights: 'search-lit@1' })
});
