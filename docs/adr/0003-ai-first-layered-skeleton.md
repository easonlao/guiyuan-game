---
status: accepted
---

# 仓库骨架重构为 AI-First 三层解耦架构与工具链收敛

为实现《HLD》规划的纯单机微信小游戏 MVP，并建立高效的“AI 主导开发与确定性测试”闭环，我们将仓库骨架重构为分层解耦架构，并将核心工程工具链（oxlint、dependency-cruiser、Vitest）的检查与防护边界收敛至新的核心代码库。

## 背景与问题

原有仓库混杂了旧版 Web 端 DOM 渲染、CSS 动画、Supabase 云端联机及 LocalPVP 网络模块。这些遗留代码存在循环依赖、语法缺陷及与微信小游戏脱机单机架构冲突的问题，导致：
1. 静态检查工具链（`oxlint`）受到遗留语法告警与报错干扰；
2. 架构防腐工具链（`dependency-cruiser`）被遗留网络模块的循环依赖阻塞；
3. 测试工具链（`Vitest`）受制于遗留 JS 资产与沙箱环境兼容性，缺乏聚焦的 Layer 1 强类型测试。

## 决定

1. **归档遗留 Web 与网络资产**：
   - 将旧版 Web 端前端、旧 JS 逻辑、旧网络模块、旧测试及历史脚本完整归档至 `legacy/` 目录，保留 Git 历史与参考价值。
2. **构建全新的纯 TypeScript 分层骨架**：
   - **Layer 1（核心计算与状态层）**：`src/core/`，纯 TypeScript 环境，彻底隔离 DOM/BOM/Cocos API。包含不可变领域模型契约（`types/`）、纯函数状态与动作解析器（`logic/`）、无头推演器（`headless/`）及视图解耦事件总线（`EventBus`）。
   - **Layer 2（存储与基建适配层）**：`src/adapters/`，定义 `IStorageManager` 接口，解耦云端依赖，提供 `MockStorage`（用于 Node.js / 测试）、`LocalStorageAdapter`（用于 Web 预览）、`WechatStorageAdapter`（用于微信小游戏脱机持久化）。
3. **工具链全面打通与收敛**：
   - `npm test`：运行 `tests/core/` 下所有 TypeScript 单元测试，支持沙箱环境脱机秒级反馈。
   - `npm run oxlint`：毫秒级静态检查（零告警、零错误）。
   - `npm run check:deps`：通过 `dependency-cruiser` 监控架构边界，严防 Layer 1 反向依赖 Layer 2，杜绝循环依赖。
   - `npm run typecheck`：通过 TypeScript 编译器严格类型检查（`tsc --noEmit`）。
   - `stryker.config.json`：配置就绪，聚焦 Layer 1 纯计算逻辑，作为发版前体检防线。

## 被否决的方案

- **渐进共存方案（保留原 `src/` 旧代码，在旁边新增 TS 代码）**：否决原因：旧代码中已废弃的 Supabase、PVP 和 CSS 会持续污染构建和检查，导致 `lint` 和 `check:deps` 长期无法变绿，严重阻碍 AI 的红绿灯自纠错机制。
- **全量修复旧代码方案**：否决原因：投入成本修补即将淘汰的旧网络和 DOM 渲染代码违背精益原则。

## 后果

- 建立了 100% 绿色、确定性的自动化质量流水线，AI 可在毫秒级反馈中进行后续核心规则、算法与 AI 决策树的开发。
- 代码完全具备类型安全（Type Safety）与不可变性（Immutability）。
- 下一阶段人类开发者或 Cocos 接入时，只需引入 `src/core/` 并通过 `EventBus` 绑定表现层，无需改动任何计算逻辑。
