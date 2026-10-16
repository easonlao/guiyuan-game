import { describe, it, expect, beforeAll } from 'vitest';
import {
  runHeadToHeadMatrix,
  findSeatBalancedWinRate,
  analyzeDominance,
  DEFAULT_STRATEGY_VARIANTS,
  DEFAULT_SCORE_CONFIG_VARIANTS,
} from '../../tools/ExperimentRunner.js';
import type { HeadToHeadReport } from '../../tools/ExperimentRunner.js';

/**
 * 占优回归护栏（绊线 / characterization pin）——工单 06 采纳进度定价后重写。
 *
 * 历史：平衡审计（spec `balance-audit-and-dominance`）发现「激进压制」对全部六个其它
 * 策略严格占优（2000 局/座次、种子 10000，座次平衡胜率 57.80%–80.85%）。工单 06 采纳
 * 「攻击进度定价」（`POINTS_CONFIG.ATTACK_PROGRESS_SCALE = { floor: 0.3, span: 0.9 }`）
 * 后该占优消失：激进压制输给平衡，七个预设互有胜负，**不存在对全部对手严格占优的策略**。
 *
 * 本文件据此从「钉住激进压制 6/6 占优」改写为「钉住不存在严格占优」：
 *   - 主断言用显著性证据 `analyzeDominance`（z = 1.96，每格 ≥ 100 局），不是裸 >50%；
 *   - 副断言钉住两个关键翻转格（平衡 vs 激进压制、剥离计分 vs 平衡）的实测值，容差
 *     2×SE，用于捕捉幅度漂移；
 *   - 绊线职责不变：若未来计分改动重新造出严格占优者（或把关键格推回旧关系），本文件
 *     变红，迫使改动人显式确认「旧占优是否消失、有没有换来新占优」。
 *
 * burst-plus-two 后的平衡重调（工单 05，化 30→160）：双级爆发一度让「激进压制」重新
 * 6/6 严格占优、平衡对激进压制跌到 40.2%。把【化】行为分从 30 抬到 160 后，
 * 严格占优再次消失，平衡对激进压制回到 54.0%。本文件的两格钉值按重调后实测重录，
 * 理由与证据见 `docs/headless/burst-plus-two-balance.md`。
 *
 * 运行参数（生产默认计分配置）：
 *   - 规则模式 mode = 'scoring'（生产默认）
 *   - 计分配置 = DEFAULT_SCORE_CONFIG_VARIANTS[0]（名为 'default' 的 POINTS_CONFIG，
 *     工单 06 起含 ATTACK_PROGRESS_SCALE）
 *   - 样本量 500 局/座次（每格 = 2 × 500 = 1000 局，两座次合并）
 *   - 种子基数 10000，回合上限 30（与审计口径一致，仅缩小样本量）
 *
 * 样本量取舍：2000 局/座次的全矩阵约 20s，会显著拖慢 npm test；500 局/座次约 5s。
 * 500 局/座次下每格二项标准误 SE = 0.5/√1000 ≈ 1.58pp，容差 2×SE ≈ 3.16pp。
 * 主断言「不存在严格占优」不依赖容差：它要求某策略对全部 6 个对手都越过显著性阈值
 * （约 53.1%），在采纳前的旧现状（57.80%–80.85%）下必然触发，因此绊线仍然有效。
 *
 * 为什么不再往下压到 250（2026-10-16 评估后否决）：250 局/座次下 SE 涨到 2.24pp，容差
 * 2×SE ≈ 4.47pp，第一个钉值格的区间变成 [49.5%, 58.5%]——**50% 落进容差内**。也就是说
 * 「平衡对激进压制」从 54% 漂到 49.5%（平衡开始输）不再会让本文件变红，而主断言也拦不住
 * （对手需越过 54.38% 才算显著占优）。省下的 ~5s CI 时间不值这个检测能力。机器速度波动
 * 由 `vitest.config.ts` 的 hookTimeout 覆盖，不靠缩样本。
 *
 * 扰动验证记录（绊线确实会红，不是假设）：
 *   - 采纳前：本文件的「不存在严格占优」断言在旧生产配置下失败（激进压制 6/6 占优）。
 *   - 计分被扰动：把 `DEFAULT_SCORE_CONFIG_VARIANTS[2]`（'attack-zero'，清零【破】/
 *     【强破】行为分与攻击状态分）当作默认配置运行时，矩阵关系重排，关键格偏离基线，
 *     本文件变红。
 */

const MATCHES_PER_SEAT = 500;
const BASE_SEED = 10000;
const MAX_ROUNDS = 30;

/**
 * 只给下面那个 hook 的超时，不抬全局。
 *
 * 它跑整张 head-to-head 矩阵，是本套件分量最重的一步。实测（本机 / 5 次 CI）：
 *   本机 5.6s；CI 7.6 / 7.9 / 9.3 / 10.1 / 10.8s（最坏 10.8s）。
 * vitest 默认 hookTimeout 是 10s——最坏值已经越过去了，慢机器上必挂。取最坏值 ×3.7 ≈ 40s，
 * 与 candidate-validation 那条例外的余量对齐。只给这一步：新出现的慢 hook 仍应撞默认值。
 * 排除掉的 250 局/座次方案见上面的「样本量取舍」。
 */
