import { describe, it, expect, beforeAll } from 'vitest';
import { ActionType } from '../../src/core/types/domain.js';
import { POINTS_CONFIG, type PointsConfig } from '../../src/core/logic/ScoreCalculator.js';
import {
  ATTACK_ZERO_POINTS_CONFIG,
  DEFAULT_STRATEGY_VARIANTS,
} from '../../tools/ExperimentRunner.js';
import {
  DEFAULT_VALIDATION_MATCHES_PER_SEAT,
  PRODUCTION_CANDIDATE,
  formatCandidateValidationReport,
  validateCandidate,
  type CandidateSpec,
  type CandidateValidationReport,
} from '../../tools/CandidateValidation.js';
import { GUARDRAIL_GUIYUAN_MAX, GUARDRAIL_P1_WIN_MAX } from '../../tools/GuardrailBand.js';
import { parseCandidateArgs } from '../../tools/CandidateValidationCli.js';
import { runActionValueCensus } from '../../tools/ActionValueCensus.js';
import {
  formatActionSummaryTable,
  formatActionValueCensusReport,
} from '../../tools/ActionValueCensusReport.js';

/**
 * 候选验证命令测试（Ticket 05）。
 *
 * 样本量取舍：对拼矩阵每座次 50 局（每格 = 2 × 50 = 100 局，恰好达到
 * `MIN_DOMINANCE_MATCHES` 显著性门槛）。所有结果由固定种子决定，
 * 因此不是「大概率」而是逐字节可复现；代价是标准误较大（每格 p≈0.5 时 ≈ 5pp），
 * 只用于验证「四条标准各自可失败、报告同时包含四条」这类结构性结论，
 * 不用于给出生产级胜率数值。
 *
 * 护栏样本必须是 500 局：护栏带（`GuardrailBand.ts`）是按「500 局平衡自对弈、
 * 种子 10000」口径定的，先手胜率上界只比锚点高 1.8pp（工单 05 重调后锚点 49.20%）。
 * 120 局的噪声会让生产配置的
 * 先手胜率（120 局实测 0.4667）落到 [0.47, 0.51] 下界外——那是口径不匹配，不是真实击穿。
 * 因此这里与 live 护栏测试保持同一口径。
 */
const FAST = {
  matchesPerSeat: 50,
  seed: 10000,
  maxRounds: 30,
  guardrailMatches: 500,
  guardrailSeed: 10000,
} as const;

/** 使【破】行为分极低，从而让 ATK 在所有被测盘面上都被支配（标准 2 失败）。 */
const ATK_DOMINATED_CONFIG = {
  ...POINTS_CONFIG,
  ACTION: { ...POINTS_CONFIG.ACTION, ATK: -100000 },
};

const DOMINATED_CANDIDATE: CandidateSpec = {
  name: 'atk-dominated',
  description: '把【破】行为分压到极低，制造全局被支配动作',
  pointsConfig: ATK_DOMINATED_CONFIG,
};

const ATTACK_ZERO_CANDIDATE: CandidateSpec = {
  name: 'attack-zero',
  description: '攻击净收益归零（ADR 0010 被否决候选，护栏被推极端）',
  pointsConfig: ATTACK_ZERO_POINTS_CONFIG,
};

/**
 * 回退【化】行为分到极低（工单 05 的平衡重调把生产值从 30 抬到 160）：重新造出
 * 「激进压制」对全部对手严格占优。
 *
 * 为什么不用「关闭进度定价」：工单 05 重调前它确实能重新造出占优，但重调后不再能
 * （实测 `strictDominators` 为空），因此不能再用它当「标准 1 可独立失败」的样本。
 * 把【化】压到 0（远低于生产值 160）是本票改动的反向样本，在 50 局/座次的快样本下
 * 仍能解析出严格占优。
 */
const TRANS_ZERO_CONFIG: PointsConfig = {
  ...POINTS_CONFIG,
  ACTION: { ...POINTS_CONFIG.ACTION, TRANS: 0 },
};

