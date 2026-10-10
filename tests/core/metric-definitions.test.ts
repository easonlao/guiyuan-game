import { describe, it, expect } from 'vitest';
import { BoardState, WuXing } from '../../src/core/types/domain.js';
import { measureBoardDiff, countUnlightedSides } from '../../src/core/logic/State.js';
import { HeadlessMatch } from '../../src/core/headless/HeadlessMatch.js';
import { balancedStrategy } from '../../src/core/ai/Strategy.js';
import {
  deriveMatchMetrics,
  aggregateMatchMetrics,
  assertDominanceVerdictHasMatrix,
  formatDominanceVerdict,
  formatDrawRateWithWinRates,
  type DominanceVerdict,
  type HeadToHeadMatrix
} from '../../src/core/headless/Metrics.js';

/** 构造仅覆盖被测节点的棋盘，其余节点保持虚空 (0,0) */
function boardWith(
  overrides: Partial<Record<WuXing, { yin: -1 | 0 | 1 | 2; yang: -1 | 0 | 1 | 2 }>>
): BoardState {
  const board = {
    [WuXing.WOOD]: { yin: 0, yang: 0 },
    [WuXing.FIRE]: { yin: 0, yang: 0 },
    [WuXing.EARTH]: { yin: 0, yang: 0 },
    [WuXing.METAL]: { yin: 0, yang: 0 },
    [WuXing.WATER]: { yin: 0, yang: 0 }
  } as Record<WuXing, { yin: -1 | 0 | 1 | 2; yang: -1 | 0 | 1 | 2 }>;
  for (const [element, node] of Object.entries(overrides)) {
    board[element as WuXing] = node;
  }
  return board as BoardState;
}

describe('陷阱 A: 加持 2 -> 点亮 1 必须记为 1 次削弱', () => {
  it('旧口径（未点亮侧数）把 2 -> 1 记为 0 削弱 —— 与事实相反', () => {
    const prev = boardWith({ [WuXing.WOOD]: { yin: 2, yang: 2 } });
    const next = boardWith({ [WuXing.WOOD]: { yin: 1, yang: 2 } });

    // 旧口径：压制 = 未点亮侧数的减少量。2 -> 1 时未点亮侧数不变，故错误地记为 0。
    const legacyUnlitSideSuppression = countUnlightedSides(next) - countUnlightedSides(prev);
    expect(legacyUnlitSideSuppression).toBe(0);
  });

  it('正确口径（等级下降量）把 2 -> 1 记为 1 次削弱', () => {
    const prev = boardWith({ [WuXing.WOOD]: { yin: 2, yang: 2 } });
    const next = boardWith({ [WuXing.WOOD]: { yin: 1, yang: 2 } });

    const diff = measureBoardDiff(prev, next);

    expect(diff.suppressionLevels).toBe(1);
    expect(diff.constructionLevels).toBe(0);
  });

  it('1 -> 0 与 0 -> -1 各记 1 次削弱', () => {
    const prev = boardWith({
      [WuXing.WOOD]: { yin: 1, yang: 0 },
      [WuXing.FIRE]: { yin: 0, yang: 0 }
    });
    const next = boardWith({
      [WuXing.WOOD]: { yin: 0, yang: 0 },
      [WuXing.FIRE]: { yin: -1, yang: 0 }
    });

    const diff = measureBoardDiff(prev, next);

    expect(diff.suppressionLevels).toBe(2);
    expect(diff.constructionLevels).toBe(0);
  });
});

