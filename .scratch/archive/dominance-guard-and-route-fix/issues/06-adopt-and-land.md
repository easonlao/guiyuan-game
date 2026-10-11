# 06: 采纳与落地 (Adopt and Land)

**What to build:** 把 05 选出的候选改动落地到生产规则，并让护栏、绊线与文档跟上新规则。

**Blocked by:** 05 候选规则的有界搜索

**Status:** closed

- [x] 生产计分与终局结算口径按候选改动更新。证据：`POINTS_CONFIG.ATTACK_PROGRESS_SCALE = { floor: 0.3, span: 0.9 }`（`62bad65`）；终局结算口径未变（候选 A 不涉及）。
- [x] 复跑并**重设**护栏带——现有带描述的是改动前的现状，不是新游戏的目标值。证据：`tests/core/ai-evaluator-benchmark-guardrails.test.ts`（`b8e6cb1`）——归元率新锚点 90.40%，带 `[0.75,0.95]→[0.86,0.95]`；先手带 `[0.45,0.55]→[0.47,0.54]`。
- [x] 更新绊线：它现在钉住「激进压制 6/6 占优」，改动后应读作「不存在严格占优」。证据：`tests/core/dominance-regression-guard.test.ts` 重写为「不存在严格占优」并用显著性证据（`b8e6cb1`）。
- [x] 同步文档：GDD 计分表与实现对齐；ADR 0011 追加采纳记录。证据：`docs/GDD.md` §2.1；`docs/adr/0011-balance-route-fix-rules.md`「采纳记录：进度定价」（`fd34b5a`）。
- [x] 记录被否决的候选，及各自失败在哪一条标准。证据：`docs/headless/candidate-search.md` §2（B/C/D/E 失败矩阵）；ADR 0011 采纳记录 §7。
- [x] 动作价值普查在新规则下的报告存档。证据：`docs/headless/action-value-census.md` 按新规则重生成（`globallyDominated` 仍为空）。
- [x] 护栏测试全绿；工作区无残留。证据：`npm test` 681 测试 / 37 文件全绿；`git status` 干净。
- [x] 测量台与实验命令不得因本票被回退。证据：`benchmark:*` 脚本保留；无回退。
