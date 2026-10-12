/**
 * burst-plus-two ticket 03 —— AI 估值器与双级爆发的对账（真实行为断言）
 *
 * 权威：`.scratch/burst-plus-two/spec.md`「AI 估值器要对账，但不重调口径」。
 * 接缝：`ActionEvaluator.evaluate(...)` 的 `breakdown`——本文件全部用真实调用取证，不读代码下结论。
 *
 * 估值器读的是**动作前后的盘面差分**（`src/core/ai/ActionEvaluator.ts`），不是解析器内部那两次
 * `±1`。所以「一次跳跃两级」在估值器里表现为三类：
 *
 *   - 形状类（逐侧 / 逐节点判定，跳两级也只记**一次**）：`repairScore`、达成归一、点亮虚空、
 *     达成加持、达成亢极、破坏对方归一、致道损；
 *   - 差分类（随级数缩放）：普通降级压制 `suppressNode`，两级就是 **2×**；
 *   - 每动作类（每动作记一次）：`burstExtraTurn`，以及 `scoreDeltaPoints`——它读计分器
 *     两次转移**之和**，不做任何缩放。
 *
 * 断言手法：把除被测信号外的权重全部清零（`signalOnly`），`breakdown` 的对应字段就直接等于
 * 「该信号命中几次」，于是「只记一次」写成 `toBe(1)`、「按级缩放」写成 `toBe(2)`，不必从一串
 * 加权和里反推。加权口径（`DEFAULT_STRATEGY_WEIGHTS`，AI 真正用的那组）另有断言，按信号逐项
 * 列成公式——公式里每个信号只出现一次，若估值器重复计数等式即不成立。
 *
 * 已知差异（**记录，不修**，见 spec「Out of Scope：AI 估值器的估值口径重做」）：净零爆发
 * （目标 `(2,2)` / `(-1,-1)`）在差分模型下目标侧没有任何变化，所有逐侧信号恒为 0，而计分器
 * 因两次转移仍给出分数。最后一节把实际观察到的 breakdown 原样钉住。
 */
import { describe, expect, it } from 'vitest';
import { ActionEvaluator, DEFAULT_STRATEGY_WEIGHTS } from '../../src/core/ai/ActionEvaluator.js';
import type { StrategyWeights } from '../../src/core/ai/types.js';
import { ActionType, Polarity, TIAN_GAN_LIST, WuXing } from '../../src/core/types/index.js';
import { gameStateWith } from '../../tools/BoardFixture.js';

const evaluator = new ActionEvaluator();
/** 甲木（阳）。爆发的作用侧由解析器逐次决定，与抽到的天干极性无关，这里只用于凑齐调用签名。 */
const jiaWoodYang = TIAN_GAN_LIST[0];
const W = DEFAULT_STRATEGY_WEIGHTS;

/** 全零权重：让 breakdown 的每一项只由显式打开的那个信号贡献。 */
const SIGNAL_OFF: StrategyWeights = {
  repairDamage: 0,
  reachGuiYi: 0,
  lightVoid: 0,
  reachKangJi: 0,
  guiyuanProgress: 0,
  breakOpponentGuiYi: 0,
  causeDamage: 0,
  suppressNode: 0,
  burstExtraTurn: 0,
  scoreDeltaWeight: 0,
  winReward: 0,
  baseActionBias: {},
};

/**
 * 只打开一个信号：字段值 = 该信号命中次数 × weight。
 * `reachKangJi` 的「达成加持」与「达成亢极」各占半权重，故传 2 → 每命中一次记 1。
 */
function signalOnly(overrides: Partial<StrategyWeights>): StrategyWeights {
  return { ...SIGNAL_OFF, ...overrides };
}

/** 强化：源节点木归一，消耗阴侧，两次 `+1` 都落在相生节点火（己方盘面）。 */
const burst = {
  actionType: ActionType.BURST,
  player: 'P1' as const,
  sourceElement: WuXing.WOOD,
  consumePolarity: Polarity.YIN,
};

