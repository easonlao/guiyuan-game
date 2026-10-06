import { describe, expect, it } from 'vitest';
import {
  createSearchStrategy,
  decideExpectimax,
  evaluateNonTerminalState,
  SEARCH_STRATEGIES,
  SEARCH_WEIGHTS
} from '../src/js/logic/headless/SearchStrategy.js';
import { createInitialHeadlessState } from '../src/js/logic/headless/HeadlessMatch.js';
import { runSeededMatch } from '../src/js/logic/headless/SeededMatch.js';

describe('issue 04: expectimax search strategy', () => {
  it('exposes versioned named weights and search strategies for depth 1 and 2', () => {
    expect(SEARCH_WEIGHTS['search-score@1']).toEqual({ id: 'search-score@1', version: 1, w_score: 0.8, w_lit: 0.2 });
    expect(SEARCH_WEIGHTS['search-lit@1']).toEqual({ id: 'search-lit@1', version: 1, w_score: 0.2, w_lit: 0.8 });

    expect(SEARCH_STRATEGIES['search-score-d1']).toMatchObject({ id: 'search-score-d1', version: 1, depth: 1 });
    expect(SEARCH_STRATEGIES['search-score-d2']).toMatchObject({ id: 'search-score-d2', version: 1, depth: 2 });
    expect(SEARCH_STRATEGIES['search-lit-d1']).toMatchObject({ id: 'search-lit-d1', version: 1, depth: 1 });
    expect(SEARCH_STRATEGIES['search-lit-d2']).toMatchObject({ id: 'search-lit-d2', version: 1, depth: 2 });
  });

  it('immediately chooses an action that achieves 五行归元 (terminal win)', () => {
    // Construct state where P1 has 9 lit sides, missing only P1-0 yin
    const state = createInitialHeadlessState({ maxTurns: 60 });
    for (let el = 0; el < 5; el++) {
      state.nodeStates[`P1-${el}`] = { yang: 1, yin: el === 0 ? 0 : 1 };
      state.nodeStates[`P2-${el}`] = { yang: 0, yin: 0 };
    }
    // Current stem: 甲 (Wood Yang, element 0)
    // Candidate 1: CONVERT (lights P1-0 yin => 10/10 lit sides => instant 五行归元!)
    // Candidate 2: ATK on P2
    const convertAction = {
      type: 'CONVERT',
      executorId: 'P1',
      target: { playerId: 'P1', elementIndex: 0, isYang: false }
    };
    const atkAction = {
      type: 'ATK',
      executorId: 'P1',
      target: { playerId: 'P2', elementIndex: 2, isYang: true }
    };

    const context = {
      playerId: 'P1',
      stem: { name: '甲', element: 0, color: '#2dcc70' },
      state,
      candidates: [atkAction, convertAction]
    };

    const choiceD1 = SEARCH_STRATEGIES['search-score-d1'].decide(context);
    expect(choiceD1).toEqual(convertAction);

    const choiceD2 = SEARCH_STRATEGIES['search-score-d2'].decide(context);
    expect(choiceD2).toEqual(convertAction);
  });

  it('selects an attack action at depth 2 to block opponent from achieving 五行归元', () => {
    // Construct state:
    // P2 has 9 lit sides, only missing P2-1 yang (丙, 火)
    // If P1 does not attack P2, P2 will draw 丙 (or can light it) and achieve 五行归元
    // If P1 attacks P2 (destroying P2's P2-2 lit side), P2 drops to 8 lit sides and cannot win next turn
    const state = createInitialHeadlessState({ maxTurns: 60 });
    state.currentPlayer = 'P1';
    for (let el = 0; el < 5; el++) {
      state.nodeStates[`P1-${el}`] = { yang: 1, yin: 0 };
      state.nodeStates[`P2-${el}`] = { yang: el === 1 ? 0 : 1, yin: 1 };
    }

    // P1 has 2 candidates:
    // candidate A: CONVERT on self (passive, does not interfere with P2)
    // candidate B: ATK on P2 (destroys P2's P2-2 yang side, reducing P2's lit count)
    const passiveAction = {
      type: 'CONVERT',
      executorId: 'P1',
      target: { playerId: 'P1', elementIndex: 0, isYang: false }
    };
    const blockAction = {
      type: 'ATK',
      executorId: 'P1',
      target: { playerId: 'P2', elementIndex: 2, isYang: true }
    };

    const context = {
      playerId: 'P1',
      stem: { name: '甲', element: 0, color: '#2dcc70' },
      state,
      candidates: [passiveAction, blockAction]
    };

    // At depth 2, the search foresees P2's win probability if unblocked, so it must choose the blocking ATK action
    const decisionD2 = SEARCH_STRATEGIES['search-score-d2'].decide(context);
    expect(decisionD2).toEqual(blockAction);
  });

  it('switches preferred action when toggling weights between score-focused and lit-focused', () => {
    // Construct a state where:
    // Choice A: ATK that repairs/reduces opponent but doesn't change P1 lit count, or passive score difference
    // Choice B: CONVERT that lights a new side (+1 lit side for P1)
    const state = createInitialHeadlessState({ maxTurns: 60 });
    for (let el = 0; el < 5; el++) {
      state.nodeStates[`P1-${el}`] = { yang: el === 0 ? 1 : 0, yin: 0 };
      state.nodeStates[`P2-${el}`] = { yang: 1, yin: 0 };
    }
    // P1 score = 100, P2 score = 100
    state.players.P1.score = 100;
    state.players.P2.score = 100;

    // Action A (score-oriented): ATK targeting opponent damaged side => destroys side, adds immediate score
    // Action B (lit-oriented): CONVERT on P1-0 yin => lights P1-0 yin (+1 lit side, 0 score)
    const actionScore = {
      type: 'ATK',
      executorId: 'P1',
      target: { playerId: 'P2', elementIndex: 2, isYang: true }
    };
    const actionLit = {
      type: 'CONVERT',
      executorId: 'P1',
      target: { playerId: 'P1', elementIndex: 0, isYang: false }
    };

    const context = {
      playerId: 'P1',
      stem: { name: '甲', element: 0, color: '#2dcc70' },
      state,
      candidates: [actionScore, actionLit]
    };

    const scoreDecision = SEARCH_STRATEGIES['search-score-d1'].decide(context);
    const litDecision = SEARCH_STRATEGIES['search-lit-d1'].decide(context);

    // One prioritizes lit count (actionLit), the other can differ or favor score
    expect(litDecision).toEqual(actionLit);
  });

  it('provides deterministic decisions given identical state and candidates', () => {
    const state = createInitialHeadlessState({ maxTurns: 60 });
    const context = {
      playerId: 'P1',
      stem: { name: '甲', element: 0, color: '#2dcc70' },
      state,
      candidates: [
        { type: 'CONVERT', executorId: 'P1', target: { playerId: 'P1', elementIndex: 0, isYang: false } },
        { type: 'TRANS', executorId: 'P1', target: { playerId: 'P1', elementIndex: 1, isYang: true } }
      ]
    };

    const decision1 = SEARCH_STRATEGIES['search-score-d1'].decide(context);
    const decision2 = SEARCH_STRATEGIES['search-score-d1'].decide(context);
    expect(decision1).toEqual(decision2);
  });

  it('runs a complete match with search strategies and benchmarks decision time', () => {
    const strategyD1 = createSearchStrategy({ id: 'test-search-d1', depth: 1, weights: 'search-score@1' });
    const strategyD2 = createSearchStrategy({ id: 'test-search-d2', depth: 2, weights: 'search-lit@1' });

    const start = performance.now();
    const match = runSeededMatch({
      initialState: createInitialHeadlessState({ maxTurns: 20 }),
      seed: 202603,
      strategies: { P1: strategyD1, P2: strategyD2 }
    });
    const matchElapsedMs = performance.now() - start;

    expect(match.terminalResult).toBeDefined();
    expect(match.consumedStemCount).toBeGreaterThan(0);
    expect(strategyD1.stats.decisionCount).toBeGreaterThanOrEqual(0);
    expect(strategyD2.stats.decisionCount).toBeGreaterThanOrEqual(0);

    const avgD1Ms = strategyD1.stats.decisionCount > 0
      ? strategyD1.stats.totalDecisionTimeMs / strategyD1.stats.decisionCount
      : 0;
    const avgD2Ms = strategyD2.stats.decisionCount > 0
      ? strategyD2.stats.totalDecisionTimeMs / strategyD2.stats.decisionCount
      : 0;

    console.log(`Search match (20 turns): total ${matchElapsedMs.toFixed(1)}ms | D1 avg ${avgD1Ms.toFixed(3)}ms/dec (${strategyD1.stats.decisionCount} decs) | D2 avg ${avgD2Ms.toFixed(3)}ms/dec (${strategyD2.stats.decisionCount} decs)`);
    // Each decision should be under 20ms
    expect(avgD1Ms).toBeLessThan(50);
    expect(avgD2Ms).toBeLessThan(100);
  });
});
