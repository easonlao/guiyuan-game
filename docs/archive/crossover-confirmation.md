# Crossover detection and confirmation

`src/js/logic/headless/CrossoverConfirmation.js` exposes three public seams:

- `classifyPayoffCrossover({ criteria, opponents })` classifies paired terminal-value differences for two actions against exactly two opponents.
- `evaluateCrossoverConfirmation({ positions, focalStrategy, opponents, discoverySeeds, confirmationSeeds, scoringConfig, criteria, maxRuns? })` evaluates all action pairs at fixed positions and rechecks discovery-qualified positions on independent seed labels.
- `formatCrossoverConfirmation(report)` formats the machine report without changing its records.

## Classifier contract

`criteria` is explicit and recorded: `{ minimumEffect, minimumPairs, uncertaintyMethod: 'paired-normal-95', evidenceRule: 'interval-excludes-zero' }`. `minimumEffect` is a difference on the `win=1`, `draw=0.5`, `loss=0` scale; `minimumPairs` is a positive safe integer. Each opponent is `{ id, samples }`, where every sample is `{ seed, actionAValue, actionBValue }` and values are `0`, `0.5`, `1`, or `null`. Seed labels and opponent IDs must be unique. A sample is paired only when both values are non-null. Missing seed entries are also reported against the union of supplied seed labels.

Differences are `actionAValue - actionBValue`. The result is `{ classification, orientation, criteria, opponents }`. `orientation` preserves the supplied opponent order as `[{ opponentId, sign }]`, where `sign` is `1`, `-1`, or `0` for a zero/undefined mean. Each opponent summary includes requested/provided/paired counts, missing seeds, mean difference, sample standard deviation, standard error, and a nominal normal-approximation 95% interval (`null` with fewer than two pairs).

A result is `uncertainty-insufficient` unless both opponents meet `minimumPairs` and both intervals exclude zero. With adequate evidence, matching signs are `no-reversal`; opposite signs below `minimumEffect` are `effect-insufficient`; otherwise the result is `crossover`. The criteria do not imply a game-wide balance threshold.

## Fixed-position evaluation

The evaluator infers the focal player from `position.currentPlayer`; the other player uses each opponent strategy. It delegates candidate enumeration, forced first actions, continuation matches, and replay records to `compareFixedPositionContinuations`. Every unordered action pair is classified from the two branches' values matched by seed for each opponent. Discovery and confirmation seed labels must be unique within phase and disjoint across phases. Criteria, positions, strategies, seed lists, scoring configuration, and budget are validated before seeded continuations run; pass `scoringConfig: {}` to explicitly request formal baseline scoring.

Only pairs classified as `crossover` in discovery are eligible for a confirmation status. Because the public runner compares every action in a position, a position with at least one qualified pair runs all its candidate actions against both confirmation opponents. Non-qualified pairs at that selected position remain `not-run` with null `comparisonIndexes`, even though the shared raw confirmation comparisons contain their action samples. `summary.confirmation.plannedOverheadMatchCount` and completed/failed/budget-skipped overhead counts separate runs for candidates not needed by any selected pair. `maxRuns` is a shared cap on attempted continuation matches across discovery and confirmation. Every requested branch/sample remains in the raw comparisons, including failures and budget skips.

Each phase's `comparisons` contains the unmodified `compareFixedPositionContinuations` results. Completed samples retain full seeded replay records. Only discovery-qualified pairs receive a confirmation evaluation: they are `confirmed` only when confirmation independently classifies as a crossover with exactly the discovery orientation, and otherwise are `not-confirmed`. Non-qualified discovery pairs are explicitly `not-run`.

The report uses schema version 1 and includes `configuration`, separate `discovery` and `confirmation` sections, aggregate and phase run counts, and `limitations`. The limitations document nominal (not multiplicity-adjusted) normal intervals, small-sample/degenerate-variance concerns, position-search selection bias, conditional strategy scope, and the fact that distinct seed labels do not guarantee collision-free underlying streams. No observed crossover is a valid result.

## Historical implementation evidence

The following records describe the original implementation, not the current verification. The issue08 import failures below were historical; the current checks are recorded in the next section.

Public seams tested are the classifier, confirmation evaluator, and formatter; evaluator integration uses the real fixed-position continuation and replay APIs, with no internal collaborator mocks and no assertion that a real game must produce a crossover.

- Red: `npm test -- --run tests/crossover-confirmation.test.js` failed because `CrossoverConfirmation.js` did not yet exist.
- Red: after classifier tests passed, the added evaluator integration failed because `evaluateCrossoverConfirmation` was not exported yet.
- Green: `npm test -- --run tests/crossover-confirmation.test.js` passed all six tests after implementation.
- `npm run build` passed (with the existing PassiveEffects chunk warning).
- `npm test` ran 110 passing tests and exposed two failures in the parallel issue08 `tests/strategy-evaluation.test.js`: they dynamically import the missing `src/js/logic/headless/StrategyEvaluation.js` rather than this task's `CrossoverConfirmation.js` public module. The issue08 owner should adapt that import/API path; no files outside issue07 ownership were changed here.
- Project scripts provide `test`, `build`, and `headless:compare`; there is no typecheck script.

