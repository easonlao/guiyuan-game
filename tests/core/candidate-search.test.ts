import { describe, it, expect } from 'vitest';
import { POINTS_CONFIG, ScoreCalculator } from '../../src/core/logic/ScoreCalculator.js';
import {
  CANDIDATE_A,
  CANDIDATE_B,
  CANDIDATE_C,
  CANDIDATE_D,
  CANDIDATE_E,
  CANDIDATE_REGISTRY,
  PRODUCTION_CANDIDATE,
  TICKET_05_CANDIDATE,
  resolveCandidate,
  validateCandidate
} from '../../src/core/headless/CandidateValidation.js';
import { parseCandidateArgs } from '../../src/core/headless/CandidateValidationCli.js';
import {
  DEFAULT_DYNAMIC_POLICY,
  TUNED_DYNAMIC_POLICY,
  createDynamicSwitchingStrategy
} from '../../src/core/headless/DynamicSwitching.js';
import { AGGRESSIVE_WEIGHTS } from '../../src/core/ai/Strategy.js';

/**
 * Ticket 05 搜索落地的接线测试：
 * - 调优动态策略（dyn-v3-self7）存在、可实例化、可经 `dynamicPolicies` 选择；
 * - 候选 A（进度定价）注册为 `CandidateSpec`，CLI 可选中；
 * - 生产默认不被改变。
 */
describe('Ticket 05 - 调优动态策略 (dyn-v3-self7)', () => {
  it('存在且参数与顾问报告一致（仅使用既有旋钮）', () => {
    expect(TUNED_DYNAMIC_POLICY.name).toBe('动态切换(调优v3)');
    expect(TUNED_DYNAMIC_POLICY.advanceSelfMax).toBe(7);
    expect(TUNED_DYNAMIC_POLICY.minLeadForAdvance).toBe(0);
    expect(TUNED_DYNAMIC_POLICY.shouldAdvanceWhenAtkTempoZero).toBe(true);
    // 其余条件关闭
    expect(TUNED_DYNAMIC_POLICY.advanceWhenOpponentActionsAtLeast).toBe(Number.POSITIVE_INFINITY);
    expect(TUNED_DYNAMIC_POLICY.advanceWhenLeadAtLeast).toBe(Number.POSITIVE_INFINITY);
    expect(TUNED_DYNAMIC_POLICY.shouldAdvanceWhenNoAtkTempo).toBe(false);
    // 推进权重 = 激进骨架 + 建设项上调；压制权重 = 激进
    expect(TUNED_DYNAMIC_POLICY.advanceWeights).toEqual({
      ...AGGRESSIVE_WEIGHTS,
      repairDamage: 100,
      lightVoid: 100,
      reachGuiYi: 100,
      guiyuanProgress: 80
    });
    expect(TUNED_DYNAMIC_POLICY.suppressWeights).toBe(AGGRESSIVE_WEIGHTS);
  });

  it('可实例化为标准 DecisionStrategy（可经 dynamicPolicies 选择）', () => {
    const strategy = createDynamicSwitchingStrategy(TUNED_DYNAMIC_POLICY);
    expect(typeof strategy).toBe('function');
  });

  it('生产默认动态策略不被改变', () => {
    expect(DEFAULT_DYNAMIC_POLICY.name).toBe('动态切换');
    expect(DEFAULT_DYNAMIC_POLICY.advanceSelfMax).toBe(2);
    expect(DEFAULT_DYNAMIC_POLICY.advanceWeights).not.toBe(TUNED_DYNAMIC_POLICY.advanceWeights);
  });
});

