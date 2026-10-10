import { describe, it, expect } from 'vitest';
import {
  ActionType,
  BoardState,
  GameState,
  Polarity,
  WuXing
} from '../../src/core/types/domain.js';
import { ActionResolver } from '../../src/core/logic/ActionResolver.js';
import {
  POINTS_CONFIG,
  ScoreCalculator,
  type PointsConfig
} from '../../src/core/logic/ScoreCalculator.js';
import { gameStateWith } from '../../src/core/headless/BoardFixture.js';
import {
  atkTempoGain,
  countActionsToGuiYuan
} from '../../src/core/headless/Metrics.js';
import {
  measureAtkSequence,
  runAtkMarginalReturn
} from '../../src/core/headless/AtkMarginalReturn.js';

/** 全零计分配置：用于证明盘面边际收益口径与计分无关 */
const ZERO_POINTS_CONFIG: PointsConfig = {
  ACTION: {
    AUTO: 0,
    CONVERT: 0,
    TRANS: 0,
    ATK: 0,
    BURST: 0,
    BURST_ATK: 0,
    DISSIPATE: 0,
    PASS: 0
  },
  STATE_CHANGE: {
    REPAIR_DMG: { yang: 0, yin: 0 },
    LIGHT_UP: 0,
    BLESSING: 0,
    CAUSE_DMG: { yang: 0, yin: 0 },
    BREAK_LIGHT: { yang: 0, yin: 0 },
    WEAKEN: 0
  },
  RARITY_MULTIPLIER: 0,
  NO_RARITY_ACTIONS: [],
  GUI_YI_MILESTONE: 0,
  DAMAGE_PENALTY: 0
};

const defaultResolver = new ActionResolver();
const zeroScoreResolver = new ActionResolver(new ScoreCalculator(ZERO_POINTS_CONFIG));

/**
 * 在受控盘面上执行一次【破】。
 * sourceElement 决定被克目标：木克土、土克水、水克火、火克金、金克木。
 */
function resolveAtk(
  state: GameState,
  sourceElement: WuXing,
  polarity: Polarity,
  resolver: ActionResolver = defaultResolver
) {
  return resolver.resolve(state, {
    actionType: ActionType.ATK,
    player: 'P1',
    sourceElement,
    polarity
  });
}

function opponentBoard(state: GameState): BoardState {
  return state.players.P2.board;
}

