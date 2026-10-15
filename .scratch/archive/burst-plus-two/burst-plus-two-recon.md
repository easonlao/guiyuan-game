# burst-plus-two — reconnaissance inventory

> 历史侦察记录，仅作证据，不是当前规则、代码状态或待办定义。原存于仓库外的 worktrees/NOTES，现随任务归档；下文保留当时的路径、行号与测量口径，它们可能已经失效。归档任务入口见 [spec.md](spec.md)，现行规则与契约以项目真源文档及代码为准。

Authority: `/home/easonlao/projects/guiyuan-game/.scratch/burst-plus-two/spec.md` and the four tickets under `issues/`.
This file is a **pointer map**, not a definition. The spec is the authority for the rule; the code is the authority for what exists.

## 0. Rule being implemented (one paragraph)

`BURST` (强化): source node 归一; consume source **yin** 1 level (no score); then apply **two independent `+1` passes** to the generation target on the **active** board. Each pass re-reads the board and picks the side **yin-first** (yin < 2 → yin; else yang < 2 → yang; else the node is `(2,2)` → overflow = **yin −1**, scored 0). `extraTurn = true`.
`BURST_ATK` (强破): source node 归一; consume source **yang** 1 level (no score); then apply **two independent `−1` passes** to the overcoming target on the **opponent** board, yin-first, **flooring at −1 with no reversal**. `extraTurn = true`.
Gate loosening: BURST is offered whenever the source is 归一 (even if the generation target is `(2,2)`); BURST_ATK likewise for a `(-1,-1)` overcome target. Burst candidates **stop carrying `polarity`** (the target side). `polarity` stays on the type and on AUTO/CONVERT/TRANS/ATK/DISSIPATE/PASS candidates.
Exact truth tables: spec.md "核心规则" sections. Verify every cell against them.

## 1. Source files that encode/consume burst magnitude, target side, or the burst gate

- `src/core/types/domain.ts:57-58` — `ActionType.BURST`/`BURST_ATK`; `:125-133` `ActionPayload` (`polarity?`, `sourceElement?`, `consumePolarity?`).
- `src/core/logic/ActionResolver.ts:243-282` — BURST case (single `+1`, side from `payload.polarity || YANG`). **Core edit.**
- `src/core/logic/ActionResolver.ts:283-323` — BURST_ATK case (single `−1`, side from `payload.polarity || YANG`). **Core edit.**
- `src/core/logic/ActionCandidates.ts:25-33` `getPlusTargetPolarity`, `:40-48` `getMinusTargetPolarity` (still used by TRANS/ATK — do not delete).
- `src/core/logic/ActionCandidates.ts:160-189` — burst block: gate `isNodeGuiYi` + `!options?.isExtraTurn`; the `getPlusTargetPolarity`/`getMinusTargetPolarity` null-checks to **remove**; the `polarity:` field to **drop**.
- `src/core/logic/TurnManager.ts:296` — execute-time extra-turn burst guard (unchanged).
- `src/core/logic/TurnManager.ts:480-508` `isActionMatch` — `polarity` compare is skipped when `action.polarity === undefined`, so dropping the candidate field is safe; still requires `sourceElement` for burst.
- `src/core/ai/ActionEvaluator.ts:170-179` — `burstExtraTurn` + `scoreDeltaPoints` (per-action); board-diff signals at `:77-166` (see §5).
- `src/minigame/action-button-formatter.ts:83-101` — subLabels already `+2`/`-2`; **must stay**. Regression test `tests/core/minigame-action-buttons.test.ts:32-90`.
- `src/minigame/action-semantics.ts:15-31` — `isAttackAction` classifies BURST_ATK as attack (unchanged).
- `src/minigame/views/board-view.ts:725-731` — `resolveActionPath` BURST → generation edge (unchanged).
- `src/minigame/views/action-bar-view.ts:199-205` — `actionKey` includes `polarity`/`consumePolarity` (safe when undefined).
- `src/minigame/game-scene.ts:132-135` — `describeAutoFlow` burst labels.
- `src/minigame/game-scene.ts:455,472` + `:795-808` — `resolveActionTarget` uses `action?.polarity ?? tianGan?.polarity` for the rune flight target side. **Decision point**: with burst no longer carrying `polarity`, this falls back to the drawn stem polarity. Presentation is out of scope per spec, but note the side may no longer be the yin-first side actually applied.
- `tools/TerminalBoardViewer.ts:134,161-175` — formats burst with `action.polarity` (undefined now → check it still renders).
- `tools/ActionValueCensus.ts:278` — comment only.
- `tools/HeadlessMatch.ts:315` — extra-turn burst downgrade guard (unchanged).
- `minigame/game.js` — committed build artifact; regenerate with `npm run build:minigame`, gate `npm run check:artifact`.

