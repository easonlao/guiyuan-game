# 02: 提交纪律

**What to build:** 提交信息里不再混进 `Co-Authored-By` 一类的 trailer；新克隆自动装上这道门禁，不靠人记得。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 有一道提交信息门禁，拦 `Co-Authored-By` trailer
- [ ] 默认行为是**剥离并警告后放行**；有环境变量可切成**判红中止**（两种模式都要能验）
- [ ] 新克隆装得上：装依赖时自动装，另有一条显式命令兜底
- [ ] 试提交一条带 trailer 的信息 → 被处理，且处理结果打印出来可见
- [ ] 试提交一条不带 trailer 的信息 → 原样通过，不被改动

**实现要点：**

- 污染是历史性的，不是进行中的：`git log --grep='Co-Authored'` = 70 条 / 全部 245 条，最新一条 2026-02-06，HEAD 是 2026-10-11。所以这道门禁是**防复发**，不是救火。
- 为什么值得做：本仓库的主要提交者是 agent，而 trailer 正是 agent 手写的典型产物。
- 钩子只管 trailer。标题风格（Conventional Commits，见 `CONTRIBUTING.md` §3）不在这道钩子里顺手加规则——一道钩子一个职责，否则说不清它到底管什么。
- 绕过方式（`--no-verify`）不要写进文档的显眼位置。
- **历史改写不在本票范围内**（`git filter-repo` 是破坏性操作，见 spec 的 Out of Scope）。

**验证记录：**（待填）
