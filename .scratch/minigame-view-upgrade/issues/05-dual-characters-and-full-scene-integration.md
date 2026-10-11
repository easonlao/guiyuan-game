# 05: 双方对战角色卡与完整对局主场景串联 (Dual Characters & Full Game Scene Integration)

**Type:** task

**What to build:** 实现 `CharacterView`（展示玩家与天道化身、行动指示器、表情反馈与计分播报），并由 `GameScene` 控制器将五行阵盘、动作按钮、天干飞行动效与双方角色交互完整串联为自闭环对局，废除旧版命令式代码，完成 Vite 打包与真机验证。

**Blocked by:** 04: 轻量缓动引擎与天干降临/流星飞行动效 (Tween Engine & Rune Flight Animation)

**Status:** ready-for-agent

- [ ] `CharacterView` 呈现双方角色头像框架、当前行动回合标识、连动回合标记与比分展示。
- [ ] `GameScene` 总协调器完成完整对战生命周期循环：抽天干 -> 符文降临 -> 玩家操作/AI 决策 -> 飞行动画 -> 棋盘变更 -> 连动/终局判定。
- [ ] 彻底清理或废止旧版硬算代码，确保表现层完全迁移至场景树体系。
- [ ] 编写端到端场景集成测试，验证对局从第 1 回合平滑推进至终局结算。
- [ ] 执行 `npm run build:minigame` 成功生成单文件 `minigame/game.js`，无报错无类型警告。
