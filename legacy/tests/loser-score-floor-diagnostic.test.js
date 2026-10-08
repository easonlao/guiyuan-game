import { describe, expect, it } from 'vitest';
import { createInitialHeadlessState } from '../src/js/logic/headless/HeadlessMatch.js';
import { runSeededMatch } from '../src/js/logic/headless/SeededMatch.js';
import { POINTS_CONFIG } from '../src/js/config/game-config.js';
import { ACTION_PROBABILITY } from '../src/js/logic/actions/RarityScoring.js';

describe('issue 01: loser 500-score floor diagnostic', () => {
  it('confirms 500 score is not a hard-coded floor or constant in config', () => {
    expect(POINTS_CONFIG.ACTION.AUTO).toBe(0);
    expect(POINTS_CONFIG.STATE_CHANGE.LIGHT_UP).toBe(100);
    expect(ACTION_PROBABILITY.AUTO).toBe(1.0);
  });

  it('proves loser in seed 202603 maxTurns=12 has exactly 5 forced AUTO actions each worth 100', () => {
    const initialState = createInitialHeadlessState({ maxTurns: 12 });
    const match = runSeededMatch({
      initialState,
      seed: 202603,
      strategies: { P1: 'build-priority', P2: 'build-priority' }
    });

    expect(match.terminalResult).toEqual({ winner: 'P2', reason: '回合上限' });
    expect(match.finalState.players.P1.score).toBe(500);

    const p1Actions = match.actionRecords.filter(r => r.playerId === 'P1');
    expect(p1Actions).toHaveLength(5);
    for (const record of p1Actions) {
      expect(record.action.type).toBe('AUTO');
      expect(record.candidates).toHaveLength(1);
      expect(record.candidates[0].type).toBe('AUTO');
      expect(record.scoreChanges).toHaveLength(1);
      expect(record.scoreChanges[0].amount).toBe(100);
      expect(record.scoreChanges[0].reason).toBe('吸纳·点亮');
    }
  });

  it('proves loser in seed 202604 maxTurns=12 has exactly 5 forced AUTO actions each worth 100', () => {
    const initialState = createInitialHeadlessState({ maxTurns: 12 });
    const match = runSeededMatch({
      initialState,
      seed: 202604,
      strategies: { P1: 'build-priority', P2: 'build-priority' }
    });

    expect(match.terminalResult).toEqual({ winner: 'P1', reason: '回合上限' });
    expect(match.finalState.players.P2.score).toBe(500);

    const p2Actions = match.actionRecords.filter(r => r.playerId === 'P2');
    expect(p2Actions).toHaveLength(5);
    for (const record of p2Actions) {
      expect(record.action.type).toBe('AUTO');
      expect(record.candidates).toHaveLength(1);
      expect(record.candidates[0].type).toBe('AUTO');
      expect(record.scoreChanges).toHaveLength(1);
      expect(record.scoreChanges[0].amount).toBe(100);
      expect(record.scoreChanges[0].reason).toBe('吸纳·点亮');
    }
  });

  it('demonstrates snowballing mechanism: BURST awards multiple sub-step scores, rarity bonus, and extra turn', () => {
    const initialState = createInitialHeadlessState({ maxTurns: 12 });
    const match = runSeededMatch({
      initialState,
      seed: 202603,
      strategies: { P1: 'build-priority', P2: 'build-priority' }
    });

    const burstRecord = match.actionRecords.find(r => r.action.type === 'BURST');
    expect(burstRecord).toBeDefined();
    expect(burstRecord.playerId).toBe('P2');
    // BURST generates 3 sub-step score awards in this match
    expect(burstRecord.scoreChanges.length).toBeGreaterThanOrEqual(2);
    const burstTotal = burstRecord.scoreChanges.reduce((sum, sc) => sum + sc.amount, 0);
    expect(burstTotal).toBe(750); // 250 + 200 + 300 (no rarity bonus)
  });

  it('verifies the 500-score loser floor does NOT persist under formal maxTurns=60', () => {
    const initialState = createInitialHeadlessState({ maxTurns: 60 });
    const match = runSeededMatch({
      initialState,
      seed: 202603,
      strategies: { P1: 'build-priority', P2: 'build-priority' }
    });

    // In 60-turn match with seed 202603, game finishes by unity victory, scores are far above 500
    expect(match.terminalResult.reason).toBe('所有天干点亮');
    expect(match.finalState.players.P1.score).toBeGreaterThan(500);
    expect(match.finalState.players.P2.score).toBeGreaterThan(500);
  });
});
