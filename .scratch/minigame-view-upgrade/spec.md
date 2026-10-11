---
status: ready-for-agent
---

# Spec: 微信小游戏表现层轻量化场景树架构改造 (minigame-view-upgrade)

## Problem Statement

当前《归元弈》微信小游戏表现层（`src/minigame/`）采用纯命令式原生 Canvas 2D 逐像素绘制（`pixel-art.ts` 约 510 行手绘 `ctx.fillRect` 坐标计算，`game-manager.ts` 约 814 行手动触摸碰撞判定与时间帧步进）。这种“从零手搓像素与坐标”的开发模式极度沉重：
1. **排版与交互极其繁琐**：每一个操作按钮【调息】【化】【破】【强化】都需要手动硬编码矩形区域，并在 `handleTouch` 中编写复杂的几何命中判定；
2. **动效与状态耦合严重**：天干符文飞行动画、生克连线、受击震屏与业务逻辑交织在单一全局渲染循环中，缺乏独立的补间驱动；
3. **表现力受限且维护成本高**：角色表情、法盘高亮、状态气泡难以快速迭代与复用，违背了低成本、高质量小游戏开发的初衷。

## Solution

在**保持底层核心博弈逻辑（`src/core/`）完全不变**的前提下，重构微信小游戏表现层（`src/minigame/`），引入基于纯 TypeScript 的**轻量级场景树架构（Scene Graph & Container System）**与**补间缓动引擎（Tween Engine）**：
1. **场景树与容器化**：构建轻量 `Node` 与 `Container` 树形结构，提供局部变换（坐标、缩放、透明度）与递归渲染；
2. **声明式交互组件**：封装 `Button` 组件，内置自动递归触摸命中检测、点击缩放反馈与状态管理，彻底消灭手动坐标命中计算；
3. **独立补间动画系统**：实现声明式 `Tween` 缓动系统（支持 Ease 曲线、序列与回调），使天干降临、流星吸收飞行、震屏与法术连线与主逻辑完全解耦；
4. **模块化视图分层**：
   - `BoardView`：基于极坐标算法自适应排布五行（金木水火土）10 个阴阳节点与生克连线；
   - `ActionBarView`：响应 `TurnManager` 的可行行动，自动排版并高亮可用动作按钮；
   - `CharacterView`：管理双方化身状态、表情反馈与气泡播报；
   - `RuneFlightView`：承载天干降临与吸收飞行动画；
5. **单向数据流桥接**：`GameScene` 作为表现层总控制器，纯粹消费 `TurnManager.getState()` 作为数据驱动源，并将玩家交互转化为动作派发。

## User Stories

1. As a player, I want to see a clear Five Elements pentagram board (Wood, Fire, Earth, Metal, Water) with distinct Yin and Yang slots, so that I can easily recognize the state of all 10 nodes (-1 道损, 0 虚空, 1 点亮, 2 加持).
2. As a player, I want the TianGan rune of the current turn to appear at the center of the screen with clear element and polarity styling, so that I instantly know which element is in play.
3. As a player, I want action buttons (调息 / 化 / 破 / 强化 / 强破) to be dynamically displayed and styled based on currently valid moves, so that I cannot execute illegal actions.
4. As a player, I want action buttons to provide immediate visual feedback (e.g. scale down on press, highlight active choices) when touched, so that the game feels responsive and tactile.
5. As a player, I want the TianGan rune to smoothly animate from the center to its target node upon absorption, so that I can visually track the flow of energy.
6. As a player, I want 爆发动作（强化 / 强破）to have distinct visual emphasis, so that I feel the strategic impact of high-tier plays.
7. As a player, I want my avatar and the opponent's avatar to react with distinct visual states (idle, cast, damaged, stunned), so that the match feels alive with emotional feedback.
8. As a player, I want banner announcements and turn status to clearly indicate whose turn it is, whether an extra turn was granted, and game over results, so that I always understand match progress.
9. As a developer, I want a unified `Node` / `Container` hierarchy with automatic touch hit testing, so that I never have to write hardcoded `if (x >= btn.x && ...)` collision logic again.
10. As a developer, I want a standalone `Tween` engine for animations, so that flight paths, screen shakes, and fades can be chained without polluting the game state loop with manual tick counters.
11. As a developer, I want the view layer to be a pure reactive projection of `TurnManager.getState()`, so that UI bugs cannot corrupt core game rule state.
12. As a developer, I want the game to compile seamlessly into `minigame/game.js` via existing Vite build pipeline with zero external GUI engine dependencies, so that WSL and WeChat DevTools development remains frictionless.