describe('陷阱 B: 占优结论必须附带跨策略对拼矩阵', () => {
  const verdict: DominanceVerdict = { strategy: '激进压制', dominates: ['平衡'] };

  it('缺少矩阵数据时拒绝输出占优结论', () => {
    expect(() => assertDominanceVerdictHasMatrix(verdict)).toThrow(/对拼矩阵/);
    expect(() =>
      assertDominanceVerdictHasMatrix(verdict, { strategies: [], cells: [] })
    ).toThrow(/对拼矩阵/);
    expect(() => formatDominanceVerdict(verdict)).toThrow(/对拼矩阵/);
  });

  it('矩阵未覆盖结论涉及的对局时拒绝输出', () => {
    const incomplete: HeadToHeadMatrix = {
      strategies: ['激进压制', '纯推进'],
      cells: [
        {
          p1Strategy: '激进压制',
          p2Strategy: '纯推进',
          matches: 2000,
          seatBalancedWinRate: 0.7
        }
      ]
    };
    expect(() => assertDominanceVerdictHasMatrix(verdict, incomplete)).toThrow(/平衡/);
  });

  it('矩阵覆盖全部被占优策略时放行', () => {
    const complete: HeadToHeadMatrix = {
      strategies: ['激进压制', '平衡'],
      cells: [
        {
          p1Strategy: '激进压制',
          p2Strategy: '平衡',
          matches: 2000,
          seatBalancedWinRate: 0.7
        }
      ]
    };
    expect(() => assertDominanceVerdictHasMatrix(verdict, complete)).not.toThrow();
    expect(formatDominanceVerdict(verdict, complete)).toContain('激进压制');
  });
});

describe('陷阱 C: 流局率必须与先后手胜率成对输出', () => {
  it('单独输出流局率被拒绝', () => {
    expect(() => formatDrawRateWithWinRates({ drawRate: 0.5 })).toThrow(/先后手胜率/);
    expect(() => formatDrawRateWithWinRates({ drawRate: 0.5, p1WinRate: 0.5 })).toThrow(
      /先后手胜率/
    );
  });

  it('成对输出时同时给出流局率与先后手胜率', () => {
    const output = formatDrawRateWithWinRates({
      drawRate: 0.5,
      p1WinRate: 0.48,
      p2WinRate: 0.02
    });
    expect(output).toContain('流局率');
    expect(output).toContain('先手胜率');
    expect(output).toContain('后手胜率');
  });
});

describe('指标口径模块由 MatchResult 派生', () => {
  it('盘面指标与终局盘面一致', () => {
    const result = new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
      seed: 4242,
      maxRounds: 30,
      collectStats: true
    });
    const metrics = deriveMatchMetrics(result);

    expect(metrics.isGuiYuan).toBe(result.endReason === 'GUI_YUAN');
    expect(metrics.isMaxRounds).toBe(result.endReason === 'MAX_ROUNDS');
    expect(metrics.roundsPlayed).toBe(result.roundsPlayed);
    expect(metrics.board.P1.residualDamage).toBeGreaterThanOrEqual(0);
    expect(metrics.board.P1.unlightedSides).toBeGreaterThanOrEqual(0);
    expect(metrics.board.P1.unlightedSides).toBeLessThanOrEqual(10);
    expect(metrics.board.P1.guiYiNodes).toBeGreaterThanOrEqual(0);
    expect(metrics.board.P1.guiYiNodes).toBeLessThanOrEqual(5);
    expect(metrics.suppressionLevels).not.toBeNull();
  });

  it('未采集统计时压制/建设度量为 null（不臆造 0）', () => {
    const result = new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
      seed: 4242,
      maxRounds: 30
    });
    const metrics = deriveMatchMetrics(result);
    expect(metrics.suppressionLevels).toBeNull();
    expect(metrics.constructionLevels).toBeNull();
  });

  it('聚合守恒：流局率等于回合上限率，胜负与归元/流局划分守恒', () => {
    const matches = [];
    for (let i = 0; i < 40; i++) {
      const result = new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
        seed: 10000 + i,
        maxRounds: 30,
        collectStats: true
      });
      matches.push(deriveMatchMetrics(result));
    }
    const game = aggregateMatchMetrics(matches);

    expect(game.totalMatches).toBe(40);
    expect(game.p1Wins + game.p2Wins + game.draws).toBe(40);
    expect(game.guiYuanCount + game.maxRoundsCount).toBe(40);
    expect(game.drawRate).toBe(game.maxRoundsRate);
    expect(game.guiYuanRate).toBeCloseTo(game.guiYuanCount / 40, 10);
    expect(
      game.doubleGuiYuanCount +
        game.suddenDeathCount +
        game.catchupFailCount +
        game.p2DirectCount
    ).toBe(game.guiYuanCount);
    expect(game.suppressionLevels).toBeGreaterThanOrEqual(0);
  });
});
