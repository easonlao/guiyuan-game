# 票 02 Standards 评审（归一金环 / 亢极双层环）

**结论：无硬性违规（documented standard 层面）。** 命名、分层、TDD、产物对账均合规；工具链（oxlint / tsc / oxfmt / depcruise / check:artifact）本机全过。以下均为判断题（baseline smells / 软性标准张力）。

## 已核验的合规项

- 常量 `UPPER_SNAKE_CASE`、函数 camelCase、布尔 `isXxx`（CONTRIBUTING §2.1）✔；`guiYiRingLayers` / `_drawGuiYiRings` 沿用文件内既有私有 `_` 前缀约定。
- 术语用 GLOSSARY 正名（归一 / 亢极），未用 _Avoid_ 别名 ✔。
- 测试与实现同步落地（CONTRIBUTING §4.3 TDD）✔；复用 `boardWith` / `sealOf` / `RecordingContext` 既有设施 ✔。
- `minigame/game.js` 为重跑产物且逐字节对账通过（CONTRIBUTING §5.6，`check:artifact` ✔）。
- `src/minigame` 属 Layer 3，未触碰核心纯度红线（§1）✔。

## 判断题

1. **冗余断言 + 注释错位**（tests/…board-view.test.ts:425-427）：`expect(guiYi[0]).toBeGreaterThan(ownSeal)` 被 `ringArcs` 的过滤条件 `arc.radius > seal.sealSize`（:357）构造性保证，永真；其上方注释却声称验证「中性金、不脉动」——配色实际由用例 1 的 `color === THEME.gold` 断言，「不脉动」则无处断言。建议删除断言或改注释。
2. **可避免的 `as` 断言**（test:377）：`{ yin: yin as 0 | 1 | 2, … }`——把 `PAIRS` 元组类型改为 `readonly [NodeLevel, NodeLevel, 0 | 1 | 2]` 即可免 cast；仓库方向（migrate-to-shoehorn skill）倾向测试少用 `as`。非门禁。
3. **Duplicated Code（轻）**（test:445-446）：底晕半径公式 `view.layout.outerRadius + view.layout.sealSize * 1.1` 把 `_drawEngraving` 私有的 1.1 系数复述进测试；测试文件头部约定「期望值手算、不从被测代码抄」，此处是公式复述而非抄坐标，属灰色地带——建议把 1.1 提为具名常量或注释锚定 ADR。
4. **One-home 张力**（docs/HLD.md §2 + docs/LLD.md §4.1-6）：「一圈金环 / 双层 / 中性金 / 不脉动 / 一视同仁」同一事实写进两处，触及 AGENTS.md「每个事实只有一个家」；但亮度阶梯早已同式双写，本次沿用既有模式。可考虑 HLD 只留指针、编码语义归 LLD §4.1。
5. **Mysterious Name（轻）**（board-view.ts:437）：`const half = GUIYI_RING_OUTSET_RATIO / 2`——「half of what」需读常量注释才知是「半外扩」；`outsetPerLayer` 一类名字更自释。
6. **摆放不一致（微）**：模块级纯函数 `guiYiRingLayers`（board-view.ts:166）置于类前，而文件内其余模块级 helper（`drawPill` / `withAlpha` / `buildGenerationRing` / `connectionKey` / `resolveActionPath`）均在类后。

## 复核命令证据

`vitest run`（26 passed）、`lint`、`typecheck`、`fmt:check`、`check:artifact` 全部通过；测试接受六种配对与三尺寸（320×568 / 390×844 / 460×900），与 spec 验收口径一致。
