# Headless batch strategy comparison

`src/js/logic/headless/BatchComparison.js` exports `runBatchComparison`. It compares one formal scoring baseline with one selected scoring configuration by replaying paired seeded matches. The executable CLI writes the complete JSON report and prints a short human-readable summary.

## Run from the command line

```sh
npm run headless:compare -- \
  --samples 4 \
  --seed 202603 \
  --max-turns 20 \
  --config no-self-cost-reward \
  --out reports/strategy-comparison.json
```

Options can use either `--name value` or `--name=value`:

- `--samples`: positive number of independent seed clusters (default `2`).
- `--seed`: safe integer or non-empty string (default `202603`). Numeric cluster seeds increment from the supplied seed; string cluster seeds use the original string for the first cluster and append `#sample-N` after that.
- `--max-turns`: per-match turn limit (default `12`).
- `--config`: candidate scoring preset: `formal-baseline`, `experimental`, `no-self-cost-reward`, `burst-action-score-once`, or `disable-rarity-bonus` (default `experimental`). The baseline side always uses formal scoring. `experimental` enables all three version-1 switches.
- `--out`: JSON destination (default `headless-batch-comparison.json`). Parent directories are created when needed.
- `--initial-state`: optional path to a complete headless state JSON template. The selected max-turn limit and each planned starting player are applied to a fresh copy for every match.
- `--help`: show usage.

Each seed cluster runs all nine ordered P1/P2 assignments of the three public strategies (`build-priority`, `attack-priority`, and `situation-responsive`), for both starting players, under both scoring configurations: 36 matches per cluster and 18 paired comparisons. The reverse ordered assignment is the strategy-role swap. No strategy-performance threshold affects the exit status. Invalid arguments/configurations or any failed, skipped, or incomplete comparison return a nonzero status. If matches fail after planning, the CLI still writes the report, including their reasons and reproduction details.

## Programmatic API

```js
import { runBatchComparison } from '../src/js/logic/headless/BatchComparison.js';

const report = runBatchComparison({
  samples: 4,
  seed: 202603,
  maxTurns: 20,
  experimentalScoringConfig: { version: 1, noSelfCostReward: true }
});
```

The optional `initialState` is a complete state template useful for evaluating fixed positions. Each run gets a cloned state with `currentPlayer` set to its planned starter and `maxTurns` set from the batch options. `baselineScoringConfig` defaults to formal scoring; `experimentalScoringConfig` defaults to all three version-1 experimental switches.

Both players in an individual match use the same strategy assignment and scoring snapshot. For each paired comparison, baseline and experiment share the actual initial position, sample seed, random algorithm version, strategy assignment, and starting player. The report records these inputs rather than inferring them later. An existing current-stem checkpoint is retained as part of the initial position and does not count as a generated stem.

Matching the heavenly-stem random stream does not guarantee that both players receive the same personal opportunities: a burst can grant an extra action, shifting which player receives later stems. The report includes this caveat in `plan.pairing`.

## Report contents

The JSON has `plan`, `coverage`, `results`, and `summary` sections:

- `plan` records sample count, base seed, turn limit, random version, strategy definitions and all ordered assignments, both starters, scoring-config identities and full versioned snapshots, and the pairing caveat.
- `coverage` reports planned/completed/failed/skipped matches and paired comparisons, per-configuration and per-starter totals, all nine strategy-role assignments, and grouped failure reasons. A failed run is a `status: "failed"` record, never a draw; incomplete pairs are excluded from paired estimates and listed with their causes.
- Each successful `results` record includes its `comparisonId`, sample index and actual seed, starting player, strategy names and version identities, complete initial state, consumed stems, random version, scoring snapshot, full action records, full state trajectory, final state, terminal result, and a compact position trajectory. Failed records preserve the available initial state, random input, prior action records, and headless error details.
- `summary.configurations[configurationId].winLossDrawMatrix[P1Strategy][P2Strategy]` contains P1 wins, P2 wins, draws, and each side's win value. A win is `1`, a draw `0.5`, and a loss `0`. The report includes the same matrices split by starting player and source comparison IDs so aggregate cells can be traced to match records.
- Action frequencies use all action records (including `AUTO` and `SKIP`) as their denominator. Match-length summaries count opportunities/action records and consumed stems. `unityVictory` reports terminal victories by `所有天干点亮`; `turnLimitSettlement` reports terminal results by `回合上限`. Rates are divided by completed matches only.
- `progressAndDestruction` counts state-value increases and decreases in recorded state changes. Each result's `positionTrajectory` follows lit sides, normalized nodes, scores, changes, and board keys after each completed opportunity; the complete ordered transitions remain in `actionRecords`.
- `repeatedBoardKeys` are counted within a match over completed-opportunity positions. A key contains both players' ten nodes, `currentPlayer`, and `isExtraTurn`. It intentionally omits scores, turn count, and random-stream position; therefore a repeated key does not prove an infinite loop. The full trajectory and action records remain available to inspect what changed.
- `summary.pairedComparison.byStrategyPair` compares P1's win value between experiment and baseline for each ordered strategy assignment. The seed is the independent cluster: within each seed, the two starting-player cases are averaged first, and only then are seed-cluster differences used for uncertainty. A two-sided 95% Student-t interval is reported when at least two complete seed clusters exist (normal approximation above 30 clusters); a single cluster has no interval. Failed cases make that whole balanced seed cluster incomplete for that strategy pair. Small batches are exploratory, not stable regression tests.

Configuration IDs identify the scoring version and the three normalized switch bits (`000` is formal settings); the attached `scoringConfig` snapshot, including its point table, is the complete rule identity. Each run's action records can be replayed with `replaySeededMatch` using its recorded `initialState`, consumed `stems`, `actionRecords`, and the scoring switches from its snapshot. The actual seed and random-version ID are also retained for reproducing the strategy-driven run.

Focused behavior and CLI integration tests are in `tests/batch-comparison.test.js`.
