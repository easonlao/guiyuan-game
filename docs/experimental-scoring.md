# Experimental scoring for headless matches

`runHeadlessMatch` accepts an optional `scoringConfig`. Omitting it preserves the formal scoring rules. Every successful result, including an omitted-config run, returns `result.scoringConfig`: an immutable, versioned snapshot of the selected switches and the `POINTS_CONFIG` values captured at match start.

```js
const result = runHeadlessMatch({
  initialState,
  stems,
  strategies,
  scoringConfig: {
    version: 1,
    noSelfCostReward: true,
    burstActionScoreOnce: true,
    disableRarityBonus: false
  }
});

console.log(result.scoringConfig);
```

Version 1 accepts only these optional keys:

- `version`: must be `1` when supplied.
- `noSelfCostReward`: suppresses only the state-change reward for the decreasing self-cost substep of `BURST` or `BURST_ATK`. The action reward and target state changes remain scored.
- `burstActionScoreOnce`: awards the `BURST` or `BURST_ATK` behavior score once per whole action, on its first successful substep. State rewards and successful-substep statistics remain per substep; blocked substeps do not alter action resolution.
- `disableRarityBonus`: disables rarity adjustment on aggregate action scores and their action/state score statistics.
- `noRarityActions`: an optional array of action type strings (e.g. `['BURST', 'BURST_ATK']`) for which rarity multipliers are bypassed, leaving other actions unaffected. Defaults to `[]`.
- `attackScoreMultiplier`: optional positive number multiplier applied strictly to attack-related state changes (`CAUSE_DMG`, `BREAK_LIGHT`, `WEAKEN`). Defaults to `1`.

Each boolean switch defaults to `false`, `noRarityActions` defaults to `[]`, and `attackScoreMultiplier` defaults to `1`. Inputs must be plain objects containing only the listed keys. Unknown keys, unsupported versions, and other values throw `HeadlessMatchError` with code `INVALID_SCORING_CONFIG`. The point table is captured from the current formal `POINTS_CONFIG`; it cannot be overridden through this experiment API. The returned snapshot contains `version`, a `name` (`formal-baseline` or `experimental`), all normalized switches, and a detached, deeply frozen `pointsConfig` copy.

Experimental configurations are local to a match. They do not mutate formal rules, the caller's configuration object, or another match. The switches alter scoring only: candidate legality, board transitions, burst boundaries, extra-turn behavior, passive rules, stem consumption, and terminal decisions continue to use the shared game rules. These options are evaluation controls, not claims that a scoring variant improves balance.

The public scoring seam is `runHeadlessMatch({ initialState, stems, strategies, scoringConfig })`; the implementation and formal-baseline characterization remain shared with the production action scorer. Focused behavior tests live in `tests/experimental-scoring.test.js`.
