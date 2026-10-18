# Capcom《Super Puzzle Fighter II Turbo》角色表现层调研

**这是一份报告（证据与导航），不是项目定义。** 它记录我从一手来源和 rip 素材里查到的
「角色动作怎么画、怎么播、怎么被触发」，供本项目改角色表现层时参考；它不定义本项目的任何规则、
数值或接口。本项目规则见 `docs/GDD.md`，工程方案见 `docs/HLD.md`。

- 调研对象：Capcom《Super Puzzle Fighter II Turbo》/《Super Puzzle Fighter II X》（CPS-2，1996）
- 范围：只查表现层（版式、动作、帧数、触发、存放与驱动、程序化成分），不查下落方块玩法
- 调研日：本轮会话
- 结论先行：**这游戏没有「每个动作固定几帧」的公开一手资料。可核实的是「动作集合」和
  「某些动作的独立帧画数量」（从 rip 图数出来），以及「动作随盘面危险度/攻击规模分档」这个结构；
  每帧停留多少个 game frame（即真正的帧表）没有任何一手文档，需要 ROM 反汇编才能拿到。**

## 0. 证据等级（本文所有数字都标等级）

| 等级 | 含义 | 本文用到的来源 |
|---|---|---|
| **一手·硬件** | 硬件行为，可由 MAME 源码逐行核实 | `mamedev/mame` 的 `cps2.cpp` / `cps1.cpp` / `cps1_v.cpp` / `cps1.h` |
| **一手·官方文件** | Capcom 自己写的规则说明 | PS1 版官方说明书（Capcom 文本，Sony 官方 CDN 托管） |
| **一手·开发者言说** | 1996 年日文杂志访谈的英译（经翻译，非原文） | shmuplations 译文 |
| **rip 素材** | 从 ROM 实际导出的美术本身（不是我画的、不是官方文档） | The Spriters Resource 的角色表；StrategyWiki 的 384×224 截图 |
| **二手·仅交叉验证** | 不能单独支撑数字 | 日文维基、KLOV/Museum of the Game 词条 |
| **未查到** | 没有任何来源，禁止填数字 | — |

**一条重要的负面结果**：网上流传的「某动作 N 帧、时长 X 秒」多来自粉丝 GIF。我实测了 emugif 站
**Ryu 与 Morrigan** 两个角色的全部动画 GIF（各 13–14 条，`http://www.emugif.com/picture/spf2x/ryu.htm`、
`…/morrigan.htm`；其余 9 人的页面是 5 条无标签 GIF，未采用）：GIF 帧延迟**绝大多数是 100 ms**
（10 fps），少数帧是 60/80/140/150/200/300/400/500/700 ms——即时机是制作者自己排的，不是 60 fps 的实机节奏。
且帧数与 Spriters Resource 的独立 rip 对不上：Ryu「遭受轻攻击」GIF **5** 帧、rip 表 **2** 帧；
「胜利」GIF **20** 帧、rip 表 **6** 帧。所以 **GIF 的帧数和时长都不能当游戏内的真实值**，本文不采用。

---

## 1. 画面版式

| 事实 | 值 | 出处 |
|---|---|---|
| 有效分辨率 | **384 × 224**，横向（水平同步） | MAME `src/mame/capcom/cps1.h:41-47`（`HBEND 64`→`HBSTART 448`、`VBEND 16`→`VBSTART 240`），由 `cps2.cpp:1758` 的 `set_raw(...)` 使用 |
| 消隐/全画面（overscan） | 512 × 262 像素 | 同上（`CPS_HTOTAL 512`、`CPS_VTOTAL 262`） |
| 刷新率 | **59.64 Hz**（= 8 MHz ÷ (512 × 262)，1 个 game frame ≈ **16.77 ms**） | 由 `cps1.h:39`（`CPS_PIXEL_CLOCK = 16 MHz / 2`）与 `cps1.h:41-47` 算出；我核算过 |
| 基板色深 | 屏上 4096 色，每个 tile/sprite 16 色（4 bit/px） | system16 CPS2 硬件页 <https://www.system16.com/hardware.php?id=795> |
| 精灵基本单位 | 16 × 16 px、4 bit/px，一块 sprite 可用 `nx×ny`（1~16 × 1~16 个 tile）拼成 | MAME `src/mame/capcom/cps1.cpp:3859-3867`（`cps1_layout16x16`）、`cps2.cpp:906-910`（`nx/ny` 解码） |

