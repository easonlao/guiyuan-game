# Standards review — `burst-plus-two` since `1b58360`

Axis: Standards only (repo-documented standards + Fowler ch.3 smell baseline). Spec axis is a separate report.
Diff: `git diff 1b58360...HEAD` (31 files, +1672/−424). Commits: 089efef, fe96381, 1a3d0bf, aad41f4, 66a22be, 1d6aeee, 00e38fd + 4 merges.

## Hard violations (documented standards)

### H1. Mutation baseline not re-pinned; `mutation:check` will report 16 false-new survivors

- `mutation-baseline.jsonl` is untouched in this range (`git log 1b58360..HEAD -- mutation-baseline.jsonl` → empty), but the diff inserts 4 lines before `src/core/logic/ActionResolver.ts:29` (the `getPlusTargetPolarity` import and `BURST_PASSES` at `:30-32`), shifting every later line by +4.
- All **16** baseline entries for `ActionResolver.ts` have `line > 28` and are therefore stale. Example: baseline `{"file":"src/core/logic/ActionResolver.ts","line":120,...,"replacement":"false"}` was the AUTO guard `if (!element || !polarity)`; that guard is now at `ActionResolver.ts:124`.
- `docs/MUTATION-TESTING.md` §3.1: "任何改变 `src/core/logic/**` 行号的改动（含 `npm run fmt`）都会让基线条目的 `line`/`column` 失效，下一次 `mutation:check` 把它们报成「疑似只是移位」的新增。改完按 §3.2 重跑全量并刷基线". §2.2 + root `AGENTS.md` ("全量变异 + 棘轮对比…实际触发者只能是 agent"): the full run is a **spec close-out** obligation; this branch is that close-out.
- Nothing catches it: `package.json` `verify` = `check:quick && typecheck && test && check:artifact` — no `mutation:check`. The scratch spec/issues never mention mutation.

### H2. Ticket `Status:` lines left stale after the work landed

- `.scratch/burst-plus-two/issues/02-strong-break-double-level-and-floor.md:11` and `04-docs-adr-gdd-lld-alignment.md:13` are still `Status: ready-for-agent` with every acceptance box unchecked, although 1a3d0bf and 00e38fd implemented them.
- `03-evaluator-reconciliation-and-balance-guardrails.md:11` is also still `ready-for-agent`, while this diff checked all of its boxes and appended `## Comments`.
- `docs/agents/issue-tracker.md`: "Triage state is recorded as a `Status:` line near the top of each issue file". Ticket 01 on the same branch did flip to `ready-for-human` — the branch is internally inconsistent.

## Judgement calls (smell baseline; no documented standard breached)

1. **Duplicated Code — the two burst loops** (`ActionResolver.ts:270-288` vs `:314-333`): near-identical shape, but 4 of ~7 steps differ (selection helper, null semantics, scoring function, target board). The shared invariant ("two independent passes") is already extracted into `BURST_PASSES`. Extracting further needs a policy callback and would blur the deliberate asymmetry (overflow → −1 on YIN vs floor → `break`). **Acceptable.** One readability nit: `boostPolarity ?? Polarity.YIN` + `levelStep` (`:274-275`) only makes sense because the helper returns null exactly at (2,2); a named helper would carry the intent.
2. **Duplicated Code — ActionCandidates comments** (`ActionCandidates.ts:161-183`): the two 3-line comment blocks and push shapes are near-identical. Minor.
3. **Duplicated Code — truth-table test scaffolding**: `burst-strengthen-truth-table.test.ts` / `burst-attack-truth-table.test.ts` repeat `Side`, `buildState`, loop and label. One parameterised file would share it; table-per-action matches existing repo style. Minor.
4. **Tests assert observable behaviour, not internals.** Both truth tables drive `ActionResolver.resolve` and assert board / `scoreDelta` / `extraTurn` / reference equality of untouched nodes (immutability, CONTRIBUTING §4.2). `burst-evaluator-reconciliation.test.ts` drives the public `ActionEvaluator.evaluate` with weights zeroed and asserts the returned `breakdown` — behavioural. The "记录，不修" section `toEqual`s whole breakdown objects, i.e. a characterisation pin, but it is labelled as such in-file.
5. **Baseline re-pin of `experiment-runner.test.ts`** (66a22be): the self-distortion alarm is re-recorded in the same branch that moves its numbers. Reason and deltas are in the case comment and handed to ticket 05; acceptable, but the alarm is now blind to this shift class.
6. **Red `verify` on the integration branch** (7 balance tripwires) is explicitly spec-scoped and handed to ticket 05. Accepted by the spec, noted here as a merge-readiness risk.
7. **Docs:** ADR 0008 appends an erratum (`0008-single-candidate-auto-execution.md:41`) instead of rewriting history — correct per root `AGENTS.md`; GDD §2.3/§2.4 and LLD §3.1 edits are rule-body rewrites in their rightful homes, not history rewrites. Two nits: (a) `docs/headless/burst-plus-two-balance.md:3` names `.scratch/burst-plus-two/spec.md` as a co-home of rule text — `AGENTS.md` gives rule text to GDD alone; (b) GDD §2.4 item 3 (untouched) still claims extra-turn candidates are "仅剩单一 `ATK` 或 `TRANS`", false when both targets are extreme (PASS is the only candidate) — pre-existing, but item 4's revision could have closed it.

## Evidence run

`npx vitest run` on the three burst test files: 54 passed. Baseline staleness computed from `mutation-baseline.jsonl` (34 entries total).
