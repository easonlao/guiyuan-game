# 施工图：事实 → 唯一家

> 用途：doc-dedup 这一轮的施工依据。一行 = 一条事实、一个家、一个能跑的对账点。
>
> 实测基点：HEAD `5859a48`（线性化后 hash 已变，见下），2026-10-24。「实测」列是写本文件时真跑的输出，不是推测。
>
> **注意：本文件里的提交 hash 都是线性化之前的旧值。** 2026-10-25 已把 main 重写为线性历史（319 个提交、0 merge），旧 hash 全部失效。引用提交时用标题而不是 hash。
>
> 判据（删留用这一条）：**删掉这份文档，agent 会不会写错代码？需求方会不会验收错？两个都不会 → 它不是事实。**
>
> 「还在说的地方」只收**正文复述**。写成「见 X」「以 X 为准」的指针不算重复，保留。

## 状态口径

| 状态 | 含义 | 处理 |
|---|---|---|
| 绿 | 家和对账点都在，命令当场通过 | 保持 |
| 红 | 对账点当前不通过 | 先修，修不了就改口径或写进白名单 |
| 无 | 有家，没有机器可查的对账点 | 标注为人工复核，不硬造 |
| 缺口 | 这条事实现在没有家 | 本轮新建 |

## A. 绿（家 + 当场通过的对账点）

**A1 Node 版本基线** — 家：`.nvmrc`
　还在说：`package.json#engines`（同值的机器判据，不是重复）；`.npmrc` 注释
　对账：`node -e "const v=require('fs').readFileSync('.nvmrc','utf8').trim();process.exit(require('./package.json').engines.node.includes(v)?0:1)"` → 退出 0（实测 0，值 `24.16.0` / `^24.16.0`）

**A2 npm 版本** — 家：`package.json#packageManager`
　对账：`test "$(npm -v)" = "$(node -p "require('./package.json').packageManager.split('@')[1]")"` → 退出 0（实测 `11.13.0`）

**A3 版本不符即判红** — 家：`.npmrc` 的 `engine-strict=true`
　对账：`npm config get engine-strict` → `true`（实测）

**A4 包安装布局（没声明就解析不到）** — 家：`.npmrc` 的 `install-strategy=linked`
　对账：`npm config get install-strategy` → `linked`（实测）

**A5 格式化口径** — 家：`.oxfmtrc.json`
　对账：`npm run fmt:check` → 退出 0

**A6 core 层禁碰浏览器全局与 `cc`** — 家：`.oxlintrc.json` 的 `overrides`
　还在说：`CONTRIBUTING.md` §1（指针，已声明「规则真源以该配置文件为准」）
　对账：`node -e "const s=JSON.stringify(require('./.oxlintrc.json'));process.exit(s.includes('no-restricted-globals')&&s.includes('no-restricted-imports')?0:1)"` → 0（实测两者皆 true）

**A7 依赖方向** — 家：`.dependency-cruiser.js`
　对账：`npm run check:deps` → 退出 0

**A8 包边界（`src/` 与 `tools/`）** — 家：`scripts/check-package-boundary.mjs`
　对账：`npm run check:boundary` → 退出 0

**A9 产物落点与逐字节对账** — 家：`scripts/lib/minigame-build.mjs` 的 `ARTIFACT_PATH` + `scripts/check-minigame-artifact.mjs`
　还在说：`docs/HLD.md` §4.4 复述了机制（同一件事写两遍，可降为指针）
　对账：`npm run check:artifact` → 退出 0（实测输出「逐字节一致，落点不在任何 dist/ 下」）

**A10 内循环命令的构成** — 家：`package.json#scripts.check:quick`（**9 段**：`check:worktrees` → `check:slices` → `fmt:check` → `lint` → `check:boundary` → `check:refs` → `check:facts` → `check:prose` → `check:deps`）
　还在说：`docs/HLD.md` §4.4 明写「命令清单以 `package.json` 为真源，本文不复制」——是好的指针写法，照这个改其他处
　对账：`node -p "require('./package.json').scripts['check:quick']"` → 9 段串联
　**2026-10-25 复核两次**：原记 5 段 → 票 04 加 `check:slices` 变 6 段 → 同日后一轮加 `check:refs` 与 `check:facts` 变 8 段。段数变是合法的，所以 `check:facts` 只断言「门禁还在链里」，不锁段数。

**A11 收尾命令** — 家：`package.json#scripts.verify`
　对账：`node -p "require('./package.json').scripts.verify"` → `check:quick && typecheck && test && check:artifact`
　旁证：2026-10-24 实跑全绿，54 文件 / 1003 用例

**A12 CI 只跑验收** — 家：`.github/workflows/fast.yml`
　对账：`grep -c 'run:' .github/workflows/fast.yml` → 2（`npm ci` + `npm run verify`，实测 2）