**版式结构**（rip 素材：384×224 的实机截图
<https://cdn.wikimg.net/en/strategywiki/images/a/ae/SPF2T_Screen_Setup.png>）：

- 两块棋盘分列**左右**，各 **6 列**宽，占屏幕下半部到中上部；棋盘为空时透出后面的舞台美术，
  所以「空地」看起来就是背景图，不是一块灰底。
- 屏幕**中央**留出一条纵向空档放两名角色（左侧 1P、右侧 2P，**面对面对称**），两人站在同一条地平线上，
  脚下是舞台美术的地面，**没有各自的独立基座/平台**——两个人在同一张舞台图上。
- 舞台背景是一张 **384×96** 的美术条（StrategyWiki 的 `SPF2T Ryu Stage.png` 等文件就是 384×96），
  上下各留出给棋盘与 HUD 的空间。
- 顶部中央是两块 `NEXT` 宝石窗 + 标题 logo，顶部两侧是危险度提示（`CAUTION` / `WARNING` / `DANGER`）。
- 角色尺寸（从 rip 表量出来的包围盒）：**宽 48~102 px、高 61~68 px**；Ryu 的多数帧是 **59×63**。

> 说明：棋盘每列的精确像素宽我**没有**从文档查到。按 CPS2 的 16 px tile 粒度 + 6 列推算应为约 96 px，
> 这是**推算不是实测**；从截图目测约 100~105 px（含边框）。角色坐标同理，属于「我量的」，不是官方数据。

---

## 2. 动作集合与帧数（核心表）

下表「帧数」= **该角色 rip 表里这一动作有多少张独立画**（我数的，两种方法交叉：目视计数 +
对 PNG 做连通域/行聚类得到每行的精灵个数，两法一致）。这是「要画多少张图」，**不是**「游戏里播多少帧」。

角色：**Ryu**（表 1004×1473，rip 者 Jacinta burke / redblueyellow，
<https://www.spriters-resource.com/arcade/superpuzfightiiturb/asset/39027/>）

| 动作（rip 表上的原标签） | 帧数 | 时长 | 触发条件 | 出处 |
|---|---|---|---|---|
| `Idle` 待机 | **7** | 未查到（下限 7×16.77 ≈ 117 ms） | 常态循环 | rip 表；我计数 |
| `Advantage` 占优 | **8** | 未查到（下限 ≈ 134 ms） | 盘面对自己有利时替换待机 | rip 表；语义映射见 §3（推断） |
| `Disadvantage 1` 劣势一档 | **8** | 未查到（下限 ≈ 134 ms） | 自己危险度升到第一档 | rip 表 |
| `Disadvantage 2` 劣势二档 | **8** | 未查到（下限 ≈ 134 ms） | 自己危险度升到第二档 | rip 表 |
| `Fight Start & Taunt` 开场 + 挑衅 | **10** | 未查到（下限 ≈ 168 ms） | 回合开始；或按挑衅键 | rip 表；挑衅键见官方手册（§3） |
| `Special Move 1: Hadouken` 必杀技 | **10**（角色）+ 12（飞行道具/命中特效，独立条目） | 未查到（下限 ≈ 168 ms） | 攻击规模达到「必杀」档 | rip 表 |
| `Super Combo: Shin'kuu Hadouken` 超必杀 | **10**（角色）+ 8（特效）+ 1（蓝色剪影） | 未查到（下限 ≈ 168 ms） | 攻击规模达到「超必杀」档 | rip 表 |
| `Minor Damage` 轻受击 | **2** | 未查到（下限 ≈ 34 ms） | 受到小规模攻击 | rip 表 |
| `Major Damage` 重受击 | **2** | 未查到（下限 ≈ 34 ms） | 受到大规模攻击 | rip 表 |
| `Victory & Selected` 胜利/被选中 | **6** | 未查到（下限 ≈ 101 ms） | 回合胜利；选人画面 | rip 表 |
| `Lose` 失败 | **3** | 未查到（下限 ≈ 50 ms） | 回合失败 | rip 表 |
| `Intermission Cutscenes` 中场小剧 | **5**（+2 张变体） | 未查到 | 关卡间的 SHOW TIME 小剧 | rip 表 |

