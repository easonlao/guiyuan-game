import { describe, it, expect, vi } from 'vitest';
import {
  ActionType,
  PlayerId,
  Polarity,
  TIAN_GAN_LIST,
  WuXing,
} from '../../src/core/types/domain.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import { TurnManager, TurnPhase } from '../../src/core/logic/TurnManager.js';
import { EventBus } from '../../src/core/logic/EventBus.js';
import { boardWith, gameStateWith } from '../../tools/BoardFixture.js';

/**
 * TurnManager 生命周期与候选匹配的补充行为断言。
 *
 * 目的：把变异测试基线里属于「活代码」的存活突变体钉死——断言的是公开接缝上
 * 可观察的行为（返回值、状态、阶段、事件），不是内部实现或 message 文案。
 */

/** 固定天干索引的 PRNG 工厂（索引 0..9 对应 TIAN_GAN_LIST） */
const prngFor = (index: number) => ({
  next: () => (index + 0.5) / 10,
  nextInt: () => index,
  getState: () => index,
});

/** 伪造一个运行期无效的玩家标识（falsy 且非 nullish），用于验证 player 守卫 */
const invalidPlayer = '' as unknown as PlayerId;

const fullGuiYuanBoard = boardWith({
  [WuXing.WOOD]: { yin: 1, yang: 1 },
  [WuXing.FIRE]: { yin: 1, yang: 1 },
  [WuXing.EARTH]: { yin: 1, yang: 1 },
  [WuXing.METAL]: { yin: 1, yang: 1 },
  [WuXing.WATER]: { yin: 1, yang: 1 },
});

/** 听牌临界盘：仅 WATER 阳侧未点亮 (0) */
const tingPaiWaterYang = boardWith({
  [WuXing.WOOD]: { yin: 1, yang: 1 },
  [WuXing.FIRE]: { yin: 1, yang: 1 },
  [WuXing.EARTH]: { yin: 1, yang: 1 },
  [WuXing.METAL]: { yin: 1, yang: 1 },
  [WuXing.WATER]: { yin: 1, yang: 0 },
});

/** 低位态盘：P1 木阳为 0，抽甲(木阳) 只产出 AUTO 候选 */
function autoManager() {
  const manager = new TurnManager({ initialState: gameStateWith({}), prng: prngFor(0) });
  const candidates = manager.startTurn();
  return { manager, candidates };
}

/** 中位态盘：P1 木归一，抽甲(木阳) 产出 ATK / BURST / BURST_ATK 候选 */
function atkManager() {
  const manager = new TurnManager({
    initialState: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } } }),
    prng: prngFor(0),
  });
  const candidates = manager.startTurn();
  return { manager, candidates };
}

