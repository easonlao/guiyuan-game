import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/js/network/SimplifiedPVPManager.js', () => ({
  default: { sendTurnSync: vi.fn() }
}));
vi.mock('../src/js/ui/effects/PassiveEffects.js', () => ({
  default: { playTurnSettlement: vi.fn().mockResolvedValue(), playFinalPenalty: vi.fn() }
}));

import EventBus from '../src/js/bus/EventBus.js';
import { POINTS_CONFIG } from '../src/js/config/game-config.js';
import { calculateNextPlayer, calculatePassiveEffects, decideTerminal } from '../src/js/logic/flow/TurnRules.js';
import { GAME_EVENTS } from '../src/js/types/events.js';
import AuthorityExecutor from '../src/js/logic/AuthorityExecutor.js';
import TurnManager from '../src/js/logic/flow/TurnManager.js';
import PassiveEffects from '../src/js/ui/effects/PassiveEffects.js';
import StateManager from '../src/js/state/StateManager.js';

const scoreChangeEvents = [];
const stateChangeEvents = [];
const collectScoreChange = (event) => scoreChangeEvents.push(event);
const collectStateChange = (event) => stateChangeEvents.push(event);

describe('current turn-flow baseline', () => {
  beforeEach(() => {
    StateManager.reset();
    AuthorityExecutor.reset();
    scoreChangeEvents.length = 0;
    stateChangeEvents.length = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(PassiveEffects, 'playTurnSettlement').mockResolvedValue();
    EventBus.on(GAME_EVENTS.SCORE_CHANGE, collectScoreChange);
    EventBus.on(GAME_EVENTS.STATE_CHANGED, collectStateChange);
  });

  afterEach(() => {
    TurnManager.cleanup();
    AuthorityExecutor.reset();
    EventBus.off(GAME_EVENTS.SCORE_CHANGE, collectScoreChange);
    EventBus.off(GAME_EVENTS.STATE_CHANGED, collectStateChange);
    vi.restoreAllMocks();
  });

  it('settles only the current PVP host player, dividends before damage penalties', async () => {
    StateManager.update({ gameMode: 0, currentPlayer: 'P1' });
    StateManager.updateNodeState('P1', 0, true, 2);
    StateManager.updateNodeState('P1', 0, false, 2);
    StateManager.updateNodeState('P1', 1, true, -1);
    StateManager.updateNodeState('P1', 1, false, -1);
    StateManager.updateNodeState('P2', 0, true, 2);
    StateManager.updateNodeState('P2', 0, false, 2);
    StateManager.updateNodeState('P2', 1, true, -1);
    StateManager.updateNodeState('P2', 1, false, -1);
    AuthorityExecutor.setAsHost();
    const sharedScoreChanges = calculatePassiveEffects(StateManager.getState(), POINTS_CONFIG).scoreChanges;

    const result = await TurnManager.endTurn();

    expect(result).toEqual({ success: true });
    expect(StateManager.getState().players.P1.score).toBe(10);
    expect(StateManager.getState().players.P2.score).toBe(0);
    expect(scoreChangeEvents.map(({ playerId, amount, reason }) => [playerId, amount, reason])).toEqual([
      ['P1', 50, '天道分红(1)'],
      ['P1', -40, '道损亏损(1)']
    ]);
    expect(scoreChangeEvents.map(({ playerId, amount, reason, totalScore }) => ({
      playerId,
      amount,
      reason,
      actionType: reason.startsWith('天道分红') ? 'DIVIDEND' : 'DAMAGE_PENALTY'
    }))).toEqual(sharedScoreChanges);
  });

  it('sets pending settlement silently before animation and applies scores after it resolves', async () => {
    StateManager.update({ gameMode: 0, currentPlayer: 'P1' });
    StateManager.updateNodeState('P1', 0, true, 2);
    StateManager.updateNodeState('P1', 0, false, 2);
    AuthorityExecutor.setAsHost();
    stateChangeEvents.length = 0;
    scoreChangeEvents.length = 0;

    let finishAnimation;
    PassiveEffects.playTurnSettlement.mockImplementationOnce(() => new Promise((resolve) => {
      finishAnimation = resolve;
    }));
    const completion = TurnManager.endTurn();

    expect(StateManager.getState().pendingSettlement).toBe(true);
    expect(StateManager.getState().players.P1.score).toBe(0);
    expect(scoreChangeEvents).toEqual([]);
    expect(stateChangeEvents.some(({ updates }) => updates?.pendingSettlement !== undefined)).toBe(false);

    finishAnimation();
    await completion;

    expect(StateManager.getState().players.P1.score).toBe(50);
    expect(scoreChangeEvents.map(({ amount }) => amount)).toEqual([50]);
  });

  it('leaves passive settlement to the PVP host on the client end-turn path', async () => {
    StateManager.update({ gameMode: 0, currentPlayer: 'P1' });
    StateManager.updateNodeState('P1', 0, true, 2);
    StateManager.updateNodeState('P1', 0, false, 2);

    const result = await TurnManager.endTurn();

    expect(result).toEqual({ success: true });
    expect(StateManager.getState().players.P1.score).toBe(0);
    expect(scoreChangeEvents).toEqual([]);
  });

  it('does not passively settle the single-player end-turn path', async () => {
    StateManager.updateNodeState('P1', 0, true, 2);
    StateManager.updateNodeState('P1', 0, false, 2);

    const result = await TurnManager.endTurn();

    expect(result).toEqual({ success: true });
    expect(StateManager.getState().players.P1.score).toBe(0);
    expect(scoreChangeEvents).toEqual([]);
  });

  it('grants one extra opportunity and preserves a stale marker on an already-extra turn', () => {
    AuthorityExecutor.setLastBurstAction('P1');
    const sharedExtraDecision = calculateNextPlayer('P1', false, 'P1');

    expect(AuthorityExecutor.calculateNextPlayer('P1', false)).toEqual({
      nextPlayer: sharedExtraDecision.nextPlayer,
      nextIsExtraTurn: sharedExtraDecision.nextIsExtraTurn
    });
    expect(AuthorityExecutor.calculateNextPlayer('P1', true)).toEqual({
      nextPlayer: 'P2',
      nextIsExtraTurn: false
    });
    expect(AuthorityExecutor.calculateNextPlayer('P2', false)).toEqual({
      nextPlayer: 'P1',
      nextIsExtraTurn: false
    });

    AuthorityExecutor.setLastBurstAction('P1');
    expect(AuthorityExecutor.calculateNextPlayer('P1', true)).toEqual({
      nextPlayer: 'P2',
      nextIsExtraTurn: false
    });
    expect(AuthorityExecutor.calculateNextPlayer('P2', false)).toEqual({
      nextPlayer: 'P1',
      nextIsExtraTurn: false
    });
    expect(AuthorityExecutor.calculateNextPlayer('P1', false)).toEqual({
      nextPlayer: 'P1',
      nextIsExtraTurn: true
    });
  });

  it('increments before the turn limit, runs opportunities 1 through 59 at maxTurns 60, and applies no final damage penalty', async () => {
    const stemEvents = [];
    const victories = [];
    const onStem = () => stemEvents.push(StateManager.getState().turnCount);
    const onVictory = (event) => victories.push(event);
    const onTurnLimit = () => queueMicrotask(() => EventBus.emit('achievement:overlay-hidden'));
    EventBus.on('game:generate-stem', onStem);
    EventBus.on(GAME_EVENTS.VICTORY, onVictory);
    EventBus.on('achievement:show-turn-limit', onTurnLimit);

    StateManager.update({
      maxTurns: 60,
      players: {
        P1: { ...StateManager.getState().players.P1, score: 100 },
        P2: { ...StateManager.getState().players.P2, score: 100, burstBonus: false }
      }
    });
    for (const playerId of ['P1', 'P2']) {
      StateManager.updateNodeState(playerId, 0, true, -1);
      StateManager.updateNodeState(playerId, 0, false, -1);
    }

    const sharedTerminalDecision = decideTerminal({
      ...StateManager.getState(),
      turnCount: 60
    });

    try {
      for (let opportunity = 1; opportunity <= 60; opportunity++) {
        await TurnManager.startTurn();
        if (opportunity === 1) expect(StateManager.getState().players.P2.burstBonus).toBe(true);
        if (opportunity < 60) await new Promise((resolve) => setTimeout(resolve, 0));
      }

      expect(stemEvents).toEqual(Array.from({ length: 59 }, (_, index) => index + 1));
      expect(StateManager.getState().turnCount).toBe(60);
      expect(victories).toEqual([sharedTerminalDecision]);
      expect(StateManager.getState().players.P1.score).toBe(100);
      expect(StateManager.getState().players.P2.score).toBe(100);
      expect(scoreChangeEvents).toEqual([]);
    } finally {
      EventBus.off('game:generate-stem', onStem);
      EventBus.off(GAME_EVENTS.VICTORY, onVictory);
      EventBus.off('achievement:show-turn-limit', onTurnLimit);
    }
  });

  it('checks P1 full-light victory before the turn-limit score decision', async () => {
    const victories = [];
    const onVictory = (event) => victories.push(event);
    const onFullUnity = () => queueMicrotask(() => EventBus.emit('achievement:overlay-hidden'));
    EventBus.on(GAME_EVENTS.VICTORY, onVictory);
    EventBus.on('achievement:show-full-unity', onFullUnity);
    StateManager.update({
      turnCount: 59,
      maxTurns: 60,
      players: {
        ...StateManager.getState().players,
        P2: { ...StateManager.getState().players.P2, burstBonus: false }
      }
    });
    for (let element = 0; element < 5; element++) {
      StateManager.updateNodeState('P1', element, true, 1);
      StateManager.updateNodeState('P1', element, false, 1);
    }

    const sharedTerminalDecision = decideTerminal({
      ...StateManager.getState(),
      turnCount: 60
    });

    try {
      await TurnManager.startTurn();

      expect(StateManager.getState().turnCount).toBe(60);
      expect(StateManager.getState().players.P2.burstBonus).toBe(false);
      expect(victories).toEqual([sharedTerminalDecision]);
    } finally {
      EventBus.off(GAME_EVENTS.VICTORY, onVictory);
      EventBus.off('achievement:show-full-unity', onFullUnity);
    }
  });
});