**帧数因角色而异，不能互相套用。** 同法数 Chun-Li
（<https://www.spriters-resource.com/arcade/superpuzfightiiturb/asset/92322/>，1256×1710）：
`Idle` **6** 帧、`Taunt` **4** 帧（她这张表把挑衅与开场合开成两条）、`Special Move 1: Lightning Leg Kick`
**7** 帧、`Super Combo: Kikoushou` **7** 帧、`Minor Damage` **4** 帧。
即「同一动作，Ryu 轻受击 2 帧、Chun-Li 4 帧」。

**一手的量级佐证**：1996 年开发者访谈里，策划太田直仁说「每个角色的动作只有几个，但**每个动作的
动画张数更多**；给设计师一个大纲，回来的动画经常是**二十帧**长」——和上表「单个动作 2~10 张、
特效另算」的分布吻合（shmuplations 英译 <https://shmuplations.com/superpuzzle/>）。
同访谈里，Dhalsim 被排除的理由就是「没把握把他的各种动作画出来」，说明**每个动作都是逐张手绘的**。

---

## 3. 动作怎么被触发

| 触发源 | 对应动作 | 证据等级 / 出处 |
|---|---|---|
| 回合开始 | 开场动作 | rip 表标签 `Fight Start` |
| 常驻 | 待机循环 | rip 表标签 `Idle` |
| 按键 | 挑衅（每回合限 1 次） | **一手·官方**：PS1 官方说明书「`SELECT button` taunt opponent (once per round)」<https://secure.cdn.us.playstation.com/manuals/classic/games/super-puzzle-fighter-ii-turbo-manual-en.pdf> |
| 攻击规模（送出的 counter gem 数量） | 必杀技 / 超必杀技（**两档**） | rip 表分成 `Special Move` 与 `Super Combo` 两组；规模分级见下 |
| 自己/对手的盘面危险度 | `Advantage` / `Disadvantage 1` / `Disadvantage 2`（**三态**） | 从 rip 表标签名推断 + 日文维基「落下口被宝石逼近时角色会做反应」交叉验证；**语义映射属推断** |
| 被打 | `Minor Damage` / `Major Damage`（**两档**） | rip 表标签 |
| 胜负 | `Victory & Selected` / `Lose` | rip 表标签 |
| 关卡之间 | `Intermission Cutscenes`（SHOW TIME） | rip 表标签；日文维基称其名为 SHOW TIME（二手） |
| **停留够久**（时间事件） | 「某些动作只在过了若干时间后才播」——即待机/占优时会插入延时变体动作 | **一手·开发者言说**：访谈原文「there might be animations that only play after a certain amount of time has passed」（<https://shmuplations.com/superpuzzle/>）；Ryu 的 `Advantage` / `Disadvantage` 各行 8 帧也是同类的「非受击反应」 |

**攻击规模的分档口径（官方数字，可直接用）**：官方说明书写明 counter gem 预警提示的分级——
`CAUTION` 1–10 个、`WARNING` 11–30 个、`DANGER` **31 个以上**；同页写明「破掉的宝石越多，落到对手场上的
counter gem 越多」，且「counter gem 按你所选角色的**预定图案**落下」。出处同上一行的 PS1 官方说明书。