describe('TurnManager 候选匹配守卫 (isActionMatch)', () => {
  it('接受与候选完全一致的动作', () => {
    const { manager, candidates } = autoManager();
    expect(manager.executeAction(candidates[0]).success).toBe(true);
  });

  it('拒绝 element 与候选不符的动作', () => {
    const { manager } = autoManager();
    const res = manager.executeAction({
      actionType: ActionType.AUTO,
      player: 'P1',
      element: WuXing.FIRE,
      polarity: Polarity.YANG,
    });
    expect(res.success).toBe(false);
  });

  it('拒绝 polarity 与候选不符的动作', () => {
    const { manager } = autoManager();
    const res = manager.executeAction({
      actionType: ActionType.AUTO,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YIN,
    });
    expect(res.success).toBe(false);
  });

  it('拒绝 actionType 与候选不符的动作', () => {
    const { manager } = autoManager();
    const res = manager.executeAction({
      actionType: ActionType.CONVERT,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YANG,
    });
    expect(res.success).toBe(false);
  });

  it('动作省略 element 时由候选补齐并接受', () => {
    const { manager } = autoManager();
    const res = manager.executeAction({
      actionType: ActionType.AUTO,
      player: 'P1',
      element: undefined,
      polarity: Polarity.YANG,
    });
    expect(res.success).toBe(true);
  });

  it('动作省略 player 时按当前行动方处理', () => {
    const { manager } = autoManager();
    const res = manager.executeAction({
      actionType: ActionType.AUTO,
      player: undefined as unknown as PlayerId,
      element: WuXing.WOOD,
      polarity: Polarity.YANG,
    });
    expect(res.success).toBe(true);
  });

  it('拒绝携带无效 falsy player 标识的动作', () => {
    const { manager } = autoManager();
    const res = manager.executeAction({
      actionType: ActionType.AUTO,
      player: invalidPlayer,
      element: WuXing.WOOD,
      polarity: Polarity.YANG,
    });
    expect(res.success).toBe(false);
  });

  it('接受与 ATK 候选完全一致的动作', () => {
    const { manager, candidates } = atkManager();
    const atk = candidates.find((c) => c.actionType === ActionType.ATK)!;
    expect(manager.executeAction(atk).success).toBe(true);
  });

  it('拒绝 sourceElement 与候选不符的动作', () => {
    const { manager } = atkManager();
    const res = manager.executeAction({
      actionType: ActionType.ATK,
      player: 'P1',
      sourceElement: WuXing.FIRE,
      polarity: Polarity.YIN,
    });
    expect(res.success).toBe(false);
  });

  it('拒绝 polarity 与 ATK 候选不符的动作', () => {
    const { manager } = atkManager();
    const res = manager.executeAction({
      actionType: ActionType.ATK,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      polarity: Polarity.YANG,
    });
    expect(res.success).toBe(false);
  });

  it('动作省略 sourceElement 时由候选补齐并接受', () => {
    const { manager } = atkManager();
    const res = manager.executeAction({
      actionType: ActionType.ATK,
      player: 'P1',
      sourceElement: undefined,
      polarity: Polarity.YIN,
    });
    expect(res.success).toBe(true);
  });

  it('动作省略 polarity 时由候选补齐并接受', () => {
    const { manager } = atkManager();
    const res = manager.executeAction({
      actionType: ActionType.ATK,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      polarity: undefined,
    });
    expect(res.success).toBe(true);
  });

  it('拒绝 consumePolarity 与 BURST 候选不符的动作', () => {
    const { manager } = atkManager();
    const res = manager.executeAction({
      actionType: ActionType.BURST,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      consumePolarity: Polarity.YANG,
      polarity: Polarity.YIN,
    });
    expect(res.success).toBe(false);
  });

  it('动作省略 consumePolarity 时由 BURST 候选补齐并接受', () => {
    const { manager } = atkManager();
    const res = manager.executeAction({
      actionType: ActionType.BURST,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      consumePolarity: undefined,
      polarity: Polarity.YIN,
    });
    expect(res.success).toBe(true);
  });

  it('拒绝缺少 sourceElement 的 BURST 动作', () => {
    const { manager } = atkManager();
    const res = manager.executeAction({
      actionType: ActionType.BURST,
      player: 'P1',
      consumePolarity: Polarity.YIN,
      polarity: Polarity.YIN,
    });
    expect(res.success).toBe(false);
  });

  it('拒绝缺少 sourceElement 的 BURST_ATK 动作', () => {
    const { manager } = atkManager();
    const res = manager.executeAction({
      actionType: ActionType.BURST_ATK,
      player: 'P1',
      consumePolarity: Polarity.YANG,
      polarity: Polarity.YIN,
    });
    expect(res.success).toBe(false);
  });
});

describe('TurnManager 构造与终局守卫', () => {
  it('构造后候选为空、天干为 null', () => {
    const manager = new TurnManager();
    expect(manager.getAvailableActions()).toEqual([]);
    expect(manager.getCurrentTianGan()).toBeNull();
  });

  it('沿用初始状态携带的天干', () => {
    const tg = TIAN_GAN_LIST[3];
    const manager = new TurnManager({
      initialState: { ...createInitialGameState(), currentTianGan: tg },
    });
    expect(manager.getCurrentTianGan()).toEqual(tg);
  });

  it('暴露注入的 PRNG 实例', () => {
    const prng = prngFor(0);
    const manager = new TurnManager({ prng });
    expect(manager.getPRNG()).toBe(prng);
  });

  it('终局状态下 startTurn() 清空候选并停在 GAME_OVER', () => {
    const manager = new TurnManager({
      initialState: gameStateWith({ isGameOver: true, winner: 'P1', endReason: 'GUI_YUAN' }),
    });
    expect(manager.startTurn()).toEqual([]);
    expect(manager.getCurrentPhase()).toBe(TurnPhase.GAME_OVER);
    expect(manager.getAvailableActions()).toEqual([]);
  });

  it('终局状态下 executeAction() 返回 extraTurn=false', () => {
    const manager = new TurnManager({
      initialState: gameStateWith({ isGameOver: true, winner: 'P1', endReason: 'GUI_YUAN' }),
    });
    const res = manager.executeAction({
      actionType: ActionType.AUTO,
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YANG,
    });
    expect(res.success).toBe(false);
    expect(res.extraTurn).toBe(false);
    expect(manager.getCurrentPhase()).toBe(TurnPhase.GAME_OVER);
  });

  it('终局状态下 endTurn() 停在 GAME_OVER', () => {
    const manager = new TurnManager({
      initialState: gameStateWith({ isGameOver: true, winner: 'P1', endReason: 'GUI_YUAN' }),
    });
    manager.endTurn();
    expect(manager.getCurrentPhase()).toBe(TurnPhase.GAME_OVER);
  });
});