describe('Ticket 05 - 候选 A 注册与 CLI 选择', () => {
  it('候选 A 是进度定价的 CandidateSpec，且与生产 POINTS_CONFIG 一致（ticket 06 已采纳）', () => {
    expect(TICKET_05_CANDIDATE.pointsConfig?.ATTACK_PROGRESS_SCALE).toEqual({
      floor: 0.3,
      span: 0.9
    });
    // 工单 06 采纳后，生产表已含同一进度定价。
    expect(POINTS_CONFIG.ATTACK_PROGRESS_SCALE).toEqual({ floor: 0.3, span: 0.9 });
    // 候选 A 与生产逐旋钮一致。
    expect(TICKET_05_CANDIDATE.pointsConfig).toEqual(POINTS_CONFIG);
  });

  it('注册表同时登记生产与候选 A，且候选 A 默认使用调优动态策略', () => {
    expect(Object.keys(CANDIDATE_REGISTRY)).toEqual(
      expect.arrayContaining([PRODUCTION_CANDIDATE.name, TICKET_05_CANDIDATE.name])
    );
    expect(CANDIDATE_REGISTRY[PRODUCTION_CANDIDATE.name].dynamicPolicies).toEqual([
      DEFAULT_DYNAMIC_POLICY
    ]);
    expect(CANDIDATE_REGISTRY[TICKET_05_CANDIDATE.name].dynamicPolicies).toEqual([
      TUNED_DYNAMIC_POLICY
    ]);
  });

  it('CLI 默认生产，--candidate 可选中候选 A，未知候选抛错', () => {
    expect(parseCandidateArgs([]).candidate).toBe(PRODUCTION_CANDIDATE.name);
    expect(parseCandidateArgs(['--candidate', 'progress-pricing']).candidate).toBe(
      'progress-pricing'
    );
    expect(() => parseCandidateArgs(['--candidate', 'nope'])).toThrow(/未知候选/);
  });

  it('validateCandidate 用调优动态策略复跑候选 A（标准 4 接线）', () => {
    const report = validateCandidate(TICKET_05_CANDIDATE, {
      matchesPerSeat: 20,
      seed: 10000,
      maxRounds: 30,
      guardrailMatches: 40,
      guardrailSeed: 10000,
      dynamicPolicies: [TUNED_DYNAMIC_POLICY]
    });
    expect(report.candidate.pointsConfig.ATTACK_PROGRESS_SCALE).toEqual({
      floor: 0.3,
      span: 0.9
    });
    expect(report.dynamicBeatsStatics.policies).toEqual([TUNED_DYNAMIC_POLICY.name]);
    expect(report.dynamicBeatsStatics.evidence).toHaveLength(7);
  });
});

describe('Ticket 05 - 五个候选 A–E 的机制与注册', () => {
  it('注册表登记五个候选 A–E（外加生产基线），每个都能解析为可运行配置', () => {
    const candidates = [CANDIDATE_A, CANDIDATE_B, CANDIDATE_C, CANDIDATE_D, CANDIDATE_E];
    expect(candidates).toHaveLength(5);
    for (const spec of candidates) {
      expect(CANDIDATE_REGISTRY[spec.name]).toBeDefined();
      const resolved = resolveCandidate(spec);
      expect(resolved.pointsConfig).toBeDefined();
      expect(resolved.rules).toBeDefined();
    }
    // 生产基线不在五个候选内，但注册表包含它。
    expect(candidates.map(spec => spec.name)).not.toContain(PRODUCTION_CANDIDATE.name);
    expect(CANDIDATE_REGISTRY[PRODUCTION_CANDIDATE.name]).toBeDefined();
  });

  it('候选 B/C/D 相对搜索基线（无进度定价）定义，避免混入候选 A 的改动', () => {
    for (const spec of [CANDIDATE_B, CANDIDATE_C, CANDIDATE_D]) {
      expect(spec.pointsConfig?.ATTACK_PROGRESS_SCALE).toBeUndefined();
    }
    expect(CANDIDATE_B.pointsConfig?.STATE_CHANGE.WEAKEN).toBe(0);
    expect(CANDIDATE_D.pointsConfig?.STATE_CHANGE.WEAKEN).toBe(0);
    expect(CANDIDATE_D.pointsConfig?.STATE_CHANGE.CAUSE_DMG).toEqual({ yang: 120, yin: 100 });
  });

  it('候选 C：赛跑差定价被解析为 PointsConfig 字段，计算 gain × (own − opp)', () => {
    const resolved = resolveCandidate(CANDIDATE_C);
    expect(resolved.pointsConfig.RACE_DIFF_PRICING).toEqual({ gain: 120 });
    const calc = new ScoreCalculator(resolved.pointsConfig);
    expect(calc.raceDiffPoints(3, 1)).toBe(240);
    expect(calc.raceDiffPoints(1, 3)).toBe(-240);
    // 未配置（生产）时恒等 0
    expect(new ScoreCalculator(POINTS_CONFIG).raceDiffPoints(3, 1)).toBe(0);
  });

  it('候选 E：isBoardSettlement 覆盖被解析进 ResolvedCandidate，计分仍为 scoring', () => {
    const resolved = resolveCandidate(CANDIDATE_E);
    expect(resolved.settlementMode).toBe('scoring');
    expect(resolved.isBoardSettlement).toBe(true);
    expect(resolved.rules.isBoardOnly).toBe(false);
    // 对照：候选 A / 生产仍是 scoring 结算。
    expect(resolveCandidate(TICKET_05_CANDIDATE).isBoardSettlement).toBe(false);
    expect(resolveCandidate(PRODUCTION_CANDIDATE).isBoardSettlement).toBe(false);
  });
});