## Issue 07 closure verification

Scope: verify the existing classifier, independent-confirmation mechanism, omission accounting, report contract, and replayability. This does not run the new issue08 evaluation design, change formal rules, or establish game balance. The user has confirmed the requirement and interpretation boundaries; no additional human review of the small-run report is required.

Verification was performed against source commit `b3da0e7746a3d3aedaf1a6ebe279cce2bf9c909f`, with no runtime or test-source changes:

- `npm test -- --run tests/crossover-confirmation.test.js tests/strategy-evaluation.test.js`: **16/16 passed** in two files.
- `npm test`: **118/118 passed** in 13 files.
- `npm run build`: **passed**. Vite retains the existing warning that `PassiveEffects.js` is both statically and dynamically imported; it does not prevent the build.
- `package.json` defines no typecheck script; no typecheck pass is claimed.
- Replayed **all 1440 completed fixed-first-action continuation samples** in the historical `reports/headless-strategy-evaluation/small-run/evaluation-full.json.gz` artifact, across 45 evaluation reports. Every trajectory, final state, and terminal result matched. Those samples have zero failures and budget skips. This is replay verification of stored runs, not new independent experimental evidence.

### What was checked

- Constructed payoff data exercises signed reversal, no reversal, effect below the declared threshold, uncertain evidence, and missing pairs through `classifyPayoffCrossover`.
- The real-runner diagnostic integration selects one discovery-qualified pair, confirms it on disjoint holdout seeds, and leaves unqualified pairs `not-run` even when their position's shared holdout data would qualify them. It reports 30 attempted runs, 28 completed runs, two failures, and six completed unselected-action overhead runs. This diagnostic is a mechanism test, not a representative real-game finding.
- Source inspection confirms a holdout is `confirmed` only if it independently meets the classifier criteria and has the same opponent-by-opponent orientation as discovery; otherwise it is `not-confirmed`. Overlapping phase seeds and invalid criteria are rejected before continuation decisions.
- Failure/budget tests retain missing pairs, distinguish numeric and string seed identities, and give failures precedence over overlapping budget skips in pair-level counts. The classifier receives `null` for non-completed branches rather than a draw value.
- Reports preserve declared criteria, seeds, strategy/scoring identities, action pairs, means, intervals, run coverage, raw replay records, and selection-bias/conditional-scope limitations. Existing formatter tests check criteria and limitations in the human-facing output.

The historical small-run artifact contains **zero confirmation comparisons**: its discovery sample count of two cannot meet its declared floor of six. The 1440 artifact replays therefore verify discovery samples only. Independent confirmation is covered by the diagnostic integration above, not by that historical artifact. Issue08 is responsible for future exploration and independent-confirmation experiments under the agreed evaluation design.

### Reproduce the artifact replay check

Run from the repository root; this reads the existing artifact and does not overwrite or rerun the study:

```sh
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { strict as assert } from 'node:assert';
import { replaySeededMatch } from './src/js/logic/headless/SeededMatch.js';
const report = JSON.parse(gunzipSync(readFileSync('reports/headless-strategy-evaluation/small-run/evaluation-full.json.gz')));
let replayed = 0;
let failed = 0;
let skipped = 0;
for (const evaluation of report.evaluations) {
  const result = evaluation.result;
  const keys = new Set(result.configuration.discoverySeeds.map(seed => `${typeof seed}:${seed}`));
  assert(result.configuration.confirmationSeeds.every(seed => !keys.has(`${typeof seed}:${seed}`)));
  for (const phase of [result.discovery, result.confirmation]) {
    for (const comparison of phase.comparisons) {
      for (const branch of comparison.firstActions) {
        for (const sample of branch.samples) {
          if (sample.status !== 'completed') {
            if (sample.status === 'failed') failed++;
            else if (sample.status === 'not-run-budget') skipped++;
            else throw new Error(`Unexpected sample status: ${sample.status}`);
            // Raw missing-data records may omit value; the classifier adapter uses null.
            assert(sample.value === undefined || sample.value === null);
            continue;
          }
          const replay = replaySeededMatch({
            initialState: sample.replay.initialState,
            stems: sample.replay.stems,
            selectedActions: sample.replay.actionRecords,
            scoringConfig: sample.replay.scoringConfigInput
          });
          assert.deepEqual(replay.trajectory, sample.replay.trajectory);
          assert.deepEqual(replay.finalState, sample.replay.finalState);
          assert.deepEqual(replay.terminalResult, sample.replay.terminalResult);
          replayed++;
        }
      }
    }
  }
}
assert(replayed > 0);
console.log(JSON.stringify({ evaluationReports: report.evaluations.length, replayed, failed, skipped,
  confirmationComparisons: report.evaluations.reduce((n, e) => n + e.result.confirmation.comparisons.length, 0) }, null, 2));
NODE
```