/** 强破：源节点木归一，消耗阳侧，两次 `-1` 都落在相克节点土（对手盘面）。 */
const burstAtk = {
  actionType: ActionType.BURST_ATK,
  player: 'P1' as const,
  sourceElement: WuXing.WOOD,
  consumePolarity: Polarity.YANG,
};

describe('burst-plus-two 03：形状类信号——一次跳跃两级只记一次', () => {
  it('repairScore：目标 (-1,-1) 一跳到 (1,-1)，道损修复只记一次（不是 2）', () => {
    // 阴侧走 -1 → 0 → 1 两次内部转移，估值器只看差分 -1 → 1。
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 1 }, [WuXing.FIRE]: { yin: -1, yang: -1 } },
    });

    const probed = evaluator.evaluate(state, jiaWoodYang, burst, signalOnly({ repairDamage: 1 }));
    expect(probed.breakdown.repairScore).toBe(1);
    // 阳侧停在 -1 没被修，因此这一条也不是「逐侧各记一次」的误读。
    expect(probed.breakdown.unityScore).toBe(0);

    // 加权口径：一次命中 = 一个 repairDamage，不是两个。
    const weighted = evaluator.evaluate(state, jiaWoodYang, burst);
    expect(weighted.breakdown.repairScore).toBe(W.repairDamage);
  });

  it('达成归一：目标 (0,1) 一跳到 (2,1)，归一里程碑只记一次', () => {
    // 源节点取 (2,1)：消耗阴侧后仍是 (1,1)，不产生「失去归一」的干扰项。
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 2, yang: 1 }, [WuXing.FIRE]: { yin: 0, yang: 1 } },
    });

    const probed = evaluator.evaluate(state, jiaWoodYang, burst, signalOnly({ reachGuiYi: 1 }));
    expect(probed.breakdown.unityScore).toBe(1);

    // 加权口径逐项展开：达成归一 1 次、点亮虚空 1 次、达成加持 1 次（阴侧 0 → 2 一次跳两级）、
    // 归一节点 1 → 2 的里程碑，以及稳态项 nextGuiYiCount × guiyuanProgress × 0.2。
    const weighted = evaluator.evaluate(state, jiaWoodYang, burst);
    expect(weighted.breakdown.unityScore).toBe(
      W.reachGuiYi +
        W.lightVoid +
        W.reachKangJi * 0.5 +
        W.guiyuanProgress +
        2 * W.guiyuanProgress * 0.2,
    );
  });

  it('点亮虚空：目标 (0,0) 一跳到 (2,0)，只记一次（不是两级两次）', () => {
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 1 }, [WuXing.FIRE]: { yin: 0, yang: 0 } },
    });

    // 阴侧 0 → 2：按级缩放这里会是 2。
    expect(
      evaluator.evaluate(state, jiaWoodYang, burst, signalOnly({ lightVoid: 1 })).breakdown
        .unityScore,
    ).toBe(1);
  });

  it('达成加持：目标 (0,0) 一跳到 (2,0)，1→2 半档只记一次', () => {
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 1 }, [WuXing.FIRE]: { yin: 0, yang: 0 } },
    });

    // 阴侧 0 → 2 一次跨过 1→2；`reachKangJi: 2` 下每命中一次记 1。
    expect(
      evaluator.evaluate(state, jiaWoodYang, burst, signalOnly({ reachKangJi: 2 })).breakdown
        .unityScore,
    ).toBe(1);
  });

  it('点亮虚空 + 达成加持：目标 (0,0) 一跳到 (2,0) 的加权口径只含各一项', () => {
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 1 }, [WuXing.FIRE]: { yin: 0, yang: 0 } },
    });

    // 源节点木 (1,1) 被消耗掉归一：-0.5 × reachGuiYi。
    const weighted = evaluator.evaluate(state, jiaWoodYang, burst);
    expect(weighted.breakdown.unityScore).toBe(
      -(W.reachGuiYi * 0.5) + W.lightVoid + W.reachKangJi * 0.5,
    );
    expect(weighted.breakdown.repairScore).toBe(0);
    expect(weighted.breakdown.suppressionScore).toBe(0);
  });

  it('达成亢极：目标 (1,1) 一跳到 (2,2)，两侧加持 + 亢极各记一次', () => {
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 1 }, [WuXing.FIRE]: { yin: 1, yang: 1 } },
    });

    // 3 = 阴侧加持 1 + 阳侧加持 1 + 节点达成亢极 1；按级或按侧重复计数都会偏离 3。
    expect(
      evaluator.evaluate(state, jiaWoodYang, burst, signalOnly({ reachKangJi: 2 })).breakdown
        .unityScore,
    ).toBe(3);
  });

  it('破坏对方归一 + 致道损：对手 (1,1) 两跳压到 (-1,1)，破归一一次、致道损一次', () => {
    // 源节点取 (1,2)：消耗阳侧后仍是 (1,1)，己方盘面不产生干扰项。
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 2 } },
      P2: { [WuXing.EARTH]: { yin: 1, yang: 1 } },
    });

    // 阴侧 1 → 0 → -1：破归一（节点级）与致道损（侧级）各一次，都不是两级两次。
    expect(
      evaluator.evaluate(state, jiaWoodYang, burstAtk, signalOnly({ breakOpponentGuiYi: 1 }))
        .breakdown.suppressionScore,
    ).toBe(1);
    expect(
      evaluator.evaluate(state, jiaWoodYang, burstAtk, signalOnly({ causeDamage: 1 })).breakdown
        .suppressionScore,
    ).toBe(1);

    // 加权口径：破归一 + 致道损 + 压制两级（差分类，见下一节）。
    const weighted = evaluator.evaluate(state, jiaWoodYang, burstAtk);
    expect(weighted.breakdown.suppressionScore).toBe(
      W.breakOpponentGuiYi + W.causeDamage + 2 * W.suppressNode,
    );
  });
});

