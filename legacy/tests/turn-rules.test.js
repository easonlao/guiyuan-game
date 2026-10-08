import { describe, expect, it } from 'vitest';
import { POINTS_CONFIG } from '../src/js/config/game-config.js';
import {
  calculateNextPlayer,
  calculatePassiveEffects,
  decideTerminal,
  decideTurnStart
} from '../src/js/logic/flow/TurnRules.js';

function emptyState() {
  const nodeStates = {};
  for (const playerId of ['P1', 'P2']) {
    for (let element = 0; element < 5; element++) {
      nodeStates[`${playerId}-${element}`] = { yang: 0, yin: 0 };
    }
  }
  return {
    currentPlayer: 'P1',
    turnCount: 0,
    maxTurns: 60,
    players: {
      P1: { score: 0, burstBonus: true },
      P2: { score: 0, burstBonus: true }
    },
    nodeStates
  };
}

describe('shared pure turn rules', () => {
  it('calculates passive counts for only the current player and orders dividend before penalty', () => {
    const state = emptyState();
    state.currentPlayer = 'P2';
    state.nodeStates['P2-0'] = { yang: 2, yin: 2 };
    state.nodeStates['P2-1'] = { yang: 2, yin: 2 };
    state.nodeStates['P2-2'] = { yang: -1, yin: -1 };
    state.nodeStates['P1-0'] = { yang: 2, yin: 2 };
    state.nodeStates['P1-1'] = { yang: -1, yin: -1 };

    expect(calculatePassiveEffects(state, POINTS_CONFIG)).toEqual({
      playerId: 'P2',
      unityCount: 2,
      damageCount: 1,
      scoreChanges: [
        {
          playerId: 'P2',
          amount: 100,
          reason: '天道分红(2)',
          actionType: 'DIVIDEND'
        },
        {
          playerId: 'P2',
          amount: -40,
          reason: '道损亏损(1)',
          actionType: 'DAMAGE_PENALTY'
        }
      ]
    });
  });

  it('counts damage only when both sides of a node are damaged', () => {
    const state = emptyState();
    state.nodeStates['P1-0'] = { yang: -1, yin: 0 };
    state.nodeStates['P1-1'] = { yang: 0, yin: -1 };
    state.nodeStates['P1-2'] = { yang: -1, yin: -1 };

    expect(calculatePassiveEffects(state, POINTS_CONFIG)).toEqual({
      playerId: 'P1',
      unityCount: 0,
      damageCount: 1,
      scoreChanges: [{
        playerId: 'P1',
        amount: -40,
        reason: '道损亏损(1)',
        actionType: 'DAMAGE_PENALTY'
      }]
    });
  });

  it('returns no passive records when the current player has neither eligible node state', () => {
    const state = emptyState();
    expect(calculatePassiveEffects(state, POINTS_CONFIG)).toEqual({
      playerId: 'P1',
      unityCount: 0,
      damageCount: 0,
      scoreChanges: []
    });
  });

  it('decides ordinary rotation, one burst opportunity, and burst use during that opportunity', () => {
    expect(calculateNextPlayer('P1', false, null)).toEqual({
      nextPlayer: 'P2',
      nextIsExtraTurn: false,
      pendingBurstPlayer: null
    });
    expect(calculateNextPlayer('P1', false, 'P1')).toEqual({
      nextPlayer: 'P1',
      nextIsExtraTurn: true,
      pendingBurstPlayer: null
    });
    expect(calculateNextPlayer('P1', true, null)).toEqual({
      nextPlayer: 'P2',
      nextIsExtraTurn: false,
      pendingBurstPlayer: null
    });
  });

  it('preserves a pending marker when an already-extra turn rotates', () => {
    expect(calculateNextPlayer('P1', true, 'P1')).toEqual({
      nextPlayer: 'P2',
      nextIsExtraTurn: false,
      pendingBurstPlayer: 'P1'
    });
  });

  it('returns no terminal decision before the limit and P1-first full-light victory at the limit', () => {
    const state = emptyState();
    state.turnCount = 59;
    state.maxTurns = 60;
    for (const playerId of ['P1', 'P2']) {
      for (let element = 0; element < 5; element++) {
        state.nodeStates[`${playerId}-${element}`] = { yang: 1, yin: 1 };
      }
    }

    expect(decideTerminal({ ...emptyState(), turnCount: 59 })).toBeNull();
    expect(decideTerminal(state)).toEqual({ winner: 'P1', reason: '所有天干点亮' });
  });

  it.each([
    [150, 100, { winner: 'P1', reason: '回合上限' }],
    [100, 150, { winner: 'P2', reason: '回合上限' }],
    [100, 100, { winner: 'DRAW', reason: '回合上限' }]
  ])('decides turn-limit result from scores %i and %i', (p1Score, p2Score, expected) => {
    const state = emptyState();
    state.turnCount = 60;
    state.maxTurns = 60;
    state.players.P1.score = p1Score;
    state.players.P2.score = p2Score;

    expect(decideTerminal(state)).toEqual(expected);
  });

  it('increments before checking terminal state and skips opponent reset on the terminal turn', () => {
    const state = emptyState();
    state.turnCount = 59;
    state.maxTurns = 60;
    state.players.P2.burstBonus = false;

    expect(decideTurnStart(state)).toEqual({
      turnCount: 60,
      terminal: { winner: 'DRAW', reason: '回合上限' },
      opponentId: 'P2',
      resetOpponentBurstBonus: false
    });
  });

  it('requests an opponent burst reset only for a nonterminal turn', () => {
    const state = emptyState();
    state.players.P2.burstBonus = false;

    expect(decideTurnStart(state)).toEqual({
      turnCount: 1,
      terminal: null,
      opponentId: 'P2',
      resetOpponentBurstBonus: true
    });
  });
});
