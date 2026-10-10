## Agent skills

### Issue tracker

Local markdown files in the `.scratch/` directory. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.

### Subagents

The main thread dispatches and aggregates; code questions go to `Explore`.

Dispatch `Explore` for a code question that is not one already-known path at one already-known line: architecture, "how does X work", bug diagnosis, or the reconnaissance before a ticket. The main thread reads only the ticket or issue text, and the file or symbol the user named verbatim — CodeGraph is there to write the brief, not to replace the dispatch.

Open the brief with: **"Start with `codegraph_explore`; use `read`/`grep` only for what it leaves unanswered."** Then give it the question, what you already ruled out, and the symbols you already know. It returns a conclusion plus `file:line` references, not a source dump. Dispatch it in the background.

| Subagent | Use for | Skills |
|---|---|---|
| `Explore` | code questions, recon | `research`, `diagnosing-bugs`, `codebase-design` |
| `Reviewer` | the two `code-review` axes, verification of landed work | `code-review` |
| `Executor` | implementing one ticket | `implement`, `implement-spec`, `tdd` |
| `ExpertAdvisor` | design and modeling decisions | — (`skills: false`) |

Inside a subagent there is no nested dispatch, so it calls `codegraph_explore` directly.

These rules also bind the exploration steps of the workflow skills (implement, code-review, …), and live only in this file: `.pi/skills/` is overwritten on update.

<!-- CODEGRAPH_START -->
## CodeGraph

This codebase is indexed (`.codegraph/` at the repo root). `codegraph_explore` is the fastest way in: one call returns the relevant symbols' verbatim line-numbered source, the call path between them (dynamic-dispatch hops grep cannot follow included), and a blast-radius summary. Treat the result as already read, and name a symbol or file to read its current source.

Without a `.codegraph/` directory there is nothing to query — indexing is the user's decision.
<!-- CODEGRAPH_END -->
