# 归元弈 (Guiyuan) - 贡献与代码规范指南 (Contributing & Style Guide)

欢迎参与《归元弈》的开发！本项目采用了 **AI-First** 架构，这意味着绝大多数的代码将由人类与 AI Agent 协同编写。

为了保障代码库在高速迭代和高频重构下依然保持工业级整洁，请无论是**人类**还是 **AI 代理**，都必须严格遵守以下规范。

---

## 1. 架构边界红线 (Architecture Boundaries)

在 `HLD.md` 和 `LLD.md` 中，我们确立了分层架构与纯数据驱动。
**核心纪律：**
* **Layer 1 (核心逻辑层 `src/logic/*`) 绝对禁止** 引入任何引擎相关的库（如 `cc`, `window`, `document`）。
* **Layer 1 必须保持纯粹（Pure）**：所有动作解析 (`ActionResolver`) 必须是**纯函数**。任何依赖随机数的地方（如天干生成），必须通过传入 Seed 或 RandomGenerator 的方式注入，确保 100% 可重现。

若依赖探测工具（如 `dependency-cruiser`）在检查中检测到越界引用，提交将被拒绝。

---

## 2. 编码风格 (Coding Style)

本项目采用严格的 TypeScript 规范，并通过极速工具链进行保障。

### 2.1 命名规范
* **类名、接口名、类型别名**：使用大驼峰 `PascalCase`（如 `ActionResolver`, `GameState`, `NodeData`）。
* **变量、函数、参数名**：使用小驼峰 `camelCase`（如 `executeAction`, `p1Nodes`, `currentPlayerId`）。
* **常量、枚举值**：使用全大写加下划线 `UPPER_SNAKE_CASE`（如 `MAX_ROUNDS`, `ActionType.BURST_ATK`）。
* **布尔值**：必须以 `is`, `has`, `can`, `should` 等开头（如 `isGameFinished`, `hasEnoughEnergy`）。

### 2.2 工具链与静态检查 (Toolchain)
* **oxlint / oxc**：我们使用 `oxlint` 进行极速的代码静态检查。代码在提交前必须无 Error。禁止滥用 `// @ts-ignore`。
* **TypeScript 严格模式**：必须保持 `"strict": true`，禁止隐式的 `any` 类型。

---

## 3. Git 提交规范 (Conventional Commits)

所有的 Git Commit Message 必须遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/) 规范。

**格式：** `<type>[optional scope]: <description>`

**允许的 Type：**
* `feat`: 增加新功能或新逻辑
* `fix`: 修复 Bug
* `refactor`: 重构代码（不改变功能，仅优化内部实现）
* `test`: 新增或修改测试用例（如 Vitest 或 Headless Match 脚本）
* `docs`: 文档变更（修改 MD 文件、注释等）
* `chore`: 构建过程或辅助工具的变动（如更新 npm 依赖）

**示例：**
* `feat(core): implement BURST_ATK action resolver`
* `test(headless): add deterministic matches for Phase 1`
* `docs(lld): update state management paradigm to immutable`

---

## 4. 给 AI Agent 的特别指引 (AI Agent Guidelines)

当 AI 代理（如 Executor, Reviewer）在执行任务时，必须：
1. **先看契约，再写代码**：在编写 `src/logic/` 下的代码前，先读取 `docs/LLD.md` 中的数据结构定义。
2. **纯数据优先**：不要使用 ES6 Class 实例去封装 `State` 属性，`State` 只能是 `readonly` 的 Interface 对象。
3. **Test-Driven (TDD)**：每实现一个功能或修复，必须同步在 `*.test.ts` 中补充覆盖该分支的用例，并通过红绿循环验证。

## 5. 开发流程闭环

1. **领取任务**：阅读对应的 Issue 或 `.scratch/` 里的 Markdown 规范。
2. **脱水开发**：在纯 TS 环境下实现功能并跑通 `vitest`。
3. **静态体检**：运行 `oxlint` 和 `dependency-cruiser`。
4. **提交代码**：按照上述 Git 规范 `git commit`。
5. **引擎验收**：最终由人类开发者将底层的纯净代码引入 Cocos Creator，进行 UI 挂载与动画预览。
