import { describe, expect, it } from 'vitest';
import { STEMS_LIST } from '../src/js/config/game-config.js';
import { createSeededStemSequence } from '../src/js/logic/headless/SeededRandom.js';
import { decidePublicStrategy, PUBLIC_STRATEGIES } from '../src/js/logic/headless/PublicStrategies.js';
import { createInitialHeadlessState } from '../src/js/logic/headless/HeadlessMatch.js';
import { replaySeededMatch, runSeededMatch } from '../src/js/logic/headless/SeededMatch.js';

describe('seeded stem source', () => {
  it('repeats a uniformly sampled formal heavenly-stem sequence for the same seed', () => {
    const first = createSeededStemSequence(202603, 10_000);
    const replay = createSeededStemSequence(202603, 10_000);

    expect(first).toEqual(replay);
    expect(new Set(first.map(stem => stem.name))).toEqual(new Set(STEMS_LIST.map(stem => stem.name)));
    const frequency = Object.fromEntries(STEMS_LIST.map(stem => [stem.name, 0]));
    for (const stem of first) frequency[stem.name]++;
    for (const count of Object.values(frequency)) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1_150);
    }
  });

});

describe('public strategy decision interface', () => {
  const candidates = [
    { type: 'CONVERT', executorId: 'P1', target: { playerId: 'P1', elementIndex: 0, isYang: false } },
    { type: 'ATK', executorId: 'P1', target: { playerId: 'P2', elementIndex: 2, isYang: false, priority: 1 } },
    { type: 'BURST', executorId: 'P1', targetEl: 1 },
    { type: 'BURST_ATK', executorId: 'P1', targetEl: 2 }
  ];
  const context = {
    playerId: 'P1',
    stem: { name: '甲', element: 0, color: '#2dcc70' },
    state: {
      currentPlayer: 'P1',
      turnCount: 4,
      maxTurns: 60,
      isExtraTurn: false,
      nodeStates: {
        'P1-0': { yang: 1, yin: 0 },
        'P1-1': { yang: 1, yin: 1 },
        'P2-2': { yang: 1, yin: 1 }
      }
    },
    history: [],
    candidates
  };

  it('gives public strategies stable version identities and distinct priority definitions', () => {
    expect(PUBLIC_STRATEGIES['build-priority'].version).toBe(1);
    expect(PUBLIC_STRATEGIES['attack-priority'].version).toBe(1);
    expect(PUBLIC_STRATEGIES['situation-responsive'].version).toBe(1);
    expect(decidePublicStrategy('build-priority', context, () => 0)).toBe(candidates[2]);
    expect(decidePublicStrategy('attack-priority', context, () => 0)).toBe(candidates[3]);
  });

  it('responds to an urgent opponent position using only the public board', () => {
    const nodeStates = Object.fromEntries(Array.from({ length: 5 }, (_, elementIndex) => [
      `P2-${elementIndex}`,
      { yang: 1, yin: 1 }
    ]));
    nodeStates['P2-4'] = { yang: 1, yin: 0 };
    const urgentContext = {
      ...context,
      state: { ...context.state, nodeStates },
      candidates: [candidates[2], candidates[1]]
    };

    expect(decidePublicStrategy('situation-responsive', urgentContext, () => 0)).toBe(candidates[1]);
  });

  it('uses only legal candidates and selects reproducible random tie breaks', () => {
    const tiedContext = { ...context, candidates: [candidates[1], { ...candidates[1], target: { ...candidates[1].target, elementIndex: 3 } }] };
    expect(decidePublicStrategy('build-priority', tiedContext, () => 0)).toBe(tiedContext.candidates[0]);
    expect(decidePublicStrategy('build-priority', tiedContext, () => 0.999999)).toBe(tiedContext.candidates[1]);
    expect(decidePublicStrategy('build-priority', { ...context, candidates: [] }, () => 0)).toBeNull();
  });
});

function createStrategyMatchState() {
  const state = createInitialHeadlessState({ maxTurns: 4 });
  for (const playerId of ['P1', 'P2']) {
    for (let elementIndex = 0; elementIndex < 5; elementIndex++) {
      state.nodeStates[`${playerId}-${elementIndex}`] = { yang: 1, yin: 1 };
    }
  }
  state.nodeStates['P1-0'] = { yang: 0, yin: 1 };
  state.nodeStates['P1-4'] = { yang: 1, yin: 0 };
  state.nodeStates['P2-4'] = { yang: 1, yin: 0 };
  state.phase = 'DECISION';
  state.turnCount = 1;
  state.currentStem = { name: '乙', color: '#2dcc70', element: 0 };
  return state;
}