> 注意：官方给的是**预警 HUD 的三档**（1–10 / 11–30 / 31+），而 rip 表上角色只有**两套**
> 攻击动作（必杀 / 超必杀）。两者是否为同一个阈值、中间那档有没有独立动画——**未查到**。
> 日文维基另称「同时送入 30 个以上 counter gem 会放超必杀」（二手，与 DANGER=31 基本吻合，可作旁证）。

**「弱攻击和挑衅共用一套动作」**：Ryu 的 rip 表把开场合为一行（`Fight Start & Taunt`），
日文维基也称弱攻击与挑衅是同一动作（二手）。这条**我只在 Ryu 的 rip 表和日文维基上见到**，
Chun-Li 的 rip 表则把 `Fight Start` 与 `Taunt` 分开列。

**攻击方与受击方的先后关系**：**未查到**。没有任何一手资料描述「攻击动作播到第几帧时对手开始受击动画」、
有没有 hitstop、两段动画是否并行。这一层只能靠逐帧观察实机/模拟器，我没有做（也没有 ROM）。

**反击（counter gem）时的专门表现**：**未查到**。rip 表里没有独立的「接住反击」动作条目，
只有 counter gem 的 HUD 图标（`COUNTER GEM` 面板）；是否复用受击/挑衅动作，无据可依。

---

## 4. 帧的存放与驱动

**硬件层（一手，MAME 源码）**

- CPS-2 **没有动画表硬件**。硬件只认「精灵表」：一段 RAM 里每个精灵占 **4 个 16 bit 字**
  （x、y、code、colour），游戏每帧自己写好这张表，硬件照表画。
  - 表地址：`0x700000-0x701fff` 与 `0x708000-0x709fff` 两页（双缓冲/切页），每页 8 KB
    = 1024 个精灵条目 → `src/mame/capcom/cps2.cpp:1280-1281`、`cps2.cpp:793`。
  - 字段解码：`x` 的高 3 bit 是优先级；`code` 受 `y` 的高 2 bit 扩展；
    `colour` 低 5 bit 是调色板号，bit5/bit6 是水平/垂直翻转，bit8-11/bit12-15 是块宽/块高（nx/ny）
    → `src/mame/capcom/cps2.cpp:889-910`。
  - 绘制顺序是从表尾往前遍历、遇到结束标记停 → `cps2.cpp:841-864`（`find_last_sprite`）、
    `cps2.cpp:865-1000`（`cps2_render_sprites`）。
- 因此「一帧角色画」= 若干精灵条目的组合；一个约 60×64 的角色帧通常要么用一条 `nx×ny=4×4` 的
  块精灵，要么拆成多条。**具体用哪种我无法核实**（需要 ROM）。

**数据层（未查到）**

- 动画帧表（每个动作的帧序列、每帧停留几帧、循环标记）**在 68000 程序里**，不在图形 ROM 里：
  spf2t 的图形 ROM 只有 4 MB（`pzf.14m/16m/18m/20m`，各 1 MB），主程序 1 MB
  （`pzf.03`+`pzf.04` 各 0x80000）→ `src/mame/capcom/cps2.cpp:8488-8510`。
- **帧表的具体格式、有没有 loop/end 标记、每帧的 dwell 值，没有任何一手文档，我也没有 ROM 可以反汇编。
  这一项写「未查到」，不猜。**
- 硬件本身提供了动画所需的全部材料：`nx×ny` 块精灵、XY 翻转、每帧改写 x/y（→ 位移）、
  以及每精灵 32 个调色板（`colour & 0x1f`，见上）。所以「帧表 = 数据驱动」在 CPS-2 上是
  **软件决定**，不是硬件特性。

---

## 5. 纯逐帧，还是有程序化成分

