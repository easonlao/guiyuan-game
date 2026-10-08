---
status: accepted
---

# 从 Cocos Creator 转向纯代码 Canvas 2D 直出微信小游戏

为契合 WSL 纯代码/无 GUI 开发环境，消除开发者对重型外部编辑器的学习成本，并避免 Web 与小游戏双重维护浪费，我们将 Layer 3 表现层技术选型由“Cocos Creator 3.x”调整为“纯 TypeScript + Canvas 2D 直出微信小游戏”，并建立 Vite 自动化热构建流水线。

## 背景与问题

1. **环境与工作流割裂**：开发者在 WSL (Linux) 终端通过 AI 协作编码，而 Cocos Creator 3.x 是一款桌面 GUI 编辑器，无法在 WSL 纯终端中无头开箱即用，两边切换成本极高。
2. **避免双重开发浪费**：如果先单独做一套常规 Web 前端，后续为了发布微信小游戏再重构一遍，会造成重复工作量与界面尺寸/触屏机制偏差。
3. **小游戏底层契约足够轻量**：微信小游戏的本质是无 DOM 的 JavaScript + 原生 Canvas 环境。《归元弈》作为基于五行环形与阴阳状态的轻量博弈游戏，核心表现层完全可通过高性能 2D Canvas 纯代码驱动，首包体积极小（预计 < 1MB，远低于 4MB 限制）。

## 决定

1. **确立 Layer 3 为纯代码驱动**：
   - 源代码组织于 `src/minigame/`，直接消费 Layer 1（`src/core/`）导出的 `TurnManager`、`State`、`EventBus`。
   - 渲染完全基于标准 Canvas 2D 上下文（`wx.createCanvas()`），配合像素比（`pixelRatio`）与手机竖屏适配。
2. **构建管线与自动化输出**：
   - 配置 Vite 构建管道（`vite.config.minigame.mjs`），将代码打包为单个高内聚 `minigame/game.js`。
   - 微信小游戏项目根目录收敛在 `minigame/`（包含 `game.json` 与 `project.config.json`）。
   - 提供 `npm run build:minigame`（单次打包）与 `npm run dev:minigame`（监听代码自动热打包）。
3. **Windows 微信开发者工具直连**：
   - Windows 上的微信开发者工具直接导入 `\\wsl$\.../minigame` 目录，作为唯一的真机仿真视窗，实时预览 Canvas 画面变化。

## 被否决的方案

- **方案 A（维持原定 Cocos Creator 3.x）**：否决原因：Cocos 学习门槛高，必须在 Windows GUI 桌面环境下操作，破坏了 WSL 命令行内与 AI 紧密协作的高效闭环。
- **方案 B（先做通用 DOM 网页版）**：否决原因：DOM 动画无法直接在微信小游戏环境运行，后续移植必须二次重构，且容易出现屏幕比例脱节。

## 后果

- 零外部 GUI 软件强依赖，全工程纯 TS 纯代码驱动。
- WSL 与 Windows 微信开发者工具形成无缝文件级热更新联动。
- 保留极高打包纯净度与启动速度，零额外引擎体积包袱。
