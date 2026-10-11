# 02: 评估参数化（回合上限、种子数、先手交换）

**What to build:** 让批量评估与锦标赛的回合上限、种子数可配置，默认与正式游戏一致（60 回合），并在所有对阵中交换先手、报告有效样本。

**Blocked by:** 无（建议在 01 之后执行）

**Status:** closed

**背景证据：** 评估默认 `maxTurns=12`（`scripts/headless-strategy-evaluation.js:19`、`StrategyEvaluation.js:396`），正式游戏 60（`src/js/state/StateManager.js:63`）；固定局面 `maxTurns=20`（`tests/fixtures/fixed-position-continuations/reachable-positions.js:38`）。只用种子 202603/202604（`StrategyEvaluation.js:119-131`）。锦标赛 `createInitialHeadlessState({maxTurns})` 未交换先手（`StrategyTournament.js:94`）。

- [x] CLI 与 API 支持 `--max-turns`（可多值扫描）与 `--seeds N`；默认 60 回合，默认种子数 ≥200。
- [x] 固定局面续局默认按正式回合上限继续，不再使用 20。
- [x] 锦标赛与批量比较对每个种子、每组策略都交换先手。
- [x] 报告运行次数与有效样本数（唯一动作序列数）分开；重复对照不计入独立样本。
- [x] 记录每局终局原因（五行归元 / 回合上限结算）及终局点亮侧数。
- [x] 测试覆盖：参数传递、先手交换成对出现、默认值与正式规则一致。
- [x] 记录 200 种子 × 60 回合的运行耗时：单局约 21ms，200 种子全配对（7,200局）约 150 秒。