describe('burst-plus-two 03：差分类信号——随级数缩放', () => {
  it('suppressNode：对手 (2,1) 两跳压到 (0,1)，记 2×', () => {
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
      P2: { [WuXing.EARTH]: { yin: 2, yang: 1 } },
    });

    // 阴侧 2 → 1 → 0：diff = 2，故 suppressNode 记两次。
    expect(
      evaluator.evaluate(state, jiaWoodYang, burstAtk, signalOnly({ suppressNode: 1 })).breakdown
        .suppressionScore,
    ).toBe(2);
    // 同一次动作里破归一是形状类，仍然只记一次——两者在同一字段里并存。
    expect(
      evaluator.evaluate(state, jiaWoodYang, burstAtk, signalOnly({ breakOpponentGuiYi: 1 }))
        .breakdown.suppressionScore,
    ).toBe(1);
    // 阴侧 2 → 0 没到道损，致道损不记。
    expect(
      evaluator.evaluate(state, jiaWoodYang, burstAtk, signalOnly({ causeDamage: 1 })).breakdown
        .suppressionScore,
    ).toBe(0);

    const weighted = evaluator.evaluate(state, jiaWoodYang, burstAtk);
    expect(weighted.breakdown.suppressionScore).toBe(W.breakOpponentGuiYi + 2 * W.suppressNode);
  });

  it('压制两级但停在道损前：差分类仍记 2×，形状类致道损记 0', () => {
    // 与上一例同形，但目标从亢极 (2,2) 起压：阴优先 (2,2) → (1,2) → (0,2)，
    // 证明 2× 来自级数本身，而不是「压到了 -1」才触发。
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
      P2: { [WuXing.EARTH]: { yin: 2, yang: 2 } },
    });

    expect(
      evaluator.evaluate(state, jiaWoodYang, burstAtk, signalOnly({ suppressNode: 1 })).breakdown
        .suppressionScore,
    ).toBe(2);
    expect(
      evaluator.evaluate(state, jiaWoodYang, burstAtk, signalOnly({ causeDamage: 1 })).breakdown
        .suppressionScore,
    ).toBe(0);
  });
});