| 成分 | 结论 | 出处 |
|---|---|---|
| 主体 | **纯 2D 逐帧手绘**（无骨骼无缩放无旋转插值） | rip 表就是逐张像素图；访谈称动作是设计师逐张画、常常二十帧 |
| 调色板/亮度 | **有**。CPS 的调色板字是「12 bit RGB + 4 bit 亮度」，全屏淡入淡出/闪白只需改调色板字，不用重画 | `src/mame/capcom/cps1_v.cpp:2607-2640`（`cps1_build_palette`，「12 bit RGB with a 4 bit brightness value」） |
| 同帧叠层（残影） | **有**。超必杀那张 rip 表上 rip 者直接写了操作说明：`<Use above animation and place previous blue sprite behind normal palette>`——即**把同一个角色帧的蓝色调色板版本垫在正常版本后面**做残影 | Ryu / Chun-Li 的 Spriters 表原文标注 |
| 位移 | 可以由每帧改写精灵 x/y 实现（硬件支持），**但这游戏是否这样用未核实** | `cps2.cpp:889-910`（x/y 是每帧写入的） |
| 抖动/闪白的具体条件 | **未查到**（日文维基称超必杀 K.O. 时画面会发光，二手，未核实） | — |

---

## 6. 受击强度是否与攻击规模成正比

**是，但是「离散两档」而不是连续插值**：rip 表上每个角色的受击动作只有
`Minor Damage`（轻）和 `Major Damage`（重）两条，各自 2~4 张画；没有第三、第四档。
判据一侧（攻击规模）在官方说明书里是**三档**（1–10 / 11–30 / 31+）。
「规模 → 播放轻还是重受击」的**具体阈值未查到**。

角色本身还有「优势/劣势」三态（`Advantage` / `Disadvantage 1` / `Disadvantage 2`），
这是**盘面危险度**驱动的表现，不是受击。日文维基的旁证：Dan 作为特例「攻击全是挑衅，
所以对手完全不播受击动作，落下口被宝石逼近时也不做反应」——反过来说明普通角色**是**会反应的（二手）。

---

## 7. 可直接照抄的做法

1. **动作集合照它的拓扑扩**：本项目现在 7 个状态（`src/minigame/types.ts:5-12` 的
   `CharacterActionState`）；SPF2T 实际是「待机 / 优势 / 劣势×2 / 开场 / 挑衅 / 必杀 / 超必杀 /
   轻受击 / 重受击 / 胜利 / 失败 / 小剧」≈ 13 条。**成本最低、观感提升最大的是加两档受击 + 两档劣势**：
   它们让「谁快输了」不用看数字，看角色就行。
2. **受击做两档、不做连续强度**。两档受击各 2~4 张画就够（Ryu 2 张、Chun-Li 4 张）。
3. **攻击做两档**：普通攻击 / 大招各一套动画，阈值可以直接借用官方的 DANGER=31（counter gem 数）。
   中间档不加动画，只加 HUD 提示（CAUTION / WARNING / DANGER 三级文字，官方口径 1–10 / 11–30 / 31+）。
4. **帧数量级**（照着做大约不会跑偏）：待机循环 6~8 帧、受击 2~4、胜利 6、失败 3、
   必杀 7~10、超必杀 10、开场/挑衅 4~10。在 60 Hz 下这些都是百毫秒级；**每帧停留几帧要自己定，
   别抄网上的「时长」**。
5. **用调色板做廉价演出**：闪白/变暗改亮度字（CPS 就是这么干的），超必杀残影 = 同一帧的
   蓝色调色板版本垫在后面。这类效果不需要额外美术。
6. **素材组织照它的表**：一个角色一张 sheet，**按动作分行**、行内按帧排，特效（飞行道具/命中火花）
   **单独成行**，因为特效和角色是各自独立的精灵，可以独立计时（Ryu 必杀技 10 帧角色 + 12 帧特效）。
7. **等待/循环标记写在数据里**：硬件不管循环，帧表必须自带 `loop / hold / end` 语义——这是
   照抄它「结构」最该抄的一点（它的具体编码未查到，但结构上必然存在）。

