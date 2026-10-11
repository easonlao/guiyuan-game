# 05: 双方对战角色卡与完整对局主场景串联 (Dual Characters & Full Game Scene Integration)

**Type:** task

**What to build:** 实现 `CharacterView`（展示玩家与天道化身、行动指示器、表情反馈与计分播报），并由 `GameScene` 控制器将五行阵盘、动作按钮、天干飞行动效与双方角色交互完整串联为自闭环对局，废除旧版命令式代码，完成 Vite 打包与真机验证。

**Blocked by:** 04: 轻量缓动引擎与天干降临/流星飞行动效 (Tween Engine & Rune Flight Animation)

**Status:** resolved

- [x] `CharacterView` 呈现双方角色头像框架、当前行动回合标识、连动回合标记与比分展示。
- [x] `GameScene` 总协调器完成完整对战生命周期循环：抽天干 -> 符文降临 -> 玩家操作/AI 决策 -> 飞行动画 -> 棋盘变更 -> 连动/终局判定。
- [x] 保留 ADR 0006 / ADR 0008 交互契约：低位态 `AUTO` 与极位态 `DISSIPATE` 直接动画流转，仅中位态多重抉择时才渲染交互按钮。
- [x] 彻底清理或废止旧版硬算代码，确保表现层完全迁移至场景树体系。
- [x] 编写端到端场景集成测试，验证对局从第 1 回合平滑推进至终局结算。
- [x] `npm run verify` 通过（含 typecheck / test / `check:artifact` 逐字节对账入库的 `minigame/game.js`）。

## Answer

`CharacterView`（`src/minigame/views/character-view.ts`）与 `GameScene`（`src/minigame/game-scene.ts`）串联完整对局；`main.ts` 改为 dt 驱动的场景树主循环；删除 `game-manager.ts`（814 行）。

**ADR 0006 / 0008 契约**（复核独立验证无回归）：`actions.length === 1` 时 P1 进 `auto-pending`、不渲染按钮，P2 走内置 `createStrategy(BALANCED_WEIGHTS)`；`AUTO` / `DISSIPATE` 直接流转；仅中位态多候选才出按钮。`ActionCandidates` 保证候选 ≥ 1，故不会渲染空按钮栏。终轮天命揭牌经 `getEventBus()` 的 `showdown:draw` 保留。

测试：`minigame-game-scene.test.ts`（生命周期、单候选无按钮+自动执行+点击加速、极位散气直流通、`InputManager` 真实点击派发、飞行落点后投影、连动、揭牌、重开、resize、端到端至终局、同种子确定性）、`minigame-character-view.test.ts`。

提交 `c9e0af1` + 产物 `1855360`；合并 `df92704`。**两轴复核后补齐**：五类单候选（CONVERT/BURST/BURST_ATK/PASS/连动 TRANS）场景级用例、0.75s 缓冲时长钉桩、重开清揭牌；零引用旧代码退场（`pixel-art.ts` 四个绘制函数、`types.ts` 四个类型）；HLD 实现状态改写与 `docs/headless/knob-census.md` 勘误。最终 `npm run verify` 全绿（46 文件 / 799 用例，`check:artifact` 逐字节一致）。

遗留（已知，不阻塞）：`FormattedActionButton.isBurst` 生产侧无消费者（仅测试断言）。