describe('burst-plus-two 03：每动作信号', () => {
  it('burstExtraTurn：爆发与强破各记一次，非爆发动作不记', () => {
    const active = gameStateWith({ P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } } });
    const withTarget = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 1 }, [WuXing.FIRE]: { yin: 0, yang: 0 } },
    });
    const withOpponentTarget = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
      P2: { [WuXing.EARTH]: { yin: 1, yang: 1 } },
    });
    const auto = {
      actionType: ActionType.AUTO,
      player: 'P1' as const,
      element: WuXing.WOOD,
      polarity: Polarity.YIN,
    };

    const one = signalOnly({ burstExtraTurn: 1 });
    expect(evaluator.evaluate(withTarget, jiaWoodYang, burst, one).breakdown.burstScore).toBe(1);
    expect(
      evaluator.evaluate(withOpponentTarget, jiaWoodYang, burstAtk, one).breakdown.burstScore,
    ).toBe(1);
    expect(evaluator.evaluate(active, jiaWoodYang, auto, one).breakdown.burstScore).toBe(0);

    // 加权口径 = 一次 burstExtraTurn。
    expect(evaluator.evaluate(withTarget, jiaWoodYang, burst).breakdown.burstScore).toBe(
      W.burstExtraTurn,
    );
  });

  it('scoreDeltaPoints：读计分器两次转移之和，不缩放也不截断', () => {
    // 强化 (0,1) → (2,1)：行为分 100 + 0→1 点亮 100 + 1→2 加持 200 + 归一里程碑 60 = 460。
    const strengthen = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 2, yang: 1 }, [WuXing.FIRE]: { yin: 0, yang: 1 } },
    });
    expect(
      evaluator.evaluate(strengthen, jiaWoodYang, burst, signalOnly({ scoreDeltaWeight: 1 }))
        .breakdown.scoreDeltaPoints,
    ).toBe(460);

    // 强破 (2,1) → (0,1)：行为分 80 + round(200 × 0.48) + round(150 × 0.48) = 248。
    // 0.48 = 攻击进度定价 floor 0.3 + span 0.9 × (对手 1 个归一节点 / 5)，两次转移各算一次。
    const attack = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
      P2: { [WuXing.EARTH]: { yin: 2, yang: 1 } },
    });
    expect(
      evaluator.evaluate(attack, jiaWoodYang, burstAtk, signalOnly({ scoreDeltaWeight: 1 }))
        .breakdown.scoreDeltaPoints,
    ).toBe(248);
  });

  it('满溢则亏格 (2,1) → (1,2)：估值器与计分器看到同一个「只有一次加持」', () => {
    // 第一级补阳到 (2,2)，第二级因满溢扣阴回 1。差分只剩阳侧 1 → 2 的加持一次；
    // 计分器那边溢出那级也返回 0 分，两侧口径在这格上一致。
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 1 }, [WuXing.FIRE]: { yin: 2, yang: 1 } },
    });

    expect(
      evaluator.evaluate(state, jiaWoodYang, burst, signalOnly({ reachKangJi: 2 })).breakdown
        .unityScore,
    ).toBe(1);
    // 行为分 100 + 加持 200 + 溢出 0 = 300，没有第三次转移被漏记。
    expect(
      evaluator.evaluate(state, jiaWoodYang, burst, signalOnly({ scoreDeltaWeight: 1 })).breakdown
        .scoreDeltaPoints,
    ).toBe(300);
  });
});

