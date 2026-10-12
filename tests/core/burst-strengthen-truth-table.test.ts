/**
 * 强化 (BURST) 双级作用真值表 —— burst-plus-two ticket 01
 *
 * 权威：`.scratch/burst-plus-two/spec.md`「核心规则：强化真值表（全部 16 种目标状态，已用真实计分器验算）」。
 * 接缝：`ActionResolver.resolve`（只断言结算后的盘面、`scoreDelta`、`extraTurn` 与引用相等）。
 *
 * 规则：源节点消耗阴侧 1 级（不计分）；相生目标连做两次 `+1`，
 * 每次重新读盘面按阴优先选侧；目标为亢极 (2, 2) 时该次改为阴侧 -1（满溢则亏，计 0 分）。
 */
import { describe, it, expect } from 'vitest';
import { ActionResolver } from '../../src/core/logic/ActionResolver.js';
import { ActionType, NodeLevel, Polarity, WuXing } from '../../src/core/types/index.js';
import { gameStateWith } from '../../tools/BoardFixture.js';

/** 强化的动作基础分（`POINTS_CONFIG.ACTION.BURST`），不属于状态分 */
const BURST_ACTION_POINTS = 100;

/** 节点状态记法 (阴, 阳)，与表现层「左阴右阳」一致 */
type Side = readonly [yin: NodeLevel, yang: NodeLevel];

interface BurstCell {
  /** 相生目标 FIRE 强化前的 (阴, 阳) */
  readonly before: Side;
  /** 强化后的 (阴, 阳) */
  readonly after: Side;
  /** 两次转移的状态分（不含行为分与归一里程碑） */
  readonly statePoints: number;
  /** 归一里程碑增量分（源节点失去归一不计负分） */
  readonly milestonePoints: number;
}

/** spec 的 16 格强化真值表，逐字抄录 */
const TRUTH_TABLE: readonly BurstCell[] = [
  { before: [-1, -1], after: [1, -1], statePoints: 300, milestonePoints: 0 },
  { before: [-1, 0], after: [1, 0], statePoints: 300, milestonePoints: 0 },
  { before: [-1, 1], after: [1, 1], statePoints: 300, milestonePoints: 60 },
  { before: [-1, 2], after: [1, 2], statePoints: 300, milestonePoints: 60 },
  { before: [0, -1], after: [2, -1], statePoints: 300, milestonePoints: 0 },
  { before: [0, 0], after: [2, 0], statePoints: 300, milestonePoints: 0 },
  { before: [0, 1], after: [2, 1], statePoints: 300, milestonePoints: 60 },
  { before: [0, 2], after: [2, 2], statePoints: 300, milestonePoints: 60 },
  { before: [1, -1], after: [2, 0], statePoints: 400, milestonePoints: 0 },
  { before: [1, 0], after: [2, 1], statePoints: 300, milestonePoints: 60 },
  { before: [1, 1], after: [2, 2], statePoints: 400, milestonePoints: 0 },
  { before: [1, 2], after: [1, 2], statePoints: 200, milestonePoints: 0 },
  { before: [2, -1], after: [2, 1], statePoints: 300, milestonePoints: 60 },
  { before: [2, 0], after: [2, 2], statePoints: 300, milestonePoints: 60 },
  { before: [2, 1], after: [1, 2], statePoints: 200, milestonePoints: 0 },
  { before: [2, 2], after: [2, 2], statePoints: 200, milestonePoints: 0 },
];

describe('强化 (BURST) 双级作用真值表', () => {
  const resolver = new ActionResolver();

  // 源节点 WOOD 归一 (1, 1)，强化消耗其阴侧；相生目标是 FIRE
  const burstPayload = {
    actionType: ActionType.BURST,
    player: 'P1' as const,
    sourceElement: WuXing.WOOD,
    consumePolarity: Polarity.YIN,
  };

  const buildState = (target: Side) =>
    gameStateWith({
      P1: {
        [WuXing.WOOD]: { yin: 1, yang: 1 },
        [WuXing.FIRE]: { yin: target[0], yang: target[1] },
      },
    });

  for (const cell of TRUTH_TABLE) {
    const [beforeYin, beforeYang] = cell.before;
    const [afterYin, afterYang] = cell.after;
    const label = `(${beforeYin}, ${beforeYang}) → (${afterYin}, ${afterYang})`;

    it(`${label}：状态分 ${cell.statePoints} + 里程碑 ${cell.milestonePoints} + 行为分 ${BURST_ACTION_POINTS}`, () => {
      const state = buildState(cell.before);

      const result = resolver.resolve(state, burstPayload);

      expect(result.success).toBe(true);
      expect(result.extraTurn).toBe(true);

      // 相生目标落位
      expect(result.nextState.players.P1.board[WuXing.FIRE]).toEqual({
        yin: afterYin,
        yang: afterYang,
      });

      // 源节点阴侧照旧 -1、阳侧不变（消耗不计状态分，失去归一也不扣分）
      expect(result.nextState.players.P1.board[WuXing.WOOD]).toEqual({ yin: 0, yang: 1 });

      // 分数 = 行为分 + 两次转移的状态分 + 归一里程碑
      expect(result.scoreDelta).toBe(BURST_ACTION_POINTS + cell.statePoints + cell.milestonePoints);

      // 盘面不可变性：未改动节点保持引用相等，原状态不被修改
      expect(result.nextState.players.P1.board[WuXing.WATER]).toBe(
        state.players.P1.board[WuXing.WATER],
      );
      expect(result.nextState.players.P2.board).toBe(state.players.P2.board);
      expect(state.players.P1.board[WuXing.FIRE]).toEqual({
        yin: beforeYin,
        yang: beforeYang,
      });
    });
  }

  it('满溢则亏扣阴侧：目标 (2, 1) 先补阳到 (2, 2)，第二次溢出把阴侧扣回 1', () => {
    const state = buildState([2, 1]);

    const result = resolver.resolve(state, burstPayload);

    expect(result.nextState.players.P1.board[WuXing.FIRE]).toEqual({ yin: 1, yang: 2 });
    // 溢出那级计 0 分：只有第一次 1→2 的加持分 200 进入状态分
    expect(result.scoreDelta).toBe(BURST_ACTION_POINTS + 200);
  });

  it('净零爆发 (2, 2) 仍然换到连动，且只按一次加持计状态分', () => {
    const state = buildState([2, 2]);

    const result = resolver.resolve(state, burstPayload);

    expect(result.nextState.players.P1.board[WuXing.FIRE]).toEqual({ yin: 2, yang: 2 });
    expect(result.extraTurn).toBe(true);
    expect(result.scoreDelta).toBe(BURST_ACTION_POINTS + 200);
  });

  it('作用侧由解析器逐次决定，载荷里的 polarity 不再影响结果', () => {
    const state = buildState([0, 0]);

    const result = resolver.resolve(state, { ...burstPayload, polarity: Polarity.YANG });

    // 阴优先：两级都落在阴侧，而不是载荷预钉的阳侧
    expect(result.nextState.players.P1.board[WuXing.FIRE]).toEqual({ yin: 2, yang: 0 });
  });
});
