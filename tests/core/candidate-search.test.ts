import { describe, it, expect } from 'vitest';
import { POINTS_CONFIG } from '../../src/core/logic/ScoreCalculator.js';
import {
  CANDIDATE_REGISTRY,
  PRODUCTION_CANDIDATE,
  TICKET_05_CANDIDATE,
  parseCandidateArgs,
  validateCandidate
} from '../../src/core/headless/CandidateValidation.js';
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
  it('候选 A 是进度定价的 CandidateSpec，且不改变生产 POINTS_CONFIG', () => {
    expect(TICKET_05_CANDIDATE.pointsConfig?.ATTACK_PROGRESS_SCALE).toEqual({
      floor: 0.3,
      span: 0.9
    });
    // 生产表本身不含该字段
    expect(POINTS_CONFIG.ATTACK_PROGRESS_SCALE).toBeUndefined();
    // 其余旋钮与生产一致
    const { ATTACK_PROGRESS_SCALE: _scale, ...rest } = TICKET_05_CANDIDATE.pointsConfig!;
    expect(rest).toEqual(POINTS_CONFIG);
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
