/**
 * 归元弈 (Guiyuan) - 护栏带的唯一定义 (Guardrail Band)
 *
 * 这是仓库里「护栏带」的**唯一**定义。两个消费者都从这里 import，任何一处都不得再
 * 硬编码这几个数：
 *   - `src/core/headless/CandidateValidation.ts`（`npm run benchmark:candidate-validation`
 *     的四条验收标准之「标准 3 护栏全绿」）；
 *   - `tests/core/ai-evaluator-benchmark-guardrails.test.ts`（`npm test` 的 live 红线）。
 *
 * 历史上这两个消费者各持一份副本、且值不同（测试是 [0.89, 0.95]/[0.47, 0.51]，
 * CLI 却停留在采纳前的 [0.75, 0.95]/[0.45, 0.55]），导致 CLI 用旧带判定候选——
 * 下界 0.75 拦不住任何回退。把定义收敛到本模块后，漂移在结构上不可能再发生：
 * 两个消费者不再各自与数字比较，而是调用本模块的 `checkGuardrailBand` 谓词。
 * `tests/core/guardrail-band-single-source.test.ts` 是防再漂移的守卫（行为层，不是源码文本 grep）。
 *
 * 锚点（唯一口径）：500 局平衡自对弈、`baseSeed` 10000、`maxRounds` 30
 *   → 归元率 **90.40%** / 先手胜率 **50.40%**（后手 49.60%，流局率 9.60%）。
 *   出处见 `docs/adr/0011-balance-route-fix-rules.md`「采纳记录」与
 *   `docs/headless/candidate-search.md` §4.3。
 *
 * 回退（本带存在的理由）：关闭生产「攻击进度定价」（`ATTACK_PROGRESS_SCALE: undefined`，
 * 即工单 06 采纳前的计分）后，同一口径实测
 *   → 归元率 **88.40%** / 先手胜率 **51.20%**。
 * 四个界都必须把这次回退挡在带外，否则「护栏带」只是装饰。
 */

/** 护栏：归元率下界。锚点 90.40% − 1.4pp；要拦住的回退是 88.40%（0.884 < 0.89）。 */
export const GUARDRAIL_GUIYUAN_MIN = 0.89;
/** 护栏：归元率上界。锚点 90.40% + 4.6pp；仍拒绝 ADR 0010 的极端候选（attack-zero ≈99.9%）。 */
export const GUARDRAIL_GUIYUAN_MAX = 0.95;
/** 护栏：先手胜率下界。锚点 50.40% − 3.4pp（噪声下界；回退值 51.20% 落在上界一侧）。 */
export const GUARDRAIL_P1_WIN_MIN = 0.47;
/** 护栏：先手胜率上界。锚点 50.40% + 0.6pp；要拦住的回退是 51.20%（0.512 > 0.51）。 */
export const GUARDRAIL_P1_WIN_MAX = 0.51;
/** 护栏：500 局堆内存增量上界（MB）。工程护栏，非平衡护栏。 */
export const GUARDRAIL_HEAP_MAX_MB = 15;

// ---------------------------------------------------------------------------
// 共享谓词：让「与带比较」只有一个实现
// ---------------------------------------------------------------------------

/** 谓词只需要这三个指标；`HeadlessBenchmark` 的指标对象结构上满足它。 */
export interface GuardrailMetrics {
  readonly guiYuanRate: number;
  readonly p1WinRate: number;
  readonly heapUsedDeltaMB: number;
}

/** 被违反的界：`<指标>.<min|max>`。 */
export type GuardrailBound =
  | 'guiYuanRate.min'
  | 'guiYuanRate.max'
  | 'p1WinRate.min'
  | 'p1WinRate.max'
  | 'heapUsedDeltaMB.max';

/** 一条护栏违规：自述指标、被违反的界、界值与实际值。 */
export interface GuardrailViolation {
  readonly metric: keyof GuardrailMetrics;
  readonly bound: GuardrailBound;
  readonly boundValue: number;
  readonly actual: number;
  /** 人类可读描述，供报告与失败信息使用。 */
  readonly message: string;
}

/**
 * 校验一组指标是否全部落在护栏带内，返回违规列表（空 = 全绿）。
 *
 * 这是「与带比较」的**唯一**实现：live 测试与 CLI 都调用它，任何一处都不再直接与数字比较，
 * 因此没有可硬编码的副本可漂移。
 */
export function checkGuardrailBand(metrics: GuardrailMetrics): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];

  if (metrics.guiYuanRate < GUARDRAIL_GUIYUAN_MIN) {
    violations.push({
      metric: 'guiYuanRate',
      bound: 'guiYuanRate.min',
      boundValue: GUARDRAIL_GUIYUAN_MIN,
      actual: metrics.guiYuanRate,
      message: `归元率 ${metrics.guiYuanRate} 低于下界 ${GUARDRAIL_GUIYUAN_MIN}`
    });
  }
  if (metrics.guiYuanRate > GUARDRAIL_GUIYUAN_MAX) {
    violations.push({
      metric: 'guiYuanRate',
      bound: 'guiYuanRate.max',
      boundValue: GUARDRAIL_GUIYUAN_MAX,
      actual: metrics.guiYuanRate,
      message: `归元率 ${metrics.guiYuanRate} 高于上界 ${GUARDRAIL_GUIYUAN_MAX}`
    });
  }
  if (metrics.p1WinRate < GUARDRAIL_P1_WIN_MIN) {
    violations.push({
      metric: 'p1WinRate',
      bound: 'p1WinRate.min',
      boundValue: GUARDRAIL_P1_WIN_MIN,
      actual: metrics.p1WinRate,
      message: `先手胜率 ${metrics.p1WinRate} 低于下界 ${GUARDRAIL_P1_WIN_MIN}`
    });
  }
  if (metrics.p1WinRate > GUARDRAIL_P1_WIN_MAX) {
    violations.push({
      metric: 'p1WinRate',
      bound: 'p1WinRate.max',
      boundValue: GUARDRAIL_P1_WIN_MAX,
      actual: metrics.p1WinRate,
      message: `先手胜率 ${metrics.p1WinRate} 高于上界 ${GUARDRAIL_P1_WIN_MAX}`
    });
  }
  if (metrics.heapUsedDeltaMB >= GUARDRAIL_HEAP_MAX_MB) {
    violations.push({
      metric: 'heapUsedDeltaMB',
      bound: 'heapUsedDeltaMB.max',
      boundValue: GUARDRAIL_HEAP_MAX_MB,
      actual: metrics.heapUsedDeltaMB,
      message: `堆内存增量 ${metrics.heapUsedDeltaMB}MB 不低于上界 ${GUARDRAIL_HEAP_MAX_MB}MB`
    });
  }

  return violations;
}