## 2. Tests asserting the OLD single-level behaviour / old gate / old payload shape

Correct each against the spec truth table; do not just renumber.

- `tests/core/action-resolver.test.ts:73-110` — BURST single `0→1`, asserts extra turn.
- `tests/core/action-resolver.test.ts:386-413` — BURST consumes requested YANG side (payload carries `polarity: YANG`).
- `tests/core/action-resolver.test.ts:415-441` / `:444-470` — BURST / BURST_ATK reject non-归一 source (gate unchanged, keep).
- `tests/core/action-resolver.test.ts:473-503` — BURST_ATK consumes requested YIN side.
- `tests/core/scoring-behavior-construction.test.ts:174-202` — BURST = 100 + 100 = 200 (single `0→1`).
- `tests/core/scoring-behavior-construction.test.ts:203-235` — BURST_ATK ≥ 80 (single level).
- `tests/core/scoring-attack-buff.test.ts:170-200` — BURST_ATK `0→-1` = 170.
- `tests/core/attack-progress-scale.test.ts:119-135` — BURST_ATK single `-1` = 278.
- `tests/core/scoring-guiyi-and-damage-penalty.test.ts:136-168` — BURST target `(1,0)→(1,1)` = 260.
- `tests/core/scoring-guiyi-and-damage-penalty.test.ts:247-276` — BURST target `(0,0)→(0,1)` = 200.
- `tests/core/convert-gate-boundary-matrix.test.ts:198-243`, `:259-303`, `:329-345`, `:352-380`, `:386-415` — dead-ends resolve to exactly PASS; the `(2,2)`-sheng / `(-1,-1)`-ke cases now also offer BURST/BURST_ATK.
- `tests/core/minigame-boundary-matrix.test.ts:79-116`, `:118-145`, `:225-250`, `:252-287` — same gate assumption.
- `tests/core/action-candidates.test.ts:124-170`, `:350-386`, `:387-421` — assert burst payload shape incl `polarity`; `:437-464`, `:467-494`, `:578-604`, `:724` — single-lit / extra-turn exclusions (keep).
- `tests/core/turn-manager.test.ts:138-165` (extra turn excludes burst), `:167-230` (executes BURST with payload `polarity`), `:357-…`, `:425-…`.
- `tests/core/turn-manager-mutation-guards.test.ts:187-233` (reject/patch `consumePolarity`, missing `sourceElement`), `:318-330`.
- `tests/core/minigame-action-bar-view.test.ts:112-153` — payload incl `polarity: YIN`, FIRE yin `+1`.
- `tests/core/minigame-game-scene.test.ts:146-165` (强化 FIRE yin `1`), `:167-189` (强破 EARTH yin `-1`), `:192-213` (消散 was sole candidate), `:987-1009` (强化 FIRE yin `1→2`), `:388-410`, `:423-440`, `:540-554`, `:584-625` (candidate sets).
- `tests/core/headless-config-injection.test.ts:253-311` — AI picks BURST, wood yin `1→0` source consume.
- `tests/core/injection-path-verification.test.ts:470-475`, `:531`.
- `tests/core/ai-strategy.test.ts:155-180`, `:212-261` — BURST_ATK chosen with payload `polarity`.
- `tests/core/ai-evaluator-benchmark-guardrails.test.ts:82-120`.
- `tests/core/action-value-census.test.ts:48-90`.
- `tests/core/dead-knob-census.test.ts:216-253`, `:555-556`, `:825-840`.
- `tests/core/smart-sudden-death-and-catchup.test.ts:113-141`, `:171-200`.
- `tests/core/tingpai-and-round-advancement.test.ts:163-200`.
- `tests/core/terminal-viewer.test.ts:113-133`.
- `tests/core/minigame-board-view.test.ts:292-310` — `resolveActionPath` BURST edge (keep).
- `tests/core/score-calculator.test.ts:28` — ACTION.BURST points.

## 3. Fixtures / helpers

- `tests/core/helpers/recording-context.ts` — unrelated to burst.
- No dedicated burst fixture: payloads/results are built inline per test.
- `tools/BoardFixture.ts` `gameStateWith(...)` — shared board builder used by several burst tests.

## 4. Docs

