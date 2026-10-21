# Agent 工具配置地图

本仓库的 agent 工具配置散在几个路径，因为**每个工具各读各的**，没有共用的位置。这份文档是地图。配置文件的正文在各文件里，本表不复述，只写「谁读哪个」和「怎么验出来的」。

三份 MCP 配置都写 `"command": "codegraph"`，跑 PATH 上那份，**不经 npx**。所以版本号不在本仓库里：每台机器自己装一份（`npm run bootstrap` 找不到会直接报错并打出安装命令）。

## 技能

一份技能装在 `.agents/skills/`。来源与 hash 见根目录 `skills-lock.json`；哪个进库、哪个不进库见 `.gitignore`。

| 工具 | 它读的技能目录 | 证据 |
|---|---|---|
| pi | 从起始目录向上走到 git 根，每层都推入 `<dir>/.agents/skills` | `dist/bundle/chunks/chunk-66G7ITPS.js:495` |
| agy（Antigravity） | `.agents/skills/` | `agy` 二进制字面量（`.agents/skills` 8 处），并写明工作区根可用 `.agents/`、`.agent/`、`_agents/`、`_agent/` |
| ZCode | `<工作区>/.agents/skills` 与 `~/.agents/skills` | `resources/app.asar` 中 `getWorkspaceAgentsSkillRoot` / `getUserAgentsSkillRoot` |

ZCode 还认自己的 `<工作区>/.zcode/skills` 与 `~/.zcode/skills`（`getWorkspaceZcodeSkillRoot` / `getUserZcodeSkillRoot`），本仓库不用。它找技能同样**向上走到 git 根**（`resolveAncestorWorkspaceRoots`）。

pi 另外也认 `.pi/skills/`，本仓库不用，`.gitignore` 保留规则以防工具写入。

pi 还读用户级 `~/.pi/agent/skills/`，一份技能对所有仓库生效。只给 pi 用的技能（`grill-me`、`grilling`、`research`、`wait-what`）放在那里：不在本仓库，也不在 `skills-lock.json` 里。

## codegraph MCP

| 工具 | 项目级文件 | 备注 |
|---|---|---|
| pi | `.pi/mcp.json` | 多一个 pi 专属键 `exposure: "direct"` |
| agy（Antigravity） | `.agents/plugins/codegraph/mcp_config.json` | 需同级的 `plugin.json`（工作区插件） |
| ZCode | `.agents/mcp.json` | 键名 `mcpServers` |

验证：

- **pi** 只找两处 MCP 配置——`~/.pi/agent/mcp.json`（全局）与 `<cwd>/.pi/mcp.json`（项目）。提示语原文是 `Add them to ~/.pi/agent/mcp.json or .pi/mcp.json.`。它的 `.agents` 引用全部是技能与主题，没有一处跟 MCP 有关。
- **agy** 读工作区插件的 `plugins/<name>/mcp_config.json`（二进制字面量），用户级则是 `~/.gemini/config/mcp_config.json`。二进制里 `.agents/mcp.json` 出现 **0 次**。
- **ZCode** 的原生源是 `~/.zcode/cli/config.json` 与 `<工作区>/.zcode/config.json`（键名 `mcp.servers`），agents 兼容源是 `~/.agents/mcp.json` 与 `<工作区>/.agents/mcp.json`（键名 `mcpServers`）。根目录 `.mcp.json` **不是**它的源；它也不读 `.agents/plugins/`（`app.asar` 里 `mcp_config.json` 出现 **0 次**）。

### codegraph 自己的安装器为什么不用

`codegraph install` 支持的目标是 Claude Code、Cursor、Codex CLI、opencode、Hermes、Gemini CLI、Antigravity IDE、Kiro、GitHub Copilot。**pi 与 ZCode 不在其中**，而 Antigravity 的适配器 `supportsLocation('local')` 返回 `false`（源码注释：Antigravity has no project-local config），只会写用户级。所以 `--target=auto` 对本仓库的三个工具一个都配不上。

## codegraph 索引

`.codegraph/` 记本机绝对路径，不入库。MCP server **不会**自动建索引：没有它就抛 `NotIndexedError`，提示 `Indexing is the user's decision — they can run 'codegraph init'`（`mcp/tools.js:1908-1926`）。

## 重建

```
npm run bootstrap
```

它跑两件事，各自已存在就跳过：从 `skills-lock.json` 装技能、建 codegraph 索引。两者都不随 clone 完整地来。

## 遇到没见过的工具

不要猜路径。按顺序查，查到后**更新本文档**并把配置文件补到对应路径：

1. 工具自己的 `--help` 或官方文档，搜 `mcp`、`skills`。
2. 二进制里的字面量：`strings <bin> | grep -iE 'mcp.*\.json|skills'`。
3. Electron 应用：grep `resources/app.asar` 里的路径构造函数（`getWorkspace*Root`、`resolve*Path` 这类命名很好找）。
4. 工具自己的数据目录里的历史记录——它记过自己读过的绝对路径。例如 ZCode 的 `.zcode/cli/artifacts/` 里有 `C:\Users\eason\.agents\skills\team-mode\SKILL.md` 这类字符串。

第 4 条往往最快，但只是线索：它证明工具**读过**某个路径，不证明那是唯一的路径。
