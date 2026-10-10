import { describe, it, expect } from 'vitest';
import { ActionPayload, ActionType, Polarity, WuXing } from '../../src/core/types/domain.js';
import {
  POINTS_CONFIG,
  ScoreCalculator,
  type PointsConfig
} from '../../src/core/logic/ScoreCalculator.js';
import { ActionResolver } from '../../src/core/logic/ActionResolver.js';
import { gameStateWith } from '../../src/core/headless/BoardFixture.js';
import type { BoardOverrides } from '../../src/core/headless/BoardFixture.js';

/**
 * Ticket 05 候选 A：攻击进度定价（`ATTACK_PROGRESS_SCALE`）。
 *
 * 口径（search-advice.md）：攻击状态分（CAUSE_DMG / BREAK_LIGHT / WEAKEN）乘以
 *   factor = floor + span × (行动前对手盘面归一节点数 / 5)，四舍五入取整。
 * 行为分 `ACTION.ATK` / `ACTION.BURST_ATK`、里程碑、己方建设分**不缩放**。
 * 未配置该字段时为恒等，生产行为逐字节不变。
 *
 * 断言写在 `ActionResolver.resolve(...).scoreDelta` 与 `ScoreCalculator` 输出上，
 * 不触碰内部数据结构。
 */

const SCALE = { floor: 0.3, span: 0.9 } as const;
const SCALED_CONFIG: PointsConfig = { ...POINTS_CONFIG, ATTACK_PROGRESS_SCALE: SCALE };

const ATK_YANG: ActionPayload = {
  actionType: ActionType.ATK,
  player: 'P1',
  sourceElement: WuXing.WOOD,
  polarity: Polarity.YANG
};
const ATK_YIN: ActionPayload = {
  actionType: ActionType.ATK,
  player: 'P1',
  sourceElement: WuXing.WOOD,
  polarity: Polarity.YIN
};
const CONVERT_YIN: ActionPayload = {
  actionType: ActionType.CONVERT,
  player: 'P1',
  element: WuXing.WOOD,
  polarity: Polarity.YIN
};

const GUI_YI = { yin: 1 as const, yang: 1 as const };

function opponentWithGuiYi(count: 0 | 2 | 4 | 5): BoardOverrides {
  const nodes: BoardOverrides = {};
  const guiYiElements = [WuXing.WOOD, WuXing.FIRE, WuXing.METAL, WuXing.WATER];
  for (const element of guiYiElements.slice(0, count)) {
    nodes[element] = GUI_YI;
  }
  if (count === 5) {
    // 目标节点自身也归一：阳侧 1、阴侧 2，可被【破】由 2 -> 1（WEAKEN = 200）
    nodes[WuXing.EARTH] = { yin: 2, yang: 1 };
  }
  return nodes;
}

function resolveAtk(config: PointsConfig, opponentGuiYi: 0 | 2 | 4 | 5, payload: ActionPayload = ATK_YANG) {
  const resolver = new ActionResolver(new ScoreCalculator(config));
  const state = gameStateWith({ P1: {}, P2: opponentWithGuiYi(opponentGuiYi), currentPlayer: 'P1' });
  return resolver.resolve(state, payload);
}

describe('Ticket 05 候选 A - 攻击进度定价 (ATTACK_PROGRESS_SCALE)', () => {
  it('未配置 ATTACK_PROGRESS_SCALE 时为恒等：攻击状态分与生产逐字节一致', () => {
    const production = new ScoreCalculator(POINTS_CONFIG);
    const withoutField = new ScoreCalculator({ ...POINTS_CONFIG });

    expect(production.config.ATTACK_PROGRESS_SCALE).toBeUndefined();
    expect(production.attackProgressScale(0)).toBe(1);
    expect(production.attackProgressScale(5)).toBe(1);

    // 生产：0 -> -1 阳侧致道损 = 300；行为分 ATK = 40；总计 340。
    const baseline = resolveAtk(POINTS_CONFIG, 2);
    const explicit = resolveAtk({ ...POINTS_CONFIG }, 2);
    expect(baseline.scoreDelta).toBe(340);
    expect(explicit.scoreDelta).toBe(baseline.scoreDelta);
    expect(withoutField.calculateTransitionPoints(0, -1, Polarity.YANG, true)).toBe(300);
  });

  it('对手 0 个归一节点：攻击状态分 ×0.3', () => {
    expect(new ScoreCalculator(SCALED_CONFIG).attackProgressScale(0)).toBeCloseTo(0.3, 10);
    // round(300 × 0.3) = 90；行为分不缩放：40 + 90 = 130
    expect(resolveAtk(SCALED_CONFIG, 0).scoreDelta).toBe(130);
  });

  it('对手 2 个归一节点：攻击状态分 ×0.66', () => {
    // round(300 × 0.66) = 198；40 + 198 = 238
    expect(resolveAtk(SCALED_CONFIG, 2).scoreDelta).toBe(238);
  });

  it('对手 4 个归一节点：攻击状态分 ×1.02', () => {
    // round(300 × 1.02) = 306；40 + 306 = 346
    expect(resolveAtk(SCALED_CONFIG, 4).scoreDelta).toBe(346);
  });

  it('对手 5 个归一节点：攻击状态分 ×1.2（2 -> 1 削弱加持 = 200）', () => {
    expect(new ScoreCalculator(SCALED_CONFIG).attackProgressScale(5)).toBeCloseTo(1.2, 10);
    // round(200 × 1.2) = 240；行为分不缩放：40 + 240 = 280
    expect(resolveAtk(SCALED_CONFIG, 5, ATK_YIN).scoreDelta).toBe(280);
  });

  it('强破 (BURST_ATK) 的攻击状态分同样按对手归一进度缩放', () => {
    const resolver = new ActionResolver(new ScoreCalculator(SCALED_CONFIG));
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: GUI_YI },
      P2: opponentWithGuiYi(2),
      currentPlayer: 'P1'
    });
    const result = resolver.resolve(state, {
      actionType: ActionType.BURST_ATK,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      consumePolarity: Polarity.YANG,
      polarity: Polarity.YANG
    });
    // 行为分 BURST_ATK = 80；攻击状态分 round(300 × 0.66) = 198；总计 278
    expect(result.scoreDelta).toBe(278);
  });

  it('非攻击动作的 scoreDelta 不缩放', () => {
    const scaled = new ActionResolver(new ScoreCalculator(SCALED_CONFIG));
    const production = new ActionResolver(new ScoreCalculator(POINTS_CONFIG));
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 0, yang: 1 } },
      currentPlayer: 'P1'
    });
    const a = scaled.resolve(state, CONVERT_YIN);
    const b = production.resolve(state, CONVERT_YIN);
    // CONVERT 行为分 50 + LIGHT_UP 100 + 达成归一里程碑 60 = 210；两条路径一致
    expect(a.scoreDelta).toBe(210);
    expect(a.scoreDelta).toBe(b.scoreDelta);
  });
});