- `docs/GDD.md:69-82` §2.3 — `:74` BURST `+1` line, `:75` BURST_ATK `-1` line, `:76` gate sentence. Ticket 01 rewrites `:74` + the `(2,2)` half of `:76`; ticket 02 rewrites `:75` + the `(-1,-1)` half. Use the spec truth tables.
- `docs/GDD.md:84-96` §2.4 — `:89` item 4 "单向极端封死" (ticket 04).
- `docs/LLD.md:45` — `ActionPayload` field contract (ticket 04: burst drops target side; `polarity` kept for AUTO/CONVERT/TRANS/ATK/DISSIPATE/PASS).
- `GLOSSARY.md:113-122` — 强化/强破 one-line definitions, no magnitude.
- `docs/adr/` — `0001`–`0015` exist; next free = **0016** (ticket 04).
- `docs/archive/headless-rule-baseline.md:17-18`, `docs/headless/candidate-search.md`, `docs/archive/experimental-scoring.md` — evidence/report class; do not edit as definition.
- `docs/SRS.md:39-40`, `docs/HLD.md:12`, `README.md:53` — pointers only, no magnitude.

## 5. AI evaluator signals vs a two-level jump (`src/core/ai/ActionEvaluator.ts`)

Per-side / per-element (a two-level jump records each side once; no systematic undercount):
- `:77-81` repairScore (`-1 → >-1`), `:101-105` unityScore (net before/after), `:109-113` 点亮虚空 (`0 → ≥1`), `:117-121` 达成加持 (`prev<2 → ==2`), `:123-124` 达成亢极, `:147-148` 破坏对方归一, `:152-156` 致道损 (`≥0 → -1`).
Per-side, scaled by diff: `:160-166` 普通降级压制 (`diff * suppressNode`) → a two-level drop records 2×.
Per-action (once): `:129-131` guiYiDelta, `:133` nextGuiYiCount, `:136-137` isBoardGuiYuan, `:172-173` burstExtraTurn, `:178-179` scoreDeltaPoints.
Known gap (record, do not fix): net-zero burst on `(2,2)` / `(-1,-1)` leaves every per-side signal flat while `scoreDeltaPoints` sees two transitions.

## 5b. Pre-change balance baseline (measured, not remembered)

Run on worktree `/home/easonlao/projects/guiyuan-game-worktrees/baseline` at the pre-change commit `1b58360`, with the exact `GuardrailBand` 口径 (`new HeadlessBenchmark().run({matches:500, strategyP1: balancedStrategy, strategyP2: balancedStrategy})`, default baseSeed 10000 / maxRounds 30):

| metric | value |
| --- | --- |
| 归元率 guiYuanRate | **0.904** |
| 先手胜率 p1WinRate | **0.504** |
| 后手胜率 p2WinRate | 0.496 |
| 流局率 drawRate | 0.096 |
| 堆增量 heapUsedDeltaMB | **3.46 MB** |
| avgP1Score / avgP2Score | 4901.51 / 4672.29 |
| wall time | 168 ms |

These match the GuardrailBand anchor (90.40% / 50.40%). Ticket 03 compares its post-change numbers against this row. Reproduce with:

```bash
cd /home/easonlao/projects/guiyuan-game-worktrees/baseline
npx tsx -e "import {HeadlessBenchmark} from './tools/HeadlessBenchmark.js'; import {balancedStrategy} from './src/core/ai/Strategy.js'; const m=new HeadlessBenchmark().run({matches:500,strategyP1:balancedStrategy,strategyP2:balancedStrategy}); console.log(m.guiYuanRate,m.p1WinRate,m.heapUsedDeltaMB);"
```

## 5c. Post-change balance snapshot (ticket 02's own report, unverified)

Ticket 02 reported, on its branch after both burst actions became two-level: 500-match balanced self-play → 归元率 **0.902** (in band 0.89–0.95), 先手胜率 **0.544** (out of band 0.47–0.51), heap delta 1.52 MB. Ticket 01 had reported 归元率 99.6% before ticket 02 landed — the BURST_ATK buff is what brought 归元率 back down. Treat these as ticket 02's claims; ticket 03 must measure its own numbers on the merged integration tip and say whether they agree.

Remaining known-red balance tests on the integration tip (ticket 03 owns them): `ai-evaluator-benchmark-guardrails` ×1, `candidate-validation` ×2, `dominance-regression-guard` ×2, `experiment-runner` ×1.

## 6. Environment notes for implementers

- Worktrees live under `/home/easonlao/projects/guiyuan-game-worktrees/<ticket>`. `node_modules` is already installed (`npm ci --prefer-offline`). `tools/node_modules/@guiyuan/game` is a relative symlink to the worktree's own `src`, so tests use the worktree code.
- Integration branch: `burst-plus-two`. Merge its tip into your branch before reporting done.
- Commit messages: Conventional Commits, no `Co-Authored-By`. Gate: `npm run check:quick` (inner loop), `npm run verify` (final).
- Rebuild the artifact with `npm run build:minigame`; `npm run verify` runs `check:artifact` byte-for-byte.
