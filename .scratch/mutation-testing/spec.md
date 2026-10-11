# Spec: 变异测试落地 (mutation-testing)

## Problem Statement

测试全绿不等于测试有用。这个仓库是 AI 主导开发的，代码和测试由同一个 agent 写，"测试看起来绿了但没断言到行为"是这里最典型的失效模式。变异测试正是针对它的：往代码里注入小 bug，看测试抓不抓得住。

当前状态（2026-10-10 落地前的初始诊断，见文末「落地结果」）：

- `stryker.config.json` 已修好两个阻断问题：dry run 因重仿真用例 hook 超时失败、`coverageAnalysis: "perTest"` 在 Stryker 10 + Vitest 5 下退化为"0 个测试/突变体"（所有突变体误报存活）。
- 修好后单文件实测 `ScoreCalculator.ts` = **60.63%**（77 杀 / 45 存活 / 5 无覆盖）。
- 45 个存活里 **20 个落在生产根本不执行的死代码上**（稀有度链 13 个、赛跑差定价 7 个）；真正有信号的是 `calculateTransitionPoints` 上的 23 个。
- 仓库没有 CI，也没有 pre-commit hook——门禁的"红"没有流水线兜底，唯一消费者是跑它的那个 agent。

## 决定（2026-10-10 grill 结论）

1. **形态**：`implement` 收尾时对本次改动的文件跑变异、当场补断言（反馈最紧，且补测试本就属于 implement）；全量体检放里程碑（每个 spec 收尾 + 发版/提审前）。
2. **规则放哪**：写进 committed 的 `docs/MUTATION-TESTING.md`，`AGENTS.md` 加一行指针，`package.json` 加脚本。**不写 `.pi/skills/`**——它被 gitignore 且按 `AGENTS.md` 的说法会被更新覆盖，改动活不过一次更新。
3. **范围**：`src/core/logic/**`，排除只有 re-export 的入口文件；`EventBus` 这类管道的低价值存活进基线后不再追；暂不纳入 `src/core/ai/**` 与 `tools/**`（实验/工具，错了不污染对局结果）。
4. **等价突变体**：遇到确认等价的才就地 `// Stryker disable next-line` 并写理由。**不做全局排除规则**——计分表本身就是一堆数字常量，禁掉字面量突变等于把最该测的东西排除掉。
5. **门禁**：**基线棘轮**，不设全局固定阈值。仓库里存一份基线（当前全部存活突变体），跑完只对"基线里没有的"存活报警。固定阈值会被跟测试无关的变化误报（删死代码分数涨、加新模块分数跌），最后必然被关掉。
6. **先删死代码再建基线**（死代码删除见 `.scratch/dead-scoring-code-removal/`），否则基线里混着永远杀不掉的噪音。
7. **不立 ADR**：按 `domain-modeling` 的三条门槛（难以逆转 + 反直觉 + 真实权衡），"难以逆转"不成立。决策与理由记在 `docs/MUTATION-TESTING.md`。

## 落地结果（2026-10-10）

阶段 1–3c 全部完成，spec 的 7 条决定均已落地：

- **门禁形态**：基线棘轮（`mutation-baseline.jsonl` + `scripts/mutation-check.mjs`）。`mutation:check` 只对基线之外的 `Survived + NoCoverage` 报警（新增 `1` / 无新增 `0` / 缺报告、缺基线或**报告来自子集跑** `2`）。
- **基线现状**：**0 条**（从 223 收紧到 0）。全量变异分 **100.00%**（923 个计分突变体：Killed 922 / Timeout 1 / Survived 0 / NoCoverage 0）；另有 150 个确认等价 / 不可观测的突变体**就地 disable**（附理由），Stryker 记为 `Ignored`。
- **等价处理**：只就地 disable，**未加全局排除规则**（决定 4）。
- **子集防护（本次补）**：`mutation:changed` 的 `--mutate` 子集报告不能做棘轮对比，`mutation:check` 会识别并拒绝（退出 `2`）。
- 规则文档：`docs/MUTATION-TESTING.md`（committed），`AGENTS.md` 一行指针，`TEST_PLAN.md` §3 同步。

## 依据

- Google《State of Mutation Testing at Google》(ICSE-SEIP 2018) 与《Practical Mutation Testing at Scale》(IEEE TSE 2021)：变异测试在 code review 时**只对改动的行**跑；Google 明确说全库绝对变异分"infeasible"，且分数"neither concrete nor actionable"——他们不拿分数当门禁，而是把**单个存活突变体**作为 review 评论发出来（有用率 20% → 80%；70% 的高优先级 bug 能被这种方式提前发现）。
- 业界共识：门禁设"实测下限往下一点"做防回退棘轮，而不是设好看的整数；按成熟度的参考档位是"活跃开发 60 / 稳定库 75 / 高保障 90"；100% 不值得追（等价突变体是天花板）；把变异分当 KPI 会逼出"为杀而杀"的测试。

## Out of Scope

- `src/core/ai/**`、`tools/**` 的变异测试。
- 把变异分当作团队 KPI 或绝对质量指标。
- 引入 CI（本次只做本地/agent 内循环）。
