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

Use `createInitialHeadlessState(overrides)` to create the complete formal `GameState` shape with a `pendingBurstPlayer: null` marker. Overrides are cloned into a new state. A supplied state must contain every formal state field, both complete player records (`id`, `type`, `score`, and `burstBonus`), finite score/change/stat records, all ten nodes with `yang` and `yin` values from -1 through 2, and the rule-relevant `isExtraTurn`, `players.*.burstBonus`, and `pendingBurstPlayer` fields. Missing nodes or turn/burst information are errors; headless evaluation does not fill rule state with defaults.

Every stem must match a canonical `STEMS_LIST` name and element. Its canonical color is supplied by the evaluator. The sequence is consumed once per actual opportunity, including a burst-granted extra opportunity. Turn count increments and terminal checks happen before the next stem is consumed, so terminal evaluation never consumes a stem.

Each strategy is called sequentially only when its player has a decision. It receives a frozen context `{ playerId, stem, state, candidates }` and must synchronously return one candidate from `candidates`. Strategies should be deterministic and side-effect free. An `AUTO` absorb (the current stem side is below 1) is forced, and a position with no candidates is recorded as `SKIP`; neither calls a strategy.

## Result and errors

A successful result contains:

- `trajectory`: complete state snapshots labelled `match-start`, `turn-start`, `opportunity-complete`, and `terminal`.
- `actionRecords`: one record per consumed opportunity, including candidates, selected action (or `SKIP`), ordered node-state changes, applied score changes, and passive score changes.
- `finalState` and `terminalResult` (`{ winner, reason }`).
- `consumedStemCount`.

Invalid input, invalid strategy selections, synchronous strategy failures, asynchronous strategies, or a live opportunity without a remaining stem throw `HeadlessMatchError`. Its stable `code` values are `INVALID_STATE`, `INVALID_STEMS`, `INVALID_STEM`, `INVALID_STRATEGIES`, `INVALID_ACTION`, `STRATEGY_FAILED`, `ASYNC_STRATEGY`, and `STEMS_EXHAUSTED`. The state and stem sequence are match-local; evaluation does not mutate caller input or formal game state. Each call is independent, and strategy calls within one match are sequential.

The evaluator uses host passive-settlement semantics from the headless-rule baseline and the shared `TurnRules` terminal/extra-turn decisions. It does not introduce seeded strategies, a CLI, or network/UI behavior.
