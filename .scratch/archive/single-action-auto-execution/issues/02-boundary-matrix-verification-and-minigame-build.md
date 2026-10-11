# 02: 边界矩阵全场景回归测试与小游戏构建打包 (Boundary Matrix Verification & Minigame Build)

**What to build:** 针对 ADR-0008 与 GDD 2.4 中梳理的 5 种典型单动作边界场景构建全量端到端测试矩阵，验证在连动禁二次爆发、生目标全满、克目标全损、极端单向锁调息等边界盘面下，自动流转生命周期与状态推进 100% 正常；同时执行 `npm run build:minigame` 构建流水线，将产物输出至 `minigame/game.js`，确保在脱机环境与真机包体体积预算（<4MB）内正常运行。

**Blocked by:** 01: 唯一合法动作全场景自动流转与交互表现 (Single-Candidate Auto-Execution Pipeline)

**Status:** closed

- [x] 编写专门的边界矩阵回归测试，覆盖 ADR-0008 明确定义的单动作场景：
  - 连动额外回合中抽到已归一节点：验证仅生成单个 ATK（阳干）或 TRANS（阴干），且自动激活流转倒计时。
  - 克制目标 (-1, -1) 极端封死：验证阳干无法普通破与强破，抽中归一节点时仅生成单个 BURST 并自动流转。
  - 相生目标 (2, 2) 极端封死：验证阴干无法普通化与强化，抽中归一节点时仅生成单个 BURST_ATK 并自动流转。
  - 极端生克受阻：验证未归一节点在破/化受阻时仅生成单个 CONVERT 并自动流转。
  - 全极值锁死：验证生成单个 PASS 并自动流转过牌。
- [x] 验证执行 `npm run build:minigame` 编译无报错，`minigame/game.js` 包含最新逻辑且代码结构完整。
- [x] 运行全套测试套件 `npm test`，确保全部测试用例 100% 通过且无回归缺陷。
