import { describe, it, expect } from 'vitest';
import {
  ActionType,
  TIAN_GAN_LIST,
  WuXing
} from '../../src/core/types/domain.js';
import { ActionResolver } from '../../src/core/logic/ActionResolver.js';
import {
  ScoreCalculator,
  type PointsConfig
} from '../../src/core/logic/ScoreCalculator.js';
import { gameStateWith } from '../../src/core/headless/BoardFixture.js';
import { atkTempoGain } from '../../src/core/headless/Metrics.js';
import {
  evaluateActionValues,
  runActionValueCensus,
  type ActionValue
} from '../../src/core/headless/ActionValueCensus.js';

/** 全零计分配置：证明价值函数可注入 PointsConfig，且 scoreDeltaPoints 归零。 */
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

function tianGanNamed(name: string) {
  const found = TIAN_GAN_LIST.find(gan => gan.name === name);
  if (!found) throw new Error(`未知天干: ${name}`);
  return found;
}

function byType(observations: readonly ActionValue[], actionType: ActionType): ActionValue {
  const found = observations.find(observation => observation.actionType === actionType);
  if (!found) throw new Error(`盘面上没有可用动作: ${actionType}`);
  return found;
}

describe('动作价值普查：盘面动作价值排序', () => {
  it('在构造盘面上给出可用动作的价值排序（不是胜率）', () => {
    // 甲（木阳）天干：己方木节点归一 (1,1)，对手土节点虚空 (0,0)。
    // 可用动作：破(ATK) / 强化(BURST) / 强破(BURST_ATK)。
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
      P2: { [WuXing.EARTH]: { yin: 0, yang: 0 } },
      currentPlayer: 'P1'
    });
    const observations = evaluateActionValues(state, tianGanNamed('甲'));

    expect(observations.map(o => o.actionType).sort()).toEqual(
      [ActionType.ATK, ActionType.BURST, ActionType.BURST_ATK].sort()
    );

    const ranked = [...observations].sort((a, b) => b.value - a.value);
    expect(ranked[0].actionType).toBe(ActionType.BURST_ATK);
    expect(ranked[0].value).toBeGreaterThan(ranked[1].value);

    // 价值 = 盘面分量 + 规则得分分量；两者都可见。
    for (const observation of observations) {
      expect(observation.boardScore + observation.scoreDeltaPoints).toBeCloseTo(
        observation.value,
        9
      );
    }
    expect(byType(observations, ActionType.ATK).scoreDeltaPoints).toBeGreaterThan(0);
  });

  it('报出盘面内被支配动作（严格低于同盘面另一可用动作）', () => {
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
      P2: { [WuXing.EARTH]: { yin: 0, yang: 0 } },
      currentPlayer: 'P1'
    });
    const observations = evaluateActionValues(state, tianGanNamed('甲'));

    const atk = byType(observations, ActionType.ATK);
    const burstAtk = byType(observations, ActionType.BURST_ATK);

    // 已知被支配情形：强破（消耗归一换连动）严格优于破（本盘面）。
    expect(burstAtk.value).toBeGreaterThan(atk.value);
    expect(atk.isDominated).toBe(true);
    expect(atk.isOptimal).toBe(false);
    expect(burstAtk.isDominated).toBe(false);
    expect(burstAtk.isOptimal).toBe(true);
  });

  it('并列最优不算支配（epsilon 内的浮点并列）', () => {
    // 单一可用动作：没有更优动作，故并列最优、不被支配。
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 0, yang: 0 } },
      P2: {},
      currentPlayer: 'P1'
    });
    const observations = evaluateActionValues(state, tianGanNamed('甲'));

    expect(observations).toHaveLength(1);
    expect(observations[0].actionType).toBe(ActionType.AUTO);
    expect(observations[0].isOptimal).toBe(true);
    expect(observations[0].isDominated).toBe(false);
  });
});

