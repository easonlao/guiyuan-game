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

## TDD evidence

Public seams tested are the classifier, confirmation evaluator, and formatter; evaluator integration uses the real fixed-position continuation and replay APIs, with no internal collaborator mocks and no assertion that a real game must produce a crossover.

- Red: `npm test -- --run tests/crossover-confirmation.test.js` failed because `CrossoverConfirmation.js` did not yet exist.
- Red: after classifier tests passed, the added evaluator integration failed because `evaluateCrossoverConfirmation` was not exported yet.
- Green: `npm test -- --run tests/crossover-confirmation.test.js` passed all six tests after implementation.
- `npm run build` passed (with the existing PassiveEffects chunk warning).
- `npm test` ran 110 passing tests and exposed two failures in the parallel issue08 `tests/strategy-evaluation.test.js`: they dynamically import the missing `src/js/logic/headless/StrategyEvaluation.js` rather than this task's `CrossoverConfirmation.js` public module. The issue08 owner should adapt that import/API path; no files outside issue07 ownership were changed here.
- Project scripts provide `test`, `build`, and `headless:compare`; there is no typecheck script.