## 8. 不建议照抄的做法（含理由）

1. **不要照抄 GIF 的帧数与时长**。我实测 emugif 全站 SPF2T 动画 GIF 一律 100 ms/帧（10 fps），
   与独立 rip 表对不上；拿它当基准会让动作慢 6 倍且帧数错。
2. **不要照抄「每角色 100+ 张独立像素画」的资产量**。Ryu 一张 rip 表 1004×1473、我数到 119 个
   独立连通块（角色帧 47–102 × 59–71 px，另含特效、HUD 与头像）；11+ 角色全做，美术成本远超这个项目的收益。**该抄的是「动作分档 + 每档少量帧」，
   不是它的绝对帧数。**
3. **不要照抄 384×224 / 16 px tile / 每行 6 列这些硬约束**。那是 CPS-2 的硬件边界，不是设计结论；
   本项目图集是 1254×1254（4 列 × 4 行），资产组织方式不同。
4. **不要照抄「对手完全不反应」的特例**（Dan）。它是角色梗，不是系统设计；照抄会让玩家读不到反馈。
5. **不要照抄「弱攻击 = 挑衅同一套动作」这个细节**。它只在 Ryu 的 rip 表和日文维基上出现，
   Chun-Li 的 rip 表把两者分开列——证据不足，且本项目状态机里 `attack` 和 `cast` 是分开的。
6. **不要在没有依据的情况下把「帧表驱动」写成「CPS-2 硬件特性」**。硬件只认精灵表，
   动画调度全在 68000 程序里；对外解释时这么说才准确。

## 9. 查不到的东西（诚实清单）

| 缺口 | 状态 |
|---|---|
| 每个动作**每帧停留几个 game frame**（真正的帧表数据） | 未查到。需要 ROM 反汇编 68000 代码；无一手文档 |
| 帧表格式、是否有 loop / hold / end 标记 | 未查到（硬件不提供，必在代码里） |
| 攻击动画与受击动画的**时序关系**（谁先、是否并行、有无 hitstop） | 未查到 |
| counter gem 命中/反击时是否有**专门**表现分支 | 未查到 |
| 攻击规模 → 轻/重受击的**具体阈值** | 未查到（官方只给了 HUD 三档 1–10 / 11–30 / 31+） |
| 「必杀 / 超必杀」两档是否也按 31 分界 | 未查到（日文维基称 30+ 触发超必杀，二手，未核实） |
| 11 个角色**各自**的完整帧数 | 只完整核了 Ryu；Chun-Li 核了 5 个动作；其余 9 人未核 |
| 角色的屏幕精确坐标、棋盘每列像素宽 | 无文档；只有我从 384×224 截图的目测（~100–105 px/6 列） |
| 某些角色是否有 2 个以上必杀技（日文维基称 Ryu 有「波動拳/ファイヤー波動拳」两种） | 未核实。rip 表上 Ryu 只有一组 `Special Move 1`，但特效行里同时有蓝色与紫色火球，**可能**是同一套动画的调色板变体（这是推测） |
| 「二十帧」这个访谈数字对应哪个具体动作 | 未查到（访谈只说「经常是二十帧」，未点名动作） |

## 10. 出处清单

**一手·MAME 源码**（`github.com/mamedev/mame`，master 分支，按本轮拉取的版本）

