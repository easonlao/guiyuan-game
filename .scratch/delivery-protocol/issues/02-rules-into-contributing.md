# 02: 规则正文落到 CONTRIBUTING

**Type:** task
**Blocked by:** None（01 已 resolved，规则文本已有输入）
**Status:** ready-for-agent

**What to build:** 把 spec 的「决定」一至八条写成可执行的规则正文，放进 `CONTRIBUTING.md`（新增一节「分支与交付」），`AGENTS.md` 与 `docs/HLD.md` 只留指针。

**为什么落在 `CONTRIBUTING.md`：** 它已经拥有贡献流程与提交纪律（§3 提交信息、§5 开发流程闭环）。交付策略是同一层的事实。`docs/HLD.md` §4.5 拥有 CI，交付策略与它不是一件事，别塞进去。

**验收清单：**

- [ ] `CONTRIBUTING.md` 新增一节，覆盖：分支命名、切片定义、两类依赖、验证档位、整理与逐提交验证、ff 合入、收尾清理
- [ ] 三条开放项的结论（01 的产出）在正文里有对应段落
- [ ] 规则里写明 **squash 发生在「票 → spec」**，切片归组在 squash 之后；不要写成「先全 squash 再进 main」
- [ ] 规则里写明**票与交付提交不是同一颗粒度**：票拆细（agent 聪明区）、交付提交按切片归组（回退单位）；一票单独能验证时才是 1:1
- [ ] 交付提交的 body 写「切片名 + 该片全部票号 + 关键取舍 + 验证命令」（spec 决定 9）
- [ ] 写明回退与 bisect 的精度是**切片**（spec 决定 12）
- [ ] 快速通道写成机器可判的判据（路径白名单 + 文件数），并写明谁判
- [ ] 规则里出现的每条命令都是 `package.json` 里真实存在的命名脚本：`node -e "console.log(Object.keys(require('./package.json').scripts).join(' '))"` 核对，不自造命令名
- [ ] 文档里不出现 `ruff`、`python`、`pytest` 这类本仓库不存在的工具
- [ ] `AGENTS.md` 只加指针，不复述规则正文（依据 `AGENTS.md` 的「每个事实只有一个家」）
- [ ] 交付策略的家登记进 `AGENTS.md` 的归属表（这张表目前只管 FSR/SRS/GDD/HLD/LLD，需要扩一行）
- [ ] 断链检查：本节引用的每个 `scripts/*.mjs` 与文档路径都存在

**实现要点：**

- 名词严格对齐本仓库：内循环 `npm run check:quick`、收尾 `npm run verify`、spec 收尾全量 `npm run mutation:milestone`。参考 `.scratch/doc-dedup/ownership-map.md` 的 A10–A13。
- **别把规则写成愿望**。本仓库两次先例（worktree 建到仓库外、`.gitignore` 反选静默失效）都说明：写不住「谁去执行」的规则等于没写。每条规则后面标一句它由谁执行——`scripts/check-delivery.mjs`（票 03）、CI、还是人工。
- 快速通道要写清「不许」那一侧：`scripts/`、`.github/`、`tests/` 不在白名单里。这三处改错了会静默降低门禁强度。
- 这一节会变长。如果超过 60 行，考虑把「执行图与切片」的细则拆到 `docs/agents/` 下一份文件——但规则正文只能有一处。

**参考：**

- `.scratch/doc-dedup/ownership-map.md`：C1 条目与 A 表（哪些命令真实存在、对账点怎么写）。
- `.scratch/archive/repo-operating-framework/spec.md`：本仓库写 spec 决定的既有口径（决定 / 依据 / Out of Scope）。
