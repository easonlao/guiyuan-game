## Agent skills

### Issue tracker

Local markdown files in the `.scratch/` directory. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.

### Subagents

Role-based delegation across the `/ask-matt` lifecycle (Explore → Execute → Review):

- **`explorer`** (Discovery, research & bug diagnosis):
  - Dispatches: `research`, `diagnosing-bugs`, CodeGraph MCP (`codegraph_explore`).
  - Focus: Investigates architecture and primary sources, navigates symbols/call trees, and reproduces tricky defects into a tight, deterministic failing test loop before fixing.
- **`executor`** (Prototyping & test-driven delivery):
  - Dispatches: `prototype`, `implement` / `implement-spec`, `tdd`.
  - Focus: Spikes throwaway prototypes for uncertain UI/state questions, drives implementation through strict red-green-refactor cycles (`tdd`), and delivers scoped ticket changes.
- **`reviewer`** (Two-axis review & boundary impact analysis):
  - Dispatches: `code-review`, CodeGraph MCP (`codegraph_explore`).
  - Focus: Performs two-axis diff reviews (Spec compliance + Coding standards), and audits affected callers and architectural seams via CodeGraph before changes land.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