describe('动作价值普查：盘面覆盖', () => {
  const report = runActionValueCensus();

  it('覆盖三个阶段：低位态期 / 中盘 / 残局', () => {
    const phaseKeys = new Set(report.boards.map(board => board.phaseKey));
    expect(phaseKeys).toContain('low-state');
    expect(phaseKeys).toContain('midgame');
    expect(phaseKeys).toContain('endgame');
  });

  it('覆盖两个阶跃条件：目标侧为加持 / 对手全道损，以及 plain 对照', () => {
    const conditionKeys = new Set(report.boards.map(board => board.stepConditionKey));
    expect(conditionKeys).toContain('plain');
    expect(conditionKeys).toContain('target-blessed');
    expect(conditionKeys).toContain('opponent-all-damaged');
  });

  it('每个被测盘面都遍历全部 10 个天干（5 元素 × 2 极性）', () => {
    expect(TIAN_GAN_LIST).toHaveLength(10);
    const tianGansPerBoard = new Map<string, Set<string>>();
    for (const observation of report.observations) {
      const set = tianGansPerBoard.get(observation.boardKey) ?? new Set<string>();
      set.add(observation.tianGan);
      tianGansPerBoard.set(observation.boardKey, set);
    }
    for (const board of report.boards) {
      // 每个天干至少有一个可用动作（AUTO / PASS / DISSIPATE 兜底），故必然被观测到。
      expect(tianGansPerBoard.get(board.key)?.size).toBe(10);
    }
  });

  it('报告列出全部动作类型，并指出哪些在所有被测状态下都被支配', () => {
    expect(report.actions.map(action => action.actionType).sort()).toEqual(
      Object.values(ActionType).sort()
    );
    expect(report.valueFunction.name).toContain('ActionEvaluator');
    expect(report.valueFunction.inputs.length).toBeGreaterThan(0);
    // 被支配动作列表与逐动作结论一致。
    for (const action of report.actions) {
      expect(report.globallyDominated.includes(action.actionType)).toBe(
        action.globallyDominated
      );
    }
  });
});

describe('口径锁：压制 = 等级下降量（measureBoardDiff.suppressionLevels）', () => {
  it('加持 2 -> 点亮 1 记 1 次压制（旧「未点亮侧数」口径会记 0）', () => {
    // 戊（土阳）破水：对手水节点阴侧加持 (2,2) -> 被破到 (1,2)。
    const state = gameStateWith({
      P1: { [WuXing.EARTH]: { yin: 1, yang: 1 } },
      P2: { [WuXing.WATER]: { yin: 2, yang: 2 } },
      currentPlayer: 'P1'
    });
    const observations = evaluateActionValues(state, tianGanNamed('戊'));
    const atk = byType(observations, ActionType.ATK);

    // 普查读的是等级下降量：2 -> 1 记 1。
    expect(atk.suppressionLevels).toBe(1);

    // 旧口径（atkTempoGain，基于未点亮侧数）把 2 -> 1 记 0 —— 证明两者结论相反。
    const before = state.players.P2.board;
    const after = new ActionResolver(new ScoreCalculator()).resolve(state, atk.action)
      .nextState.players.P2.board;
    expect(atkTempoGain(before, after)).toBe(0);
    expect(atk.suppressionLevels).not.toBe(atkTempoGain(before, after));
  });
});

describe('动作价值普查：可注入计分配置与规则开关', () => {
  it('注入全零 PointsConfig 时，规则得分分量全部归零、价值等于盘面分量', () => {
    const report = runActionValueCensus({ pointsConfig: ZERO_POINTS_CONFIG });

    expect(report.observations.length).toBeGreaterThan(0);
    for (const observation of report.observations) {
      expect(observation.scoreDeltaPoints).toBe(0);
      expect(observation.value).toBeCloseTo(observation.boardScore, 9);
    }
  });

  it('开启 board-only 规则开关时，规则得分分量全部归零', () => {
    const report = runActionValueCensus({ rules: { isBoardOnly: true } });

    expect(report.observations.length).toBeGreaterThan(0);
    for (const observation of report.observations) {
      expect(observation.scoreDeltaPoints).toBe(0);
    }
  });
});

describe('动作价值普查：确定性', () => {
  it('同一选项两次运行产出深度相等的报告', () => {
    expect(runActionValueCensus()).toEqual(runActionValueCensus());
  });
});
