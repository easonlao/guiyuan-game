# [wayfinder:map] 第一阶段：重构纯代码游戏逻辑与测试闭环

## Destination

将游戏的核心规则（五行生克、行动回合等）完全写成独立的纯 TypeScript 代码，与游戏画面（Cocos）剥离，并确保这些规则100%能通过自动化测试。

## Notes

- Domain: 归元弈 (Guiyuan) - 轻度策略五行博弈小游戏
- Skills: TypeScript, Vitest, oxc (oxlint), dependency-cruiser
- Preferences: AI-First 架构，逻辑与表现严密解耦，无界面（Headless）优先。

## Decisions so far

- [搭建基础代码环境](file:///home/easonlao/projects/guiyuan-game/.scratch/ticket-setup-env.md): 选用 TS(v5) + Vitest + oxlint + dependency-cruiser，已完成本地配置和连通性测试。
- [定义基础游戏数据模型](file:///home/easonlao/projects/guiyuan-game/.scratch/ticket-define-models.md): 严格按照 SRS 创建了强类型的 `models.ts`（涵盖 `NodeStateValue`、`ActionType`、`Element`、`Polarity`）。
- [实现游戏核心动作解析器](file:///home/easonlao/projects/guiyuan-game/.scratch/ticket-implement-actions.md): 正在进行。目标是实现 `ActionResolver` 并覆盖 Vitest 边界测试。

## Not yet specified
- 拓展目标 D：开发无画面的 AI 对战模拟器，用于测试性能和策略平衡。
- 拓展目标 E：设计本地存档功能的读写接口。

## Out of scope

- Cocos Creator 内部的 UI 绑定、动画制作与渲染逻辑（遵循 HLD，UI 层留给人类开发者后续挂载）。
