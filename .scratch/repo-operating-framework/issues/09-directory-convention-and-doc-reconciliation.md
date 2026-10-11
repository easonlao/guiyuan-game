# 09: 目录约定与文档对账

**What to build:** 东西放哪写清楚；文档里说的和实际做的一致。

**Blocked by:** 04（先有验收命令，才能验证「文档说的门禁真的存在」）

**Status:** ready-for-agent

- [ ] 目录约定写进 `AGENTS.md` 或 `docs/HLD.md`：实验报告、归档、生成物、脚本各归哪
- [ ] `CONTRIBUTING.md` §1 说的「depcruise 拦 core 引入 `cc`/`window`/`document`」与实际能力对齐
- [ ] `docs/HLD.md` §4.2 说的边界与实际规则对齐
- [ ] 消除 `docs/HLD.md` §4.3 与 `docs/MUTATION-TESTING.md` §2.1 关于变异节奏的矛盾

**实现要点：**

- **三处文档都在说谎，逐条修**：
  - `CONTRIBUTING.md` §1 说 depcruise 拦「core 引入 `cc`/`window`/`document`」。**做不到**——`window`/`document` 是全局量不是 import，depcruise 看不见；`cc` 是 npm 包，被 `doNotFollow` 排掉。要么用 lint 规则（如 `no-restricted-globals`）真正执行，要么把话收回。
  - `docs/HLD.md` §4.2 说拦「UI 视图层反向依赖核心逻辑层」。真正的风险是**反方向**（core → minigame），现有规则不拦。
  - `docs/HLD.md` §4.3 说变异「不介入高频的日常开发循环」；`docs/MUTATION-TESTING.md` §2.1 说 `mutation:changed` 在**每个** implement 收尾跑。**直接矛盾。**
- 修矛盾的原则按 `AGENTS.md`：**修矛盾的一方（删除或改指针），不要两边各留一份**。先判断哪一边是当前意图——从 `docs/MUTATION-TESTING.md` 的完整推导看，§2.1 是后来的落地结论，`docs/HLD.md` §4.3 那句是更早的规划口吻。
- `AGENTS.md` §4.1 的「标准化格式化」那句由 03 处理，本票不重复。
- 目录约定不要写成愿望清单。只写**现在成立**的，或者本 spec 的票落地后会成立的。

**验证记录：**（待填）
