/**
 * 强破 (BURST_ATK) 双级作用真值表 —— burst-plus-two ticket 02
 *
 * 权威：规则见 `docs/GDD.md` §2.3，取值真源 `src/core/logic/ScoreCalculator.ts`（本表按动作分 80、攻击进度系数 0.66 取基准），决策见 ADR 0016。
 * 接缝：`ActionResolver.resolve`（只断言结算后的盘面、`scoreDelta`、`extraTurn` 与引用相等）。
 *
 * 规则：源节点消耗阳侧 1 级（不计分）；对手相克目标连做两次 `-1`，
 * 每次重新读盘面按阴优先选侧；两侧均到道损 -1 即止，**不反转、不溢出**。
 * 两次转移的攻击状态分都按**行动前**对手盘面归一进度（2 个归一节点 → 0.66）缩放。
 */
import { describe, it, expect } from 'vitest';
import { ActionResolver } from '../../src/core/logic/ActionResolver.js';
import { ActionType, NodeLevel, Polarity, WuXing } from '../../src/core/types/index.js';
import { gameStateWith } from '../../tools/BoardFixture.js';

/** 强破的动作基础分（`POINTS_CONFIG.ACTION.BURST_ATK`），不属于状态分 */
const BURST_ATK_ACTION_POINTS = 80;

/** 节点状态记法 (阴, 阳)，与表现层「左阴右阳」一致 */
type Side = readonly [yin: NodeLevel, yang: NodeLevel];

interface BurstAtkCell {
  /** 对手相克目标 EARTH 强破前的 (阴, 阳) */
  readonly before: Side;
  /** 强破后的 (阴, 阳) */
  readonly after: Side;
  /** 两次攻击转移的状态分（不含行为分），已按 0.66 缩放 */
  readonly statePoints: number;
}

/** spec 的 16 格强破真值表，逐字抄录 */
const TRUTH_TABLE: readonly BurstAtkCell[] = [
  { before: [-1, -1], after: [-1, -1], statePoints: 0 },
  { before: [-1, 0], after: [-1, -1], statePoints: 198 },
  { before: [-1, 1], after: [-1, -1], statePoints: 330 },
  { before: [-1, 2], after: [-1, 0], statePoints: 264 },
  { before: [0, -1], after: [-1, -1], statePoints: 165 },
  { before: [0, 0], after: [-1, -1], statePoints: 363 },
  { before: [0, 1], after: [-1, 0], statePoints: 297 },
  { before: [0, 2], after: [-1, 1], statePoints: 297 },
  { before: [1, -1], after: [-1, -1], statePoints: 264 },
  { before: [1, 0], after: [-1, 0], statePoints: 264 },
  { before: [1, 1], after: [-1, 1], statePoints: 264 },
  { before: [1, 2], after: [-1, 2], statePoints: 264 },
  { before: [2, -1], after: [0, -1], statePoints: 231 },
  { before: [2, 0], after: [0, 0], statePoints: 231 },
  { before: [2, 1], after: [0, 1], statePoints: 231 },
  { before: [2, 2], after: [0, 2], statePoints: 231 },
];

/** 目标是否达成归一（阴阳双侧均 >= 1） */
const isGuiYi = ([yin, yang]: Side) => yin >= 1 && yang >= 1;

