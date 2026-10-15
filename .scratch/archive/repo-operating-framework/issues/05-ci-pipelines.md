# 05: CI 快链与手动里程碑

**Type:** task

**What to build:** 每次推送自动跑验收；需要跑 33 分钟全量变异时点一个按钮，结果落盘可下载。

**Blocked by:** 04（流水线会把验收命令的形状烤死，形状没定就先接线，以后每次推送都慢）

**Status:** resolved

- [x] 流水线文件里**只出现「跑某条命名脚本」**，不写裸命令
- [x] 快链在 PR 与推送到主分支时自动跑，无凭证、离线可跑
- [x] 改动文件的变异（`mutation:changed`）作为快链里的**观察项**自动跑：红了不阻断别的，但结果落盘
- [x] 全量变异 + 棘轮对比**只能手动触发**，结果落盘可下载
- [x] 没有 `on: schedule`
- [x] 写一条 ADR：为什么快链自动、里程碑手动、不挂定时
- [x] 全量那条的**触发者写进 `AGENTS.md`**（需求方不是开发者，不会去按按钮）

**实现要点：**

- **不挂定时的理由是结构性的，不是成本。** 仓库是 public，Actions 分钟数不限量。真实理由：门禁是**差分棘轮**（`docs/MUTATION-TESTING.md` §3.1 只报基线之外的新增存活/无覆盖）。代码没变、测试没变，存活集合就不变——没有 diff 的跑法在定义上产不出新发现。ADR 里要写这条，不要写「太贵」。
- **删掉定时不等于可以不管。** 那道门禁是仓库最强的一道（比参考仓库严——参考仓库把 mutate 当观测项只落盘不设红线）。触发者只能是 agent，所以「spec 收尾时跑全量 + 棘轮」必须写进 `AGENTS.md` 并配一条命名脚本。
- `mutation:changed` 的子集报告**不能**做棘轮对比（`mutation:check` 会识别并退 `2`），所以它在快链里只能是观察项，不能当门禁。
- 快链里的变异观察项要传一个基线 ref（对比对象），否则「改动的文件」无从判定。
- 全量变异实测 33 分钟 / 1073 个突变体，超时要给够。

## Answer

实现：

- 新增 `.github/workflows/fast.yml`（快链，自动）：`on: pull_request` / `push: branches: [main]`；`permissions: contents: read`，全程无凭证引用。两个 job：
  - `verify`：checkout → setup-node（`node-version-file: .nvmrc` + `cache: npm`）→ `npm ci` → **`npm run verify`**（唯一检查步）。
  - `mutation-changed`（观测项）：job 级 `continue-on-error: true`，红了不阻断验收；跑 **`npm run mutation:changed -- <ref>`**，基线 ref 按事件取（PR 用 `github.event.pull_request.base.sha`，push 用 `github.event.before`，并挡掉建分支时的全零 SHA）；`if: always()` 上传 `artifacts/` 为 artifact（保留 14 天）。`fetch-depth: 0` 供 diff 用。
- 新增 `.github/workflows/mutation-milestone.yml`（里程碑，手动）：**只有 `on: workflow_dispatch`**；跑 **`npm run mutation:milestone`**，`timeout-minutes: 120`（全量实测 33 分钟，给足）；`if: always()` 上传 `artifacts/` 为 artifact（保留 30 天）。棘轮有新增存活时该 job 判红。
- `package.json` 新增命名脚本 `mutation:milestone` = `npm run mutation && npm run mutation:check`（给 AGENTS.md 与里程碑流水线一个入口，而不是让两边各拼两条命令）。
- `AGENTS.md` 的 Mutation testing 节写明：全量 + 棘轮的触发者是 **agent**，在每个 spec 收尾时跑 `npm run mutation:milestone`。
- `docs/HLD.md` 新增 §4.5「持续集成流水线」（工程方案回写 HLD，CI 归 HLD 所有）；`docs/MUTATION-TESTING.md` §2.2/§2.3/§9 与快速上手表同步（原 §2.3 写「本仓库没有 CI」，已按现状改写）；新增 ADR `docs/adr/0012-ci-fast-chain-and-manual-milestone.md`（决策 + 被否决方案 + 后果；不挂定时的理由写成「差分棘轮没有 diff 产不出新发现」的结构性理由，不是成本）。

证据：

| 项 | 命令 / 做法 | 结果 |
|---|---|---|
| YAML 可解析 | `node -e` 用仓库内 `yaml` 解析两个 workflow | 两个文件均解析成功，`on` / `jobs` 符合预期 |
| 无定时 | `grep -rn "on: schedule" .github/` | 无匹配（文件里只有解释「为什么不挂」的注释） |
| 只跑命名脚本 | `grep -rn "run:" .github/workflows/` | 仅 `npm ci`（安装）、`npm run verify`、`npm run mutation:changed -- <ref>`、`npm run mutation:milestone` 四条，无裸检查命令 |
| 验收命令仍绿 | `npm run verify` | 退出 `0`：`fmt:check` 91 文件、`lint` 干净、`check:deps` 46 modules / 130 dependencies、`typecheck` 干净、`test` 39 文件 / 728 用例全绿 |
| 基线 ref 能喂进 `mutation:changed` | `npm run mutation:changed -- HEAD~5 --dryRunOnly` | 退出 `0`：识别出 1 个改动文件 `src/core/logic/ActionResolver.ts`，`Instrumented 1 source file(s) with 362 mutant(s)`，dry run 成功——证明 ref 参数与 `--mutate` 透传正常 |
| 棘轮命令在 | `npm run mutation:check` | 退出 `0`（对现存全量报告：34 条存活/无覆盖均在基线内） |

未能本地验证（诚实说明）：两个 workflow 的**真实 runner 执行**要推到 GitHub 才跑得起来；本票只做了 YAML 解析与命令/脚本层面的验证，没有在 Actions 上实际跑过。全量 `npm run mutation:milestone` 本地未跑（33 分钟），只验证了它的两个组成脚本各自可用（`mutation:check` 已跑；`mutation` 未重复跑，此前已有全量报告）。

## Comments

两轴评审（Standards / Spec，独立子代理）结论：7 项验收条款全部实现，无功能缺陷。已按意见收尾：

- **文档单家归属**：`docs/MUTATION-TESTING.md` §2.3 改为指向 `docs/HLD.md` §4.5，不再复述 CI 方案；ADR 0012 的「决定」只留决策与理由，具体 workflow / 权限 / ref 取法明确让给 HLD §4.5；两个 workflow 的头部注释收敛为指针。
- **成本口径措辞**：`mutation-milestone.yml` 头部不再用「跑 33 分钟不划算」解释不挂 push，改为指向 ADR 0012 的结构性理由。
- **去掉未要求的触发**：`fast.yml` 移除 `workflow_dispatch`（票面只要求 PR + push main），`docs/HLD.md` 的描述随之准确。
- **边界防御**：观测项的基线 ref 挡掉建分支时的全零 `event.before`（否则 `git diff` 退 128）。
- **变更记录**：ADR 的「后果」删去一条属于变更历史的条目（变更历史由 git 承载）。

保留的判断：`run: npm ci` 是安装步不是检查步，不算「裸命令」（参考仓库 ADR-0010 同样保留安装步）；`fast.yml` 的 `concurrency` / timeout / `cache: npm` 属常规 CI 配置。
