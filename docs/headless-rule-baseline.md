# Headless rule baseline

This document records the observable rules shared by formal turn flow and the pure `src/js/logic/flow/TurnRules.js` calculations. It is a baseline, not a proposed balance change. Action resolution and score calculation remain in their existing modules; the shared turn module has no UI, network, storage, or learning imports.

## Action and score characteristics

Scores below are the current applied scores, including rarity rounding.

| Action | Characterized result |
| --- | --- |
| `AUTO` | A `0 → 1` state change scores 100. |
| `CONVERT` | A `0 → 1` state change scores 337. |
| `TRANS` | A `0 → 1` state change scores 278. |
| `ATK` | An opponent yin `0 → -1` change scores 241. |
| `BURST` | With source `(yang=1, yin=1)` and target `(0,0)`, source yin becomes 0, target yin becomes 2, and the three successful changes score 392 + 490 + 734 = **1616**. |
| `BURST_ATK` | With source `(1,1)` and opponent target `(0,0)`, source yang becomes 0, opponent target becomes `(-1,-1)`, and the three successful changes score 391 + 440 + 489 = **1320**. |

Additional locked scoring behavior:

- The diagnostic self-damage transitions `BURST` yin `0 → -1` and `BURST_ATK` yang `0 → -1` still award positive scores of 490 and 489 respectively.
- A successful action substep adds one behavior-stat occurrence. A blocked substep adds neither a score nor a behavior occurrence; earlier successful substeps remain applied.
- Applied score rarity rounding uses the combined behavior-plus-state score. Statistic components are rounded independently. For a `BURST_ATK` yang damage effect with behavior 80 and state 120, the applied score is 489 while the recorded components total 196 + 294 = 490.
- `BURST`/`BURST_ATK` eligibility and target-selection conditions are unchanged. In particular, no new eligibility or success gate was added around the existing burst marker assignment.

## Turn and terminal rules

- Ordinary turns switch players. A pending burst marker matching the current player grants one same-player extra opportunity and is consumed. Ending an already-extra opportunity switches players and clears the extra-turn flag. As in the current authority adapter, this already-extra branch leaves any stale burst marker untouched; it can therefore affect a later matching normal turn.
- Turn start increments `turnCount` before terminal evaluation. With `maxTurns = 60`, turns/opportunities 1 through 59 can proceed; incrementing to 60 ends the game before another stem is generated.
- Full-light victory requires all five nodes for a player to have both sides at least 1. P1 is checked before P2, and full-light victory takes precedence over the turn limit.
- At the limit, P1 wins only when P1's score is greater; P2 wins only when P2's score is greater; equal scores produce `DRAW`. The reason strings remain `所有天干点亮` and `回合上限`.
- A terminal decision does not apply the existing final damage penalty. That helper has no active caller in the current flow; turn-limit scores remain unchanged by terminal handling.

## Passive-settlement divergence

- The PVP host settles only the current turn player's nodes. A dividend counts only a complete `(2,2)` node; damage loss counts only a complete `(-1,-1)` node, not a single damaged side.
- When present, dividend records are ordered before damage-penalty records. The formal host adapter silently sets `pendingSettlement` before awaiting settlement animation, then applies the score records after animation completion.
- The PVP client does not calculate passive effects locally; it waits for the host's turn-sync data.
- The single-player end-turn branch does not perform passive settlement. This difference is intentional in the baseline and is not normalized by the shared extraction. The headless evaluation baseline uses the host settlement semantics.

## Isolation note

`StateManager.reset()` now creates fresh nested initial state as well as fresh node state. Characterization exposed that its former shallow reset shared nested statistics with the initial template, allowing recorded statistics to survive later resets. This fix is limited to reset construction; `getState()` remains the existing shallow-copy API and is not expanded into the later full snapshot boundary.

## Verification

The characterization and adapter-equivalence tests are in `tests/action-scoring-baseline.test.js`, `tests/turn-rules.test.js`, `tests/turn-manager-baseline.test.js`, and `tests/state-reset-isolation.test.js`. Run the full suite and production build with:

```sh
npm test
npm run build
```
