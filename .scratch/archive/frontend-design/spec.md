# 归元弈界面表现重构

> **归档说明（本轮任务整理）**：本 feature 的历史阶段结束，八票的实现物均已交付；本包**不声称全部验收完成**——角色图集「缓存优先最终版」在微信端的加载确认仍待用户重新编译目验（本目录原票 07-wechat-cache-first.md），该未验收项与同根因事项已收敛为活动路线里的[票 07](../../frontend-art-direction/issues/07-wechat-atlas-and-layout-acceptance.md)。小屏布局项的微信确认已由用户在后续验收中覆盖（证据见 `.scratch/archive/board-channel-and-marks/issues/05-opponent-scale-and-layout.md` 与[其 spec 的验收节](../board-channel-and-marks/spec.md)；证据不是定义）。本目录只作证据与导航，不定义规则；各票状态保留原文，未伪造 resolved。

## 目标

在现有微信 Canvas 2D 表现层中建立统一的修仙道场视觉，让玩家能辨认盘面归属、阴阳状态、当前天干与下一步操作。此任务文件记录实施范围与研究依据，玩法规则仍以 `docs/GDD.md` 为准，盘面契约仍以 `docs/LLD.md` §4 和 ADR 0015 为准。

## GitHub 研究依据

- [OpenAI game-ui-frontend](https://github.com/openai/plugins/blob/main/plugins/game-studio/skills/game-ui-frontend/SKILL.md)：先确立游戏世界、材质、字体与动效方向；棋盘优先；强调重要状态变化；避免通用后台式界面。这里采用 Canvas 主题常量，适配微信宿主，无需引入 DOM。
- [AgentSkills game-ui-design](https://github.com/jeremylongworth-source/AgentSkills/blob/main/skills/game-ui-design/SKILL.md) 与其 [检查表](https://github.com/jeremylongworth-source/AgentSkills/blob/main/skills/game-ui-design/references/game-ui-checklist.md)：操作信息按玩家决策组织，补齐状态表达，检验小屏文字与点击区域，颜色之外也用文字及形状传达状态。
- [Chessground](https://github.com/lichess-org/chessground)：参考棋盘主导、路径/落点提示、移动反馈、触屏适配的设计思想。只借鉴交互概念，不引入其代码或依赖。
- [PlayableIntelligence design-game](https://github.com/PlayableIntelligence/game-creator/blob/main/skills/design-game/SKILL.md)：对背景、色彩、文字、过渡和游戏反馈整体审视。其专用项目结构不适用于本仓库，仅作为研究资料。
- [wuxing-game](https://github.com/fanyuyu1997-art/wuxing-game)：检索到的五行题材探索推理网页游戏；玩法与宿主不同，不作为架构或规则重构依据。

## 实施边界

- 统一墨青底、玉色、暖金、米白文字的主题；用程序绘图增强道场环境与阵盘材质。
- 保持卡通修仙人物与既有表情反馈，增强人物卡、回合播报、天干核心、操作按钮及终局视觉。
- 内环固定 P1、外环固定 P2、外环偏移及真实生克路径保持既有契约。
- 新增开发用浏览器预览，复用真实 `GameScene` 和 `InputManager`，不进入微信交付产物。
- 保持核心规则、AI、确定性随机源及回合生命周期。

## 验收

- 在 320×568、390×844、460×900 等尺寸检查可读性、遮挡与输入坐标；浏览器预览运行真实对局，无运行时错误。
- 多选操作、唯一动作自动结算、飞行、天道回合、终局与重开均可完成。
- 运行 `check:quick`、重建 `minigame/game.js` 并通过 `verify`。

## 验收证据

- `verify` 通过：46 个测试文件、834 项测试全部通过，类型、格式、lint、依赖边界与微信产物逐字节对账通过。
- 浏览器检查 320×568、390×844、460×900 的真实 Canvas 场景；从 390 缩到 320 后，操作栏仍可点击右列按钮。
- 以真实 Pointer Events 完成 30 大回合，覆盖抉择、飞行、降临、天道推演、自动流转和终局；点击终局后成功重开，无浏览器运行时错误。
- 代码复核未发现需要修正的问题。截图保存在不入库的 `artifacts/ui-design/`；编写本段时微信模拟器和真机尚未按 `docs/HLD.md` §4.6 验收。（现状见顶部归档说明：微信开发者工具的后续验收覆盖了布局与盘面可读性；图集加载的最终确认在活动票 07；真机未涉及。）
