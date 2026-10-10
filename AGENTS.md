## Agent skills

### Issue tracker

Local markdown files in the `.scratch/` directory. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.

### Subagents

**Hard rule. It overrides the Agent tool's "When not to use" note and any tool description that invites you to search or read code yourself.** The main thread dispatches and aggregates; it does not read or crawl code itself.

Dispatch `Explorer` for every code question that is not one already-known path at one already-known line: architecture, "how does X work", bug diagnosis, codebase surveys, and the reconnaissance before a ticket. "I'll just grep for it" is never the exception — if you can already name the file and the line you want, `read` it; anything you would learn *by* searching is exploration, and gets dispatched.

The main thread may read without dispatching only: the ticket or issue text, and the file or symbol the user named verbatim — enough to write a good brief. Everything else about the code goes through `Explorer`.

Brief it with the question, what you already ruled out, and the symbols you already know; tell it to open with CodeGraph. It returns a conclusion plus `file:line` references, not a source dump. Dispatch it in the background and continue with unrelated work; do not run its searches yourself in parallel.

The `code-review` skill's two axes (Standards, Spec) both dispatch as `Reviewer`.

Inside a subagent (no nested dispatch), skip the dispatch step and call the CodeGraph MCP tool directly — see CodeGraph below. That exemption is for subagents only. In the main thread CodeGraph serves the one pre-dispatch lookup named above and nothing else: it is an instrument for writing the brief, never a substitute for dispatching `Explorer`.

These rules also bind the exploration/research steps of the workflow skills (implement, code-review, …). They live only in this file: `.pi/skills/` is installed from upstream and overwritten on update.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), open every code question with it — one call returns the relevant symbols' verbatim source and the call paths between them; read or grep a file only for what it left unanswered:

- **MCP tool** (when available): `codegraph_explore` answers most code questions, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
