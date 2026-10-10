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
 * 下界 0.75 拦不住任何回退。把定义收敛到本模块后，漂移在结构上不可能再发生；
 * `tests/core/guardrail-band-single-source.test.ts` 是防止有人重新硬编码的守卫。
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
