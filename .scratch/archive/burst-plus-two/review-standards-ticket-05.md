# 标准轴复审 — 工单 05 工作区改动（对 `HEAD` = 458da3c）

轴：Standards（仓库成文标准 + Fowler ch.3 嗅探基线）。Diff：`git diff HEAD`（11 文件，+178/−60）。
证据运行：`npx vitest run` 49 文件 / 895 用例全绿；`check:quick`、`typecheck`、`check:artifact`（逐字节一致）全绿；
500 局 / 种子 10000 自对弈复现锚点 归元 92.00% / 先手 49.20% / 平均 18.18。

## 硬违规

**H1. 变异基线未重钉——`mutation:check` 会报 1 条假新增存活。**
`src/core/logic/ScoreCalculator.ts:62-64` 插入了 3 行注释，`TRANS: 160` 落到 `:65`；其后的行号整体 +3。
`mutation-baseline.jsonl:23` 记的是 `{ScoreCalculator.ts, line 162, ConditionalExpression}`，而该
`if (prevLevel === newLevel)` 现在在 `ScoreCalculator.ts:165`。身份键含行号（`docs/MUTATION-TESTING.md` §3.1：
「任何改变 `src/core/logic/**` 行号的改动…都会让基线条目的 `line`/`column` 失效…改完按 §3.2 重跑全量并刷基线」），
故下次全量跑必报这条为「疑似只是移位」的新增；本 diff 未动基线文件。§2.2 + 根 `AGENTS.md`（spec 收尾跑
`mutation:milestone`，触发者只能是 agent）要求本票做这件事；`verify` 不含 `mutation:check`，没人拦。
同一类问题上一轮标准复审已提（`review-standards.md` H1），并在 `756dfe2` 重钉过。

**H2. 两处注释把新值写成 150（实际 160）。**
`tests/core/candidate-validation.test.ts:65`（「把生产值从 30 抬到 150」）与
`tests/core/minigame-game-scene.test.ts:872`（「化 30→150」），与 `ScoreCalculator.ts:65`、报告 §7、issue
的 160 自相矛盾。

**H3. 锚点事实出现第二、第三个家，且值已冲突。**
`tools/GuardrailBand.ts:18-31` 把锚点重录为 92.00% / 49.20%、回退为 75.80% / 58.60%，但
`tests/core/guardrail-band-single-source.test.ts:29-33` 仍写 0.904 / 0.504 与 0.884 / 0.512（测试名亦称
「实测锚点 90.40% / 50.40%」），`docs/headless/candidate-search.md:53` 仍以现在时断言「锚点 90.40% / 50.40%…
回退 88.40% / 51.20%」（`guardrail-provenance.md:28` 同）。违反 `AGENTS.md`「每个事实只有一个家」，
也违背该测试存在的目的（防锚点漂移）；两条断言仍落在带内 → 静默漂移，不红。

## 判断项

1. **决定没有 ADR 家。** `docs/headless/burst-plus-two-balance.md:162` 以「**决定：`POINTS_CONFIG.ACTION.TRANS`
   30 → 160**」开场，且 §7.3 是被否决方案表——而该文件头部自称「报告类：只做证据与导航，不定义规则」，
   `AGENTS.md`「ADR 的边界」把「为什么这么定」归 `docs/adr/`。前例：0001/0002/0011/0016 都有 ADR。判断：ADR 门槛
   的「难以撤销」不成立，可只留 issue；但报告不该由自己承载「决定」句式。
2. **带宽 vs 噪声。** `GUARDRAIL_P1_WIN_MAX = 0.51` 只比新锚点高 1.8pp，而本 diff 自己的 2000 局基线钉值是
   52.55%（`tests/core/experiment-runner.test.ts:224,252`，带外）；§7.4 已如实披露，但 issue 验收项
   「先手胜率回到 `[0.47, 0.51]`」勾选时未带这个限定词。
3. **反向样本换成合成配置。** `candidate-validation.test.ts:65-75` 用 `TRANS: 0`（既非生产旧值 30，也不再是带的
   回退口径 `ATTACK_PROGRESS_SCALE: undefined`），「本票改动的最小反向样本」说法与实测反向值不符。

## 嗅探（Fowler）

- **Duplicated Code**：同一段理由句复制到六处（`ScoreCalculator.ts:62-64`、生成物 `game.js`、四个测试文件、
  报告 §7、issue Comments）——H2 的 150/160 正是这种复制的直接产物。理由句可以只留代码一处 + 指针。
- 其余基线嗅探（Message Chains / Middle Man / Refused Bequest / Primitive Obsession 等）在本 diff 未见。

## 合规项（非缺陷）

护栏带**值**未动、只重录锚点并写明口径与回退，符合工单 05 的验收要求；各钉值更新都附理由与证据指针；
issue `Status:` / `## Comments` 格式符合 `docs/agents/issue-tracker.md`，02/03/04 均已 `resolved`；
术语用词与 `GLOSSARY.md` 一致（化 / 强化 / 爆发动作）。