**A13 「CI 不跑突变测试」这条结论** — 家：`docs/HLD.md` §4.5 + `docs/adr/0012-ci-fast-chain-and-manual-milestone.md`
　还在说：`AGENTS.md`、`fast.yml` 注释、`scripts/mutation-check.mjs` 注释（4 个文件，提交「docs: 清掉三处「CI 跑突变测试」的过期表述」刚为它做过三处订正）
　对账：`grep -v '^ *#' .github/workflows/fast.yml | grep -ci mutation` → 0（实测 0，即只出现在注释里）

**A14 hook 的安装方式** — 家：`package.json#scripts.prepare`（+ `setup:hooks`）
　对账：`git config core.hooksPath` → `.githooks`（实测）

**A15 worktree 落点** — 家：`scripts/check-worktrees.mjs`
　还在说：`docs/HLD.md:138` 复述了同一机制与理由（应降为指针）
　对账：`npm run check:worktrees` → 退出 0

**A16 什么不进版本库** — 家：`.gitignore`
　对账：`git ls-files -i -c --exclude-standard` → 空（已跟踪但被忽略的文件数 = 0，实测 0）

**A17 `minigame/game.js` 入库** — 家：`docs/adr/0014-minigame-artifact-is-committed.md`
　对账：`git ls-files minigame/game.js` 非空 + `npm run check:artifact` 通过

**A18 `.scratch/` 入库** — 家：`docs/agents/issue-tracker.md`（含「为什么入库」一节）
　对账：`git ls-files .scratch | wc -l` → > 0（**2026-10-25 复核：11**；原记 160，多出来那 160 份全在 `archive/`，已随清理三档删除，现在只剩 `delivery-protocol/` 与 `doc-dedup/`）

**A19 技能来源与 hash** — 家：`skills-lock.json`
　对账：lock 集合 − `.agents/skills/` 目录集合 → 恰好 `{sprite-gen}`（该技能 53MB，按需安装，已在 `.gitignore` 说明）。实测：lock 35 项，目录 34 个，差集正是 `sprite-gen`

**A20 决策与理由** — 家：`docs/adr/`
　对账：`ls docs/adr | grep -vcE '^[0-9]{4}-[a-z0-9-]+\.md$'` → 0（命名格式违规数 0，实测）；当前 18 条

**A21 术语与禁用别名** — 家：`GLOSSARY.md`
　对账：`grep -cE '^\*\*[^*]+\*\*:' GLOSSARY.md` 与 `grep -c '^_Avoid_:' GLOSSARY.md` 相等 → 36 / 36（实测）

**A22 类型契约** — 家：`src/core/types/domain.ts`
　还在说：`docs/LLD.md`（已声明「类型真源是 domain.ts，本文只写字段语义」，是好的指针写法）
　对账：`npm run typecheck` → 退出 0

**A23 参数取值** — 家：`src/core/logic/` 常量
　对账：`npm test` → 全绿（取值有断言，实测 1003 用例通过）

**A24 突变基线** — 家：`mutation-baseline.jsonl`（入库）
　对账：`git ls-files mutation-baseline.jsonl` 非空；**条目 34 条**（`grep -vc '^#' mutation-baseline.jsonl`）。
　**口径统一为「条」**（2026-10-25 复核）：本文件 38 行，其中 4 行是 `#` 注释，记录是 34 条；`docs/MUTATION-TESTING.md` §3.3 也写「34 条」。两个家对同一个量必须用同一个叫法。

**A25 突变棘轮的判定口径** — 家：`docs/MUTATION-TESTING.md`
　对账：`npm run mutation:check`（需先有全量报告，属按需，不是每轮）。2026-10-25 实核：缺报告时退出 **2**（与 §3.1 / §10 写的口径一致）；`mutation:changed` 无改动时退出 0。
　同日审计结论：机制、指针、退出码、版本、补丁、常量全部当天可核；**只有两处实测数字没日期**（§2.1 的突变体数量、§5.2 的分数，都是 2026-10-11 那次全量跑的），已改成带日期并把「现行可核量」与「当日快照」分开列在 §3.3。

## B. 红（先修再谈清理）

> 本章现在为空。原 B1 已核实为**假警报**，改口径后转绿，见下。

