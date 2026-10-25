# 02: 规则正文落到 CONTRIBUTING

**Type:** task
**Blocked by:** None（01 已 resolved，规则文本已有输入）
**Status:** resolved

**What to build:** 把 spec 的「决定」一至八条写成可执行的规则正文，放进 `CONTRIBUTING.md`（新增一节「分支与交付」），`AGENTS.md` 与 `docs/HLD.md` 只留指针。

**为什么落在 `CONTRIBUTING.md`：** 它已经拥有贡献流程与提交纪律（§3 提交信息、§5 开发流程闭环）。交付策略是同一层的事实。`docs/HLD.md` §4.5 拥有 CI，交付策略与它不是一件事，别塞进去。

## Answer

已落地（2026-10-25）。`CONTRIBUTING.md` 新增 **§6 分支与交付**，共 6 个小节；`AGENTS.md` 只加了三处指针与归属表一行。

**节次与 spec 决定的对应：**

| § | 内容 | 对应决定 |
|---|---|---|
| 6.1 | 三层颗粒度、切片定义、票与提交的比值、回退/bisect 精度 | 6、12 |
| 6.2 | spec / ticket 分支与 worktree，单写者 | 1、5 |
| 6.3 | 回 main 的七步；squash 点是票 → spec；四要素 body；整理阶段不新增测试 | 7、8、9 |
| 6.4 | 快速通道三条判据与排除项 | 3、10 |
| 6.5 | 产物与切片重排的三条命令 | 11 |
| 6.6 | 验证档与执行者（含两个未落地脚本的诚实标注） | 2、4 |

**验收清单：**

- [x] `CONTRIBUTING.md` 新增一节，覆盖：分支命名、切片定义、两类依赖、验证档位、整理与逐提交验证、ff 合入、收尾清理
- [x] 三条开放项（D1/D2/D3）的结论在正文里有对应段落
- [x] 写明 squash 发生在「票 → spec」，切片归组在 squash 之后
- [x] 写明票与交付提交不是同一颗粒度，并给出比值规则
- [x] 交付提交 body 四要素（含「该片全部票号」）
- [x] 写明回退与 bisect 的精度是切片
- [x] 快速通道写成机器可判的判据（路径白名单 + 文件数）
- [x] 规则里每条命令都真实存在（逐个核对 `package.json#scripts`）
- [x] 不出现 `ruff` / `pytest` / `python`
- [x] `AGENTS.md` 只加指针，不复述规则正文
- [x] 归属表新增 `CONTRIBUTING.md` 一行
- [x] 断链检查：引用的路径逐个检查，两个未落地脚本已在 §6.6 明写

**验收核对记录：**

- 命令真实性：`check:quick` / `verify` / `build:minigame` / `mutation:milestone` / `check:worktrees` 逐个用 `node -p "require('./package.json').scripts['X']"` 核对，均存在。
- 禁词：`grep -c -E 'ruff|pytest|python' CONTRIBUTING.md` = 0。
- 意外修正：§1 末尾原写「CI 快链在 **PR** / push 时判红」，但本仓库从未用过 PR，且旧历史下 CI 是事后补救。改为「CI 只做兜底，拦截靠交付前的本地验收」。

**决定 2 的落地情况（需要明确）：**

「不变量必须由脚本断言」这一步**只完成了一半**。已落地的只有 `npm run check:worktrees`。main 线性、快照一致、无新增孤儿提交、worktree 清账、切片依赖无环这五类，目前**只写在 §6.6 的执行者表里，无人拦**。它们的脚本在票 03、04。在票 03 落地前，这些不变量与 §6 的其他条款一样，靠协调代理人工核对。

**实现要点：**

- 名词严格对齐本仓库：内循环 `npm run check:quick`、收尾 `npm run verify`、spec 收尾全量 `npm run mutation:milestone`。参考 `.scratch/doc-dedup/ownership-map.md` 的 A10–A13。
- **别把规则写成愿望**。本仓库两次先例（worktree 建到仓库外、`.gitignore` 反选静默失效）都说明：写不住「谁去执行」的规则等于没写。每条规则后面标一句它由谁执行——`scripts/check-delivery.mjs`（票 03）、CI、还是人工。
- 快速通道要写清「不许」那一侧：`scripts/`、`.github/`、`tests/` 不在白名单里。这三处改错了会静默降低门禁强度。
- 这一节会变长。如果超过 60 行，考虑把「执行图与切片」的细则拆到 `docs/agents/` 下一份文件——但规则正文只能有一处。

**参考：**

- `.scratch/doc-dedup/ownership-map.md`：C1 条目与 A 表（哪些命令真实存在、对账点怎么写）。
- `.scratch/archive/repo-operating-framework/spec.md`：本仓库写 spec 决定的既有口径（决定 / 依据 / Out of Scope）。
