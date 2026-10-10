import { describe, it, expect, beforeAll } from 'vitest';
import { ActionType } from '../../src/core/types/domain.js';
import { POINTS_CONFIG } from '../../src/core/logic/ScoreCalculator.js';
import {
  ATTACK_ZERO_POINTS_CONFIG,
  DEFAULT_STRATEGY_VARIANTS
} from '../../src/core/headless/ExperimentRunner.js';
import {
  DEFAULT_VALIDATION_MATCHES_PER_SEAT,
  GUARDRAIL_GUIYUAN_MAX,
  PRODUCTION_CANDIDATE,
  formatCandidateValidationReport,
  parseCandidateArgs,
  validateCandidate,
  type CandidateSpec,
  type CandidateValidationReport
} from '../../src/core/headless/CandidateValidation.js';

/**
 * 候选验证命令测试（Ticket 05）。
 *
 * 样本量取舍：对拼矩阵每座次 50 局（每格 = 2 × 50 = 100 局，恰好达到
 * `MIN_DOMINANCE_MATCHES` 显著性门槛），护栏 120 局。所有结果由固定种子决定，
 * 因此不是「大概率」而是逐字节可复现；代价是标准误较大（每格 p≈0.5 时 ≈ 5pp），
 * 只用于验证「四条标准各自可失败、报告同时包含四条」这类结构性结论，
 * 不用于给出生产级胜率数值。
 */
const FAST = {
  matchesPerSeat: 50,
  seed: 10000,
  maxRounds: 30,
  guardrailMatches: 120,
  guardrailSeed: 10000
} as const;

/** 使【破】行为分极低，从而让 ATK 在所有被测盘面上都被支配（标准 2 失败）。 */
const ATK_DOMINATED_CONFIG = {
  ...POINTS_CONFIG,
  ACTION: { ...POINTS_CONFIG.ACTION, ATK: -100000 }
};

const DOMINATED_CANDIDATE: CandidateSpec = {
  name: 'atk-dominated',
  description: '把【破】行为分压到极低，制造全局被支配动作',
  pointsConfig: ATK_DOMINATED_CONFIG
};

const ATTACK_ZERO_CANDIDATE: CandidateSpec = {
  name: 'attack-zero',
  description: '攻击净收益归零（ADR 0010 被否决候选，护栏被推极端）',
  pointsConfig: ATTACK_ZERO_POINTS_CONFIG
};

