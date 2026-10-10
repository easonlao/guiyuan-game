import { describe, it, expect } from 'vitest';
import { BoardState, WuXing } from '../../src/core/types/domain.js';
import {
  measureBoardDiff,
  countUnlightedSides,
  isBoardTingPai
} from '../../src/core/logic/State.js';
import { HeadlessMatch } from '../../src/core/headless/HeadlessMatch.js';
import type { MatchResult } from '../../src/core/headless/HeadlessMatch.js';
import { boardWith, gameStateWith } from '../../src/core/headless/BoardFixture.js';
import { balancedStrategy } from '../../src/core/ai/Strategy.js';
import {
  deriveMatchMetrics,
  aggregateMatchMetrics,
  countActionsToGuiYuan,
  assertDominanceVerdictHasMatrix,
  formatDominanceVerdict,
  formatDrawRateWithWinRates,
  type DominanceVerdict,
  type HeadToHeadMatrix
} from '../../src/core/headless/Metrics.js';


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

  const matrixWith = (rate: number, matches = 2000): HeadToHeadMatrix => ({
    strategies: ['激进压制', '平衡'],
    cells: [
      { p1Strategy: '激进压制', p2Strategy: '平衡', matches, seatBalancedWinRate: rate }
    ]
  });

  it('真结论通过：矩阵实测显著高于 50% 时放行', () => {
    expect(() => assertDominanceVerdictHasMatrix(verdict, matrixWith(0.7))).not.toThrow();
  });

  it('假结论被拒：矩阵实测低于 50% 时指出是哪一对、实际值多少', () => {
    expect(() => assertDominanceVerdictHasMatrix(verdict, matrixWith(0.4))).toThrow(
      /激进压制 vs 平衡.*40\.00%/
    );
  });

  it('缺格被拒：结论点名的对手不在矩阵中时拒绝', () => {
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

  it('临界格不可判定：与 50% 无法区分的格子不能作为占优证据', () => {
    // 审计中的真实临界格：归元冲刺 vs 纯推进 board-only 50.21%，每座次 2000 局。
    const criticalVerdict: DominanceVerdict = { strategy: '归元冲刺', dominates: ['纯推进'] };
    const matrix: HeadToHeadMatrix = {
      strategies: ['归元冲刺', '纯推进'],
      cells: [
        {
          p1Strategy: '归元冲刺',
          p2Strategy: '纯推进',
          matches: 4000,
          seatBalancedWinRate: 0.5021
        }
      ]
    };
    expect(() => assertDominanceVerdictHasMatrix(criticalVerdict, matrix)).toThrow(/无法判定/);
  });

  it('样本不足被拒：高胜率但样本量不足时不能作为占优证据', () => {
    expect(() => assertDominanceVerdictHasMatrix(verdict, matrixWith(0.9, 10))).toThrow(
      /样本不足/
    );
  });

  it('反向格按互补胜率读取：矩阵只存 B 对 A 时也能判定', () => {
    const reversed: HeadToHeadMatrix = {
      strategies: ['平衡', '激进压制'],
      cells: [
        {
          p1Strategy: '平衡',
          p2Strategy: '激进压制',
          matches: 2000,
          seatBalancedWinRate: 0.3
        }
      ]
    };
    expect(() => assertDominanceVerdictHasMatrix(verdict, reversed)).not.toThrow();
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
      shouldCollectStats: true
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
        shouldCollectStats: true
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

describe('盘面进度指标: 还差几次行动到五行归元', () => {
  const fullGuiYuan = boardWith({
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 1 },
    [WuXing.WATER]: { yin: 1, yang: 1 }
  });

  const tingPaiVoidLastSide = boardWith({
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 1 },
    [WuXing.WATER]: { yin: 1, yang: 0 }
  });

  const tingPaiDamagedLastSide = boardWith({
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 1 },
    [WuXing.WATER]: { yin: 1, yang: -1 }
  });

  function matchResultWithP1Board(board: BoardState): MatchResult {
    return {
      winner: null,
      endReason: null,
      roundsPlayed: 1,
      finalP1Score: 0,
      finalP2Score: 0,
      finalState: gameStateWith({ P1: board }),
      record: { seed: 0, maxRounds: 30, actions: [] }
    };
  }

  it('空盘面还差 10 次行动（每侧虚空需 1 次）', () => {
    expect(countActionsToGuiYuan(boardWith())).toBe(10);
  });

  it('虚空侧记 1 次、道损侧记 2 次行动', () => {
    const board = boardWith({
      [WuXing.WOOD]: { yin: 1, yang: 1 },
      [WuXing.FIRE]: { yin: 1, yang: 1 },
      [WuXing.EARTH]: { yin: 1, yang: 1 },
      [WuXing.METAL]: { yin: 1, yang: 1 },
      [WuXing.WATER]: { yin: 0, yang: -1 }
    });

    // 水阴虚空 1 次 + 水阳道损 2 次 = 3 次
    expect(countActionsToGuiYuan(board)).toBe(3);
  });

  it('听牌临界态最后一侧为虚空时还差 1 次行动', () => {
    expect(isBoardTingPai(tingPaiVoidLastSide)).toBe(true);
    expect(countActionsToGuiYuan(tingPaiVoidLastSide)).toBe(1);
  });

  it('听牌临界态最后一侧为道损时还差 2 次行动（听牌不等于还差 1 次）', () => {
    expect(isBoardTingPai(tingPaiDamagedLastSide)).toBe(true);
    expect(countActionsToGuiYuan(tingPaiDamagedLastSide)).toBe(2);
  });

  it('五行归元完成时返回 0', () => {
    expect(countActionsToGuiYuan(fullGuiYuan)).toBe(0);
  });

  it('deriveMatchMetrics 把进度指标挂到双方盘面上', () => {
    const metrics = deriveMatchMetrics(matchResultWithP1Board(fullGuiYuan));

    expect(metrics.board.P1.actionsToGuiYuan).toBe(0);
    expect(metrics.board.P1.unlightedSides).toBe(0);
    expect(metrics.board.P2.actionsToGuiYuan).toBe(10);
  });
});