describe('burst-plus-two 03：已知差异——净零爆发在差分模型下不可见（记录，不修）', () => {
  /**
   * 断言的是「估值器看不到盘面变化」这件事本身，而不是「这样合理」。
   * 修它属于估值口径重做（spec 明确划到平衡阶段），本票只负责把它钉住、不让它悄悄漂移。
   */
  const perSideSignals = [
    { name: 'repairDamage', probe: { repairDamage: 1 } },
    { name: 'reachGuiYi', probe: { reachGuiYi: 1 } },
    { name: 'lightVoid', probe: { lightVoid: 1 } },
    { name: 'reachKangJi', probe: { reachKangJi: 2 } },
    { name: 'breakOpponentGuiYi', probe: { breakOpponentGuiYi: 1 } },
    { name: 'causeDamage', probe: { causeDamage: 1 } },
    { name: 'suppressNode', probe: { suppressNode: 1 } },
  ] as const;

  it('强化目标 (2,2)：逐侧信号全为 0，但 scoreDeltaPoints 仍记两次转移 300', () => {
    // 源节点 (2,1) 消耗阴侧后仍是 (1,1)，把「源节点被消耗」的干扰项也排除掉。
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 2, yang: 1 }, [WuXing.FIRE]: { yin: 2, yang: 2 } },
    });

    const hits: Record<string, number> = {};
    for (const { name, probe } of perSideSignals) {
      const score = evaluator.evaluate(state, jiaWoodYang, burst, signalOnly(probe));
      hits[name] =
        score.breakdown.repairScore + score.breakdown.unityScore + score.breakdown.suppressionScore;
    }
    expect(hits).toEqual({
      repairDamage: 0,
      reachGuiYi: 0,
      lightVoid: 0,
      reachKangJi: 0,
      breakOpponentGuiYi: 0,
      causeDamage: 0,
      suppressNode: 0,
    });

    // 实际观察到的 breakdown：唯一的非零盘面项是稳态项 nextGuiYiCount(2) × 0.2 × guiyuanProgress。
    const weighted = evaluator.evaluate(state, jiaWoodYang, burst);
    expect(weighted.breakdown).toEqual({
      repairScore: 0,
      unityScore: 2 * W.guiyuanProgress * 0.2,
      suppressionScore: 0,
      burstScore: W.burstExtraTurn,
      scoreDeltaPoints: 300,
      biasScore: 0,
      totalScore: 2 * W.guiyuanProgress * 0.2 + W.burstExtraTurn + 300,
    });
  });

  it('强破目标 (-1,-1)：逐侧信号全为 0，但 scoreDeltaPoints 仍记动作分 80', () => {
    // 源节点 (1,2) 消耗阳侧后仍是 (1,1)；对手目标已是道损底，两次 -1 都在解析器里被挡下。
    const state = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 2 } },
      P2: { [WuXing.EARTH]: { yin: -1, yang: -1 } },
    });

    const hits: Record<string, number> = {};
    for (const { name, probe } of perSideSignals) {
      const score = evaluator.evaluate(state, jiaWoodYang, burstAtk, signalOnly(probe));
      hits[name] =
        score.breakdown.repairScore + score.breakdown.unityScore + score.breakdown.suppressionScore;
    }
    expect(hits).toEqual({
      repairDamage: 0,
      reachGuiYi: 0,
      lightVoid: 0,
      reachKangJi: 0,
      breakOpponentGuiYi: 0,
      causeDamage: 0,
      suppressNode: 0,
    });

    const weighted = evaluator.evaluate(state, jiaWoodYang, burstAtk);
    expect(weighted.breakdown).toEqual({
      repairScore: 0,
      unityScore: 1 * W.guiyuanProgress * 0.2,
      suppressionScore: 0,
      burstScore: W.burstExtraTurn,
      scoreDeltaPoints: 80,
      biasScore: 0,
      totalScore: 1 * W.guiyuanProgress * 0.2 + W.burstExtraTurn + 80,
    });
  });
});