describe('TurnManager executeAction 失败路径', () => {
  it('非动作阶段调用 executeAction 被拒且无副作用', () => {
    const manager = new TurnManager({ prng: prngFor(0) });
    const candidates = manager.startTurn();
    manager.endTurn();
    const res = manager.executeAction(candidates[0]);
    expect(res.success).toBe(false);
    expect(res.extraTurn).toBe(false);
    expect(manager.getCurrentPhase()).toBe(TurnPhase.START_TURN);
    expect(manager.getState().currentPlayer).toBe('P1');
  });

  it('非当前行动方的动作被拒且 extraTurn=false', () => {
    const manager = new TurnManager({ prng: prngFor(0) });
    manager.startTurn();
    const res = manager.executeAction({
      actionType: ActionType.AUTO,
      player: 'P2',
      element: WuXing.WOOD,
      polarity: Polarity.YANG,
    });
    expect(res.success).toBe(false);
    expect(res.extraTurn).toBe(false);
  });

  it('连动额外行动中二次爆发被拒且 extraTurn=false', () => {
    const manager = new TurnManager({
      initialState: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } } }),
      prng: prngFor(0),
    });
    const burst = manager.startTurn().find((c) => c.actionType === ActionType.BURST)!;
    expect(manager.executeAction(burst).success).toBe(true);
    expect(manager.isExtraTurnActive()).toBe(true);

    manager.startTurn(); // 连动回合候选已过滤 BURST
    const res = manager.executeAction({
      actionType: ActionType.BURST,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      consumePolarity: Polarity.YIN,
      polarity: Polarity.YIN,
    });
    expect(res.success).toBe(false);
    expect(res.extraTurn).toBe(false);
  });

  it('不在候选列表中的动作被拒且 extraTurn=false', () => {
    const manager = new TurnManager({ prng: prngFor(0) });
    manager.startTurn();
    const res = manager.executeAction({
      actionType: ActionType.ATK,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      polarity: Polarity.YIN,
    });
    expect(res.success).toBe(false);
    expect(res.extraTurn).toBe(false);
  });

  it('常规动作不会激活连动额外行动', () => {
    const manager = new TurnManager({ prng: prngFor(0) });
    const candidates = manager.startTurn();
    const res = manager.executeAction(candidates[0]);
    expect(res.success).toBe(true);
    expect(manager.isExtraTurnActive()).toBe(false);
  });

  it('终结对局的动作不会留下激活的连动', () => {
    const manager = new TurnManager({
      initialState: gameStateWith({
        P1: {
          [WuXing.WOOD]: { yin: 1, yang: 1 },
          [WuXing.FIRE]: { yin: 1, yang: 1 },
          [WuXing.EARTH]: { yin: 1, yang: 1 },
          [WuXing.METAL]: { yin: 1, yang: 1 },
          [WuXing.WATER]: { yin: 1, yang: 0 },
        },
      }),
      prng: prngFor(8), // 壬水 (WATER, YANG) -> AUTO 补全归元
    });
    const auto = manager.startTurn().find((c) => c.actionType === ActionType.AUTO)!;
    const res = manager.executeAction(auto);
    expect(res.success).toBe(true);
    expect(manager.getState().isGameOver).toBe(true);
    expect(manager.isExtraTurnActive()).toBe(false);
  });
});

