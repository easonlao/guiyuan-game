import { describe, it, expect } from 'vitest';
import { HeadlessMatch } from '../../src/core/headless/HeadlessMatch.js';
import { ActionType } from '../../src/core/types/domain.js';
import { balancedStrategy } from '../../src/core/ai/Strategy.js';
import type { DecisionStrategy } from '../../src/core/ai/types.js';

describe('HeadlessMatch (Headless Simulation)', () => {
  it('should run a simulation match to completion without error', () => {
    const match = new HeadlessMatch();
    const result = match.run(undefined, undefined, 20);

    expect(result.roundsPlayed).toBeGreaterThanOrEqual(1);
    expect(result.finalState).toBeDefined();
    expect(typeof result.finalP1Score).toBe('number');
    expect(typeof result.finalP2Score).toBe('number');
    expect(result.closureType).toBeDefined();
    expect(result.record).toBeDefined();
    expect(result.record.actions.length).toBeGreaterThan(0);
  });

  it('should reproduce identical match results given the same seed', () => {
    const match = new HeadlessMatch();
    const result1 = match.run(undefined, undefined, { seed: 8888, maxRounds: 30 });
    const result2 = match.run(undefined, undefined, { seed: 8888, maxRounds: 30 });

    expect(result1.roundsPlayed).toBe(result2.roundsPlayed);
    expect(result1.winner).toBe(result2.winner);
    expect(result1.endReason).toBe(result2.endReason);
    expect(result1.closureType).toBe(result2.closureType);
    expect(result1.finalP1Score).toBe(result2.finalP1Score);
    expect(result1.finalP2Score).toBe(result2.finalP2Score);
    expect(result1.record).toEqual(result2.record);
  });

  it('Ticket 02: lowStateRedirect ON makes the low-state redirect reachable, OFF forces AUTO', () => {
    // 偏好改道的策略：优先选【化】/【破】，否则退回首个合法动作
    const redirectPreferred: DecisionStrategy = (_state, _tianGan, actions) => {
      const candidates = actions ?? [];
      return (
        candidates.find(
          (a) => a.actionType === ActionType.TRANS || a.actionType === ActionType.ATK
        ) ?? candidates[0]
      );
    };

    const match = new HeadlessMatch();
    const off = match.run(redirectPreferred, redirectPreferred, { seed: 24680, maxRounds: 30 });
    const on = match.run(redirectPreferred, redirectPreferred, {
      seed: 24680,
      maxRounds: 30,
      lowStateRedirect: true
    });

    // 首回合棋盘全为虚空（低位态）：关闭时只能【吸纳】
    expect(off.record.actions[0].action.actionType).toBe(ActionType.AUTO);

    // 开启后首回合低位态改道可达，并被策略实际选中执行
    expect([ActionType.TRANS, ActionType.ATK]).toContain(on.record.actions[0].action.actionType);

    // 开关确实改变了可观察的对局轨迹
    expect(on.record).not.toEqual(off.record);

    // 相同种子下开启后依然确定性可复现
    const onAgain = match.run(redirectPreferred, redirectPreferred, {
      seed: 24680,
      maxRounds: 30,
      lowStateRedirect: true
    });
    expect(onAgain.record).toEqual(on.record);
  });
});

describe('HeadlessMatch low-state choice instrumentation (Ticket 04)', () => {
  it('leaves the new distributions undefined when collectStats is off (default path untouched)', () => {
    const result = new HeadlessMatch().run(undefined, undefined, { seed: 24680, maxRounds: 30 });
    expect(result.stats).toBeUndefined();
  });

  it('records an action-type distribution summing to the number of resolved actions', () => {
    const result = new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
      seed: 24680,
      maxRounds: 30,
      collectStats: true
    });
    const stats = result.stats!;
    const total = Object.values(stats.actionTypeCounts).reduce((sum, count) => sum + count, 0);

    expect(total).toBe(result.record.actions.length);
    expect(stats.lowStateDecisions).toBeGreaterThan(0);
    expect(stats.lowStateDecisions).toBeLessThanOrEqual(total);
  });

  it('with the redirect switch OFF every low-state decision resolves to AUTO', () => {
    const result = new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
      seed: 24680,
      maxRounds: 30,
      collectStats: true
    });
    const stats = result.stats!;

    expect(stats.lowStateDecisions).toBeGreaterThan(0);
    expect(stats.lowStateChoices[ActionType.AUTO]).toBe(stats.lowStateDecisions);
    expect(stats.lowStateChoices[ActionType.TRANS]).toBe(0);
    expect(stats.lowStateChoices[ActionType.ATK]).toBe(0);
  });

  it('with the redirect switch ON a low-state decision can resolve to TRANS or ATK', () => {
    // 偏好改道的策略：优先选【化】/【破】，否则退回首个合法动作
    const redirectPreferred: DecisionStrategy = (_state, _tianGan, actions) => {
      const candidates = actions ?? [];
      return (
        candidates.find(
          (a) => a.actionType === ActionType.TRANS || a.actionType === ActionType.ATK
        ) ?? candidates[0]
      );
    };

    const result = new HeadlessMatch().run(redirectPreferred, redirectPreferred, {
      seed: 24680,
      maxRounds: 30,
      lowStateRedirect: true,
      collectStats: true
    });
    const stats = result.stats!;
    const redirectCount =
      stats.lowStateChoices[ActionType.TRANS] + stats.lowStateChoices[ActionType.ATK];

    expect(stats.lowStateDecisions).toBeGreaterThan(0);
    expect(redirectCount).toBeGreaterThan(0);
    // 每个低位态决策恰好落入一个动作类型
    expect(stats.lowStateChoices[ActionType.AUTO]).toBe(stats.lowStateDecisions - redirectCount);
    const lowStateTotal = Object.values(stats.lowStateChoices).reduce((sum, count) => sum + count, 0);
    expect(lowStateTotal).toBe(stats.lowStateDecisions);
  });
});