const MATRIX_HOOK_TIMEOUT_MS = 40_000;
/** 每格合并两座次后的样本量。 */
const GAMES_PER_CELL = 2 * MATCHES_PER_SEAT;
/** p≈0.5 时座次平衡胜率的二项标准误。 */
const STANDARD_ERROR = 0.5 / Math.sqrt(GAMES_PER_CELL);
/** 容差 = 2 × SE ≈ 3.16pp（推导见文件头注释）。 */
const TOLERANCE = 2 * STANDARD_ERROR;
/** 策略总数（7 个预设）；严格占优 = 对另外 6 个全部显著占优。 */
const STRATEGY_COUNT = DEFAULT_STRATEGY_VARIANTS.length;

/**
 * 500 局/座次、种子 10000、scoring/default（含进度定价）下实测的关键格座次平衡胜率。
 * 两个格子取自候选搜索 `docs/headless/candidate-search.md` §4.1/§4.5 的核心翻转对，
 * 并在本文件相同样本量下重测；burst-plus-two 平衡重调（工单 05）后按实测重录。
 * 容差 2×SE ≈ 3.16pp。
 */
const PINNED_CELLS: readonly {
  readonly strategyA: string;
  readonly strategyB: string;
  readonly expected: number;
  readonly note: string;
}[] = [
  {
    strategyA: '平衡',
    strategyB: '激进压制',
    expected: 0.54,
    note: '工单 06 核心翻转：激进压制不再占优平衡；工单 05 重调后平衡仍以 54.0% 领先',
  },
  {
    strategyA: '剥离计分',
    strategyB: '平衡',
    expected: 0.571,
    note: '相对价值翻转旁证：压制计分被关掉的策略在采纳后能赢平衡（工单 05 重调后 57.1%）',
  },
];

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

describe('占优回归护栏：采纳进度定价后不存在严格占优（绊线）', () => {
  let report: HeadToHeadReport;

  beforeAll(() => {
    report = runHeadToHeadMatrix({
      strategies: DEFAULT_STRATEGY_VARIANTS,
      mode: 'scoring',
      scoreConfig: DEFAULT_SCORE_CONFIG_VARIANTS[0],
      matches: MATCHES_PER_SEAT,
      baseSeed: BASE_SEED,
      maxRounds: MAX_ROUNDS,
    });
  }, MATRIX_HOOK_TIMEOUT_MS);

  it('在生产默认计分配置（含 ATTACK_PROGRESS_SCALE）下跑出全策略座次平衡矩阵', () => {
    expect(report.mode).toBe('scoring');
    expect(report.scoreConfigName).toBe('default');
    expect(report.matchesPerSeat).toBe(MATCHES_PER_SEAT);
    expect(report.strategies).toEqual(DEFAULT_STRATEGY_VARIANTS.map((variant) => variant.name));
    // 工单 06 采纳：生产默认配置确实带着进度定价，本绊线钉的是采纳后的现状。
    expect(DEFAULT_SCORE_CONFIG_VARIANTS[0].config.ATTACK_PROGRESS_SCALE).toEqual({
      floor: 0.3,
      span: 0.9,
    });
  });

  it('不存在对全部其它策略严格占优的策略（显著性证据，不是裸 >50%）', () => {
    const analysis = analyzeDominance(report);
    const strictDominators = analysis.verdicts
      .filter((verdict) => verdict.dominates.length === STRATEGY_COUNT - 1)
      .map((verdict) => verdict.strategy);

    expect(
      strictDominators,
      `严格占优者：${strictDominators.join('、') || '（无）'}。` +
        `若计分改动重新造出严格占优者，请先确认旧占优是否消失、是否换来新占优，再更新基线。`,
    ).toEqual([]);

    // 核心翻转：激进压制不再占优平衡（旧现状是它 6/6 占优）。
    const aggressive = analysis.verdicts.find((verdict) => verdict.strategy === '激进压制');
    expect(aggressive?.dominates ?? []).not.toContain('平衡');
  });

  it(`钉住关键翻转格（容差 ${formatPercent(TOLERANCE)} ≈ 2×SE）`, () => {
    for (const { strategyA, strategyB, expected, note } of PINNED_CELLS) {
      const actual = findSeatBalancedWinRate(report, strategyA, strategyB);
      expect(actual, `矩阵缺少「${strategyA} 对 ${strategyB}」这一格`).toBeDefined();
      const delta = Math.abs(actual! - expected);
      expect(
        delta,
        `格「${strategyA} 对 ${strategyB}」期望 ${formatPercent(expected)}，` +
          `实际 ${formatPercent(actual!)}，偏差 ${formatPercent(delta)}` +
          `（容差 ${formatPercent(TOLERANCE)}，样本 ${MATCHES_PER_SEAT} 局/座次，种子 ${BASE_SEED}）。` +
          `用途：${note}。`,
      ).toBeLessThanOrEqual(TOLERANCE);
    }
  });
});
