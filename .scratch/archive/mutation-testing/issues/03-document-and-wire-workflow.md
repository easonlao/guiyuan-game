# 03: 把落地方式写成文档并接进工作流

**What to build:** 一份 `docs/MUTATION-TESTING.md` 说清"怎么做、什么时候做、门禁是什么、等价突变体怎么办、为什么不设全局阈值（附来源）"；`AGENTS.md` 加一行指针；`TEST_PLAN.md` 的突变测试一节从"必须 >= 80%"改写为与实现一致的描述。

**Blocked by:** 01、02

**Status:** resolved

- [x] 新 agent 只读这份文档就能跑对命令，并说清门禁是什么
- [x] 写明两条路径：改动处跑（`implement` 收尾）、里程碑全量（每个 spec 收尾 + 发版/提审前）
- [x] 写明等价突变体策略：确认等价的就地 disable 并写理由，不做全局排除
- [x] 写明为何不设全局固定阈值，并给出来源（Google 两篇论文 + 基线棘轮的实践依据）
- [x] `TEST_PLAN.md` 里不再有"Mutation Score 必须 >= 80%"这条未接线的硬红线
- [x] `AGENTS.md` 有一行指向该文档（`AGENTS.md` 只放导航指针，不塞完整做法）
- [x] 明确写出规则**不**放在 `.pi/skills/` 及其原因

**备注：** 决定 7 选择了不立 ADR；若动工时认为该决定值得一条正式记录（仓库有 ADR 0010 记录"否决方案"的先例），可另开一票，不要塞进本票。

**交付提交：** `5327235`。

**交付内容：** `docs/MUTATION-TESTING.md`（新建）、`AGENTS.md`（一行指针）、`docs/TEST_PLAN.md` §3（改写）、`stryker.config.json`（`_comment` 订正）。
