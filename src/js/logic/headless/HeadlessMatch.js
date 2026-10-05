import { STEMS_LIST, STEMS_MAP, POINTS_CONFIG } from '../../config/game-config.js';
import { createInitialGameState } from '../../state/StateManager.js';
import { createActionCandidates } from '../actions/ActionCandidates.js';
import { createActionResolver } from '../actions/ActionResolver.js';
import { createScoreCalculator } from '../actions/ScoreCalculator.js';
import {
  calculateNextPlayer,
  calculatePassiveEffects,
  decideTurnStart
} from '../flow/TurnRules.js';
import { createScopedState } from './ScopedState.js';

const PLAYER_IDS = ['P1', 'P2'];
const SIDES = ['yang', 'yin'];
const INITIAL_STATE_SCHEMA = createInitialGameState();
const FULL_STATE_FIELDS = [
  'phase', 'myRole', 'gameMode', 'turnCount', 'maxTurns', 'currentPlayer',
  'isExtraTurn', 'players', 'nodeStates', 'currentStem', 'turnScoreChanges',
  'lastAction', 'pendingSettlement', 'actionStats', 'actionScores', 'stateStats',
  'stateScores', 'passiveStats', 'passiveScores', 'pendingBurstPlayer'
];

export class HeadlessMatchError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'HeadlessMatchError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new HeadlessMatchError(code, message);
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested, seen);
  }
  return value;
}

function validateFullState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    fail('INVALID_STATE', 'initialState must be a complete game state object');
  }
  for (const field of FULL_STATE_FIELDS) {
    if (!Object.hasOwn(state, field) || state[field] === undefined) fail('INVALID_STATE', `initialState.${field} is required`);
  }
  if (typeof state.phase !== 'string') fail('INVALID_STATE', 'initialState.phase must be a string');
  if (state.myRole !== null && !PLAYER_IDS.includes(state.myRole)) {
    fail('INVALID_STATE', 'initialState.myRole must be P1, P2, or null');
  }
  if (![0, 1, 2].includes(state.gameMode)) fail('INVALID_STATE', 'initialState.gameMode must be 0, 1, or 2');
  if (!Number.isSafeInteger(state.turnCount) || state.turnCount < 0) {
    fail('INVALID_STATE', 'initialState.turnCount must be a non-negative integer');
  }
  if (!Number.isSafeInteger(state.maxTurns) || state.maxTurns < 1) {
    fail('INVALID_STATE', 'initialState.maxTurns must be a positive integer');
  }
  if (!PLAYER_IDS.includes(state.currentPlayer)) {
    fail('INVALID_STATE', 'initialState.currentPlayer must be P1 or P2');
  }
  if (typeof state.isExtraTurn !== 'boolean') {
    fail('INVALID_STATE', 'initialState.isExtraTurn must be a boolean');
  }
  if (state.pendingBurstPlayer !== null && !PLAYER_IDS.includes(state.pendingBurstPlayer)) {
    fail('INVALID_STATE', 'initialState.pendingBurstPlayer must be P1, P2, or null');
  }
  if (!state.players || typeof state.players !== 'object') {
    fail('INVALID_STATE', 'initialState.players must contain P1 and P2');
  }
  for (const playerId of PLAYER_IDS) {
    const player = state.players[playerId];
    if (!player || typeof player !== 'object' || player.id !== playerId || !['HUMAN', 'AI'].includes(player.type) || !Number.isFinite(player.score) || typeof player.burstBonus !== 'boolean') {
      fail('INVALID_STATE', `initialState.players.${playerId} must contain its id, type, finite score, and boolean burstBonus`);
    }
  }
  if (!state.nodeStates || typeof state.nodeStates !== 'object') {
    fail('INVALID_STATE', 'initialState.nodeStates must contain all ten nodes');
  }
  for (const playerId of PLAYER_IDS) {
    for (let elementIndex = 0; elementIndex < 5; elementIndex++) {
      const key = `${playerId}-${elementIndex}`;
      const node = state.nodeStates[key];
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        fail('INVALID_STATE', `initialState.nodeStates.${key} is required`);
      }
      for (const side of SIDES) {
        if (!Number.isInteger(node[side]) || node[side] < -1 || node[side] > 2) {
          fail('INVALID_STATE', `initialState.nodeStates.${key}.${side} must be an integer from -1 to 2`);
        }
      }
    }
  }
  if (!state.turnScoreChanges || typeof state.turnScoreChanges !== 'object' || !PLAYER_IDS.every(id => Number.isFinite(state.turnScoreChanges[id]))) {
    fail('INVALID_STATE', 'initialState.turnScoreChanges must contain finite P1 and P2 values');
  }
  if (typeof state.pendingSettlement !== 'boolean') {
    fail('INVALID_STATE', 'initialState.pendingSettlement must be a boolean');
  }
  for (const field of ['actionStats', 'actionScores', 'stateStats', 'stateScores', 'passiveStats', 'passiveScores']) {
    if (!state[field] || !PLAYER_IDS.every(id => state[field][id] && typeof state[field][id] === 'object')) {
      fail('INVALID_STATE', `initialState.${field} must contain P1 and P2 records`);
    }
    for (const playerId of PLAYER_IDS) {
      for (const key of Object.keys(INITIAL_STATE_SCHEMA[field][playerId])) {
        if (!Number.isFinite(state[field][playerId][key])) {
          fail('INVALID_STATE', `initialState.${field}.${playerId}.${key} must be finite`);
        }
      }
    }
  }
  if (state.currentStem !== null && (typeof state.currentStem !== 'object' || Array.isArray(state.currentStem))) {
    fail('INVALID_STATE', 'initialState.currentStem must be a stem object or null');
  }
  if (state.lastAction !== null && (typeof state.lastAction !== 'object' || Array.isArray(state.lastAction))) {
    fail('INVALID_STATE', 'initialState.lastAction must be an action object or null');
  }
}

