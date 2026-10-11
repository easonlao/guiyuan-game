# 08 产物边界 — Spec 轴复核（Reviewer，独立复核）

被审对象：`git diff HEAD~1...HEAD`（单提交 `1203e88`）。复核用 `git archive HEAD` 复制到 /tmp 后独立跑，未改动工作区。

> 注意：复核期间工作区被另一路（Standards 轴跟进）改成脏树——`.scratch/.../issues/08-artifact-boundary.md`、`docs/HLD.md`、`scripts/check-minigame-artifact.mjs`、`scripts/lib/minigame-build.mjs` 有未提交改动（mtime 09:30–09:31）。下面结论针对 **HEAD**，并标注哪些已在脏树里被修。

## 已核实做到（证据）

- ADR 写的是真实那条弱理由：`docs/adr/0014-minigame-artifact-is-committed.md:13`「理由只有一条，而且比它看起来弱：省下的是一次命令」；`:24` 明确拒绝借参考仓库类比。参考侧事实核对过：`/tmp/model-war-169.../docs/adr/0007-runtime-bundle-artifact-is-committed.md:7` 确为 `runtime.iife.js` 入库 + sha256 写回放 meta + 独立漂移门禁。
- 门禁真会红（在 HEAD 副本上实测）：改产物（+1 字节）退 1、报首差 94210；翻中段一字节退 1、报首差 66077；只改源码不重建退 1；产物缺失退 1；基线退 0。入库产物 == 现打（sha256 `81f2eee1…`，94210 字节，连续两次 `build:minigame` 一致）。
- 接进验收：`package.json:19`（verify 第四段）、`package.json:27`（命名脚本）、`.github/workflows/fast.yml:54`。
- `minify: false` 保持：`scripts/lib/minigame-build.mjs:44`。落点判定存在且对嵌套 `dist/` 也生效：`scripts/check-minigame-artifact.mjs:32`（`minigame/dist/game.js` → 红）。

## (a) 缺 / 只做了一半

1. **「逐字节比对」在 HEAD 里是字符串比对**：`scripts/check-minigame-artifact.mjs:42`（`readFileSync(target,'utf8')`）+ `:49`（`fresh !== committed`），`firstDifference` 也先 re-encode。合法 UTF-8 下与字节比等价（解码是单射），但验收条款写的是「逐字节」。脏树已改 `Buffer.equals`。
2. **落点判定只管常量，盖不住 vite 侧的落点**：判定读 `ARTIFACT_PATH`（`:32`），而落点事实在 HEAD 写了三份——`scripts/lib/minigame-build.mjs:17`（`ARTIFACT_PATH`）、`:20`（`ARTIFACT_FILE_NAME`）、`:36`（`outDir: 'minigame'`）。实测：只把 `outDir` 改成 `dist/minigame`，`check:artifact` 仍退 0。单次构建走 `writeMiniGameArtifact`（`:71-76`）所以只影响 `dev:minigame`（`:47` write:true、`:80`）。脏树已把 outDir/fileName 从 `ARTIFACT_PATH` 派生。

## (b) 票外行为

3. **构建面重构 + 静音**：新增 `scripts/lib/minigame-build.mjs`、`scripts/build-minigame.mjs:7-12` 变薄 CLI——票只要求「别顺手打开压缩」，没说重构。副作用是 `logLevel: 'silent'`（`scripts/lib/minigame-build.mjs:33`）连 `dev:minigame` 一起静音：实测当前 watch 无任何输出；去掉 `logLevel` 后 vite 才打印 `watching for file changes… built in 184ms`。`docs/DEVELOPMENT.md:42` 仍在推荐这条监听工作流。

## (c) 看着做到了、但实现有问题

4. **引用错行**：`docs/adr/0014-…:27`「`.gitignore:5` 的 `dist/` 是无锚点规则」——HEAD 的 `dist/` 在 `.gitignore:10`，第 5 行是注释（`.scratch/` 那条）。票里的 `:5` 是旧账，ADR 把错行号继承了；ADR 是长期文档，得改。
5. 次要：`catch {}`（`:43`）吞掉所有 fs 错误（EACCES/EISDIR）并报「找不到入库产物」。脏树已改为只吞 `ENOENT`。