**B1 `Co-Authored-By` 门禁** — 家：`.githooks/commit-msg`
　对账：门禁生效后的区间里，顶格 trailer 数应为 0。区间起点用**提交标题**定位（hash 已随线性化改变）：`BASE=$(git log --format='%h' --grep='加 Co-Authored-By 提交信息门禁' -1)`，然后 `git log $BASE..HEAD --format=%B | grep -cEi '^co-authored-by[[:space:]]*:'` → 0（重写前实测 0）
　**口径必须是顶格**：门禁的判定就是顶格（缩进的行 git 不认作 trailer）。用宽松子串 `grep -i 'co-authored-by'` 会命中正文里**提到** `CO-AUTHORED-BY:` 的提交——提交「fix(repo): 提交门禁补齐大小写与模式校验」的 body 正是在解释这条规则，重写前宽松口径实测报 1。
　旁证这条口径真能测出违规：同一命令在门禁**之前**的区间报 70，与 `.scratch/archive/repo-operating-framework/spec.md` 记录的「70 条」吻合。
　**由此得一条通用规则：对账点必须与门禁/脚本的判定口径逐字一致**，否则测的是另一个东西。原先拟的「白名单」方案不需要了——没有违规可豁免。

## C. 缺口（这条事实现在没有家，本轮要新建）

**C1 分支与交付策略** — **已落 spec**：`.scratch/delivery-protocol/spec.md`，家定在 `CONTRIBUTING.md` §6（票 02 已 resolved），执行体 `scripts/check-delivery.mjs` **已落地**（票 03，`npm run check:delivery`）。
　三条开放项已拍定（2026-10-24）：D1 body 四要素、D2 白名单且 ≤ 3 文件、D3 每步重建 + amend + verify。见 spec 决定 9–11。
　对账点：`npm run check:delivery` → 四条断言全过。

**C2 提交标题格式** — 家有（`CONTRIBUTING.md` §3 Conventional Commits），但**没有对账点**：`.githooks/commit-msg` 头注明确「只管 trailer，标题风格不在这道钩子」。
　两个选择：补第二道 hook（对账点：`git log -1 --format=%s` 匹配类型前缀），或承认它只是约定、从「门禁」降级为「约定」。

**C3 美术方向与视觉编码路线** — main 上无家。整条路线只在挂起分支的 `.scratch/frontend-art-direction`。
　按本仓库规则，视觉词不进 `GLOSSARY.md`，画法归 `docs/HLD.md` §2 Layer 3、落点契约归 `docs/LLD.md` §4.1——但「路线图」本身没有家。

**C4 文档归属表自身** — 家有（`AGENTS.md`），但只覆盖 5 类文档 + 3 类真源/报告/入口。本表补全后应回写进 `AGENTS.md`，或让 `AGENTS.md` 指向本表。

**C5 报告类证据的引用纪律** — 家有文字（`AGENTS.md`：引用 `docs/headless/`、`docs/archive/` 必须写明「这是证据，不是定义」），无对账点。
　候选对账点：`git grep -c '证据，不是定义'` 的计数与 `docs/headless/*.md` 被引用次数对齐（弱，但能发现「引用了却没标注」）。

**C6 FR 编号 ↔ 测试名** — `docs/SRS.md` 有 19 个 `FR-x.y` 编号、6 个 `FR-x` 分组、4 个 `NFR`；`tests/` 里 `FR-` 出现 **0 次**，验收条款无法机械对账。
　建议：测试文件描述里带 FR 编号，对账点 = 每个 FR 编号在 `tests/` 里至少出现一次。

**C7 `.scratch/` 的生命周期与引用方向** — 无家。`.scratch/` 是要被清理的过程区，但没有任何规则说「谁能引用它」。
　**规则建议：引用单向。** `.scratch/` 可以引用 `docs/` 与代码；反过来不行——`docs/`、ADR、代码不得把 `.scratch/` 当作事实或证据的出处。
　**当前违规 6 处**（都已核实，全在采信链上或报告层，删 `.scratch` 当天全部断链）：
　1. `docs/HLD.md:138` —— 「历史上真发生过，见 `.scratch/archive/burst-plus-two/`」
　2. `docs/HLD.md:169` —— 「任务留档见 `.scratch/archive/minigame-view-upgrade`」
　3. `docs/SRS.md:103` —— 「留档 `.scratch/archive/minigame-view-upgrade`」
　4. `docs/adr/0002-attack-buff-and-rarity-nerf.md:76` —— 「删除工单见 `.scratch/archive/dead-scoring-code-removal/`」
　5. `docs/adr/0016-burst-two-level-and-overflow-penalty.md:39` —— 实测数字指到工单 03 的 Comments
　6. `docs/headless/burst-plus-two-balance.md:3-5、115` —— 指到 `.scratch/archive/burst-plus-two/`
　对账：`git grep -n -E '\.scratch/' -- docs/adr docs/HLD.md docs/SRS.md docs/GDD.md docs/FSR.md GLOSSARY.md README.md` → 0 行（当前 **5** 行；第 6 处是 `docs/headless/` 里的，报告层随本层删除自然消失）。结构性说明在 `AGENTS.md` 与 `docs/agents/issue-tracker.md`，不入此断言。
　修法：每处先把证据（数字/结论）落到 ADR 或 `docs/headless/` 正文，再把引用改成指向那个新家；不要只把路径改成一个已删的路径。

