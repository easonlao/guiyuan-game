# Legacy Codebase (归档资产)

本目录归档了原 Web 版客户端的历史代码、旧版 JavaScript 逻辑、旧版测试用例及旧版实验分析脚本。

## 目录结构

- `src/`：原 Web 端 JS 逻辑与 CSS 样式（包含已废弃的 Supabase 云端与 LocalPVP 网络模块）。
- `tests/`：基于旧版 JS 逻辑的回归测试套件。
- `scripts/`：旧版无头对战模拟与平衡性实验脚本。
- `index.html`：原 Web 预览页面。

> **注意**：
> 按照 [HLD.md](../docs/HLD.md) 的“AI-First”三层解耦架构，本项目正式切入 Cocos Creator 3.x 纯单机 MVP 目标。
> 所有活跃开发均转移至根目录下的纯 TypeScript 骨架：
> - `src/core/` (Layer 1 核心计算逻辑)
> - `src/adapters/` (Layer 2 存储与基建适配层)
> - `tests/core/` (强类型核心单元测试)