describe('TurnManager step / executeTurn 终局与阶段守卫', () => {
  it('终局状态下 step() 返回非成功、无连动、原状态', () => {
    const manager = new TurnManager({
      initialState: gameStateWith({ isGameOver: true, winner: 'P1', endReason: 'GUI_YUAN' }),
    });
    const res = manager.step();
    expect(res.success).toBe(false);
    expect(res.extraTurn).toBe(false);
    expect(res.nextState).toBe(manager.getState());
    expect(manager.getCurrentPhase()).toBe(TurnPhase.GAME_OVER);
  });

  it('终局状态下 executeTurn() 返回非成功、无连动、原状态', () => {
    const manager = new TurnManager({
      initialState: gameStateWith({ isGameOver: true, winner: 'P1', endReason: 'GUI_YUAN' }),
    });
    const res = manager.executeTurn((_s, _t, actions) => actions[0]);
    expect(res.success).toBe(false);
    expect(res.extraTurn).toBe(false);
    expect(res.nextState).toBe(manager.getState());
    expect(manager.getCurrentPhase()).toBe(TurnPhase.GAME_OVER);
  });

  it('已处于 EXECUTE_ACTION 时 step() 不重复抽取天干', () => {
    const bus = new EventBus();
    const draws = vi.fn();
    bus.on('tiangan:draw', draws);
    const manager = new TurnManager({ eventBus: bus, prng: prngFor(0) });
    manager.startTurn();
    expect(draws).toHaveBeenCalledTimes(1);
    manager.step();
    expect(draws).toHaveBeenCalledTimes(1);
  });

  it('已处于 EXECUTE_ACTION 时 executeTurn() 不重复抽取天干', () => {
    const bus = new EventBus();
    const draws = vi.fn();
    bus.on('tiangan:draw', draws);
    const manager = new TurnManager({ eventBus: bus, prng: prngFor(0) });
    manager.startTurn();
    manager.executeTurn((_s, _t, actions) => actions[0]);
    expect(draws).toHaveBeenCalledTimes(1);
  });

  it('上一回合已结束时 executeTurn() 会开启新回合并执行', () => {
    const manager = new TurnManager({ prng: prngFor(0) });
    const candidates = manager.startTurn();
    manager.executeAction(candidates[0]); // 半回合交接，phase = END_TURN
    expect(manager.getCurrentPhase()).toBe(TurnPhase.END_TURN);

    const res = manager.executeTurn((_s, _t, actions) => actions[0]);
    expect(res.success).toBe(true);
    expect(manager.getState().currentPlayer).toBe('P1');
  });

  it('step() 完成终轮天命揭牌时不报告连动', () => {
    const manager = new TurnManager({
      initialState: gameStateWith({
        round: 8,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        P1: fullGuiYuanBoard,
        P2: tingPaiWaterYang,
      }),
      prng: prngFor(8),
    });
    const res = manager.step();
    expect(res.success).toBe(true);
    expect(res.extraTurn).toBe(false);
    expect(manager.getState().isGameOver).toBe(true);
  });

  it('executeTurn() 完成终轮天命揭牌时不报告连动', () => {
    const manager = new TurnManager({
      initialState: gameStateWith({
        round: 8,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        P1: fullGuiYuanBoard,
        P2: tingPaiWaterYang,
      }),
      prng: prngFor(2), // 丙火 -> 未命中 -> P1 胜
    });
    const res = manager.executeTurn((_s, _t, actions) => actions[0]);
    expect(res.success).toBe(true);
    expect(res.extraTurn).toBe(false);
    expect(manager.getState().isGameOver).toBe(true);
  });
});

describe('TurnManager 终轮天命揭牌路径', () => {
  it('P1 的回合不会触发后手揭牌', () => {
    const manager = new TurnManager({
      initialState: gameStateWith({
        currentPlayer: 'P1',
        lockedGuiYuan: { P1: true, P2: false },
        P1: fullGuiYuanBoard,
      }),
      prng: prngFor(0),
    });
    const actions = manager.startTurn();
    expect(manager.getState().isGameOver).toBe(false);
    expect(manager.getCurrentPhase()).toBe(TurnPhase.EXECUTE_ACTION);
    expect(actions.length).toBeGreaterThan(0);
  });

  it('揭牌命中时派发生命周期事件并判定 P2 获胜', () => {
    const bus = new EventBus();
    const turnStart = vi.fn();
    const tianganDraw = vi.fn();
    const turnEnd = vi.fn();
    const nodeChanged = vi.fn();
    bus.on('turn:start', turnStart);
    bus.on('tiangan:draw', tianganDraw);
    bus.on('turn:end', turnEnd);
    bus.on('node:stateChanged', nodeChanged);

    const manager = new TurnManager({
      initialState: gameStateWith({
        round: 5,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        P1: fullGuiYuanBoard,
        P2: tingPaiWaterYang,
      }),
      eventBus: bus,
      prng: prngFor(8), // 壬水命中
    });

    expect(manager.startTurn()).toEqual([]);

    expect(turnStart).toHaveBeenCalledWith({ round: 5, player: 'P2', isExtraTurn: false });
    expect(tianganDraw).toHaveBeenCalledWith({ tianGan: TIAN_GAN_LIST[8] });
    expect(turnEnd).toHaveBeenCalledWith({ round: 5, player: 'P2' });
    expect(nodeChanged).toHaveBeenCalled();

    expect(manager.isExtraTurnActive()).toBe(false);
    expect(manager.getState().lockedGuiYuan).toEqual({ P1: true, P2: true });
    expect(manager.getState().winner).toBe('P2');
  });

  it('揭牌未命中时保持 P1 单方锁定并判定 P1 获胜', () => {
    const bus = new EventBus();
    const turnEnd = vi.fn();
    bus.on('turn:end', turnEnd);

    const manager = new TurnManager({
      initialState: gameStateWith({
        round: 6,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        P1: fullGuiYuanBoard,
        P2: tingPaiWaterYang,
      }),
      eventBus: bus,
      prng: prngFor(2), // 丙火未命中
    });

    manager.startTurn();

    expect(manager.getState().winner).toBe('P1');
    expect(manager.getState().lockedGuiYuan).toEqual({ P1: true, P2: false });
    expect(manager.isExtraTurnActive()).toBe(false);
    expect(turnEnd).toHaveBeenCalledWith({ round: 6, player: 'P2' });
  });
});