describe('seeded match and replay public entry points', () => {
  it('keeps strategy context public-only, supplies prior action history, and replays recorded choices', () => {
    const initialState = createStrategyMatchState();
    const contexts = [];
    const scoringConfig = { version: 1, noSelfCostReward: true };
    const result = runSeededMatch({
      initialState,
      seed: 202603,
      scoringConfig,
      strategies: {
        P1: {
          id: 'test-situation-responsive',
          version: 1,
          decide: (context, random) => {
            contexts.push(context);
            return decidePublicStrategy('situation-responsive', context, random);
          }
        },
        P2: {
          id: 'test-attack-priority',
          version: 1,
          decide: (context, random) => {
            contexts.push(context);
            return decidePublicStrategy('attack-priority', context, random);
          }
        }
      }
    });

    expect(contexts.length).toBeGreaterThan(1);
    expect(contexts[0]).toMatchObject({ playerId: 'P1', stem: { name: '乙' } });
    expect(Object.keys(contexts[0])).toEqual(['playerId', 'stem', 'state', 'history', 'candidates']);
    expect(Object.isFrozen(contexts[0])).toBe(true);
    expect(Object.isFrozen(contexts[0].history)).toBe(true);
    expect(contexts[0].state).toMatchObject({ currentPlayer: 'P1', nodeStates: initialState.nodeStates });
    expect(contexts[0].state).not.toHaveProperty('players');
    expect(contexts[0]).not.toHaveProperty('stems');
    expect(contexts[0]).not.toHaveProperty('scoringConfig');
    expect(JSON.stringify(contexts[0])).not.toContain('noSelfCostReward');
    expect(contexts[0].history).toEqual([]);
    expect(contexts[1].history).toHaveLength(1);
    expect(contexts[1].history[0]).toMatchObject({ opportunity: 1, playerId: 'P1', action: expect.any(Object) });
    expect(JSON.stringify(contexts[1].history)).not.toContain('scoreChanges');

    const replay = replaySeededMatch({
      initialState,
      stems: result.stems,
      selectedActions: result.actionRecords,
      scoringConfig
    });
    expect(replay.finalState).toEqual(result.finalState);
    expect(replay.actionRecords).toEqual(result.actionRecords);
    expect(result.stems).toHaveLength(result.consumedStemCount);
    expect(result.terminalResult).toBeDefined();
    expect(result.trajectory.at(-1).event).toBe('terminal');
    expect(replay.terminalResult).toEqual(result.terminalResult);
    expect(replay.trajectory).toEqual(result.trajectory);
    expect(result.strategyIdentities).toEqual({
      P1: { id: 'test-situation-responsive', version: 1 },
      P2: { id: 'test-attack-priority', version: 1 }
    });
  });

  it('keeps built-in strategy decisions independent of scoring configuration', () => {
    const initialState = createStrategyMatchState();
    const match = { initialState, seed: 202603, strategies: { P1: 'build-priority', P2: 'attack-priority' } };
    const baseline = runSeededMatch(match);
    const repeated = runSeededMatch(match);
    const experimental = runSeededMatch({ ...match, scoringConfig: { version: 1, noSelfCostReward: true, burstActionScoreOnce: true } });

    const decisions = result => result.actionRecords.map(({ opportunity, playerId, stem, action }) => ({ opportunity, playerId, stem, action }));
    expect(repeated.actionRecords).toEqual(baseline.actionRecords);
    expect(repeated.finalState).toEqual(baseline.finalState);
    expect(decisions(experimental)).toEqual(decisions(baseline));
    expect(experimental.scoringConfig).toMatchObject({ name: 'experimental', noSelfCostReward: true, burstActionScoreOnce: true });
  });

  it('isolates each player tie stream from the other player\'s random draws', () => {
    const initialState = createStrategyMatchState();
    initialState.maxTurns = 5;
    const runWithP2Draws = extraDraws => runSeededMatch({
      initialState,
      seed: 202603,
      strategies: {
        P1: {
          id: 'random-legal-candidate',
          version: 1,
          decide: (context, random) => context.candidates[Math.floor(random() * context.candidates.length)]
        },
        P2: {
          id: 'fixed-action-with-variable-random-use',
          version: 1,
          decide: (context, random) => {
            for (let draw = 0; draw < extraDraws; draw++) random();
            return context.candidates[0];
          }
        }
      }
    });
    const fewP2Draws = runWithP2Draws(0);
    const manyP2Draws = runWithP2Draws(100);
    const laterP1Action = result => result.actionRecords.find(record => record.opportunity === 3 && record.playerId === 'P1').action;

    expect(laterP1Action(fewP2Draws)).toEqual(laterP1Action(manyP2Draws));
  });

  it('keeps generated heavenly stems unchanged when player tie-break draws differ', () => {
    const initialState = createStrategyMatchState();
    const seeded = { initialState, seed: 7, strategies: { P1: 'situation-responsive', P2: 'build-priority' } };
    const first = runSeededMatch(seeded);
    const second = runSeededMatch({ ...seeded, strategies: { P1: 'build-priority', P2: 'build-priority' } });

    expect(first.stems).toEqual(second.stems);
    expect(first.actionRecords[0].action).not.toEqual(second.actionRecords[0].action);
  });
});
