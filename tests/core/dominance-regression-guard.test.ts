import { describe, it, expect, beforeAll } from 'vitest';
import {
  runHeadToHeadMatrix,
  findSeatBalancedWinRate,
  computeDominanceVerdicts,
  DEFAULT_STRATEGY_VARIANTS,
  DEFAULT_SCORE_CONFIG_VARIANTS
} from '../../src/core/headless/ExperimentRunner.js';
import type { HeadToHeadReport } from '../../src/core/headless/ExperimentRunner.js';

/**
 * 占优回归护栏（绊线 / characterization pin）
 *
 * 背景：平衡审计发现「激进压制」在座次平衡对拼矩阵中对全部六个其它策略严格占优
 * （座次平衡胜率 57.80%–80.85%，2000 局/座次，种子 10000）。这个事实此前只写在
 * markdown 文档里，没有任何测试会在计分改动后失败——唯一涉及真实对拼矩阵的占优断言
 * 只是「报告文本含『占优』或『矩阵』字样」，出现占优时它反而更容易通过。
 *
 * 方向：现状下占优**确实存在**，所以本文件断言的是「占优存在」，而不是「不存在占优」
 * （后者今天就会红）。它的作用是绊线：改动计分后这条断言会失败，逼改动人显式确认
 * 「旧占优是否消失、有没有换来新占优」。
 *
 * 运行参数（生产默认计分配置）：
 *   - 规则模式 mode = 'scoring'（计分轴开启，生产默认）
 *   - 计分配置 = DEFAULT_SCORE_CONFIG_VARIANTS[0]（名为 'default' 的 POINTS_CONFIG）
 *   - 样本量 500 局/座次（每格 = 2 × 500 = 1000 局，两座次合并）
 *   - 种子基数 10000，回合上限 30（与审计口径一致，仅缩小样本量）
 *
 * 样本量取舍：2000 局/座次的全矩阵约 20s，会显著拖慢 npm test；500 局/座次约 5s，
 * 在把每格标准误压到 1.58pp 的前提下把开销控制在可接受范围。在 vitest 并行下本文件
 * 成为关键路径，npm test 墙钟由约 2.6s 增至约 5.5s（新增约 3s）。因为缩小了样本量，
 * 本文件钉的是 500 局/座次下的实测值（见 PINNED_CELLS），不是 markdown 里
 * 2000 局/座次的数字（例如 2000 局/座次下「对平衡」是 57.80%，此处是 59.20%）。
 *
 * 容差推导：每格胜率来自 n = 2 × 500 = 1000 局，p≈0.5 时二项标准误
 *   SE = 0.5 / √n ≈ 1.58pp。
 * 引擎由种子确定，行为等价的重构应给出 0 偏差；取 2 × SE ≈ 3.16pp 作为
 * 「与采样噪声不可区分」的带宽，超过它才判定为刻意的计分改动，而不是无关重构。
 * 严格占优本身另由「胜率 > 50%」的无容差断言守住，因此容差只负责捕捉幅度漂移。
 *
 * ⚠️ 本钉**预期会被 ticket 03 打破**（03 会改动计分以消除该占优）。当它变红时，
 * 不要直接改数字——先确认：
 *   1) 旧的「激进压制严格占优」是否消失？
 *   2) 是否换来了新的占优者？若有，是谁、对谁、幅度多少？
 *   3) 这是有意的平衡改动，还是意外回归？
 * 确认后再按新现状更新本文件的基线，并同步 markdown 文档。
 *
 * 扰动验证记录（绊线确实会红，不是假设）：用一次刻意的计分改动把本文件的 scoreConfig
 * 换掉再运行，实测：
 *   - 换成 DEFAULT_SCORE_CONFIG_VARIANTS[1]（'suppress-boost'，放大对敌破坏状态分）：
 *     值钉失败，vitest 报
 *     「格「激进压制 对 平衡」期望 59.20%，实际 71.40%，偏差 12.20%
 *      （容差 3.16%，样本 500 局/座次，种子 10000）」——偏差 12.20pp 远超容差 3.16pp。
 *   - 换成 DEFAULT_SCORE_CONFIG_VARIANTS[2]（'attack-zero'，清零【破】/【强破】行为分与
 *     攻击状态分）：占优断言本身失败，vitest 报
 *     「格「激进压制 对 纯推进」应严格占优（座次平衡胜率 > 50%），实际 43.50%，
 *      仅高出 50% -6.50%」——激进压制对纯推进反落下风，严格占优不再成立。
 * 两种扰动都证明这条绊线在计分被改动时确实变红，而不是一条恒真的断言。
 */