describe('【破】盘面边际收益口径 (atkTempoGain)', () => {
  it('虚空 0 -> 道损 -1：对手还差行动数 +1（本票核心假设）', () => {
    const state = gameStateWith({ P2: { [WuXing.WATER]: { yin: 0 } } });
    const before = opponentBoard(state);
    const result = resolveAtk(state, WuXing.EARTH, Polarity.YIN);

    expect(atkTempoGain(before, opponentBoard(result.nextState))).toBe(1);
    expect(countActionsToGuiYuan(opponentBoard(result.nextState))).toBe(
      countActionsToGuiYuan(before) + 1
    );
  });

  it('点亮 1 -> 虚空 0：对手还差行动数 +1', () => {
    const state = gameStateWith({ P2: { [WuXing.WATER]: { yin: 1 } } });
    const before = opponentBoard(state);
    const result = resolveAtk(state, WuXing.EARTH, Polarity.YIN);

    expect(atkTempoGain(before, opponentBoard(result.nextState))).toBe(1);
  });

  it('加持 2 -> 点亮 1：对手还差行动数不变（边际收益为 0，封顶前的“吸收”拐点）', () => {
    const state = gameStateWith({ P2: { [WuXing.WATER]: { yin: 2 } } });
    const before = opponentBoard(state);
    const result = resolveAtk(state, WuXing.EARTH, Polarity.YIN);

    expect(atkTempoGain(before, opponentBoard(result.nextState))).toBe(0);
  });

  it('已道损 -1：盘面不再变化，边际收益为 0（封顶）', () => {
    const state = gameStateWith({
      P2: { [WuXing.WATER]: { yin: -1, yang: -1 } }
    });
    const before = opponentBoard(state);
    // 强制结算：等级被 clampNodeLevel 限制在 -1，不产生任何盘面变化。
    const result = resolveAtk(state, WuXing.EARTH, Polarity.YIN);

    expect(opponentBoard(result.nextState)).toEqual(before);
    expect(atkTempoGain(before, opponentBoard(result.nextState))).toBe(0);
  });

  it('口径与计分剥离：计分配置全零时盘面边际收益逐字节不变', () => {
    const state = gameStateWith({
      P2: {
        [WuXing.WATER]: { yin: 0 },
        [WuXing.WOOD]: { yin: 1 },
        [WuXing.FIRE]: { yin: 2 }
      }
    });
    const before = opponentBoard(state);

    const scored = resolveAtk(state, WuXing.EARTH, Polarity.YIN, defaultResolver);
    const stripped = resolveAtk(state, WuXing.EARTH, Polarity.YIN, zeroScoreResolver);

    // 计分确实被改动（证明计分轴并非静默无效）……
    expect(stripped.scoreDelta).not.toBe(scored.scoreDelta);
    // ……但盘面变化与盘面边际收益完全一致。
    expect(opponentBoard(stripped.nextState)).toEqual(opponentBoard(scored.nextState));
    expect(atkTempoGain(before, opponentBoard(stripped.nextState))).toBe(
      atkTempoGain(before, opponentBoard(scored.nextState))
    );
  });

  it('默认计分下的盘面边际收益与全零计分一致（口径不读取 POINTS_CONFIG）', () => {
    const state = gameStateWith({ P2: { [WuXing.WATER]: { yin: 0 } } });
    const before = opponentBoard(state);

    const scored = resolveAtk(state, WuXing.EARTH, Polarity.YIN, defaultResolver);
    const stripped = resolveAtk(state, WuXing.EARTH, Polarity.YIN, zeroScoreResolver);

    expect(POINTS_CONFIG.ACTION.ATK).toBeGreaterThan(0);
    expect(atkTempoGain(before, opponentBoard(scored.nextState))).toBe(
      atkTempoGain(before, opponentBoard(stripped.nextState))
    );
  });
});

describe('【破】连续序列的不变量（不是复述报告数字）', () => {
  it('全道损盘面已无合法【破】：0 次命中且封顶', () => {
    const sequence = measureAtkSequence({
      [WuXing.WOOD]: { yin: -1, yang: -1 },
      [WuXing.FIRE]: { yin: -1, yang: -1 },
      [WuXing.EARTH]: { yin: -1, yang: -1 },
      [WuXing.METAL]: { yin: -1, yang: -1 },
      [WuXing.WATER]: { yin: -1, yang: -1 }
    });

    expect(sequence.steps).toHaveLength(0);
    expect(sequence.capped).toBe(true);
    expect(sequence.totalGain).toBe(0);
  });

  it('每次合法命中只产生 0 或 +1 的盘面收益，且累计收益等于终点减起点', () => {
    const report = runAtkMarginalReturn();
    for (const phase of report.phases) {
      const seq = phase.sequence;
      let running = 0;
      for (const step of seq.steps) {
        expect([0, 1]).toContain(step.gain);
        running += step.gain;
        expect(step.cumulativeGain).toBe(running);
      }
      expect(seq.totalGain).toBe(running);
      expect(seq.finalActionsToGuiYuan).toBe(seq.initialActionsToGuiYuan + seq.totalGain);
    }
  });

  it('封顶条件是全盘道损：序列终止时对手每一侧都是 -1', () => {
    const report = runAtkMarginalReturn();
    for (const phase of report.phases) {
      if (!phase.sequence.capped) continue;
      expect(phase.sequence.finalActionsToGuiYuan).toBe(20);
    }
  });
});
