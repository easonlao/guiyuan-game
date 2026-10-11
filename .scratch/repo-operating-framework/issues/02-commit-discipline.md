# 02: 提交纪律

**Type:** task

**What to build:** 提交信息里不再混进 `Co-Authored-By` 一类的 trailer；新克隆自动装上这道门禁，不靠人记得。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 有一道提交信息门禁，拦 `Co-Authored-By` trailer。证据：`.githooks/commit-msg`（可执行）。
- [x] 默认行为是**剥离并警告后放行**；有环境变量可切成**判红中止**（两种模式都要能验）。证据：`COMMIT_MSG_MODE` 默认 `strip`、取 `fail` 判红；四种组合见验证记录。
- [x] 新克隆装得上：装依赖时自动装，另有一条显式命令兜底。证据：`prepare` = `git config core.hooksPath .githooks`（`npm install` 实测生效）；`npm run setup:hooks` 为显式命令。
- [x] 试提交一条带 trailer 的信息 → 被处理，且处理结果打印出来可见。证据：真实 `git commit` 退出 0，stderr 打印「提交信息含…」「已剥离…」与剥离后全文，落库信息只剩标题。
- [x] 试提交一条不带 trailer 的信息 → 原样通过，不被改动。证据：钩子对干净信息退出 0，文件逐字节不变。

**实现要点：**

- 污染是历史性的，不是进行中的：`git log --grep='Co-Authored'` = 70 条 / 全部 245 条，最新一条 2026-02-06，HEAD 是 2026-10-11。所以这道门禁是**防复发**，不是救火。
- 为什么值得做：本仓库的主要提交者是 agent，而 trailer 正是 agent 手写的典型产物。
- 钩子只管 trailer。标题风格（Conventional Commits，见 `CONTRIBUTING.md` §3）不在这道钩子里顺手加规则——一道钩子一个职责，否则说不清它到底管什么。
- 绕过方式（`--no-verify`）不要写进文档的显眼位置。
- **历史改写不在本票范围内**（`git filter-repo` 是破坏性操作，见 spec 的 Out of Scope）。

## Answer

实现：`.githooks/commit-msg`（`COMMIT_MSG_MODE` 默认 `strip`）；`package.json` 加 `setup:hooks`（显式）与 `prepare`（装依赖时自动）；规则与安装写在 `CONTRIBUTING.md` §3，`AGENTS.md` 只留指针。

各种输入 × 模式（直接跑钩子，输入为临时文件）：

| 输入 | 模式 | 退出 | 结果 |
|---|---|---|---|
| `Co-Authored-By:` | strip（默认） | 0 | 剥离该行与尾部空行，改写结果打到 stderr |
| `CO-AUTHORED-BY:`（全大写） | strip | 0 | 同上（`git interpret-trailers` 也认全大写） |
| `Co-Authored-By :`（冒号前空格） | strip | 0 | 同上（git 也把这种写法归一成 trailer） |
| 缩进的 `  Co-Authored-By:` | strip | 0 | 原样通过（git 不把缩进行当 trailer，不会产生 contributor） |
| 带 trailer | fail | 1 | 中止，文件原样不动 |
| 无 trailer | strip / fail | 0 | 原样通过 |
| 只有 trailer 一行 | strip | 1 | 剥离后为空，明确中止 |
| 带 trailer | `COMMIT_MSG_MODE=FAIL`（拼错） | 1 | 判红，不静默降级为 strip |
| 无 trailer | `COMMIT_MSG_MODE=FAIL` | 0 | 原样通过（模式与无 trailer 的消息无关） |

端到端（真实 `git commit --allow-empty`，跑完即 `git reset --soft HEAD~1` 撤掉）：

- 带 trailer、默认模式 → 退出 0；`git log -1 --format=%B` 只剩 `chore: hook selftest`。
- 同一命令加 `COMMIT_MSG_MODE=fail` → 退出 1，HEAD 未变。

安装：

- `npm run setup:hooks` → `git config core.hooksPath` = `.githooks`。
- 清空 `core.hooksPath` 后 `npm install` → `prepare` 自动把它设回 `.githooks`，`package-lock.json` 未被改动。
- 干净克隆端到端（`git clone` 到 /tmp）：克隆后 `core.hooksPath` 为空 → `npm install` 后变 `.githooks`；在克隆里提交带 trailer 的信息被剥离、`COMMIT_MSG_MODE=fail` 判红退出 1。

**复核后补充（code-review 两轴，固定点 `0952603`）：**

- **大小写漏判（真缺陷）**：原模式 `^[Cc]o-[Aa]uthored-[Bb]y…` 只覆盖 8 种组合，而 `git interpret-trailers` 认 `CO-AUTHORED-BY:`——**git 认、门禁不认**。改成 `grep -qiE` + `awk` 比对小写化后的行，模式只写一遍给两者共用。
- **模式拼错会静默降级**：原实现把任何非 `fail` 值当成 `strip`。改成 `case` 分支，未知取值判红。
- **剥离后为空**：只有 trailer 一行的消息，剥离后为空——原来会靠 git 报「empty commit message」，现在钩子自己明确中止。
- **注释里的快照数字**：钩子头注原抄了票面的提交总数与日期，会漂移；改成指向 02 号票。
- **`AGENTS.md` 复述规则**：改为纯指针，规则正文只在 `CONTRIBUTING.md` §3（与验证记录原先写的「只留指针」对齐）。
- **`package.json` 重复命令**：`prepare` 改为调 `npm run --silent setup:hooks || true`，命令只有一处。
- **未修、记录在案**：`.pi/skills/setup-pre-commit/SKILL.md` 让人把 `prepare` 设成 `husky`，照做会覆盖这条自动安装路径；`.pi/skills/` 更新时会被覆盖，所以不在本票修。
