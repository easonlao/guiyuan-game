# 02: 删除三个未接线的选项旋钮（RACE_DIFF_PRICING / rules 转发 / recordActions）

**What to build:** 依据 `docs/headless/knob-census.md` §5 的「WIRE 或 DELETE」条目，删除三个在生产路径无消费者、且已决定不接线的选项旋钮，避免它们被误以为生效。

**Blocked by:** None

**Status:** resolved

## 决定（2026-10-10）

三者均 **DELETE**（不接线）：

| 旋钮 | 现状 | 决定 |
| --- | --- | --- |
| `PointsConfig.RACE_DIFF_PRICING` | 生产 `POINTS_CONFIG` 不设置该字段，`raceDiffPoints` 恒等 0；机制代码存在但未接线 | DELETE（连同 `raceDiffPoints` 与 `ActionResolver` 中的应用点） |
| `TurnManagerOptions.rules` / `ActionCandidatesOptions.rules` | 只转发到候选接缝，而 `getAvailableActions` 从不读 `rules` | DELETE（规则只属于策略，不影响候选生成） |
| `BenchmarkOptions.recordActions` | 转发到 `HeadlessMatch`，但 `BenchmarkMetrics` 不暴露逐动作记录 | DELETE（批量报告不需要逐动作证据） |

## 验收标准

- [x] 删除上表三个旋钮及其应用点 / 转发链。
- [x] 同步 `tests/core/dead-knob-census.test.ts` 的 `SCORING_KNOBS` 清单与 `docs/headless/knob-census.md` §0 / §2 / §5。
- [x] `npm test`、`npm run typecheck`、`npm run lint` 全绿。

## 与工单 01 的关系

工单 01 处理计分模块内部的死符号（稀有度链、零分动作旋钮、`ScoreConfig`）。本票处理选项层（`Options`）的未接线旋钮。两者可并行。