## D. 保留类，无自动对账点（人工复核）

这四条是「代码推不出来的」，必须留，但**无法自证错**——所以给人工复核节奏，不要装作有门禁。

| 事实 | 家 | 复核建议 |
|---|---|---|
| 规则机制与意图（满溢则亏为什么存在、爆发为什么双级） | `docs/GDD.md` §2.2–2.4 | 每次改规则时，核 ADR 是否记了取舍 |
| 需求范围与验收条款（FR/NFR） | `docs/SRS.md` | 每次 spec 收尾时核 FR 与已完成范围 |
| 定位、竞品、成本与时间估算、项目级风险 | `docs/FSR.md` | 每季度一次 |
| 架构与分层理由（结构可由代码推，理由不能） | `docs/HLD.md` §2 | 每次新增包或层时 |
| 实验证据（无头推演报告、历史方案） | `docs/headless/`、`docs/archive/` | 引用时必须写明「证据，不是定义」 |

## 施工顺序

1. **定 C2**（B1 已关闭：假警报，对账口径已改成与门禁一致，不需要白名单）：这是仅剩的一条「门禁与事实不一致」。
2. **消重**：把 A 表里标为「还在说」的正文复述改成指针。优先级：A13（4 个家）、A9/A15（机制写两遍）、「取值以代码常量为准」（8 个文件在说）。
3. **删证据层**：`docs/headless/`（12 份 248K）、`docs/archive/`（12 份 104K）、`.scratch/archive/`（160 文件）。删前先把 C7 那 6 处反向引用修完，否则删完会在采信链上留断链。
4. **清 `.scratch/`**：全部 20 处死链接**都在 `.scratch/` 内部**（已核：`docs/DEVELOPMENT.md`、`docs/TEST_PLAN.md` 的引用者全在 `.scratch/archive/`；存活文档零死链），所以删 `.scratch` 会一次性消掉它们。唯一要提前做的是上一步的 C7。
5. **回写**：把 A/C/D 三张表并进 `AGENTS.md` 的归属表，或让 `AGENTS.md` 指向本文件。

## 本表不覆盖

- 游戏规则的逐条内容（归 `docs/GDD.md`）。
- 代码实现细节（归代码本身，用 `codegraph_explore` 查）。
- 第三方工具自身的配置语义。

## 复核记录（写本文件时逐条真跑，2026-10-24）

| 检查 | 输出 |
|---|---|
| `npm run verify` | 全绿：54 文件 / 1003 用例；`check:artifact` 逐字节一致 |
| A1 版本基线一致性 | 退出 0 |
| A2 npm 版本 | `11.13.0` = `npm@11.13.0` |
| A3 / A4 | `true` / `linked` |
| A6 lint 规则键 | `no-restricted-globals` + `no-restricted-imports` 皆存在 |
| A12 CI run 步数 | 2 |
| A13 mutation 非注释行 | 0 |
| A16 已跟踪但被忽略 | 0 |
| A18 `.scratch` 入库文件数 | 160 |
| A19 技能 lock/dir 差集 | `sprite-gen`（预期内） |
| A20 ADR 命名违规 | 0（共 18 条） |
| A21 词条 / Avoid 行 | 36 / 36 |
| C6 SRS 编号 / tests 命中 | 19 个 `FR-x.y` + 6 个 `FR-x` + 4 个 NFR；`tests/` 命中 0 |
| C7 反向引用（docs/ADR → `.scratch/`） | 对账点覆盖 5 处（HLD 2 / SRS 1 / ADR 2），另 1 处在 `docs/headless/` 随报告层删除消失 |
| 死链来源 | 4 个已删 `docs/*.md` 的引用者 **全部**在 `.scratch/archive/`，存活文档零死链 |
| A24 突变基线行数 | 38 |
| **B1 trailer（顶格口径）** | **0**（宽松子串口径报 1，已确认是假阳性：提交「fix(repo): 提交门禁补齐大小写与模式校验」正文提及 trailer） |
| B1 同口径回测门禁前区间 | 70，与归档 spec 记录的 70 条吻合 |

> **上表是 2026-10-24 写本文件时的记录，不是当前值。** 2026-10-25 逐条复核 25 条对账点，其中三处已变：**A10**（5 → 6 段，票 04 加了 `check:slices`）、**A18**（160 → 11，`archive/` 随清理删除）、**A24**（38 行 → 统一口径为 34 条）。当前值以 A 表的条目为准，本表只做当日记录。
