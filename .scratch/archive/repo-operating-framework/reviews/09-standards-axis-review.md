# 09 目录约定与文档对账 — Standards 轴复核（Reviewer，独立复核）

被审对象：`git diff HEAD~1...HEAD`（单提交 `0a061d8`）。复核未改动工作区：lint 行为在 `/tmp` 的副本里实测（`/tmp/oxlint-probe-a1`、`/tmp/oxlint-probe-b2`），`npm test` 只读。

## 已核实做到（证据）

- **新 lint 规则真会红、且没有漏洞**：`.oxlintrc.json:5` 的 `src/core/**/*.ts` **能匹配顶层文件**（探针 `src/core/index.ts` 用 `window` → 报 `no-restricted-globals`，退 1）；`document`、`import "cc"`（副作用导入）与 `import { Node } from "cc"` 都报 `no-restricted-imports`。自动发现生效（不带 `--config` 同结果），且加配置**没有关掉默认规则**（`no-debugger` / `no-constant-condition` / `no-unused-vars` 与无配置时一致）。HEAD 上 `npm run lint` 退 0。
- **`CONTRIBUTING.md:19` 的分档陈述属实**：`package.json:11` 的 `check:quick` = `fmt:check && lint && check:boundary && check:deps`（「前三项在内」成立），`package.json:12` 的 `verify` 含 `typecheck`。
- **`CONTRIBUTING.md:17` 的三条 depcruise 规则实名存在**：`.dependency-cruiser.js:19`（`core-not-to-adapters`）、`:30`、`:51`。
- **表里的落点事实对**：`.scratch/archive/<feature>/` 真存在（追踪 81 个文件）；`artifacts/`、无锚点 `dist/` 与 `.gitignore` 一致；`39 文件 / 728 用例` 实测一致（`npm test`）。
- **§4.3 改写与变异真源一致**：`docs/MUTATION-TESTING.md:31`（`mutation:changed` = implement 收尾）与 `:40`（`mutation:milestone` = spec 收尾 / 发版）逐条对得上；`docs/HLD.md:114` 指向的 §4.5 存在（`docs/HLD.md:127`）。

## (a) 违反成文规范

1. **提交类型与改动内容不符（`CONTRIBUTING.md` §3）**：`0a061d8` 标 `docs(repo): …`，但本次新增的 `.oxlintrc.json` 是**改变门禁行为**的配置文件（`npm run lint` 从此会因 `window` / `cc` 判红），§3 把 `docs` 定义为「文档变更（修改 MD 文件、注释等）」。这份配置属 `chore`（构建过程或辅助工具的变动），要么换类型，要么拆一次提交。
2. **「每个事实只有一个家」（`AGENTS.md:5` + 文档归属表 `AGENTS.md:9-14`）被本次新增内容重复**：
   - `AGENTS.md:39-40` 与 `docs/HLD.md:66-67` 近乎逐字重复包描述（「会打进 game.js」/「只在你电脑上用 Node.js 跑，不进 game.js」）。包拓扑归 HLD，`AGENTS.md:39` 自己都写了「包拓扑见 `docs/HLD.md` §2」，却仍复述。
   - `AGENTS.md:42`（「根包；用相对路径引用 `src/` 与 `tools/`」）与 `docs/HLD.md:70` 重复同一事实。
   - `AGENTS.md:44-45` 与同文件 `AGENTS.md:22` 重复「报告类：证据，不是定义」这一分类——同一事实在同一个文件里出现两次。
   - `CONTRIBUTING.md:17` 复述 depcruise 规则语义（`docs/HLD.md:105` 已列、真源 `.dependency-cruiser.js`）。
   - `CONTRIBUTING.md:19` 复述「哪条脚本在哪一档」，而 `docs/HLD.md:118` 明写「命令清单以 `package.json` 为真源，本文不复制（复制就会漂）」，`CONTRIBUTING.md:78-79` 也已列同一对脚本。
   - `docs/HLD.md:98` 与 `CONTRIBUTING.md:13` 互相指认归属：前者说配置「执行 `CONTRIBUTING.md` §1 的红线」，后者说「规则真源以该配置文件为准」——同一个事实（哪两条规则在管 core 纯度）有两个家，且指向成环。

## (b) 判断项（基线 smell / 轻微）

3. **Duplicated Code（判断项）**：上面第 2 条整组都是「一处事实、两处正文」。修法是留指针、删正文（`AGENTS.md` 表只留「放哪」，`是什么` 留给 HLD §2）。
4. **自相矛盾（判断项）**：`AGENTS.md:49` 把 `.gitignore` 里「`dist/` 是无锚点规则」的理由抄进表内，而下一行 `AGENTS.md:51` 声称「本表不复制」。
5. **Speculative Generality（判断项，低）**：`.oxlintrc.json:3` 只为一个作用域用了 `overrides`；顶层 `rules` 也能表达。作用域隔离本身是有意的（`src/adapters` 合法用 `cc`），故仅记为判断项，不建议改。

## 与 Spec 轴的重叠

`AGENTS.md:51`「其余顶层目录」漏 `.githooks/` 一项，Spec 轴已报（`09-spec-axis-review.md:14`），此处只作佐证、不另计。