function validateStems(stems) {
  if (!Array.isArray(stems)) fail('INVALID_STEMS', 'stems must be an array');
  return stems.map((stem, index) => {
    if (!stem || typeof stem !== 'object') fail('INVALID_STEM', `stems[${index}] must be a stem object`);
    const canonical = STEMS_LIST.find(item => item.name === stem.name && item.element === stem.element);
    if (!canonical) fail('INVALID_STEM', `stems[${index}] is not a recognized heavenly stem`);
    return clone(canonical);
  });
}

function validateStrategies(strategies) {
  if (!strategies || typeof strategies !== 'object' || PLAYER_IDS.some(id => typeof strategies[id] !== 'function')) {
    fail('INVALID_STRATEGIES', 'strategies must provide synchronous P1 and P2 strategy functions');
  }
}

function sameValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, i) => key !== rightKeys[i])) return false;
  return leftKeys.every(key => sameValue(left[key], right[key]));
}

function takeStrategyAction(strategy, context, opportunity, playerId) {
  let selected;
  try {
    selected = strategy(context);
  } catch {
    fail('STRATEGY_FAILED', `strategy ${playerId} failed at opportunity ${opportunity}`);
  }
  try {
    if (selected && typeof selected.then === 'function') {
      fail('ASYNC_STRATEGY', `strategy ${playerId} returned a promise at opportunity ${opportunity}`);
    }
  } catch (error) {
    if (error instanceof HeadlessMatchError) throw error;
    fail('INVALID_ACTION', `strategy ${playerId} returned an invalid value at opportunity ${opportunity}`);
  }
  if (!context.candidates.some(candidate => sameValue(candidate, selected))) {
    fail('INVALID_ACTION', `strategy ${playerId} selected an action outside the candidate set at opportunity ${opportunity}`);
  }
  return clone(selected);
}

function executeAction(resolver, action, playerId, opponentId, stem) {
  switch (action.type) {
    case 'AUTO': {
      const isYang = STEMS_MAP[stem.element].yang === stem.name;
      resolver.applyPlus(playerId, stem.element, isYang, 'AUTO', false);
      return;
    }
    case 'CONVERT':
      resolver.applyPlus(action.target.playerId, action.target.elementIndex, action.target.isYang, 'CONVERT', false);
      return;
    case 'ATK':
      resolver.applyMinus(action.target.playerId, action.target.elementIndex, action.target.isYang, 'ATK', true);
      return;
    case 'TRANS':
      resolver.applyPlus(action.target.playerId, action.target.elementIndex, action.target.isYang, 'TRANS', false);
      return;
    case 'BURST':
      resolver.applyBurst(playerId, stem.element, action.targetEl);
      return;
    case 'BURST_ATK':
      resolver.applyBurstAtk(playerId, stem.element, opponentId, action.targetEl);
      return;
    default:
      fail('INVALID_ACTION', `unsupported action type ${String(action.type)}`);
  }
}

function snapshot(trajectory, opportunity, event, state) {
  trajectory.push({ opportunity, event, state: clone(state) });
}

/**
 * Create the complete formal GameState shape with an explicit headless burst marker.
 * Overrides are copied into the fresh state, including nested values.
 */
export function createInitialHeadlessState(overrides = {}) {
  return {
    ...createInitialGameState(),
    ...clone(overrides),
    pendingBurstPlayer: overrides.pendingBurstPlayer ?? null
  };
}

/**
 * Run a deterministic match using a complete initial game state and a fixed stem sequence.
 * Strategies are called synchronously in opportunity order and must return one of the
 * supplied candidates. AUTO and skipped opportunities do not invoke a strategy.
 *
 * @param {{ initialState: object, stems: object[], strategies: { P1: Function, P2: Function } }} input
 * @returns {{ trajectory: object[], actionRecords: object[], finalState: object, terminalResult: object, consumedStemCount: number }}
 * @throws {HeadlessMatchError} for invalid inputs, strategy failures, or exhausted stems
 */