const DOMINANCE_CANDIDATE: CandidateSpec = {
  name: 'trans-zero',
  description: '回退【化】行为分到 0（工单 05 重调的反向样本），重新造出激进压制严格占优',
  pointsConfig: TRANS_ZERO_CONFIG,
};

/**
 * 只给下面那个确定性用例的超时，不抬全局。
 *
 * 它把整套候选验证跑两遍比对，是本文件唯一的重活（其余用例 0–3ms）。实测（本机 / 5 次 CI）：
 *   本机 2.8s；CI 3.3 / 3.9 / 4.0 / 4.0 / 4.2s（最坏 4.2s）。
 * vitest 默认 testTimeout 是 5s，最坏值离它只剩 20%——同一台慢机器就能越过去。
 * 取最坏值 ×3.6 ≈ 15s，与 dominance 那条例外的余量对齐。
 *
 * 注：15s 的实际来源是「3 × vitest 默认的 5s」，不是从实测推的——当时手里有 4036ms 这个数
 * 但没拿它推导。事后按「最坏值 ×3.6」核对，4.2 × 3.6 ≈ 15 恰好落在同一处，故保留。
 * （不在这里复述这个值的改动历史，那由 git 承载。）
 */
const DETERMINISM_TIMEOUT_MS = 15_000;