describe('Ticket 05 - 候选验证命令：四条标准一次跑完', () => {
  let production: CandidateValidationReport;
  let dominated: CandidateValidationReport;
  let attackZero: CandidateValidationReport;

  beforeAll(() => {
    production = validateCandidate(PRODUCTION_CANDIDATE, FAST);
    const baselineHeadToHead = production.noStrictDominance.headToHead;
    dominated = validateCandidate(DOMINATED_CANDIDATE, { ...FAST, baselineHeadToHead });
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
          report.dynamicBeatsStatics.passed
      );
    }
  });

  it('生产配置是「before」基线：标准 1 失败（激进压制严格占优），其余三条照常输出', () => {
    expect(production.noStrictDominance.passed).toBe(false);
    expect(production.noStrictDominance.strictDominators).toContain('激进压制');
    // 标准 2 在生产配置下通过（普查无全局被支配动作）
    expect(production.everyActionHasValue.passed).toBe(true);
    // 标准 3 在生产配置下通过
    expect(production.guardrails.passed).toBe(true);
    // 标准 4 在生产配置下失败（对激进压制只有约 0.7pp 优势，落在噪声内）
    expect(production.dynamicBeatsStatics.passed).toBe(false);
    expect(production.allPassed).toBe(false);
  });

  it('标准 1 独立失败，不影响标准 2/3/4 的输出', () => {
    expect(production.noStrictDominance.passed).toBe(false);
    expect(production.everyActionHasValue.passed).toBe(true);
    expect(production.guardrails.passed).toBe(true);
    expect(production.dynamicBeatsStatics.evidence.length).toBe(
      DEFAULT_STRATEGY_VARIANTS.length
    );
  });

  it('标准 2 独立失败：ATK 在所有被测盘面上都被支配，其余标准照常输出', () => {
    expect(dominated.everyActionHasValue.passed).toBe(false);
    expect(dominated.everyActionHasValue.globallyDominated).toContain(ActionType.ATK);
    // 其余三条标准仍然存在（未必通过，但一定被计算）
    expect(dominated.noStrictDominance.matrix.cells.length).toBe(
      DEFAULT_STRATEGY_VARIANTS.length * (DEFAULT_STRATEGY_VARIANTS.length - 1)
    );
    expect(dominated.guardrails.checks.length).toBe(3);
    expect(dominated.dynamicBeatsStatics.evidence.length).toBe(
      DEFAULT_STRATEGY_VARIANTS.length
    );
  });

  it('标准 3 独立失败：攻击净收益归零把归元率推到极端（≥ 95%），其余标准照常输出', () => {
    expect(attackZero.guardrails.passed).toBe(false);
    expect(attackZero.guardrails.guiYuanRate).toBeGreaterThan(GUARDRAIL_GUIYUAN_MAX);
    expect(attackZero.guardrails.checks.find(check => check.key === 'guiYuanRate')?.passed).toBe(
      false
    );
    // 其余三条标准仍然存在
    expect(attackZero.noStrictDominance.matrix.cells.length).toBeGreaterThan(0);
    expect(attackZero.everyActionHasValue.actions.length).toBeGreaterThan(0);
    expect(attackZero.dynamicBeatsStatics.evidence.length).toBeGreaterThan(0);
  });

  it('无严格占优结论必须附带完整对拼矩阵', () => {
    const result = production.noStrictDominance;
    expect(result.matrix.strategies).toEqual(DEFAULT_STRATEGY_VARIANTS.map(v => v.name));
    expect(result.matrix.cells.length).toBe(
      DEFAULT_STRATEGY_VARIANTS.length * (DEFAULT_STRATEGY_VARIANTS.length - 1)
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
    const vsAggressive = evidence.find(item => item.staticStrategy === '激进压制');
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
      .filter(line => line.includes('流局率') && line.startsWith('|'));
    expect(bodyRows.length).toBeGreaterThan(0);
  });

  it('改动前后逐格对照：候选改变强弱关系时报告翻转格，并覆盖全部有序对', () => {
    expect(attackZero.baselineComparison.baselineName).toBe(PRODUCTION_CANDIDATE.name);
    expect(attackZero.baselineComparison.comparison.matchups.length).toBe(
      DEFAULT_STRATEGY_VARIANTS.length * (DEFAULT_STRATEGY_VARIANTS.length - 1)
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

  it('同一候选与同一选项产出同一报告（确定性；唯一例外是运行期内存诊断）', () => {
    const spec: CandidateSpec = {
      name: 'determinism',
      description: '确定性探针',
      pointsConfig: { ...POINTS_CONFIG, ACTION: { ...POINTS_CONFIG.ACTION, ATK: 41 } }
    };
    const options = {
      matchesPerSeat: 50,
      seed: 4242,
      maxRounds: 30,
      guardrailMatches: 100,
      guardrailSeed: 10000
    } as const;
    const stripRuntimeDiagnostics = (report: CandidateValidationReport) => ({
      ...report,
      // 堆内存增量是运行期诊断，天然带噪声；其余全部字段必须逐字节一致。
      // 它同时出现在 `heapUsedDeltaMB` 与逐条 `checks[].actual` 中，两处都要归一。
      guardrails: {
        ...report.guardrails,
        heapUsedDeltaMB: 0,
        checks: report.guardrails.checks.map(check =>
          check.key === 'heapUsedDeltaMB' ? { ...check, actual: 0 } : check
        )
      }
    });
    const a = validateCandidate(spec, options);
    const b = validateCandidate(spec, options);
    expect(stripRuntimeDiagnostics(a)).toEqual(stripRuntimeDiagnostics(b));
  });

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
      '9'
    ]);
    expect(parsed).toMatchObject({
      isHelp: false,
      name: 'probe',
      mode: 'board-only',
      matches: 50,
      seed: 7,
      maxRounds: 20,
      guardrailMatches: 100,
      guardrailSeed: 9
    });
    expect(parseCandidateArgs(['--help']).isHelp).toBe(true);
    expect(() => parseCandidateArgs(['--mode', 'nope'])).toThrow(/未知结算方式/);
    expect(() => parseCandidateArgs(['--bogus'])).toThrow(/未知参数/);
  });

  it('默认对拼样本量有定义，且生产默认结算方式为 scoring', () => {
    expect(DEFAULT_VALIDATION_MATCHES_PER_SEAT).toBeGreaterThanOrEqual(100);
    expect(PRODUCTION_CANDIDATE.settlementMode).toBe('scoring');
  });
});
