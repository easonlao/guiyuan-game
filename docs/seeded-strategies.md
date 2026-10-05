# Seeded matches and public strategies

`src/js/logic/headless/SeededMatch.js` exports `runSeededMatch` and `replaySeededMatch`. It layers seeded heavenly-stem generation, versioned public strategies, and recorded-action replay over the deterministic headless evaluator in [headless-match.md](./headless-match.md). Scoring options are described in [experimental-scoring.md](./experimental-scoring.md).

## Run a seeded match

```js
import { runSeededMatch } from '../src/js/logic/headless/SeededMatch.js';

const result = runSeededMatch({
  initialState,
  seed: 202603,
  strategies: {
    P1: 'build-priority',
    P2: 'situation-responsive'
  },
  scoringConfig: { version: 1, noSelfCostReward: true }
});
```

Seeds are non-empty strings or safe integers. Each built-in strategy has a stable identity and version (`build-priority@1`, `attack-priority@1`, `situation-responsive@1`). A successful result includes the normal headless result plus:

- `seed`, `randomVersion` (`mulberry32-fnv1a-v1`), and `strategyIdentities`.
- `stems`: the canonical heavenly-stem records actually consumed from the generated future sequence, in order. It excludes an already-present `initialState.currentStem` checkpoint and any unused future stems.
- `scoringConfig`: the headless evaluator's immutable snapshot, including when the default configuration is used.

Stem selection preserves the formal distribution: each draw selects `STEMS_LIST[Math.floor(random() * STEMS_LIST.length)]`, so each of the ten formal heavenly stems is equally likely. The seeded source uses FNV-1a seed/stream derivation and Mulberry32 output. Its algorithm identifier is versioned; changing the PRNG, seed normalization, or stream names requires a version change for old records to remain reproducible.

The stem generator and tie-breakers are independent streams: `heavenly-stems`, `strategy-ties:P1`, and `strategy-ties:P2`. A policy's extra tie-break draws therefore cannot shift the heavenly-stem sequence or the other player's tie sequence. This provides reproducibility, not cryptographic randomness.

## Public decision context

Built-in and custom strategies receive a deeply frozen context with exactly these top-level fields:

```js
{
  playerId,
  stem,       // current canonical stem, never a future stem
  state: {
    currentPlayer,
    turnCount,
    maxTurns,
    isExtraTurn,
    scores: { P1, P2 },
    nodeStates // public P1/P2 board position
  },
  history,   // completed public actions before this decision
  candidates // legal actions for this opportunity only
}
```

History entries contain `opportunity`, `playerId`, `stem`, `candidates`, `action`, and public board `stateChanges`. They cover completed opportunities, including forced `AUTO` and `SKIP`; scoring-change records are omitted because they depend on scoring configuration. Neither context nor history includes future stems, the seed, scoring configuration, strategy IDs/labels, player `type`/burst parameters, or the other side's strategy parameters. Public scores and both public boards are included. The built-in definitions do not consult scores or scoring configuration.

`AUTO` is forced by the headless evaluator, and a no-candidate opportunity is recorded as `SKIP`; neither invokes a strategy. Strategies otherwise must return one of the supplied candidates. The seeded wrapper passes only the sanitized context to a decision function and gives it a separate per-player random callback for tie selection.

A custom, versioned decision definition can be supplied instead of a built-in name:

```js
const cautious = {
  id: 'cautious-builder',
  version: 1,
  decide(context, nextTieBreak) {
    // Return one of context.candidates. Keep decision rules independent of scoringConfig.
    return context.candidates[0];
  }
};

runSeededMatch({ initialState, seed: 'trial-a', strategies: { P1: cautious, P2: 'attack-priority' } });
```

The whole match uses one core evaluation and captures scoring configuration once, before any strategy decisions. Strategy failures retain the core's original initial position, accumulated records, trajectory, stem sequence, consumed count, and scoring snapshot; seeded errors additionally include the seed, random version, and strategy identities for reproduction.

The callback receives no strategy labels or match configuration. Its optional `nextTieBreak()` callback reads only that player's tie stream. Keep custom definitions synchronous and side-effect free; their `id` and `version` are recorded in the result. A custom ID cannot reuse a built-in ID, so result identity does not mislabel a replacement implementation as a built-in version.

## Built-in decision definitions

The definitions are fixed heuristics, not calls to the existing AI scorer. They rank only legal candidates and resolve equal top ranks uniformly from the player's tie stream. Empty candidate lists return `null`; otherwise a non-finite tie draw falls back to the first top-ranked legal candidate.

- **`build-priority@1`**: `BURST` 50, `CONVERT` 40, `TRANS` 30, `ATK` 10, `BURST_ATK` 0.
- **`attack-priority@1`**: `BURST_ATK` 50, `ATK` 40, `BURST` 30, `CONVERT` 10, `TRANS` 0.
- **`situation-responsive@1`**: when the opponent has fewer than eight lit sides, ranks `BURST` 40, `CONVERT` 30, `TRANS` 20, `BURST_ATK` 15, `ATK` 10. At eight or more lit opponent sides, the opponent is treated as an urgent threat: `ATK` ranks `30 + litSides`, with 10 added if its target side is currently 1; `BURST_ATK` ranks `35 + litSides + litSidesOnTargetNode`; `BURST` ranks 20 and `CONVERT`/`TRANS` rank 10.

Missing action types rank 0. These policies are decision definitions only; final match outcomes come from the shared game rules and terminal winner, not from a heuristic score.

## Replay

Pass the original initial position, the actual consumed `stems`, and the original `actionRecords` to replay the recorded choices:

```js
import { replaySeededMatch } from '../src/js/logic/headless/SeededMatch.js';

const replay = replaySeededMatch({
  initialState,
  stems: result.stems,
  selectedActions: result.actionRecords,
  scoringConfig: { version: 1, noSelfCostReward: true }
});
```

The replay entry uses each recorded action only when that opportunity has a legal decision, and the shared evaluator rejects a selection that is no longer legal. Include the same scoring configuration to reproduce score fields; the recorded stems and actions are independent of strategy implementation changes. The initial position remains required because a resumed current-stem checkpoint is not part of the generated `stems` list.

Focused behavior tests live in `tests/seeded-strategies.test.js`.