export function runHeadlessMatch({ initialState, stems, strategies } = {}) {
  validateFullState(initialState);
  const stemSequence = validateStems(stems);
  validateStrategies(strategies);

  let isolatedInitialState;
  try {
    isolatedInitialState = clone(initialState);
  } catch {
    fail('INVALID_STATE', 'initialState must be structured-cloneable');
  }
  const stateManager = createScopedState(isolatedInitialState);
  const candidates = createActionCandidates(stateManager);
  const scoreCalculator = createScoreCalculator(stateManager);
  const resolver = createActionResolver(stateManager, scoreCalculator);
  const trajectory = [{ opportunity: 0, event: 'match-start', state: clone(stateManager.getState()) }];
  const actionRecords = [];
  let consumedStemCount = 0;
  let terminalResult = null;

  while (!terminalResult) {
    const state = stateManager.getState();
    const turnStart = decideTurnStart(state);
    stateManager.update({ turnCount: turnStart.turnCount });
    const opportunity = turnStart.turnCount;

    if (turnStart.terminal) {
      terminalResult = turnStart.terminal;
      stateManager.update({ phase: 'GAME_END' });
      snapshot(trajectory, opportunity, 'terminal', stateManager.getState());
      break;
    }

    if (turnStart.resetOpponentBurstBonus) {
      const opponent = stateManager.getState().players[turnStart.opponentId];
      stateManager.update({
        players: {
          ...stateManager.getState().players,
          [turnStart.opponentId]: { ...opponent, burstBonus: true }
        }
      });
    }
    stateManager.update({ pendingSettlement: false });

    if (consumedStemCount >= stemSequence.length) {
      fail('STEMS_EXHAUSTED', `stem sequence ended before opportunity ${opportunity}`);
    }
    const stem = stemSequence[consumedStemCount++];
    const playerId = stateManager.getState().currentPlayer;
    const opponentId = playerId === 'P1' ? 'P2' : 'P1';
    stateManager.update({ currentStem: clone(stem) });
    snapshot(trajectory, opportunity, 'turn-start', stateManager.getState());

    const node = stateManager.getNodeState(playerId, stem.element);
    const isYang = STEMS_MAP[stem.element].yang === stem.name;
    const currentSideValue = isYang ? node.yang : node.yin;
    let availableActions;
    let action;
    if (currentSideValue < 1) {
      action = { type: 'AUTO', executorId: playerId, playerId, stem: clone(stem), isYang };
      availableActions = [clone(action)];
    } else {
      availableActions = candidates.getAvailableActions(playerId, stem.element, isYang).actions;
      action = availableActions.length === 0
        ? { type: 'SKIP' }
        : takeStrategyAction(strategies[playerId], deepFreeze({
            playerId,
            stem: clone(stem),
            state: deepFreeze(clone(stateManager.getState())),
            candidates: deepFreeze(clone(availableActions))
          }), opportunity, playerId);
    }

    const stateChangesBefore = stateManager.takeStateChanges();
    const scoreChangesBefore = stateManager.takeScoreChanges();
    if (action.type !== 'SKIP') {
      executeAction(resolver, action, playerId, opponentId, stem);
    }
    const actionStateChanges = stateManager.takeStateChanges();
    const actionScoreChanges = stateManager.takeScoreChanges();
    stateChangesBefore.push(...actionStateChanges);
    scoreChangesBefore.push(...actionScoreChanges);

    let burstPlayer = stateManager.getState().pendingBurstPlayer;
    if (['BURST', 'BURST_ATK'].includes(action.type) && !stateManager.getState().isExtraTurn) {
      burstPlayer = playerId;
    }
    stateManager.update({ pendingBurstPlayer: burstPlayer });

    const passive = calculatePassiveEffects(stateManager.getState(), POINTS_CONFIG);
    for (const change of passive.scoreChanges) {
      stateManager.addScore(change.playerId, change.amount, change.reason, change.actionType);
    }
    const passiveScoreChanges = stateManager.takeScoreChanges();
    stateManager.update({ pendingSettlement: passive.scoreChanges.length > 0 });

    const next = calculateNextPlayer(
      playerId,
      stateManager.getState().isExtraTurn,
      stateManager.getState().pendingBurstPlayer
    );
    stateManager.update({
      currentPlayer: next.nextPlayer,
      isExtraTurn: next.nextIsExtraTurn,
      pendingBurstPlayer: next.pendingBurstPlayer,
      currentStem: null,
      turnScoreChanges: { P1: 0, P2: 0 }
    });

    actionRecords.push({
      opportunity,
      playerId,
      stem: clone(stem),
      candidates: clone(availableActions),
      action: clone(action),
      stateChanges: stateChangesBefore,
      scoreChanges: scoreChangesBefore,
      passiveScoreChanges
    });
    snapshot(trajectory, opportunity, 'opportunity-complete', stateManager.getState());
  }

  return {
    trajectory,
    actionRecords,
    finalState: clone(stateManager.getState()),
    terminalResult,
    consumedStemCount
  };
}

export default runHeadlessMatch;
