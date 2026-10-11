# 02: 交互式操作按钮组件与动作派发切片 (Interactive Action Button & TurnManager Dispatch)

**Type:** task

**What to build:** 实现响应式按钮组件 `Button` 与操作面板 `ActionBarView`，端到端打通玩家输入到核心状态机：根据当前回合天干及合法动作候选，自动动态渲染【吸纳】【调息】【化】【破】【强化】等按钮组，触摸时提供触觉级按压缩放微动，点击有效按钮时向 `TurnManager` 提交 `ActionPayload` 推进回合。

**Blocked by:** 01: 极简场景树基座与触控调度 (Scene Graph Core & Input Dispatcher)

**Status:** resolved

- [x] `Button` 节点支持自动尺寸计算、按压缩放反馈微动、置灰禁用态与 `onTap` 点击回调。
- [x] `ActionBarView` 自动订阅 `TurnManager` 的当前合法动作（`ActionCandidates`），动态排版可用操作并禁用非法操作。
- [x] 点击可用按钮时，正确向 `turnManager.executeAction(...)` 派发合法的动作载荷推进核心状态机。
- [x] 具备无头单元测试：模拟玩家点击特定动作按钮，断言 `TurnManager` 内部状态产生对应的合法流转。

## Answer

`Button`（`src/minigame/scene/button.ts`：自动尺寸、按压缩放 0.92、禁用态、`onTap`）与 `ActionBarView`（`src/minigame/views/action-bar-view.ts`：按 `getAvailableActions()` 排版，点击派发 `executeAction`，订阅后自动置灰、`dispose()` 退订）。

测试：`minigame-button.test.ts`、`minigame-action-bar-view.test.ts`（真实 seeded `TurnManager`，断言完整载荷与状态流转）。

范围界定：唯一候选的自动流转**不在**本视图——按 ADR 0008 归 `GameScene`；本视图对唯一候选仍渲染一个按钮。`InputManager` 在手指移出后抬起不给回调，`Button` 可能停在按下缩放态（`release()` 可复位）。

提交 `c1dc12b`；合并 `9d429d6`。
