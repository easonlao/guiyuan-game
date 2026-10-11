# 08: 【破】的边际收益曲线 (Marginal Return of 破)

**What to build:** 【破】在盘面上的边际价值随**使用次数**与**所处阶段**的变化曲线，用来判定它有没有递减收益。

**待验证的假设（目前没有任何证据）：** 一次【破】把对手一侧从虚空打到道损，对手需要两次行动才能回到点亮——即一次行动换对手两次行动，压制是节奏正收益。而封顶只发生在对手全道损时，那时对手已被打残。若假设成立，则「根据盘面在推进与压制之间切换」没有存在空间：一条路线全程不亏，最优解必然是尽量多压制。这正是「把【破】提前到低位态后游戏立刻崩坏」的同一个机制。

**本票只测盘面价值，必须与计分剥离。** 计分的作用由 09 单独测，否则无法归因。

**Blocked by:** 02 指标口径表与陷阱回归测试、07 盘面 fixture 构造器与盘面进度指标

**Status:** resolved

- [x] 边际收益的口径不依赖计分（例如盘面节奏差，或达成五行归元所需行动数之差）。证据：`Metrics.atkTempoGain`；`docs/headless/atk-marginal-return.md`（`60283e5`，并入 `650cb5c`）。
- [x] 测第 1、2、3 次【破】的边际收益。证据：`docs/headless/atk-marginal-return.md`；`tests/core/atk-marginal-return.test.ts`。
- [x] 测【破】在不同阶段（低位态期 / 中盘 / 残局）的边际收益。证据：`docs/headless/atk-marginal-return.md`。
- [x] 给出收益随次数与阶段的变化曲线，明确回答是否递减。证据：`docs/headless/atk-marginal-return.md`（逐侧阶跃函数，非平滑递减）。
- [x] 若递减，指出拐点；若不递减，指出封顶条件。证据：`docs/headless/atk-marginal-return.md`（加持软拐点；全道损硬封顶）。
- [x] 与「把【破】提前到低位态导致崩坏」的机制对照，判断本曲线能否解释它。证据：`docs/headless/atk-marginal-return.md` §5（盘面是必要前置，计分是充分放大器）。
