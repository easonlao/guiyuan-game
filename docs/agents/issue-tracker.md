# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

## 为什么 `.scratch/` 入库而 `.pi/skills/` 不入库

两者都在仓库根目录下、都由工具写入，但持久性相反：

- **`.scratch/` 入库**：它是任务层的真源。`Resolve` 一步把决定追加进 `map.md`，这些文件必须跨 clone、跨机器可见，否则整个任务层协议就是空转——写进去的答案下一个 clone 看不到。内容全是 `.md`，体积小，不含密钥。
- **`.pi/skills/` 不入库**：`AGENTS.md` 明写它「会被更新覆盖」；来源与 hash 由根目录 `skills-lock.json` 记录，可据此重建。入库只会制造覆盖冲突。

`.gitignore` 只排除 `.pi/skills/` 而不是整个 `.pi/`。git 的规则是「父目录被排除时其内文件无法再被包含」，排除 `.pi/` 会让 `!.pi/subagents.json` 这类反选被静默忽略——不报错，只是不生效。所以 `.pi/subagents.json`（子代理行为配置：并发、深度、工作树隔离等）与 `.pi/mcp.json`（codegraph MCP 配置唯一入库的家；`.agents/` 下那份是工具自动注册的副本，随整目录排除）直接入库，不需要任何反选。
