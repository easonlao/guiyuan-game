# Deterministic headless match

`src/js/logic/headless/HeadlessMatch.js` exports `createInitialHeadlessState`, `runHeadlessMatch`, and `HeadlessMatchError`. The public entry point evaluates a complete state against a fixed heavenly-stem sequence and two synchronous strategies. It reuses the production action-candidate, action-resolution, score-calculation, passive-settlement, and turn-rule modules while updating only a match-scoped state value. It does not run the UI/event-bus turn orchestration or read/write the formal `StateManager` singleton.

## Input

```js
runHeadlessMatch({
  initialState, // complete GameState plus pendingBurstPlayer
  stems,        // fixed sequence of { name, element }
  strategies: { P1, P2 }
});
```

Use `createInitialHeadlessState(overrides)` to create the complete formal `GameState` shape with a `pendingBurstPlayer: null` marker. Overrides are cloned into a new state. A supplied state must contain every formal state field, both complete player records (`id`, `type`, `score`, and `burstBonus`), finite score/change/stat records, all ten nodes with `yang` and `yin` values from -1 through 2, and the rule-relevant `isExtraTurn`, `players.*.burstBonus`, and `pendingBurstPlayer` fields. Phases must be one of `HOME`, `INITIATIVE`, `STEM_GENERATION`, `DECISION`, `PLAYING`, or `GAME_END`. Missing nodes or turn/burst information are errors; headless evaluation does not fill rule state with defaults.

A non-null `currentStem` is a canonical `STEMS_LIST` record and defines a complete-position checkpoint at the already-started opportunity: its phase must be `DECISION` or `PLAYING`, and `turnCount` must be positive and live. The evaluator executes this stem first without incrementing `turnCount` or consuming a stem from the supplied future sequence. A null `currentStem` means the checkpoint is between opportunities, so the next opportunity goes through shared turn-start rules and then consumes the next sequence stem. `GAME_END` is accepted only when shared terminal rules confirm the state is terminal. Any initially terminal position returns unchanged with no actions, no count/stem changes, and zero sequence stems consumed.

Every supplied future stem must match a canonical `STEMS_LIST` name and element. Its canonical color is supplied by the evaluator. The sequence is consumed once per future opportunity, including a burst-granted extra opportunity; a checkpoint's current stem comes from `initialState`, not this sequence. Turn count increments and terminal checks happen before the next future stem is consumed, so terminal evaluation never consumes a stem.

Each strategy is called sequentially only when its player has a decision. It receives a frozen context `{ playerId, stem, state, candidates }` and must synchronously return one candidate from `candidates`. Strategies should be deterministic and side-effect free. An `AUTO` absorb (the current stem side is below 1) is forced, and a position with no candidates is recorded as `SKIP`; neither calls a strategy.

## Result and errors

A successful result contains:

- `trajectory`: complete state snapshots labelled `match-start`, `turn-start`, `opportunity-complete`, and `terminal`.
- `actionRecords`: one record per executed opportunity, including an initial `currentStem` checkpoint, with candidates, selected action (or `SKIP`), ordered node-state changes, applied score changes, and passive score changes.
- `finalState` and `terminalResult` (`{ winner, reason }`).
- `consumedStemCount`: the number of stems consumed from the supplied future sequence; a checkpoint stem is not counted.

Invalid input, invalid strategy selections, synchronous strategy failures, asynchronous strategies, or a live opportunity without a remaining stem throw `HeadlessMatchError`. Its stable `code` values are `INVALID_STATE`, `INVALID_STEMS`, `INVALID_STEM`, `INVALID_STRATEGIES`, `INVALID_ACTION`, `STRATEGY_FAILED`, `ASYNC_STRATEGY`, and `STEMS_EXHAUSTED`. Each error carries detached structured `details`: failing state, stem, player, opportunity, rejected selection (if any), candidates, prior action records, trajectory, consumed count, initial state, and canonical fixed stems where available. Uncloneable values and cycles are rendered safely in those details rather than leaking native clone/inspection errors. The state and stem sequence are match-local; evaluation does not mutate caller input or formal game state. Each call is independent, and strategy calls within one match are sequential.

The evaluator uses host passive-settlement semantics from the headless-rule baseline and the shared `TurnRules` terminal/extra-turn decisions. It does not introduce seeded strategies, a CLI, or network/UI behavior.
