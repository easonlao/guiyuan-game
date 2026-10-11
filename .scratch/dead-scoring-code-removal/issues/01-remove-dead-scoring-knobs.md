# 删除计分模块的死代码（稀有度链 / 零分动作旋钮 / 第三份计分真相）

**What to build:** 依据 `docs/headless/knob-census.md` §5 的死参数清单与 ADR 0011「决策 3」（接线或删除另立工单），删除 `src/core/logic/ScoreCalculator.ts` 中在生产路径无消费者的计分旋钮，并同步移除仅为其存在的测试，使「配置里存在的字段 = 会生效的字段」重新成立。

**Blocked by:** None

**Status:** done

## 背景

`docs/headless/knob-census.md` 的逐参数普查（`tests/core/dead-knob-census.test.ts`）确认以下符号在生产路径无消费者。它们留在配置里会诱导「调它试试」的无效实验：

| 死符号 | 位置 | 死因 |
| --- | --- | --- |
| `PointsConfig.RARITY_MULTIPLIER` | `ScoreCalculator.ts:104` | 只被 `applyRarityBonus` 的默认参数读取 |
| `PointsConfig.NO_RARITY_ACTIONS` | `ScoreCalculator.ts:107` | 只被 `isNoRarityAction` 读取 |
| `ACTION_PROBABILITY` | `ScoreCalculator.ts:125` | 只被 `applyRarityBonus` 读取 |
| `ScoreCalculator.applyRarityBonus` / `isNoRarityAction` | `ScoreCalculator.ts:297` / `:290` | 生产路径无调用点 |
| `ScoreConfig` / `DEFAULT_SCORE_CONFIG` | `ScoreCalculator.ts:139` / `:149` | 生产只消费 `PointsConfig`；仅 `tests/core/score-calculator.test.ts` 引用 |
| `PointsConfig.ACTION.DISSIPATE` | `ScoreCalculator.ts:86` | `ActionResolver` 的 `DISSIPATE` 分支强制 `scoreDelta = 0` |
| `PointsConfig.ACTION.PASS` | `ScoreCalculator.ts:87` | `ActionResolver` 的 `PASS` 分支强制 `scoreDelta = 0` |

ADR 0002 已加勘误记录稀有度链失效（见该 ADR「勘误」节）。

## 验收标准

- [x] 删除上表全部死符号；`POINTS_CONFIG` 不再含 `RARITY_MULTIPLIER` / `NO_RARITY_ACTIONS` / `ACTION.DISSIPATE` / `ACTION.PASS`。
- [x] 删除 `applyRarityBonus` / `isNoRarityAction` 及其测试（`tests/core/scoring-attack-buff-rarity.test.ts` 中相应用例），或把该测试改名为仅覆盖仍生效的 2.5× 攻击强化。
- [x] 删除或改写 `ScoreConfig` / `DEFAULT_SCORE_CONFIG` 及其测试，使其引用 `POINTS_CONFIG`。
- [x] 同步 `tests/core/dead-knob-census.test.ts` 的 `SCORING_KNOBS` 清单（完整性断言会强制这一变更被显式做出）。
- [x] 同步 `docs/headless/knob-census.md` §0/§1/§5 与 `docs/GDD.md` §2.1（若其仍列稀有度加成）。
- [x] `npm test`、`npm run typecheck`、`npm run lint` 全绿。

## 不在本票范围

- `PointsConfig.RACE_DIFF_PRICING`、`TurnManagerOptions.rules` / `ActionCandidatesOptions.rules`、`BenchmarkOptions.recordActions` 属「WIRE 或 DELETE」二选一，需要先决定是否接线，另立工单。
- 若未来要复活稀有度机制，属于新机制，应重新接线而不是恢复死字段。
