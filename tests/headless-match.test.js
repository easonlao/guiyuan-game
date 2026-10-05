import { describe, expect, it } from 'vitest';
import EventBus from '../src/js/bus/EventBus.js';
import StateManager from '../src/js/state/StateManager.js';
import { GAME_EVENTS } from '../src/js/types/events.js';
import { createInitialHeadlessState, HeadlessMatchError, runHeadlessMatch } from '../src/js/logic/headless/HeadlessMatch.js';

describe('headless match public API', () => {
  it('runs an isolated forced AUTO opportunity and stops before consuming a terminal stem', () => {
    const initialState = createInitialHeadlessState({ maxTurns: 2 });
    const formalStateBefore = StateManager.getState();
    let strategyCalls = 0;
    let stateEvents = 0;
    const onStateChanged = () => { stateEvents++; };
    EventBus.on(GAME_EVENTS.STATE_CHANGED, onStateChanged);

    const result = runHeadlessMatch({
      initialState,
      stems: [
        { name: '甲', element: 0 },
        { name: '乙', element: 0 }
      ],
      strategies: {
        P1: () => { strategyCalls++; throw new Error('AUTO must be forced'); },
        P2: () => { strategyCalls++; throw new Error('terminal opportunity has no decision'); }
      }
    });

    expect(result.terminalResult).toEqual({ winner: 'P1', reason: '回合上限' });
    expect(result.consumedStemCount).toBe(1);
    expect(result.actionRecords).toHaveLength(1);
    expect(result.actionRecords[0]).toMatchObject({
      playerId: 'P1',
      stem: { name: '甲', element: 0 },
      action: { type: 'AUTO' },
      stateChanges: [{ playerId: 'P1', elementIndex: 0, side: 'yang', before: 0, after: 1 }],
      scoreChanges: [{ playerId: 'P1', amount: 100 }]
    });
    expect(result.finalState.players.P1.score).toBe(100);
    expect(result.trajectory.at(-1).state).toEqual(result.finalState);
    expect(strategyCalls).toBe(0);
    expect(stateEvents).toBe(0);
    EventBus.off(GAME_EVENTS.STATE_CHANGED, onStateChanged);
    expect(initialState.players.P1.score).toBe(0);
    expect(initialState.nodeStates['P1-0']).toEqual({ yang: 0, yin: 0 });
    expect(StateManager.getState()).toEqual(formalStateBefore);
  });

  it('offers only real candidates to a strategy and resolves the selected candidate with shared scoring', () => {
    const initialState = createInitialHeadlessState({
      maxTurns: 2,
      nodeStates: {
        ...createInitialHeadlessState().nodeStates,
        'P1-0': { yang: 1, yin: 0 }
      }
    });
    let strategyContext;

    const result = runHeadlessMatch({
      initialState,
      stems: [{ name: '甲', element: 0 }, { name: '乙', element: 0 }],
      strategies: {
        P1: context => {
          strategyContext = context;
          return context.candidates.find(candidate => candidate.type === 'CONVERT');
        },
        P2: () => null
      }
    });

    expect(strategyContext.candidates.map(candidate => candidate.type)).toContain('CONVERT');
    expect(Object.isFrozen(strategyContext.state)).toBe(true);
    expect(result.actionRecords[0].action).toEqual(result.actionRecords[0].candidates.find(candidate => candidate.type === 'CONVERT'));
    expect(result.actionRecords[0].stateChanges).toEqual([
      { playerId: 'P1', elementIndex: 0, side: 'yin', before: 0, after: 1 }
    ]);
    expect(result.actionRecords[0].scoreChanges).toEqual([
      { playerId: 'P1', amount: 337, reason: '调息·点亮', actionType: 'CONVERT' }
    ]);
    expect(result.finalState.nodeStates['P1-0']).toEqual({ yang: 1, yin: 1 });
    expect(result.finalState.actionStats.P1['调息']).toBe(1);
    expect(result.finalState.stateStats.P1['点亮']).toBe(1);
  });

  it('records skipped opportunities and preserves stale burst state through an already-extra opportunity', () => {
    const base = createInitialHeadlessState({ maxTurns: 4, isExtraTurn: true, pendingBurstPlayer: 'P1' });
    const initialState = {
      ...base,
      nodeStates: {
        ...base.nodeStates,
        'P1-0': { yang: 1, yin: 2 },
        'P2-0': { yang: 1, yin: 2 },
        'P1-2': { yang: -1, yin: -1 },
        'P2-2': { yang: -1, yin: -1 }
      }
    };
    let strategyCalls = 0;
    const result = runHeadlessMatch({
      initialState,
      stems: [
        { name: '甲', element: 0 },
        { name: '甲', element: 0 },
        { name: '甲', element: 0 },
        { name: '乙', element: 0 }
      ],
      strategies: {
        P1: () => { strategyCalls++; return null; },
        P2: () => { strategyCalls++; return null; }
      }
    });

    expect(result.actionRecords.map(record => record.playerId)).toEqual(['P1', 'P2', 'P1']);
    expect(result.actionRecords.map(record => record.action.type)).toEqual(['SKIP', 'SKIP', 'SKIP']);
    expect(result.trajectory.filter(entry => entry.event === 'opportunity-complete').map(entry => ({
      currentPlayer: entry.state.currentPlayer,
      isExtraTurn: entry.state.isExtraTurn,
      pendingBurstPlayer: entry.state.pendingBurstPlayer
    }))).toEqual([
      { currentPlayer: 'P2', isExtraTurn: false, pendingBurstPlayer: 'P1' },
      { currentPlayer: 'P1', isExtraTurn: false, pendingBurstPlayer: 'P1' },
      { currentPlayer: 'P1', isExtraTurn: true, pendingBurstPlayer: null }
    ]);
    expect(result.consumedStemCount).toBe(3);
    expect(strategyCalls).toBe(0);
  });

  it('consumes one stem for each actual opportunity, including a burst-granted extra opportunity', () => {
    const base = createInitialHeadlessState({ maxTurns: 3 });
    const initialState = {
      ...base,
      nodeStates: { ...base.nodeStates, 'P1-0': { yang: 1, yin: 1 } }
    };
    const strategyCalls = [];

    const result = runHeadlessMatch({
      initialState,
      stems: [
        { name: '甲', element: 0 },
        { name: '甲', element: 0 },
        { name: '丙', element: 1 }
      ],
      strategies: {
        P1: context => {
          strategyCalls.push(context.stem.name);
          return context.candidates.find(candidate => candidate.type === 'BURST') ?? context.candidates[0];
        },
        P2: () => null
      }
    });

    expect(result.actionRecords.map(record => record.playerId)).toEqual(['P1', 'P1']);
    expect(result.actionRecords[0].action.type).toBe('BURST');
    expect(result.actionRecords[0].stateChanges).toHaveLength(3);
    expect(result.actionRecords[0].stateChanges.map(change => change.after)).toEqual([0, 1, 2]);
    expect(result.actionRecords[0].scoreChanges.map(change => change.amount)).toEqual([392, 490, 734]);
    expect(result.trajectory.find(entry => entry.event === 'opportunity-complete').state).toMatchObject({
      currentPlayer: 'P1', isExtraTurn: true, pendingBurstPlayer: null
    });
    expect(result.consumedStemCount).toBe(2);
    expect(strategyCalls).toEqual(['甲', '甲']);
  });

  it('resolves TRANS and BURST_ATK through the shared candidate and action rules', () => {
    const base = createInitialHeadlessState({ maxTurns: 2 });
    const transState = {
      ...base,
      nodeStates: { ...base.nodeStates, 'P1-0': { yang: 0, yin: 1 } }
    };
    const transResult = runHeadlessMatch({
      initialState: transState,
      stems: [{ name: '乙', element: 0 }, { name: '甲', element: 0 }],
      strategies: {
        P1: context => context.candidates.find(candidate => candidate.type === 'TRANS'),
        P2: () => null
      }
    });
    expect(transResult.actionRecords[0].action.type).toBe('TRANS');
    expect(transResult.actionRecords[0].stateChanges).toEqual([
      { playerId: 'P1', elementIndex: 1, side: 'yin', before: 0, after: 1 }
    ]);
    expect(transResult.actionRecords[0].scoreChanges[0]).toMatchObject({ amount: 278, actionType: 'TRANS' });

    const burstAtkState = {
      ...base,
      nodeStates: { ...base.nodeStates, 'P1-0': { yang: 1, yin: 1 } }
    };
    const burstAtkResult = runHeadlessMatch({
      initialState: burstAtkState,
      stems: [{ name: '甲', element: 0 }, { name: '乙', element: 0 }],
      strategies: {
        P1: context => context.candidates.find(candidate => candidate.type === 'BURST_ATK'),
        P2: () => null
      }
    });
    expect(burstAtkResult.actionRecords[0].action.type).toBe('BURST_ATK');
    expect(burstAtkResult.actionRecords[0].stateChanges).toEqual([
      { playerId: 'P1', elementIndex: 0, side: 'yang', before: 1, after: 0 },
      { playerId: 'P2', elementIndex: 2, side: 'yin', before: 0, after: -1 },
      { playerId: 'P2', elementIndex: 2, side: 'yang', before: 0, after: -1 }
    ]);
    expect(burstAtkResult.actionRecords[0].scoreChanges.map(change => change.amount)).toEqual([391, 440, 489]);
  });

  it('uses host passive settlement for the current player only after the action', () => {
    const base = createInitialHeadlessState({ maxTurns: 2 });
    const initialState = {
      ...base,
      nodeStates: {
        ...base.nodeStates,
        'P1-0': { yang: 2, yin: 2 },
        'P2-0': { yang: 2, yin: 2 }
      }
    };
    const result = runHeadlessMatch({
      initialState,
      stems: [{ name: '甲', element: 0 }, { name: '乙', element: 0 }],
      strategies: {
        P1: context => context.candidates.find(candidate => candidate.type === 'ATK'),
        P2: () => null
      }
    });

    expect(result.actionRecords[0].passiveScoreChanges).toEqual([{
      playerId: 'P1', amount: 50, reason: '天道分红(1)', actionType: 'DIVIDEND'
    }]);
    expect(result.actionRecords[0].scoreChanges).toEqual([{
      playerId: 'P1', amount: 241, reason: '破·致阴道损', actionType: 'ATK'
    }]);
    expect(result.finalState.players.P1.score).toBe(291);
    expect(result.finalState.players.P2.score).toBe(0);
  });

  it('keeps branched evaluations independent when they share one input state', () => {
    const base = createInitialHeadlessState({ maxTurns: 3 });
    const initialState = {
      ...base,
      nodeStates: { ...base.nodeStates, 'P1-0': { yang: 1, yin: 0 } }
    };
    const stems = [
      { name: '甲', element: 0 },
      { name: '乙', element: 0 }
    ];
    const evaluate = choose => runHeadlessMatch({
      initialState,
      stems,
      strategies: {
        P1: context => context.candidates.find(candidate => candidate.type === choose),
        P2: () => null
      }
    });

    const convertBranch = evaluate('CONVERT');
    const attackBranch = evaluate('ATK');

    expect(convertBranch.actionRecords[0].action.type).toBe('CONVERT');
    expect(attackBranch.actionRecords[0].action.type).toBe('ATK');
    expect(convertBranch.finalState.nodeStates['P1-0']).toEqual({ yang: 1, yin: 1 });
    expect(attackBranch.finalState.nodeStates['P1-0']).toEqual({ yang: 1, yin: 0 });
    expect(initialState.nodeStates['P1-0']).toEqual({ yang: 1, yin: 0 });
    expect(stems).toHaveLength(2);
  });

  it('checks full-light victory before the turn limit without consuming a stem', () => {
    const base = createInitialHeadlessState({ maxTurns: 1 });
    const nodeStates = { ...base.nodeStates };
    for (const playerId of ['P1', 'P2']) {
      for (let element = 0; element < 5; element++) {
        nodeStates[`${playerId}-${element}`] = { yang: 1, yin: 1 };
      }
    }
    const result = runHeadlessMatch({
      initialState: { ...base, nodeStates },
      stems: [],
      strategies: { P1: () => null, P2: () => null }
    });

    expect(result.terminalResult).toEqual({ winner: 'P1', reason: '所有天干点亮' });
    expect(result.consumedStemCount).toBe(0);
    expect(result.actionRecords).toEqual([]);
  });

  it.each([
    [150, 100, 'P1'],
    [100, 150, 'P2'],
    [100, 100, 'DRAW']
  ])('returns the turn-limit result for scores %i and %i', (p1Score, p2Score, winner) => {
    const base = createInitialHeadlessState({ maxTurns: 1 });
    const initialState = {
      ...base,
      players: {
        ...base.players,
        P1: { ...base.players.P1, score: p1Score },
        P2: { ...base.players.P2, score: p2Score }
      }
    };
    const result = runHeadlessMatch({
      initialState,
      stems: [],
      strategies: { P1: () => null, P2: () => null }
    });

    expect(result.terminalResult).toEqual({ winner, reason: '回合上限' });
    expect(result.consumedStemCount).toBe(0);
  });

  it('reports stable errors for an exhausted stem sequence, asynchronous strategy, and strategy failure', () => {
    const base = createInitialHeadlessState({ maxTurns: 3 });
    const forcedInput = {
      initialState: base,
      stems: [{ name: '甲', element: 0 }],
      strategies: { P1: () => null, P2: () => null }
    };
    let exhausted;
    try {
      runHeadlessMatch(forcedInput);
    } catch (error) {
      exhausted = error;
    }
    expect(exhausted).toBeInstanceOf(HeadlessMatchError);
    expect(exhausted).toMatchObject({
      code: 'STEMS_EXHAUSTED',
      message: 'stem sequence ended before opportunity 2'
    });

    const decisionState = {
      ...base,
      nodeStates: { ...base.nodeStates, 'P1-0': { yang: 1, yin: 0 } }
    };
    const decisionInput = {
      initialState: decisionState,
      stems: [{ name: '甲', element: 0 }],
      strategies: { P1: context => Promise.resolve(context.candidates[0]), P2: () => null }
    };
    let asynchronous;
    try {
      runHeadlessMatch(decisionInput);
    } catch (error) {
      asynchronous = error;
    }
    expect(asynchronous).toMatchObject({
      code: 'ASYNC_STRATEGY',
      message: 'strategy P1 returned a promise at opportunity 1'
    });

    const failedInput = {
      ...decisionInput,
      strategies: { P1: () => { throw new Error('implementation detail'); }, P2: () => null }
    };
    const failureMessages = [];
    for (let run = 0; run < 2; run++) {
      try {
        runHeadlessMatch(failedInput);
      } catch (error) {
        failureMessages.push(error.message);
        expect(error.code).toBe('STRATEGY_FAILED');
      }
    }
    expect(failureMessages).toEqual([
      'strategy P1 failed at opportunity 1',
      'strategy P1 failed at opportunity 1'
    ]);
  });

  it('rejects incomplete rule state and strategy choices outside the candidate set with stable errors', () => {
    const initialState = createInitialHeadlessState({ maxTurns: 2 });
    const validInput = {
      initialState,
      stems: [{ name: '甲', element: 0 }, { name: '乙', element: 0 }],
      strategies: { P1: () => null, P2: () => null }
    };

    expect(() => runHeadlessMatch({
      ...validInput,
      initialState: { ...initialState, pendingBurstPlayer: undefined }
    })).toThrow(expect.objectContaining({
      name: 'HeadlessMatchError',
      code: 'INVALID_STATE',
      message: 'initialState.pendingBurstPlayer is required'
    }));
    expect(() => runHeadlessMatch({
      ...validInput,
      initialState: {
        ...initialState,
        nodeStates: Object.fromEntries(Object.entries(initialState.nodeStates).filter(([key]) => key !== 'P2-4'))
      }
    })).toThrow(expect.objectContaining({
      code: 'INVALID_STATE',
      message: 'initialState.nodeStates.P2-4 is required'
    }));
    expect(() => runHeadlessMatch({
      ...validInput,
      initialState: {
        ...initialState,
        passiveStats: { ...initialState.passiveStats, P1: {} }
      }
    })).toThrow(expect.objectContaining({
      code: 'INVALID_STATE',
      message: 'initialState.passiveStats.P1.天道分红 must be finite'
    }));

    const decisionState = createInitialHeadlessState({
      maxTurns: 2,
      nodeStates: {
        ...initialState.nodeStates,
        'P1-0': { yang: 1, yin: 0 }
      }
    });
    expect(() => runHeadlessMatch({
      ...validInput,
      initialState: decisionState,
      strategies: { P1: () => ({ type: 'BURST' }), P2: () => null }
    })).toThrow(expect.objectContaining({
      name: 'HeadlessMatchError',
      code: 'INVALID_ACTION',
      message: 'strategy P1 selected an action outside the candidate set at opportunity 1'
    }));
  });
});