describe('Ticket 05 - 候选验证命令：四条标准一次跑完', () => {
  let production: CandidateValidationReport;
  let dominated: CandidateValidationReport;
  let dominance: CandidateValidationReport;
  let attackZero: CandidateValidationReport;

  beforeAll(() => {
    production = validateCandidate(PRODUCTION_CANDIDATE, FAST);
    const baselineHeadToHead = production.noStrictDominance.headToHead;
    dominated = validateCandidate(DOMINATED_CANDIDATE, { ...FAST, baselineHeadToHead });
    dominance = validateCandidate(DOMINANCE_CANDIDATE, { ...FAST, baselineHeadToHead });
    attackZero = validateCandidate(ATTACK_ZERO_CANDIDATE, { ...FAST, baselineHeadToHead });
  });

  it('报告同时包含四条标准，且每条都有独立的通过/失败结论', () => {
    for (const report of [production, dominated, attackZero]) {
      expect(report.noStrictDominance).toBeDefined();
      expect(report.everyActionHasValue).toBeDefined();
      expect(report.guardrails).toBeDefined();
      expect(report.dynamicBeatsStatics).toBeDefined();
      expect(report.allPassed).toBe(
        report.noStrictDominance.passed &&
          report.everyActionHasValue.passed &&
          report.guardrails.passed &&
          report.dynamicBeatsStatics.passed,
      );
    }
  });

  it('生产配置（工单 06 采纳后）标准 1 无严格占优，但小样本矩阵为「无法判定」而非通过', () => {
    // 无严格占优者：
    expect(production.noStrictDominance.strictDominators).toEqual([]);
    // 但 FAST 的小样本矩阵存在 within-noise 对，C1 不能读作通过。
    expect(production.noStrictDominance.fullyDecided).toBe(false);
    expect(production.noStrictDominance.undecidable.length).toBeGreaterThan(0);
    expect(production.noStrictDominance.verdict).toBe('inconclusive');
    expect(production.noStrictDominance.passed).toBe(false);
    // 标准 2 在生产配置下通过（普查无全局被支配动作）
    expect(production.everyActionHasValue.passed).toBe(true);
    // 标准 3 在生产配置下通过
    expect(production.guardrails.passed).toBe(true);
    // 标准 4 在生产配置下仍失败（默认动态策略对激进压制只有约 0.7pp 优势，落在噪声内）
    expect(production.dynamicBeatsStatics.passed).toBe(false);
    expect(production.allPassed).toBe(false);
  });

  it('回归：样本量低于 MIN_DOMINANCE_MATCHES 时，C1 明确报「无法判定」而不是通过', () => {
    const tiny = validateCandidate(PRODUCTION_CANDIDATE, {
      ...FAST,
      matchesPerSeat: 20, // 每格 40 局 < MIN_DOMINANCE_MATCHES(100) → 全部 insufficient
      baselineHeadToHead: production.noStrictDominance.headToHead,
    });
    expect(tiny.noStrictDominance.strictDominators).toEqual([]);
    expect(tiny.noStrictDominance.fullyDecided).toBe(false);
    expect(tiny.noStrictDominance.undecidable.length).toBeGreaterThan(0);
    expect(tiny.noStrictDominance.undecidable.every((item) => item.reason === 'insufficient')).toBe(
      true,
    );
    expect(tiny.noStrictDominance.verdict).toBe('inconclusive');
    expect(tiny.noStrictDominance.passed).toBe(false);
    // 报告不得声称「不存在严格占优」，而应说明无法判定并列出对与原因。
    const markdown = formatCandidateValidationReport(tiny);
    expect(markdown).toContain('无法判定');
    expect(markdown).not.toContain('对拼矩阵中不存在对全部对手严格占优的策略，且矩阵完全可判定');
    expect(markdown).toContain('insufficient');
  });

  it('标准 1 独立失败（回退【化】行为分重新造出占优），不影响标准 2/3/4 的输出', () => {
    expect(dominance.noStrictDominance.passed).toBe(false);
    expect(dominance.noStrictDominance.verdict).toBe('fail');
    expect(dominance.noStrictDominance.strictDominators).toContain('激进压制');
    expect(dominance.everyActionHasValue.passed).toBe(true);
    // 该候选（【化】= 0，比生产值 160 低很多）同时把先手胜率推出上界（实测 0.540），
    // 因此标准 3 也随之独立失败（这正是带的用意，不是回归）。
    expect(dominance.guardrails.passed).toBe(false);
    const dominanceP1 = dominance.guardrails.checks.find((check) => check.key === 'p1WinRate');
    expect(dominanceP1?.passed).toBe(false);
    expect(dominance.guardrails.p1WinRate).toBeGreaterThan(GUARDRAIL_P1_WIN_MAX);
    expect(dominance.dynamicBeatsStatics.evidence.length).toBe(DEFAULT_STRATEGY_VARIANTS.length);
  });

  it('标准 2 独立失败：ATK 在所有被测盘面上都被支配，其余标准照常输出', () => {
    expect(dominated.everyActionHasValue.passed).toBe(false);
    expect(dominated.everyActionHasValue.globallyDominated).toContain(ActionType.ATK);
    // 其余三条标准仍然存在（未必通过，但一定被计算）
    expect(dominated.noStrictDominance.matrix.cells.length).toBe(
      DEFAULT_STRATEGY_VARIANTS.length * (DEFAULT_STRATEGY_VARIANTS.length - 1),
    );
    expect(dominated.guardrails.checks.length).toBe(3);
    expect(dominated.dynamicBeatsStatics.evidence.length).toBe(DEFAULT_STRATEGY_VARIANTS.length);
  });

  it('标准 3 独立失败：攻击净收益归零把归元率推到极端（≥ 95%），其余标准照常输出', () => {
    expect(attackZero.guardrails.passed).toBe(false);
    expect(attackZero.guardrails.guiYuanRate).toBeGreaterThan(GUARDRAIL_GUIYUAN_MAX);
    expect(attackZero.guardrails.checks.find((check) => check.key === 'guiYuanRate')?.passed).toBe(
      false,
    );
    // 其余三条标准仍然存在
    expect(attackZero.noStrictDominance.matrix.cells.length).toBeGreaterThan(0);
    expect(attackZero.everyActionHasValue.actions.length).toBeGreaterThan(0);
    expect(attackZero.dynamicBeatsStatics.evidence.length).toBeGreaterThan(0);
  });

  it('无严格占优结论必须附带完整对拼矩阵', () => {
    const result = production.noStrictDominance;
    expect(result.matrix.strategies).toEqual(DEFAULT_STRATEGY_VARIANTS.map((v) => v.name));
    expect(result.matrix.cells.length).toBe(
      DEFAULT_STRATEGY_VARIANTS.length * (DEFAULT_STRATEGY_VARIANTS.length - 1),
    );
    // 每个格子都来自座次平衡对拼（两座次合计样本）
    for (const cell of result.matrix.cells) {
      expect(cell.matches).toBe(FAST.matchesPerSeat * 2);
      expect(cell.seatBalancedWinRate).toBeGreaterThanOrEqual(0);
      expect(cell.seatBalancedWinRate).toBeLessThanOrEqual(1);
    }
    // 完整报告（headToHead）携带逐格流局率/先后手胜率
    expect(result.headToHead.matchups.length).toBe(result.matrix.cells.length);
    // 结论文本由矩阵守卫消费：含座次平衡矩阵与占优结论
    const markdown = formatCandidateValidationReport(production);
    expect(markdown).toContain('座次平衡胜率矩阵');
    expect(markdown).toContain('无严格占优');
    expect(markdown).toContain('激进压制');
  });

  it('标准 4 报告置信区间与边际，并用显著性而非裸 >50% 判定', () => {
    const evidence = production.dynamicBeatsStatics.evidence;
    expect(evidence).toHaveLength(DEFAULT_STRATEGY_VARIANTS.length);
    for (const item of evidence) {
      expect(item.matches).toBe(FAST.matchesPerSeat * 2);
      expect(item.standardError).toBeCloseTo(0.5 / Math.sqrt(item.matches), 10);
      expect(item.margin).toBeCloseTo(item.dynamicWinRate - 0.5, 10);
      expect(item.lowerBound).toBeCloseTo(item.dynamicWinRate - item.threshold, 10);
      expect(item.upperBound).toBeCloseTo(item.dynamicWinRate + item.threshold, 10);
    }
    // 对激进压制：裸胜率可能 >50%，但显著判定为否（与 50% 无法区分）
    const vsAggressive = evidence.find((item) => item.staticStrategy === '激进压制');
    expect(vsAggressive).toBeDefined();
    if (vsAggressive!.dynamicWinRate > 0.5) {
      expect(vsAggressive!.significant).toBe(false);
    }
    expect(production.dynamicBeatsStatics.passed).toBe(false);
  });

  it('流局率始终与先后手胜率成对报告（陷阱 C）', () => {
    const guardrails = production.guardrails;
    expect(guardrails.drawRate).toBeGreaterThanOrEqual(0);
    expect(guardrails.p1WinRate).toBeGreaterThanOrEqual(0);
    expect(guardrails.p2WinRate).toBeGreaterThanOrEqual(0);

    const markdown = formatCandidateValidationReport(production);
    expect(markdown).toContain('流局率');
    expect(markdown).toContain('先手胜率');
    expect(markdown).toContain('后手胜率');
    // 逐对明细也成对出现
    const bodyRows = markdown
      .split('\n')
      .filter((line) => line.includes('流局率') && line.startsWith('|'));
    expect(bodyRows.length).toBeGreaterThan(0);
  });

  it('改动前后逐格对照：候选改变强弱关系时报告翻转格，并覆盖全部有序对', () => {
    expect(attackZero.baselineComparison.baselineName).toBe(PRODUCTION_CANDIDATE.name);
    expect(attackZero.baselineComparison.comparison.matchups.length).toBe(
      DEFAULT_STRATEGY_VARIANTS.length * (DEFAULT_STRATEGY_VARIANTS.length - 1),
    );
    expect(attackZero.baselineComparison.flips.length).toBeGreaterThan(0);
    for (const flip of attackZero.baselineComparison.flips) {
      expect(flip.flipped).toBe(true);
      expect(flip.scoringRelation).not.toBe(flip.boardOnlyRelation);
    }
    const markdown = formatCandidateValidationReport(attackZero);
    expect(markdown).toContain('改动前后逐格对照');
    expect(markdown).toContain('强弱关系翻转');
  });

  it('候选与基线一致时复用候选矩阵，翻转清单为空', () => {
    expect(production.baselineComparison.reusedCandidateMatrix).toBe(true);
    expect(production.baselineComparison.flips).toHaveLength(0);
  });

  it(
    '同一候选与同一选项产出同一报告（确定性；唯一例外是运行期内存诊断）',
    () => {
      const spec: CandidateSpec = {
        name: 'determinism',
        description: '确定性探针',
        pointsConfig: { ...POINTS_CONFIG, ACTION: { ...POINTS_CONFIG.ACTION, ATK: 41 } },
      };
      const options = {
        matchesPerSeat: 50,
        seed: 4242,
        maxRounds: 30,
        guardrailMatches: 100,
        guardrailSeed: 10000,
      } as const;
      const stripRuntimeDiagnostics = (report: CandidateValidationReport) => ({
        ...report,
        // 堆内存增量是运行期诊断，天然带噪声；其余全部字段必须逐字节一致。
        // 它同时出现在 `heapUsedDeltaMB` 与逐条 `checks[].actual` 中，两处都要归一。
        guardrails: {
          ...report.guardrails,
          heapUsedDeltaMB: 0,
          checks: report.guardrails.checks.map((check) =>
            check.key === 'heapUsedDeltaMB' ? { ...check, actual: 0 } : check,
          ),
        },
      });
      const a = validateCandidate(spec, options);
      const b = validateCandidate(spec, options);
      expect(stripRuntimeDiagnostics(a)).toEqual(stripRuntimeDiagnostics(b));
    },
    DETERMINISM_TIMEOUT_MS,
  );

  it('CLI 参数解析：默认生产配置，支持样本/种子/结算方式，未知参数抛错', () => {
    const defaults = parseCandidateArgs([]);
    expect(defaults.isHelp).toBe(false);
    expect(defaults.name).toBe(PRODUCTION_CANDIDATE.name);
    expect(defaults.mode).toBe('scoring');
    expect(defaults.matches).toBeUndefined();

    const parsed = parseCandidateArgs([
      '--name',
      'probe',
      '--mode',
      'board-only',
      '--matches',
      '50',
      '--seed',
      '7',
      '--max-rounds',
      '20',
      '--guardrail-matches',
      '100',
      '--guardrail-seed',
      '9',
    ]);
    expect(parsed).toMatchObject({
      isHelp: false,
      name: 'probe',
      mode: 'board-only',
      matches: 50,
      seed: 7,
      maxRounds: 20,
      guardrailMatches: 100,
      guardrailSeed: 9,
    });
    expect(parseCandidateArgs(['--help']).isHelp).toBe(true);
    expect(() => parseCandidateArgs(['--mode', 'nope'])).toThrow(/未知结算方式/);
    expect(() => parseCandidateArgs(['--bogus'])).toThrow(/未知参数/);
  });

  it('默认对拼样本量有定义，且生产默认结算方式为 scoring', () => {
    expect(DEFAULT_VALIDATION_MATCHES_PER_SEAT).toBeGreaterThanOrEqual(100);
    expect(PRODUCTION_CANDIDATE.settlementMode).toBe('scoring');
  });

  it('动作类型结论表由同一个 formatter 渲染（消除候选验证与普查的重复表格）', () => {
    const census = runActionValueCensus({
      pointsConfig: PRODUCTION_CANDIDATE.pointsConfig,
      rules: PRODUCTION_CANDIDATE.rules,
    });
    const table = formatActionSummaryTable(census.actions);
    // 两处报告都逐字包含同一张表。
    expect(formatActionValueCensusReport(census)).toContain(table);
    expect(formatCandidateValidationReport(production)).toContain(table);
    // 表头唯一且完整。
    expect(table).toContain(
      '| 动作类型 | 可用 | 观测数 | 最优盘面数 | 被支配盘面数 | 全局被支配 |',
    );
  });
});
