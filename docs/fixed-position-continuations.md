# Fixed-position continuation evaluation

`src/js/logic/headless/FixedPositionContinuations.js` exports the public fixed-position seams:

- `extractReachableFixedPosition(matchResult, selector)` extracts and deeply freezes a checkpoint from a successful `runSeededMatch` result.
- `freezeDiagnosticFixedPosition({ id, description, state })` freezes a caller-authored state and marks it `source: "manual-diagnostic"`, `classification: "diagnostic"`.
- `enumerateLegalFirstActions(position, { scoringConfig })` asks the headless rule runner for the real first-opportunity candidate set.
- `compareFixedPositionContinuations({ position, strategies, seeds, scoringConfig, maxRuns? })` evaluates every enumerated first action through complete seeded matches.
- `formatFixedPositionComparison(result)` formats the machine result for a concise human summary.

There is no CLI in this ticket.

## Extract and freeze reachable positions

```js
import { runSeededMatch } from '../src/js/logic/headless/SeededMatch.js';
import { extractReachableFixedPosition } from '../src/js/logic/headless/FixedPositionContinuations.js';

const baseline = runSeededMatch({
  initialState,
  seed: 1,
  strategies: { P1: 'build-priority', P2: 'attack-priority' }
});
const position = extractReachableFixedPosition(baseline, {
  id: 'balanced-turn-7',
  classification: 'balanced',
  opportunity: 7,
  playerId: 'P1'
});
```

The source match must carry the formal-baseline scoring snapshot; experimental source matches are rejected rather than labelled baseline-reachable. The selector must name a recorded live `turn-start` and its matching action record. The extracted `state` contains the complete game state, current canonical stem, both scores and boards, `isExtraTurn`, both player burst flags, and `pendingBurstPlayer`. Headless trajectories retain the caller's UI `phase`; because the checkpoint already has `currentStem`, extraction normalizes only `phase` to `DECISION` (the accepted phase for resuming an opportunity) and records the original value and normalization in provenance. All other state values are preserved and the returned object is deeply frozen and detached from the match result.

`provenance.baselineMatch` keeps the complete baseline replay record: the complete initial state, seed and RNG version, versioned strategy identities, scoring snapshot and normalized scoring input, consumed stems, all action records, full trajectory, final state, terminal result, and consumed count. The static fixture in `tests/fixtures/fixed-position-continuations/reachable-positions.js` uses a fixed baseline seed/strategy pair and hashes full checkpoint states so rule or strategy drift fails tests. It includes balanced, trailing-needs-disruption, near-turn-limit, and extra-opportunity examples. No hand-built sample is presented as reachable; caller-authored positions must use `freezeDiagnosticFixedPosition`.

## Enumerate and compare

```js
import {
  compareFixedPositionContinuations,
  formatFixedPositionComparison
} from '../src/js/logic/headless/FixedPositionContinuations.js';

const result = compareFixedPositionContinuations({
  position,
  strategies: { P1: 'build-priority', P2: 'attack-priority' },
  seeds: [202603, 202604, 202605],
  scoringConfig: {} // explicit formal-baseline selection
});
console.log(formatFixedPositionComparison(result));
```

The first-action set comes from `runHeadlessMatch`'s recorded legal candidates, not an AI scorer or the baseline policy's selected action. Candidate order is the evaluator's order. `AUTO` remains forced; a no-candidate `SKIP` is represented as its one forced first action. The enumerator invokes the public runner with no future stems: if the fixed-stem action is nonterminal, the next opportunity reports `STEMS_EXHAUSTED` with the already-recorded first action in public reproduction details. Thus candidate extraction does not need to simulate the rest of a match. The runner's first selected candidate in that record is not an action recommendation. Each comparison branch and seed starts from a fresh clone of the same frozen position.

`scoringConfig` is required. Pass `{}` for `formal-baseline`, or pass a supported version-1 scoring switch object such as `{ version: 1, noSelfCostReward: true }`. The result stores the effective scoring snapshot. A strategy that mutates the shared points table and changes a later run's snapshot produces an explicit `SCORING_CONFIG_CHANGED` failure rather than being counted under mismatched rules.

The checkpoint player's first decision is forced to one enumerated action. Thereafter both players use the supplied continuation strategies. Built-in names have their existing public versions; custom strategies must be versioned `{ id, version, decide }` definitions and receive only the normal frozen public decision context for the current opportunity. The forced choice is not communicated as future stems or scoring configuration. Result strategy identities distinguish the forced first action from its continuation policy.

All requested seeds are run for every first action unless `maxRuns` is supplied. Replicate seed values must be unique and valid for `runSeededMatch`. Every candidate appears in `firstActions`, including when an attempt fails or is skipped because the run budget is exhausted. Failures retain error details (and headless reproduction context when available); budget skips have their own records. Neither is silently removed from action comparisons.

## Results and uncertainty

Each successful sample reports the formal terminal result and acting player's outcome (`win`, `draw`, `loss`) and uniform value (`1`, `0.5`, `0`, respectively). Per-action summaries include W/D/L counts and proportions, marginal 95% Wilson intervals, value mean, and a normal-approximation 95% interval based on the sample standard error. With fewer than two completed values, the sample-based value interval is `null`; the sample count and W/D/L intervals remain explicit.

The first legal action in candidate order is the named reference. Every branch reports its same-seed paired value difference from that reference, the exact paired seed list, missing pairs, mean difference on the same `win=1`, `draw=0.5`, `loss=0` scale, and a normal-approximation 95% interval. Pairing means that each first action is evaluated with the same replicate seed and versioned RNG, giving identical stem-stream prefixes where both runs continue. Branches can consume different numbers of tie-break draws after their states diverge, so the API does not claim that every later policy random draw is identical.

Each successful sample contains a complete replay record (`initialState`, consumed `stems`, full `actionRecords`, trajectory, final state, terminal result, effective scoring snapshot, normalized `scoringConfigInput`, seed/RNG version, and strategy identities). Reproduce it directly with `replaySeededMatch({ initialState, stems, selectedActions: actionRecords, scoringConfig: scoringConfigInput })`. For a failed seeded match, the structured failure details carry the available reproduction state, stems, seed, random version, and policy identities. `maxRuns`, when supplied, caps continuation runs (`candidate × seed`), not the small first-action enumeration probe.

These are conditional estimates under the selected continuation policies and scoring configuration, not globally optimal action values. Terminal win/draw/loss is the primary outcome. This API does not use scores, action-score totals, or board-normalization changes as substitutes for formal terminal results.
