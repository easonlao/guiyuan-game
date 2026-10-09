## Agent skills

### Issue tracker

Local markdown files in the `.scratch/` directory. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.

### Subagents

Research and exploration run in a background subagent, which reaches the code through the CodeGraph MCP tool (`codegraph_explore`). Implementing a ticket explores the relevant code the same way before changing it. A read the main thread can finish in one step — one known file, one CodeGraph call — stays inline.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), open every code question with it — one call returns the relevant symbols' verbatim source and the call paths between them; read or grep a file only for what it left unanswered:

- **MCP tool** (when available): `codegraph_explore` answers most code questions, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
