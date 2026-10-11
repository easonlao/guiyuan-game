# 01: 唯一合法动作全场景自动流转与交互表现 (Single-Candidate Auto-Execution Pipeline)

**What to build:** 当系统计算出的当前合法动作候选列表严格只有 1 项（`getAvailableActions().length === 1`）时，无论动作类型为低位吸纳 (AUTO)、极位散气 (DISSIPATE)、消散过牌 (PASS)，还是由于连动限制或生克极值封死导致的常规动作（破 ATK、化 TRANS、调息 CONVERT、强化 BURST、强破 BURST_ATK），表现层统一判定为无实质分叉决策的确定性流转。系统自动启动约 0.75 秒缓冲倒计时并播放匹配的播报文案与动态按钮标签，倒计时结束后自动执行该动作；倒计时期间玩家轻触屏幕任意区域或按钮可立即加速跳过倒计时直接结算。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 升级 `GameManager` 中的单动作判定：将原先限定于 AUTO/DISSIPATE/PASS 的 `isSingleAuto` 泛化为当 `actions.length === 1` 时全局激活倒计时调度。
- [x] 升级 `formatActionButton` 与 Banner 播报：针对常规动作（ATK/TRANS/CONVERT/BURST/BURST_ATK）在自动流转期间展示匹配的倒计时按钮文案（如【自动击破】、【自动化气】、【自动调息】）与战报 SubText（如“唯一机缘·破”、“势在必行”）。
- [x] 支持触控随时加速：在单动作倒计时缓冲期内，玩家点击屏幕任意区域或点击唯一按钮时，立即终止倒计时并即时执行该动作。
- [x] 保持多动作决策权：当 `actions.length >= 2` 时，不触发任何自动倒计时，严格等待玩家手动点击决策。
- [x] 扩充 `tests/core/minigame-auto-absorption.test.ts` 或相关单元测试，覆盖常规动作在单候选时的倒计时激活、文案格式化及自动执行。