## Implementation Decisions

- **Architecture Decision**: Introduce a lightweight scene graph (`Node` / `Container` / `Button` / `InputManager`) plus a tween engine (`Tween`) into the view layer, leaving Layer 1 untouched. Rationale lives in ADR 0005; component contracts (fields, signatures, transform and hit-test semantics) live in `docs/HLD.md` §2 Layer 3 and `docs/LLD.md` §4 — this spec does not restate them.
- **Modules to Build**: the `Node` / `Container` / `Button` / `InputManager` / `Tween` base, the four business views `BoardView` / `ActionBarView` / `CharacterView` / `RuneFlightView`, and the `GameScene` orchestrator. Per-module responsibilities are in HLD §2 Layer 3.
- **Core Engine Boundary**: Layer 1 (`src/core/`) stays 100% untouched; `GameScene` talks to it only through `TurnManager` public APIs — `startTurn()`, `getState()`, `getCurrentTianGan()`, `getAvailableActions()`, `executeAction()`, `getEventBus()`. The presentation-layer contract (read-only snapshot, candidate query, action submission, one-way data flow, event subscription) lives in `docs/LLD.md` §4.
- **Interaction Constraint (must be preserved)**: low-state `AUTO` and extreme-state `DISSIPATE` flow through animation directly from the view layer; interactive buttons render only when the mid-state has multiple choices. This is the contract of ADR 0006 and ADR 0008, already implemented in `game-manager.ts`, and the refactor must not regress it.

## Testing Decisions

- **Testing Philosophy**: Test external behavioral contracts and event flows, not internal Canvas drawing commands (e.g. do not test whether `ctx.arc` was called with specific floats; test that tapping button X dispatches action Y and updates node view state Z).
- **Test Seam**:
  - Highest Seam: `GameScene` / View Orchestrator with Mock Canvas Context & Mock TurnManager.
  - Secondary Seam: `InputManager` hit testing against nested `Container` / `Button` graphs.
  - Animation Seam: `Tween` ticker deterministic step advances without real-time delays.
- **Prior Art**:
  - Existing core tests in `tests/core/` (such as `turn-manager.test.ts` and `minigame-action-buttons.test.ts`) demonstrate deterministic testing using seeded PRNG and mock callbacks.

## Out of Scope

- Introducing heavyweight third-party GUI engines (Cocos Creator, Unity, heavy DOM adapters) that break WSL CLI development.
- Modifying Layer 1 core rules, state structures, scoring algorithms, or AI strategies in `src/core/`.
- Adding backend network multiplayer or persistence protocols (covered in future metagame milestones).
- Audio and BGM asset integration (deferred to a subsequent audio milestone).

## Further Notes

- Complies with ADR 0004 (`docs/adr/0004-pure-ts-canvas-wechat-minigame.md`). The architectural decision behind this refactor is ADR 0005 (`docs/adr/0005-scene-graph-and-tween-for-minigame-view.md`); the interaction contract is bound by ADR 0006 (strict three-tier state + zero-latency low-state absorption) and ADR 0008 (single-candidate auto-execution).
- The artifact `minigame/game.js` is committed and gated by a byte-for-byte reconciliation check (ADR 0014). Final acceptance runs `npm run verify` (typecheck / test / `check:artifact`), not `npm run build:minigame` alone.
