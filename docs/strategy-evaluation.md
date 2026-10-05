# Headless strategy evaluation

`npm run headless:evaluate -- [options]` runs the preregistered small study using the frozen reachable positions in `tests/fixtures/fixed-position-continuations/reachable-positions.js`. It evaluates the formal scoring baseline, each independent scoring switch, and the combined switches. Each scoring selection is compared with the formal baseline through `runBatchComparison`; because that public API owns both sides of each paired report, its formal-baseline matches are repeated once per selection. The report counts those controls transparently rather than presenting them as independent samples.

```sh
npm run headless:evaluate -- --help
npm run headless:evaluate -- --samples 2 --seed 202603 --max-turns 12 --config all
npm run headless:evaluate -- --config disable-rarity-bonus --max-runs 100 --out reports/my-evaluation
```

Defaults use two discovery and two independent confirmation seeds, seed `202603`, a 12-turn cap for paired full-match batch comparisons, all five scoring selections (including `combined`), and `minimumEffect: 0.1`, `minimumPairs: 6`. Frozen continuation checkpoints keep their recorded full `maxTurns` value (20 in the shipped fixture); the CLI never rewrites a checkpoint into an unreachable state. The evidence floor is intentionally greater than the default phase sample count, so a small run can correctly report insufficient evidence rather than overstate a result. `--samples` sets both phase counts; `--discovery-samples` and `--confirmation-samples` may set them separately. `--max-runs` caps fixed-position continuation matches for the full CLI study; it is not a match-turn cap. Select one rule preset with `--config formal-baseline`, an individual switch name, or `--config combined`; `--config all` runs all five selections. Arguments accept `--name value` or `--name=value`. Invalid options and incomplete evaluations exit nonzero and write `missing-data.json` and `missing-data.md`; failed or skipped runs are never interpreted as draws.

## Public evaluation seam

`src/js/logic/headless/StrategyEvaluation.js` exports `evaluateCrossoverConfirmation({ positions, focalStrategy, opponents, discoverySeeds, confirmationSeeds, scoringConfig, criteria, maxRuns? })`. `opponents` contains exactly two `{ id, strategy }` definitions. `criteria` records `minimumEffect`, `minimumPairs`, `uncertaintyMethod: "paired-normal-95"`, and `evidenceRule: "interval-excludes-zero"`. The evaluator calls `compareFixedPositionContinuations` on each supplied checkpoint and returns schema version, configuration, raw discovery and confirmation comparisons, per-position candidate-action-pair classifications, summary counts, and explicit interpretation limits. Only discovery-qualified pairs are eligible for holdout confirmation. Other pairs carry `status: "not-run"`; confirmation outcomes do not relabel unqualified exploration results.

For each candidate action pair and opponent, the estimated difference is the paired, same-seed terminal outcome value from the focal player's perspective (win 1, draw 0.5, loss 0). The result records sample counts, failures, means, and normal-approximation 95% intervals. Classifications are delegated to `CrossoverConfirmation.js`; its declared thresholds are fixed before the comparison and are retained in output. Confirmation seeds are a distinct set from discovery seeds. These are conditional estimates under the named continuation strategies, not globally optimal action values.

`runStrategyEvaluationStudy` orchestrates the 3 focal strategies against all 3 choose 2 opponent-policy pairs (nine focal/opponent-pair reports per scoring selection), on every frozen checkpoint. It also runs the ordered strategy assignments and both starters for every scoring configuration through `runBatchComparison`. The batch API runs sequentially because the existing game state boundary is shared. The full artifact retains the duplicate formal controls and all comparison/replay records.

## Artifacts and replay

The default output directory is `reports/headless-strategy-evaluation/small-run/`. `evaluation.json` is the readable summary, `evaluation-full.json.gz` is the complete machine report with raw `compareFixedPositionContinuations` results and replay inputs, and `research.md` gives the findings and limitations. Decompress the full artifact with `gzip -dc evaluation-full.json.gz`; each successful continuation sample preserves the complete checkpoint state, scoring input, seed, random version, strategies, stems, selected action records, trajectory, final state, and terminal result. Replay a sample with `replaySeededMatch` as described in [fixed-position-continuations.md](fixed-position-continuations.md). The report also stores the frozen checkpoint IDs/state identities, scoring and policy versions, criteria, CLI parameters, git revision and working-tree snapshot, and planned/completed/failed/skipped coverage.

The human report separates **observed facts** from **limited inference** and **questions for players**. It summarizes strategy advantage, match length, win method, repeated-board indicators, progress/destruction, and scoring configuration comparisons, but treats none of action balance, close scores, or longer games alone as evidence of better play. It reports actual policy action disagreements or estimated preferred-first-action differences only when found in the results; it does not invent test cases. A selected human case retains the exact checkpoint, action pair, reason for selection, and evidence limits, followed by these questions:

1. Did anticipating this opponent change which first action you chose?
2. Did a correct read of the opponent create a meaningful advantage?
3. After attacking, did you still have a useful way to make progress?

No scoring selection is automatically adopted by the formal game. No observed crossover, uncertain evidence, or worse experimental results are valid research findings, not evaluation failures.
