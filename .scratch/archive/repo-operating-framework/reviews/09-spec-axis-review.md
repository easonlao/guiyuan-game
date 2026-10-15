# 09 目录约定与文档对账 — Spec 轴复核（Reviewer，独立复核）

被审对象：`git diff HEAD~1...HEAD`（单提交 `0a061d8`）。探针在工作区创建后已删除，`git status --porcelain` 为空，被审工作未改。

## 已核实做到（证据）

- **目录表逐行核对为真**：`src/package.json` = `@guiyuan/game`、`tools/package.json` = `@guiyuan/devtools`；`scripts/lib/` 存在；`tests/core/*.test.ts:2` 走 `../../src/…`、`../../tools/…` 相对路径；`docs/agents/` 含 issue-tracker / triage / domain；`docs/headless/`、`docs/archive/` 存在；`.scratch` 入库（`git ls-files .scratch | wc -l` = 112）且 `.scratch/archive/<feature>/` 为 feature 目录；`minigame/game.js` 入库；`artifacts/` 在 `.gitignore` 且确被写（`scripts/mutation-changed.mjs:67`）；`dist/` 为无锚点规则。
- **`CONTRIBUTING.md:13` 的「真正执行」独立复现**：探针 `src/core/__review_probe.ts`（`import 'cc'` + `window` + `document`）与嵌套 `src/core/logic/__review_probe.ts`，`npx oxlint` 均退 1 并报 `no-restricted-globals`×2 + `no-restricted-imports`×1；同内容放 `src/adapters/` 退 0。`npm run lint` 覆盖 `src/core`（`package.json:22`），串进 `check:quick`（`:16`）→ `verify`（`:17`）→ CI（`.github/workflows/fast.yml:54`）。注：`oxlint --print-config` 只原样回显 overrides、不反映生效结果，探针才是有效验证。
- **`docs/HLD.md:102` §4.2 无失真**：只实名两条真规则（`.dependency-cruiser.js:30` / `:51`），未声称拦 `core → minigame`；`CONTRIBUTING.md:17` 的 `src/core → src/adapters` 有 `core-not-to-adapters`（`.dependency-cruiser.js:18`）兜底。
- **`docs/HLD.md:114` §4.3 与 `docs/MUTATION-TESTING.md` §2.1（`:13-14`）一致**，且采信侧正确：符合 spec 决定 5/6（全量由 agent 在 spec 收尾触发，改动处变异进快链当观察项）。

## (a) 缺 / 只做了一半

1. **`AGENTS.md:51` 的「版本库里的其余顶层目录」漏了 `.githooks/`**：`git ls-tree HEAD` 的顶层目录里 `.githooks/` 是追踪目录，表内无行、该句也未列（唯一提及在 `CONTRIBUTING.md:60`）。句子以「其余」自称完整，属票面「东西放哪写清楚」的半个缺口。

## (b) 票外行为

无实质越界。`.oxlintrc.json` 是票面明示的两条路径之一（「选『真正执行』：新增 `.oxlintrc.json` 的 lint 规则，而非收回」）；`docs/HLD.md:97` 的配置指针是同族文档对账；`map.md` 的 Decisions/勾选属 tracker 协议。

## (c) 看着做到了、但实现有问题

2. **`map.md:42` 关闭的 09 仍带 `[FRONTIER]`**：同仓活跃 map 只把该标记放在未完成票上（`.scratch/minigame-view-upgrade/map.md:15`），归档 map 均已剥离。任务层因此显示「下一张票」是已完成票。
3. 次要：**`docs/HLD.md:114`「由 agent 手动触发（§4.5）」与 `:131` / `fast.yml:82` 有措辞张力**——`mutation:changed` 同时由 CI 自动跑（观察项）。§4.5 已解释，非与 §2.1 的矛盾，仅易误读。
