# 04: 执行图加 Slice 字段与切片依赖检测

**Type:** task
**Blocked by:** None（切片定义在 spec 决定 6，已定）
**Status:** ready-for-agent

**What to build:** 给 `.scratch/<effort>/issues/NN-<slug>.md` 增加 `Slice:` 字段，并写 `scripts/check-slices.mjs` 断言「票据归属唯一、切片依赖无环」。

**为什么：** spec 决定 5–6。切片依赖一旦成环，交付整理阶段的重排就无解——而那时才发现，代价是整个整理返工。所以这条必须在开工时就红。

**设计取舍（照一个家原则）：**

- **切片依赖不单独声明**，从票据依赖**推导**：票 A 属于切片 S1、票 B 属于切片 S2，且 B 的 `Blocked by:` 里有 A，就得到 S1 → S2。声明两遍就会漂移。
- `Slice:` 值用 `S1` / `S2` / `S3`，与 `spec.md` 的票据表一致。允许一张票标 `Slice: none`（决策票、纯调研票，不产出交付提交）。
- 循环检测在**票据图**和**切片图**上各跑一次：票据成环本身也是错误。

**验收清单：**

- [ ] `docs/agents/issue-tracker.md` 增加 `Slice:` 字段说明（格式、取值、`none` 的含义），与既有 `Type:` / `Status:` / `Blocked by:` 并列
- [ ] `scripts/check-slices.mjs`：读 `.scratch/*/issues/*.md`，解析 `Slice:` 与 `Blocked by:`，输出两个判定——归属合法（每票恰好一个切片，且 `Slice:` 在 `spec.md` 票据表里出现过）、无环（票据图与切片图各一次）
- [ ] 判红时打印成环路径（`S1 → S2 → S1`），不只说「有环」
- [ ] 现有 `.scratch/` 全部票据能被解析：缺 `Slice:` 的按 `none` 处理并在输出里列出（**不判红**，避免清理票面时批量误伤）
- [ ] 命名脚本 `npm run check:slices`；接进 `check:quick`（它是静态检查、毫秒级，与 `check:delivery` 不同）
- [ ] `npm run check:quick` 在加入后仍全绿

**实现要点：**

- 解析用行首匹配，不要全文正则：`^Slice:`、`^Blocked by:`。票面里会大段引用规则正文，全文匹配会误判。
- `Blocked by: None` 与「没有这一行」要区分开：前者是明确声明无依赖，后者是缺字段。
- 现有 `.scratch/` 有 160 个文件、多种历史写法（`**Status:**` 与 `Status:` 并存，`reviews/` 子目录不带字段）。**不要求历史票补齐**：脚本只对 `spec.md` 票据表里列出的票强制校验。这条写进脚本注释，否则后来的人会去批量改历史文件。
- 无环检测用拓扑排序，不用递归 DFS：递归在 160 个文件上不好给「环在哪」的路径。

**参考：**

- `docs/agents/issue-tracker.md`：字段约定与 wayfinding 语义。
- `.scratch/delivery-protocol/spec.md`：票据表（本 spec 自己的第一个样例）。
- `.scratch/doc-dedup/ownership-map.md`：C4 —— 归属表与字段说明的登记位置。
