import { describe, it, expect } from 'vitest';
import {
  checkGuardrailBand,
  GUARDRAIL_GUIYUAN_MIN,
  GUARDRAIL_GUIYUAN_MAX,
  GUARDRAIL_P1_WIN_MIN,
  GUARDRAIL_P1_WIN_MAX,
  type GuardrailMetrics
} from '../../src/core/headless/GuardrailBand.js';

/**
 * 护栏带防再漂移守卫（工单 03）。
 *
 * 历史缺陷：护栏带在仓库里曾有两份副本、值不同——live 测试是 [0.89, 0.95] / [0.47, 0.51]，
 * 而 `CandidateValidation` 的 CLI 判据停留在采纳前的 [0.75, 0.95] / [0.45, 0.55]，
 * 于是 `npm run benchmark:candidate-validation` 用旧带判定候选，下界 0.75 拦不住任何回退。
 *
 * 本文件用三层**行为**断言让这种漂移再次发生时会变红（不再 grep 源码文本）：
 *   1. 契约层：带必须包含实测锚点、且把「无进度定价」的回退挡在带外——这是带存在的理由，
 *      与带值本身无关，因此能抓住「静默把界改松」。
 *   2. 谓词层：`checkGuardrailBand` 对锚点指标零违规。
 *   3. 谓词层：`checkGuardrailBand` 对回退指标报出且只报出「归元率下界」「先手上界」两处违规。
 *
 * 两个消费者（live 测试与 CLI）都调用同一个谓词、不再与任何数字比较，所以「消费者各持一份
 * 副本」这一漂移形态在结构上不可能再出现；上面第 2/3 层则保证谓词本身有牙齿（把界改松即红）。
 */

/** 锚点：500 局平衡自对弈、baseSeed 10000、maxRounds 30（ADR 0011「采纳记录」）。 */
const ANCHOR_GUIYUAN_RATE = 0.904;
const ANCHOR_P1_WIN_RATE = 0.504;
/** 回退：关闭生产「攻击进度定价」后同口径实测（工单 02 复现，ADR 0011）。 */
const NO_PROGRESS_PRICING_GUIYUAN_RATE = 0.884;
const NO_PROGRESS_PRICING_P1_WIN_RATE = 0.512;

/** 堆内存增量与本次断言无关，取一个明确在带内的值。 */
const IN_BAND_HEAP_MB = 1;

const ANCHOR_METRICS: GuardrailMetrics = {
  guiYuanRate: ANCHOR_GUIYUAN_RATE,
  p1WinRate: ANCHOR_P1_WIN_RATE,
  heapUsedDeltaMB: IN_BAND_HEAP_MB
};

const ROLLBACK_METRICS: GuardrailMetrics = {
  guiYuanRate: NO_PROGRESS_PRICING_GUIYUAN_RATE,
  p1WinRate: NO_PROGRESS_PRICING_P1_WIN_RATE,
  heapUsedDeltaMB: IN_BAND_HEAP_MB
};

describe('护栏带唯一定义与防漂移守卫', () => {
  it('带包含实测锚点（90.40% / 50.40%）', () => {
    expect(ANCHOR_GUIYUAN_RATE).toBeGreaterThanOrEqual(GUARDRAIL_GUIYUAN_MIN);
    expect(ANCHOR_GUIYUAN_RATE).toBeLessThanOrEqual(GUARDRAIL_GUIYUAN_MAX);
    expect(ANCHOR_P1_WIN_RATE).toBeGreaterThanOrEqual(GUARDRAIL_P1_WIN_MIN);
    expect(ANCHOR_P1_WIN_RATE).toBeLessThanOrEqual(GUARDRAIL_P1_WIN_MAX);
  });

  it('带把「无进度定价」的回退挡在带外（88.40% / 51.20%）', () => {
    // 归元率下界必须 > 88.40%，否则回退（0.884）重新落进带内，带就拦不住它。
    expect(NO_PROGRESS_PRICING_GUIYUAN_RATE).toBeLessThan(GUARDRAIL_GUIYUAN_MIN);
    // 先手胜率上界必须 < 51.20%，否则回退（0.512）重新落进带内。
    expect(NO_PROGRESS_PRICING_P1_WIN_RATE).toBeGreaterThan(GUARDRAIL_P1_WIN_MAX);
  });

  it('checkGuardrailBand 对锚点指标（90.40% / 50.40%）零违规', () => {
    expect(checkGuardrailBand(ANCHOR_METRICS)).toEqual([]);
  });

  it('checkGuardrailBand 对回退指标（88.40% / 51.20%）报出归元率下界与先手上界两处违规', () => {
    const violations = checkGuardrailBand(ROLLBACK_METRICS);

    // 违规集合精确等于这两条：把任一下界/上界改松，这里都会变红。
    expect(violations.map(v => v.bound)).toEqual(['guiYuanRate.min', 'p1WinRate.max']);

    // 每条违规自述指标、界值与实际值，使失败信息（含 `toEqual([])` 的 diff）能命名越界项。
    expect(violations[0]).toMatchObject({
      metric: 'guiYuanRate',
      bound: 'guiYuanRate.min',
      boundValue: GUARDRAIL_GUIYUAN_MIN,
      actual: NO_PROGRESS_PRICING_GUIYUAN_RATE
    });
    expect(violations[1]).toMatchObject({
      metric: 'p1WinRate',
      bound: 'p1WinRate.max',
      boundValue: GUARDRAIL_P1_WIN_MAX,
      actual: NO_PROGRESS_PRICING_P1_WIN_RATE
    });
  });
});
