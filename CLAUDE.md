# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 项目概述

**归元弈** 是一款基于中国传统五行文化的策略对战游戏，融合太极曲线美学和五行相生相克机制。

- **项目根目录**: 当前目录
- **治理文档**: `RULES/` 目录包含 Project-Brain 六根柱治理框架
- **技术栈**: 原生 JavaScript (ES6+) + Vite + Supabase

---

## 常用命令

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

---

## 架构原则

### 核心设计模式

**模块化分层架构 + 事件驱动通信**

所有模块通过 `EventBus` 通信，完全解耦：
- **Logic** (`js/logic/`) - 纯游戏逻辑，无 UI 依赖
- **State** (`js/state/`) - 状态管理，返回不可变状态副本
- **View** (`js/ui/`) - 仅负责渲染，不包含业务逻辑
- **Interaction** (`js/interaction/`) - 用户输入处理

### 架构红线（重要）

1. **150 行文件限制**: 单文件超过 150 行必须拆分
2. **灵肉分离**: UI 文件中严禁包含复杂计算或业务规则
3. **配置驱动**: 业务常量必须存放于 `js/config/game-config.js`
4. **事件通信**: 模块间禁止直接调用，必须通过 EventBus

### 数据流向（单向）

```
用户操作 → InputHandler → EventBus → GameEngine → StateManager
                                                              ↓
                                    ┌─────────────────────────┼───────────────────┐
                                    ↓                         ↓                   ↓
                              Renderer                   SyncManager          EventBus
                                    ↓                         ↓                   ↓
                              UI动画                      Supabase             事件通知
```

---

## 目录结构

```
src/
├── main.js                    # 应用入口，模块初始化顺序
├── style.css                  # 全局样式（五行颜色、响应式基准）
│
├── js/
│   ├── bus/
│   │   └── EventBus.js        # 事件总线核心（所有模块通信中枢）
│   │
│   ├── config/
│   │   └── game-config.js     # 游戏配置：五行规则、积分表、天干映射
│   │
│   ├── logic/
│   │   ├── actions/           # 操作候选、解析、计分
│   │   ├── ai/                # AI 控制器
│   │   ├── flow/              # 游戏流程、回合管理
│   │   └── GameEngine.js      # 游戏引擎：天干生成、决策、积分、胜负判定
│   │
│   ├── state/
│   │   ├── StateManager.js    # 游戏状态管理（节点、分数、回合）
│   │   └── ui-state.js        # UI 状态管理
│   │
│   ├── ui/
│   │   ├── animation/         # 动画管理器、粒子特效、场景转场
│   │   ├── board/             # 棋盘渲染、节点渲染、动画
│   │   ├── decisions/         # 决策面板
│   │   ├── effects/           # 视觉特效（爆炸、飞行、撞击等）
│   │   ├── overlays/          # 胜利/等待/成就覆盖层
│   │   ├── Renderer.js        # 渲染控制器
│   │   └── LeaderboardUI.js   # 排行榜 UI
│   │
│   ├── interaction/
│   │   └── InputHandler.js    # 输入处理：点击、触摸、菜单选择
│   │
│   ├── network/
│   │   ├── supabaseClient.js  # Supabase 客户端配置
│   │   ├── RoomManager.js     # 房间管理：创建、加入、匹配
│   │   ├── SyncManager.js     # 状态同步：混合同步模式（完整/增量）
│   │   ├── LeaderboardManager.js  # 排行榜管理
│   │   ├── AuthorityExecutor.js   # 权威执行器
│   │   ├── CommandSender.js       # 命令发送
│   │   ├── GameCommand.js         # 游戏命令定义
│   │   ├── ReconnectionManager.js # 断线重连
│   │   └── StateSnapshotManager.js # 状态快照
│   │
│   ├── types/
│   │   └── events.js          # 事件类型定义：GAME/UI/ANIMATION/INPUT 事件
│   │
│   └── utils/
│       ├── dom.js             # DOM 工具函数
│       ├── easing.js          # 缓动函数
│       └── DebugController.js # 调试控制器
│
├── css/                       # 样式文件
│   ├── variables.css          # CSS 变量
│   ├── fonts.css              # 字体定义
│   └── components.css         # 组件样式
│
└── types/                     # TypeScript 类型定义
    └── events.js
```

---

## 核心游戏机制

### 五行相生相克规则

```javascript
// 木(0) → 火(1) → 土(2) → 金(3) → 水(4) → 木(0)
// 木克土、火克金、土克水、金克木、水克火
RULES = {
  0: { s: 1, k: 2 },  // 木：相生火，相克土
  1: { s: 2, k: 3 },  // 火：相生土，相克金
  2: { s: 3, k: 4 },  // 土：相生金，相克水
  3: { s: 4, k: 0 },  // 金：相生水，相克木
  4: { s: 0, k: 1 }   // 水：相生木，相克火
};
```

### 节点状态值

| 值 | 名称 | 视觉表现 |
|----|------|----------|
| -1 | 道损 | 邪恶红色裂纹 |
| 0 | 虚空 | 暗淡无光 |
| 1 | 点亮 | 正常光辉 |
| 2 | 加持 | 强烈光效 |

### 游戏模式

- `gameMode: 0` - PvP（玩家对战）
- `gameMode: 1` - PvAI（玩家 vs AI 天道）
- `gameMode: 2` - AIvAI（天道运转演示）

---

## 事件系统

### 事件命名规范

```javascript
// 格式：namespace:action-name
'game:start'              // 游戏开始
'game:action-selected'    // 玩家选择操作
'ui:show-decision'        // 显示决策面板
'anim:impact-stage1'      // 撞击动画第一段
```

### 核心事件分类

- `GAME_EVENTS` - 游戏逻辑事件（状态变更、胜负判定）
- `UI_EVENTS` - UI 渲染事件（显示/隐藏面板）
- `ANIMATION_EVENTS` - 动画事件（粒子、转场）
- `INPUT_EVENTS` - 交互事件（点击、菜单）
- `PLAYER_EVENTS` - 玩家事件（登录、档案）
- `LEADERBOARD_EVENTS` - 排行榜事件

---

## Project-Brain 治理框架

项目遵循 Project-Brain V1.1.2 规范，六根柱位于 `RULES/` 目录：

| 文档 | 路径 | 用途 |
|------|------|------|
| REQ | `RULES/REQUIREMENTS.md` | 需求文档、游戏规则、积分系统 |
| DSG | `RULES/DESIGN.md` | 技术设计、模块架构、数据流 |
| ARC | `RULES/ARCHITECTURE.md` | 架构原则、文件组织规范 |
| RMP | `RULES/ROADMAP.md` | 开发阶段、任务规划、版本规划 |
| TST | `RULES/TEST_PLAN.md` | 测试计划 |
| CHG | `RULES/CHANGELOG.md` | 变更日志 |

任何代码修改前，先检查相关柱石文档，确保符合治理规范。

---

## 开发注意事项

1. **路径处理**: Windows 环境下跨目录操作使用绝对路径
2. **状态不可变**: StateManager 返回状态副本，防止意外修改
3. **动画同步**: 逻辑层监听动画完成事件再执行下一步
4. **调试面板**: DebugController 提供状态修改和事件触发功能
5. **响应式**: 使用 `clamp(8px, 2.564vw, 10px)` 作为字体基准

---

## 当前开发状态

参考 `RULES/ROADMAP.md`：
- Phase 1-3（基础设施、数据流、UI）已完成
- Phase 4（网络对战）进行中
- Phase 5（排行榜）进行中
- Phase 6-8（账户、成就、优化）待开始
