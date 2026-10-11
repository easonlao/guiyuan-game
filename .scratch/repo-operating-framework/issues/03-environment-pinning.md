# 03: 环境固化

**What to build:** 一台新机器按文档装出来的环境与现在一致；代码有统一的格式化，diff 里不混进风格噪声。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `package.json` 声明 Node 版本要求与包管理器版本（现在两者都没有，`.nvmrc` 写了一个没人强制）
- [ ] 装上 formatter，并有一条**命名脚本**可检查（不只是「能跑」，是能当门禁用）
- [ ] 三份 vitest 配置收敛：`vitest.config.ts` 与 `scripts/run-tests.mjs` 里那份内联到 `/tmp` 的配置合并，`npm test` 读的是仓库里那一份
- [ ] 决定 `scripts/run-tests.mjs` 的 `/tmp` 符号链接机制**留还是删**，并说明理由
- [ ] `docs/HLD.md` §4.1 对 oxc 的描述与实际一致（要么落地格式化，要么把「标准化格式化」那句收回）

**实现要点：**

- 现状：`engines` / `packageManager` / `fmt` / `build` 四个字段全部 `undefined`。
- **没有 formatter**，而 `docs/HLD.md` §4.1 已经白纸黑字说 oxc「承担…标准化格式化」。文档承诺了一个不存在的工具——这正是本仓库「每个事实只有一个家」规则要修的东西。
- 三份配置里，根目录 `vitest.config.ts` 是**死的**：`npm test` 走 `scripts/run-tests.mjs`，它自己往 `/tmp/vitest.config.mjs` 写一份内容几乎相同的配置。另一份 `vitest.stryker.config.ts` 被 `stryker.config.json` 引用，是活的。
- 合并时以 `run-tests.mjs` 里那份的实际行为为准（它带 `include: ['tests/core/**/*.test.ts']`、`environment: 'node'`、`globals: true`），别只看根目录那份就以为等价。
- `/tmp` 符号链接机制是为了在只读沙箱环境下给 Vitest 准备可写临时目录。删之前先确认当前环境还需不需要。

**验证记录：**（待填）