const DOMINANT_STRATEGY = '激进压制';
const MATCHES_PER_SEAT = 500;
const BASE_SEED = 10000;
const MAX_ROUNDS = 30;

/** 每格合并两座次后的样本量。 */
const GAMES_PER_CELL = 2 * MATCHES_PER_SEAT;
/** p≈0.5 时座次平衡胜率的二项标准误。 */
const STANDARD_ERROR = 0.5 / Math.sqrt(GAMES_PER_CELL);
/** 容差 = 2 × SE ≈ 3.16pp（推导见文件头注释）。 */
const TOLERANCE = 2 * STANDARD_ERROR;

/**
 * 500 局/座次、种子 10000、scoring/default 下实测的「激进压制」座次平衡胜率。
 * 数值来自本文件运行时相同的配置；缩小样本量后与 2000 局/座次的审计表不同是正常的。
 */
const PINNED_CELLS: readonly { readonly opponent: string; readonly expected: number }[] = [
  { opponent: '平衡', expected: 0.592 },
  { opponent: '归元冲刺', expected: 0.807 },
  { opponent: '保守自保', expected: 0.719 },
  { opponent: '纯推进', expected: 0.784 },
  { opponent: '纯压制', expected: 0.804 },
  { opponent: '剥离计分', expected: 0.803 }
];

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

describe('占优回归护栏：激进压制严格占优（特征化钉，预期被 ticket 03 打破）', () => {
  let report: HeadToHeadReport;

  beforeAll(() => {
    report = runHeadToHeadMatrix({
      strategies: DEFAULT_STRATEGY_VARIANTS,
      mode: 'scoring',
      scoreConfig: DEFAULT_SCORE_CONFIG_VARIANTS[0],
      matches: MATCHES_PER_SEAT,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS
    });
  });

  it('在生产默认计分配置下跑出全策略座次平衡矩阵', () => {
    expect(report.mode).toBe('scoring');
    expect(report.scoreConfigName).toBe('default');
    expect(report.matchesPerSeat).toBe(MATCHES_PER_SEAT);
    expect(report.strategies).toEqual(DEFAULT_STRATEGY_VARIANTS.map(variant => variant.name));
  });

  it('激进压制对全部六个其它策略严格占优（6/6，座次平衡胜率 > 50%）', () => {
    const opponents = report.strategies.filter(strategy => strategy !== DOMINANT_STRATEGY);
    expect(opponents).toHaveLength(6);

    for (const opponent of opponents) {
      const rate = findSeatBalancedWinRate(report, DOMINANT_STRATEGY, opponent);
      expect(rate, `矩阵缺少「${DOMINANT_STRATEGY} 对 ${opponent}」这一格`).toBeDefined();
      expect(
        rate!,
        `格「${DOMINANT_STRATEGY} 对 ${opponent}」应严格占优（座次平衡胜率 > 50%），` +
          `实际 ${formatPercent(rate!)}，仅高出 50% ${formatPercent(rate! - 0.5)}`
      ).toBeGreaterThan(0.5);
    }

    // 与 Metrics.ts 的显著性守卫结论一致：六个对手全部被判定为占优对象。
    const verdict = computeDominanceVerdicts(report).find(
      entry => entry.strategy === DOMINANT_STRATEGY
    );
    expect(verdict).toBeDefined();
    expect(verdict!.dominates.slice().sort()).toEqual(opponents.slice().sort());
  });

  it(`钉住激进压制对其余六者的座次平衡胜率（容差 ${formatPercent(TOLERANCE)} ≈ 2×SE）`, () => {
    for (const { opponent, expected } of PINNED_CELLS) {
      const actual = findSeatBalancedWinRate(report, DOMINANT_STRATEGY, opponent);
      expect(actual, `矩阵缺少「${DOMINANT_STRATEGY} 对 ${opponent}」这一格`).toBeDefined();
      const delta = Math.abs(actual! - expected);
      expect(
        delta,
        `格「${DOMINANT_STRATEGY} 对 ${opponent}」期望 ${formatPercent(expected)}，` +
          `实际 ${formatPercent(actual!)}，偏差 ${formatPercent(delta)}` +
          `（容差 ${formatPercent(TOLERANCE)}，样本 ${MATCHES_PER_SEAT} 局/座次，种子 ${BASE_SEED}）。` +
          `若这是 ticket 03 的计分改动所致，请先确认旧占优是否消失、是否换来新占优，再更新基线。`
      ).toBeLessThanOrEqual(TOLERANCE);
    }
  });
});