- `src/mame/capcom/cps2.cpp:8488-8510` — `ROM_START( spf2t )`：主程序 2×0x80000、图形 4×0x100000（+0x800000 填充）、QSound
- `src/mame/capcom/cps2.cpp:12717-12721` — spf2t 系列 `GAME()`（Europe 960529 / USA 960620 / Japan 960531 …）
- `src/mame/capcom/cps2.cpp:1737-1770` — CPS-2 机器配置：68000 @ 16 MHz、`SCREEN` + `set_raw(CPS_PIXEL_CLOCK, …)`、调色板 0xc00 项
- `src/mame/capcom/cps2.cpp:793` / `1280-1281` — 对象（精灵）RAM 两页，各 0x2000 字节
- `src/mame/capcom/cps2.cpp:841-864` — `find_last_sprite`（结束标记）
- `src/mame/capcom/cps2.cpp:865-1000` — `cps2_render_sprites`：4 字/精灵、优先级、code 扩展、翻转、`nx×ny` 块精灵
- `src/mame/capcom/cps1.cpp:3859-3886` — `cps1_layout16x16`（16×16、4 bpp）与 `GFXDECODE_START( gfx_cps1 )`
- `src/mame/capcom/cps1_v.cpp:2607-2640` — 调色板字 = 12 bit RGB + 4 bit 亮度
- `src/mame/capcom/cps1.h:39-47` — `CPS_PIXEL_CLOCK 8 MHz`、`HTOTAL 512`、`VTOTAL 262` → 384×224、59.64 Hz

**一手·官方文件**

- PS1 版官方说明书（Capcom 文本 / Sony 官方 CDN）：<https://secure.cdn.us.playstation.com/manuals/classic/games/super-puzzle-fighter-ii-turbo-manual-en.pdf>
  — `SELECT` 挑衅每回合 1 次；`CAUTION 1–10` / `WARNING 11–30` / `DANGER 31+` counter gem 预警；「破得越多送得越多」；counter gem 按角色预定图案落下

**一手·开发者言说（经英译）**

- 1996 年开发者访谈（太田直仁 / 江口勝博 / 船水紀孝 等），shmuplations 英译：<https://shmuplations.com/superpuzzle/>
  — 「每个角色动作只有几个，但每个动作的动画张数更多」「经常二十帧」「Dhalsim 因为动作画不出来被排除」

**rip 素材（美术本身，非官方文档）**

- The Spriters Resource，Super Puzzle Fighter 2 Turbo / Characters
  - Ryu：<https://www.spriters-resource.com/arcade/superpuzfightiiturb/asset/39027/>（图片直链 `https://www.spriters-resource.com/media/assets/36/39027.png`，1004×1473）
  - Chun-Li：<https://www.spriters-resource.com/arcade/superpuzfightiiturb/asset/92322/>（1256×1710）
  - 站点归类页（22 个资产）：<https://www.spriters-resource.com/arcade/superpuzfightiiturb/>
  - 表上的动作标签与「蓝色剪影垫在正常调色板后面」的说明都是 rip 者写的，不是 Capcom 文案
- StrategyWiki，384×224 实机截图（版式证据）：<https://strategywiki.org/wiki/File:SPF2T_Screen_Setup.png>
  （直链 `https://cdn.wikimg.net/en/strategywiki/images/a/ae/SPF2T_Screen_Setup.png`）；舞台美术 384×96

**二手·仅交叉验证**

- 日文维基「スーパーパズルファイターIIX」：<https://ja.wikipedia.org/wiki/スーパーパズルファイターIIX>
  — 弱攻击与挑衅同动作、30+ counter gem 触发超必杀、Dan 的对手不播受击动作、SHOW TIME 小剧
- Museum of the Game / KLOV 词条：<https://www.arcade-museum.com/Videogame/super-puzzle-fighter-ii-turbo>
  — 「两名 SD 角色在屏幕中央，破宝石时出招，不同宝石触发不同招式」
- System 16 CPS-2 硬件页：<https://www.system16.com/hardware.php?id=795> — 384×224、4096 色、900 个 16×16 精灵、3 层卷轴
- Capcom 官方 CPS-2 宣传册 `SF#04: Super Puzzle Fighter 2X`（12 页，The Arcade Flyer Archive
  <https://flyers.arcade-museum.com/videogames/show/1932>）——我逐页看过，内容是角色周边/贴纸/纸工，
  **不含动作或帧数信息**，只作「官方 SD 人设」的旁证
