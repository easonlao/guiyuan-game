## Agent skills

### Issue tracker

Local markdown files in the `.scratch/` directory. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.

### Subagents

The main thread dispatches and aggregates; it does not read or crawl code itself. Dispatch the `Explorer` subagent for anything spanning more than one file or one lookup — architecture, "how does X work", bug diagnosis, and the reconnaissance before a ticket. Brief it to open with CodeGraph, and with the question and the symbols you already know; it runs in the background and returns a conclusion plus `file:line` references, not a source dump.

The `code-review` skill's two axes (Standards, Spec) both dispatch as `Reviewer`.

Inside a subagent (no nested dispatch), skip the dispatch step and call the CodeGraph MCP tool directly — see CodeGraph below.

These rules also bind the exploration/research steps of the workflow skills (implement, code-review, …). They live only in this file: `.pi/skills/` is installed from upstream and overwritten on update.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), open every code question with it — one call returns the relevant symbols' verbatim source and the call paths between them; read or grep a file only for what it left unanswered:

- **MCP tool** (when available): `codegraph_explore` answers most code questions, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
