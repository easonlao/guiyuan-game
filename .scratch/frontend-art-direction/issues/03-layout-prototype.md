# 用当前游戏的粗略改版图确认画面方向

Parent: ../map.md
Type: prototype
Label: wayfinder:prototype
Status: resolved
Assignee: main-agent
Blocked by: 02

> **原型已归档（2026-10-16）**：`layout-prototype.html`、`layout-prototype.ts` 与一次性探针
> `probe-layout-snapshot.ts` 移到分支 `exp/character-generation`——用户已选定 A 布局，原型完成使命
> （即本票文末「原型归档（throwaway 分支）等用户选定后再做」）。下文的运行说明保留为过程记录，
> `tools/minigame-preview/index.html` 的入口链接已移除。要复跑：
> `git checkout exp/character-generation -- tools/minigame-preview/`

## Question

把用户选择的视觉特征放回当前游戏后，哪种粗略画面方案既符合喜好，又让盘面、可操作入口、行动结果更容易辨认？使用临时原型而非正式素材，通过用户反馈确定方向，记录待试玩验证的假设，不声称原型已证明新玩家可理解。

## Answer

用户查看三布局原型后回复「A方案」，选定 A：人物在上、棋盘居中，作为后续美术规划的布局基线。不继续推进 B/C。

这次确认只针对布局方向，不代表用户逐项批准人物大小、背景、按钮样式、占位角色画风或最终资产，也不证明新玩家可理解性。正式前端未改；原型源文件与截图入口见下方记录。临时分支归档尚未执行，不声称已完成归档。

下一步明确 A 布局的首批静态美术范围及代码绘制边界，随后再定具体生成流程。角色动作与行动反馈保持后续规划范围。

## Comments

### Prototype：三布局竖屏临时原型已可打开，等用户反馈（票保持 claimed，不关）

回答的问题：**人物与棋盘并重时，哪种竖屏摆法既符合已确认的视觉特征，又让盘面、可操作入口、行动结果更容易辨认。** 本原型只把选项摆出来，不代表已证明新玩家可理解，也不得出最终风格结论。

**入口与运行**

- 一条命令：`npm run preview:minigame`（= `vite tools/minigame-preview --host 0.0.0.0`，见 `package.json:38`），默认端口 **5173**。
- 原型页：`http://localhost:5173/layout-prototype.html?variant=A`；`?variant=B|C` 直达，或点页面底部唯一切换条的左右箭头 / 按 ← → / 1 2 3 切换，URL 即刷新即保持。
- 默认预览 `http://localhost:5173/` 不受影响，只在左上角多了一个「🧭 布局原型 A/B/C」入口链接。
- 为什么不把 `?variant=` 挂在默认预览页上：默认预览跑的是正式 `GameScene`，盘面 / 头像 / 操作栏的排布写在 `src/minigame/game-scene.ts` 里；三个候选要改的正是这套排布，而本轮不允许改正式源码，所以另开 `layout-prototype.html` 承载（也避开了仓库已有的 `prototype.html` 动效原型，不覆盖他人产物）。

**三个变体（结构不同，不是换色）**

| 键 | 布局 | 一句话 |
|---|---|---|
| A | 人物上方 + 棋盘中央 | 顶部一条人物舞台，棋盘在中央拿中等可用高度，人物最大 |
| B | 人物分列棋盘两侧 | 左右窄侧栏放人物，棋盘被挤成中间窄列、明显变小 |
| C | 人物融入背景 + 棋盘前景 | 人物压暗进背景、棋盘前景最大；小屏上人物与盘面重叠明显 |

**同一份真实快照（三个变体共用，保证可比）**

- 真实 `GameScene` 在内存里重放到「种子 13 · 第 4/30 回合 · 玩家抉择中」后冻结（玩家动作固定取第一个候选，确定性可复现）；三个变体只读投影同一份状态：天干 甲木阳、比分 410:410、3 个真实候选；「上一招」是真实结算结果「天道用甲 · 调息（天道·木阴 虚空→点亮）」。
- 盘面 = 真实 `BoardView.update(p1Board, p2Board)` + 真实候选弧 / 高亮连线投影；操作按钮与「上一招」= 真实 `ActionBarView` / `ActionResultView`（按钮文案与置灰口径与正式一致）；角色 = 仓库现有 `minigame/assets/characters.png` + 真实 `drawCharacterSprite`，页面明确标注为**占位素材、非最终画风**；背景 = 当前游戏已有的 `drawLandscape`，页面只另加了少量线条与淡雾草图。
- 静态展示：按钮点击不结算（只读门面，不写回快照），页面侧栏会闪一下「不执行」的提示；「上一招」条可展开看真实变更明细。`?seed=`、`?round=` 可换一份可复现快照。

**截图**（`artifacts/` 不入库；以下 8 张已于 2026-10-16 随 `artifacts/` 删除）

- `layout-A.png`、`layout-B.png`、`layout-C.png`：1280×900，含右侧说明栏。
- `layout-A-phone390.png`、`layout-B-phone390.png`、`layout-C-phone390.png`、`layout-C-phone390x700.png`：390 宽窄屏证据。
- `layout-overview.png`：三布局对比总览（同一快照，460×800 画布裁切并排）。

截图没了不影响本票结论（用户选定 A，见 `../map.md`）。要复核，先取回原型
`git checkout exp/character-generation -- tools/minigame-preview/`，再跑 `npm run preview:minigame`。

**已知代价与风险（如实呈现，未修饰）**

- B：390 宽时棋盘外环直径约 180px（A/C 约 300px+），侧栏人物只比现状头像略大。这是「人物占两侧」的结构性代价，不是实现问题。
- C：390×700 时人物与盘面重叠、棋盘外沿贴近操作栏；人物只有名字与比分，可辨识度三者最低。即票里预告的小屏风险。
- 三张截图都不能证明：真机字体与触摸可点范围、动效节奏、新玩家是否更易懂、角色最终画风是否达标。
- 角色姿势固定为待机，不含施法 / 受击等动作表现，本原型不评估动画。

**边界**：只新增 `tools/minigame-preview/` 下原型文件（`layout-prototype.html`、`layout-prototype.ts`、一次性探针 `probe-layout-snapshot.ts`），`tools/minigame-preview/index.html` 只加了一个入口链接；未改 `src/minigame`、未改 `minigame/game.js`、未提交、未切分支。快照点可用 `npx tsx tools/minigame-preview/probe-layout-snapshot.ts [seed] [round]` 复核；原型归档（throwaway 分支）等用户选定后再做。

**请用户反馈**：三个里哪个第一眼最顺；要不要「A 的人物 + C 的盘面」这类混合；人物大小、背景氛围、按钮与「上一招」的位置是否合适。