describe('强破 (BURST_ATK) 双级作用真值表', () => {
  const resolver = new ActionResolver();

  // 源节点 WOOD 归一 (1, 1)，强破消耗其阳侧；相克目标是 P2 的 EARTH
  const burstAtkPayload = {
    actionType: ActionType.BURST_ATK,
    player: 'P1' as const,
    sourceElement: WuXing.WOOD,
    consumePolarity: Polarity.YANG,
  };

  // 对手归一数恒为 2：目标自身归一占 1 时补 METAL 一个，否则补 METAL + WATER 两个
  const buildState = (target: Side) =>
    gameStateWith({
      P1: {
        [WuXing.WOOD]: { yin: 1, yang: 1 },
      },
      P2: {
        [WuXing.EARTH]: { yin: target[0], yang: target[1] },
        [WuXing.METAL]: { yin: 1, yang: 1 },
        ...(isGuiYi(target) ? {} : { [WuXing.WATER]: { yin: 1, yang: 1 } }),
      },
    });

  for (const cell of TRUTH_TABLE) {
    const [beforeYin, beforeYang] = cell.before;
    const [afterYin, afterYang] = cell.after;
    const label = `(${beforeYin}, ${beforeYang}) → (${afterYin}, ${afterYang})`;

    it(`${label}：状态分 ${cell.statePoints} + 行为分 ${BURST_ATK_ACTION_POINTS}`, () => {
      const state = buildState(cell.before);

      const result = resolver.resolve(state, burstAtkPayload);

      expect(result.success).toBe(true);
      expect(result.extraTurn).toBe(true);

      // 对手相克目标落位
      expect(result.nextState.players.P2.board[WuXing.EARTH]).toEqual({
        yin: afterYin,
        yang: afterYang,
      });

      // 源节点阳侧照旧 -1、阴侧不变（消耗不计状态分，失去归一也不扣分）
      expect(result.nextState.players.P1.board[WuXing.WOOD]).toEqual({ yin: 1, yang: 0 });

      // 分数 = 行为分 + 两次转移的状态分（对手盘面归一节点在行动前恒为 2 → ×0.66）
      expect(result.scoreDelta).toBe(BURST_ATK_ACTION_POINTS + cell.statePoints);

      // 盘面不可变性：未改动节点保持引用相等，原状态不被修改
      expect(result.nextState.players.P2.board[WuXing.METAL]).toBe(
        state.players.P2.board[WuXing.METAL],
      );
      expect(result.nextState.players.P1.board[WuXing.FIRE]).toBe(
        state.players.P1.board[WuXing.FIRE],
      );
      expect(state.players.P2.board[WuXing.EARTH]).toEqual({
        yin: beforeYin,
        yang: beforeYang,
      });
    });
  }

  it('见底即止，不反转：目标 (0, -1) 第一级扣阴到 -1，第二级因阳侧已见底而停止', () => {
    const state = buildState([0, -1]);

    const result = resolver.resolve(state, burstAtkPayload);

    expect(result.nextState.players.P2.board[WuXing.EARTH]).toEqual({ yin: -1, yang: -1 });
    // 0→-1 阴（250 × 0.66 = 165）；阳侧本已是 -1，第二次无级可扣
    expect(result.scoreDelta).toBe(BURST_ATK_ACTION_POINTS + 165);
  });

  it('阴侧扣到底后转扣阳侧，而不是反转回涨：目标 (0, 0) → (-1, -1)', () => {
    const state = buildState([0, 0]);

    const result = resolver.resolve(state, burstAtkPayload);

    expect(result.nextState.players.P2.board[WuXing.EARTH]).toEqual({ yin: -1, yang: -1 });
    // 0→-1 阴（165）+ 0→-1 阳（198）
    expect(result.scoreDelta).toBe(BURST_ATK_ACTION_POINTS + 165 + 198);
  });

  it('双侧见底 (-1, -1)：净零强破仍然换到连动，且只有行为分 80', () => {
    const state = buildState([-1, -1]);

    const result = resolver.resolve(state, burstAtkPayload);

    expect(result.nextState.players.P2.board[WuXing.EARTH]).toEqual({ yin: -1, yang: -1 });
    expect(result.extraTurn).toBe(true);
    expect(result.scoreDelta).toBe(BURST_ATK_ACTION_POINTS);
  });

  it('作用侧由解析器逐次决定，载荷里的 polarity 不再影响结果', () => {
    const state = buildState([0, 0]);

    const result = resolver.resolve(state, { ...burstAtkPayload, polarity: Polarity.YIN });

    // 阴优先：两级分别扣阴、再扣阳，而不是载荷预钉的阴侧单级
    expect(result.nextState.players.P2.board[WuXing.EARTH]).toEqual({ yin: -1, yang: -1 });
  });

  it('两次转移都按行动前对手盘面缩放：第一级不改变第二级的缩放系数', () => {
    const state = buildState([1, 1]);

    const result = resolver.resolve(state, burstAtkPayload);

    // 1→0 阴（150 × 0.66 = 99）+ 0→-1 阴（250 × 0.66 = 165）；若第二次改按行动后盘面（1 个归一 → 0.48）则为 120
    expect(result.scoreDelta).toBe(BURST_ATK_ACTION_POINTS + 99 + 165);
  });
});
