import { describe, it, expect } from 'vitest';
import { GameScene, describeAutoFlow } from '../../src/minigame/game-scene.js';
import { LEVEL_LABEL } from '../../src/minigame/views/action-result-view.js';
import {
  CANDIDATE_BREATH_PERIOD,
  PREVIEW_BREATH_SPEED,
} from '../../src/minigame/views/board-view.js';
import { InputManager } from '../../src/minigame/scene/input-manager.js';
import { Button } from '../../src/minigame/scene/button.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import { createPRNG, PRNG } from '../../src/core/utils/prng.js';
import { ActionType, GameState, Polarity, WuXing } from '../../src/core/types/domain.js';
import { boardWith, gameStateWith } from '../../tools/BoardFixture.js';
import { RecordingContext } from './helpers/recording-context.js';

/** 动画时长统一压到 0.1 秒，测试用模拟时钟快速跑完。 */
const FAST_TIMING = {
  width: 375,
  height: 667,
  safeTop: 24,
  safeBottom: 10,
  autoExecuteDelay: 0.1,
  aiThinkDelay: 0.1,
  entranceDuration: 0.1,
  flightDuration: 0.1,
  impactDuration: 0.1,
  resultHold: 0.04,
} as const;

/** 按给定天干索引依次抽取的 PRNG：`drawTianGan` 只读 `nextInt(0, 9)`。 */
function scriptedPrng(indices: readonly number[]): PRNG {
  let cursor = 0;
  return {
    next: () => 0,
    nextInt: () => indices[Math.min(cursor++, indices.length - 1)],
    getState: () => 0,
  };
}

/** 推进模拟时钟 `seconds` 秒（默认 60fps 步长）。 */
function advance(scene: GameScene, seconds: number, dt = 1 / 60): void {
  const steps = Math.max(1, Math.ceil(seconds / dt));
  for (let index = 0; index < steps; index += 1) {
    scene.update(dt);
  }
}

/** 逐步推进模拟时钟，直到 `predicate` 成立（超过 `maxSeconds` 仍未成立则停手，交给调用方断言）。 */
function advanceUntil(
  scene: GameScene,
  predicate: () => boolean,
  maxSeconds = 5,
  dt = 1 / 60,
): void {
  const steps = Math.ceil(maxSeconds / dt);
  for (let index = 0; index < steps; index += 1) {
    if (predicate()) {
      return;
    }
    scene.update(dt);
  }
}

/** 场景里按钮的屏幕坐标（场景层级无缩放，逐级累加偏移即可）。 */
function buttonScreenPosition(button: Button): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let node = button.parent; node !== null; node = node.parent) {
    x += node.x;
    y += node.y;
  }
  return { x: x + button.x, y: y + button.y };
}

/** 模拟一次真实触摸：命中检测 -> 按钮 -> `TurnManager.executeAction`。 */
function tapButton(input: InputManager, button: Button): void {
  const point = buttonScreenPosition(button);
  input.handleTouchStart(point.x, point.y);
  input.handleTouchEnd(point.x, point.y);
}

/** 单候选自动流转的播报副文案（对齐旧命令式实现的文案，ADR 0008）。 */
describe('GameScene：ADR 0008 唯一候选自动流转的播报文案', () => {
  it('八种动作类型各自的自动流转播报文案保持不变', () => {
    expect(describeAutoFlow(ActionType.AUTO)).toBe('自动吸纳中');
    expect(describeAutoFlow(ActionType.DISSIPATE)).toBe('亢极满溢·散气回落中');
    expect(describeAutoFlow(ActionType.PASS)).toBe('道法受阻·消散过牌中');
    expect(describeAutoFlow(ActionType.ATK)).toBe('唯一机缘·破');
    expect(describeAutoFlow(ActionType.TRANS)).toBe('唯一机缘·化');
    expect(describeAutoFlow(ActionType.CONVERT)).toBe('势在必行·调息');
    expect(describeAutoFlow(ActionType.BURST)).toBe('势在必行·强化');
    expect(describeAutoFlow(ActionType.BURST_ATK)).toBe('势在必行·强破');
  });
});

/**
 * 唯一候选自动流转的场景级逐类覆盖（GDD §2.4 / ADR 0008）。
 *
 * 上一条用例只钉住纯文案映射；这里把「非低位 / 非极位」的唯一候选真的推过 `GameScene`：
 * 无按钮、无输入，缓冲结束后动作真的落到盘面上。
 * 强化门槛放开后，强破总是与强化同时出现（源节点归一时强化必在候选集内），
 * 因此【强破】不再有唯一候选路径，这里改为验证它与【强化】并列渲染、点按后照旧结算。
 */
describe('GameScene：唯一候选自动流转（场景级逐类覆盖）', () => {
  /** 推进到唯一候选的缓冲期，断言此刻只有这一个候选且不渲染任何按钮。 */
  function expectSingleAutoFlow(
    scene: GameScene,
    expected: ActionType,
    expectedSubText: string,
  ): GameState {
    advanceUntil(scene, () => scene.phase === 'auto-pending');
    expect(scene.turnManager.getAvailableActions().map((action) => action.actionType)).toEqual([
      expected,
    ]);
    expect(scene.phase).toBe('auto-pending');
    // ADR 0008：唯一候选不渲染交互按钮——面板整体隐藏且不可交互。
    // （连动回合的面板里可能还留着上一回合的按钮，它们已随 `action:executed` 置灰。）
    expect(scene.actionBar.visible).toBe(false);
    expect(scene.actionBar.interactive).toBe(false);
    expect(scene.actionBar.getButtons().every((button) => button.disabled)).toBe(true);
    expect(scene.characters.bannerSubText).toContain(scene.turnManager.getCurrentTianGan()!.name);
    expect(scene.characters.bannerSubText).toContain(
      expectedSubText.includes('调息') ? '调息' : expectedSubText.includes('化') ? '化' : '消散',
    );
    return scene.turnManager.getState();
  }

  /** 缓冲结束后动作真的被提交：状态换新并进入符文飞行动效。 */
  function expectAutoExecuted(scene: GameScene, before: GameState): void {
    advanceUntil(scene, () => scene.turnManager.getState() !== before);
    expect(scene.turnManager.getState()).not.toBe(before);
    expect(scene.phase).toBe('flying');
  }

  it('仅剩唯一【调息】：无按钮自动流转，对侧从虚空抬到点亮', () => {
    // 甲木（木·阳）已点亮、对侧虚空 -> 可调息；P2 土双道损 -> 【破】被封死。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 0, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: -1, yang: -1 } },
      }),
      prng: scriptedPrng([0]),
    });
    scene.start();

    const before = expectSingleAutoFlow(scene, ActionType.CONVERT, '势在必行·调息');
    expectAutoExecuted(scene, before);

    // 调息把木阴侧从虚空抬到点亮 (0 -> 1)。
    expect(scene.turnManager.getState().players.P1.board[WuXing.WOOD]).toEqual({
      yin: 1,
      yang: 1,
    });
  });

  it('候选并列【强化】【强破】：相克目标双道损不再封死强破，点按强化消耗阴侧并抬升相生节点', () => {
    // 甲木归一 (1,1)；P2 土双道损 -> 【破】封死，但【强破】门槛放开后仍可选；对侧已点亮 -> 禁调息。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: -1, yang: -1 } },
      }),
      prng: scriptedPrng([0]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);

    expect(scene.phase).toBe('awaiting-player');
    expect(scene.actionBar.getButtons().map((button) => button.label)).toEqual([
      '【强化】',
      '【强破】',
    ]);

    const burst = scene.actionBar.getButtons().find((button) => button.label === '【强化】');
    expect(burst).toBeDefined();
    tapButton(input, burst as Button);
    advanceUntil(scene, () => scene.turnManager.isExtraTurnActive());

    // 强化：消耗木阴侧 (1 -> 0)，相生火连抬两级、阴优先到 (2, 0)。
    const board = scene.turnManager.getState().players.P1.board;
    expect(board[WuXing.WOOD]).toEqual({ yin: 0, yang: 1 });
    expect(board[WuXing.FIRE]).toEqual({ yin: 2, yang: 0 });
  });

  it('相生目标 (2, 2) 时【强破】不再独占候选：与【强化】并列渲染，点按后照旧结算', () => {
    // 乙木（木·阴）归一 (1,1)；相生火双加持 (2,2) -> 【化】封死，但强化门槛放开后【强化】仍可选；P2 土可破。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: {
          [WuXing.WOOD]: { yin: 1, yang: 1 },
          [WuXing.FIRE]: { yin: 2, yang: 2 },
        },
        P2: { [WuXing.EARTH]: { yin: 0, yang: 0 } },
      }),
      prng: scriptedPrng([1]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);

    expect(scene.turnManager.getAvailableActions().map((action) => action.actionType)).toEqual([
      ActionType.BURST,
      ActionType.BURST_ATK,
    ]);
    expect(scene.actionBar.getButtons().map((button) => button.label)).toEqual([
      '【强化】',
      '【强破】',
    ]);

    const burstAtk = scene.actionBar.getButtons().find((button) => button.label === '【强破】');
    expect(burstAtk).toBeDefined();
    tapButton(input, burstAtk as Button);
    advanceUntil(scene, () => scene.turnManager.isExtraTurnActive());

    // 强破：消耗木阳侧 (1 -> 0)，P2 土阴侧 0 -> -1。
    const state = scene.turnManager.getState();
    expect(state.players.P1.board[WuXing.WOOD]).toEqual({ yin: 1, yang: 0 });
    expect(state.players.P2.board[WuXing.EARTH].yin).toBe(-1);
  });

  it('连动回合仅剩唯一【消散过牌】：无按钮自动流转，盘面不变但行动权交接', () => {
    // 强化门槛放开后，中位态总能给出合法动作，消散过牌只在连动额外行动中出现。
    // 首回合：甲木归一 (2, 1) + P2 土双道损 -> 【强化】【强破】并列，点【强化】换取连动。
    // 连动再抽甲木：对侧已点亮禁调息、连动禁二次爆发 -> 只剩唯一【消散过牌】。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 2, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: -1, yang: -1 } },
      }),
      prng: scriptedPrng([0, 0]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);

    const burst = scene.actionBar.getButtons().find((button) => button.label === '【强化】');
    expect(burst).toBeDefined();
    tapButton(input, burst as Button);
    advanceUntil(scene, () => scene.turnManager.isExtraTurnActive());

    const before = expectSingleAutoFlow(scene, ActionType.PASS, '道法受阻·消散过牌中');
    expectAutoExecuted(scene, before);

    // 消散过牌不改盘面，只把行动权交给天道。
    const state = scene.turnManager.getState();
    expect(state.players.P1.board[WuXing.WOOD]).toEqual({ yin: 1, yang: 1 });
    expect(state.currentPlayer).toBe('P2');
  });

  it('连动回合仅剩唯一【化】：无按钮自动流转，相生节点 +1', () => {
    // 首回合：甲木归一 (1,2) + P2 土可破 -> 【破】【强化】【强破】三选一，点【强破】换取连动。
    // 连动抽中乙木（木·阴）：对侧已点亮禁调息、连动禁二次爆发 -> 只剩唯一【化】。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 2 } },
        P2: { [WuXing.EARTH]: { yin: 0, yang: 0 } },
      }),
      prng: scriptedPrng([0, 1]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);

    const burstAtk = scene.actionBar.getButtons().find((button) => button.label === '【强破】');
    expect(burstAtk).toBeDefined();
    tapButton(input, burstAtk as Button);
    expect(scene.turnManager.isExtraTurnActive()).toBe(true);

    const before = expectSingleAutoFlow(scene, ActionType.TRANS, '唯一机缘·化');
    expectAutoExecuted(scene, before);

    // 化气：相生火阴侧从虚空抬到点亮。
    expect(scene.turnManager.getState().players.P1.board[WuXing.FIRE]).toEqual({
      yin: 1,
      yang: 0,
    });
  });

  it('唯一候选的缓冲倒计时是 GDD §2.4 的约 0.75 秒：不抢跑也不拖沓', () => {
    // 这里刻意不覆盖任何时长选项，钉住 `DEFAULT_AUTO_EXECUTE_DELAY` 本身。
    const scene = new GameScene({
      width: 375,
      height: 667,
      safeTop: 24,
      safeBottom: 10,
      initialState: createInitialGameState(),
      prng: scriptedPrng([0]),
    });
    scene.start();
    advanceUntil(scene, () => scene.phase === 'auto-pending');
    expect(scene.phase).toBe('auto-pending');
    const before = scene.turnManager.getState();

    // 缓冲期内不抢跑：推进 0.70 秒（< 0.75）仍停在唯一候选的缓冲态。
    advance(scene, 0.7);
    expect(scene.phase).toBe('auto-pending');
    expect(scene.turnManager.getState()).toBe(before);

    // 再推进 0.10 秒（累计约 0.8 秒 > 0.75）后自动执行。
    advance(scene, 0.1);
    expect(scene.phase).toBe('flying');
    expect(scene.turnManager.getState()).not.toBe(before);
    expect(scene.turnManager.getState().players.P1.board[WuXing.WOOD].yang).toBe(1);
  });
});

describe('GameScene：回合生命周期与交互契约', () => {
  it('开局：抽天干 -> 符文降临 -> 多重抉择时渲染按钮并等待玩家', () => {
    // P1 木阳已点亮 (1,0)：甲木给出【调息】【破】两项候选。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({ P1: { [WuXing.WOOD]: { yang: 1 } } }),
      prng: scriptedPrng([0]),
    });
    const ctx = new RecordingContext();

    scene.start();
    expect(scene.phase).toBe('entrance');
    expect(scene.runeFlight.tianGan?.name).toBe('甲');
    expect(scene.actionBar.visible).toBe(false);

    advance(scene, 0.15);
    expect(scene.phase).toBe('awaiting-player');
    expect(scene.actionBar.visible).toBe(true);
    expect(scene.characters.currentPlayer).toBe('P1');
    expect(scene.characters.bannerText).toBe('你的回合');
    expect(scene.characters.bannerSubText).toBe('甲 · 木阳\n请选择法术');

    const labels = scene.actionBar.getButtons().map((button) => button.label);
    expect(labels).toEqual(['【调息】', '【破】']);
    expect(() => scene.render(ctx.asContext())).not.toThrow();
  });

  it('ADR 0008：唯一候选不渲染按钮，缓冲结束后自动执行', () => {
    // 初盘木阳为虚空：甲木只给出唯一【吸纳】。
    const scene = new GameScene({
      ...FAST_TIMING,
      autoExecuteDelay: 1,
      initialState: createInitialGameState(),
      prng: scriptedPrng([0]),
    });

    scene.start();
    advance(scene, 0.15);

    expect(scene.turnManager.getAvailableActions().length).toBe(1);
    expect(scene.turnManager.getAvailableActions()[0].actionType).toBe(ActionType.AUTO);
    expect(scene.phase).toBe('auto-pending');
    expect(scene.actionBar.visible).toBe(false);
    expect(scene.actionBar.getButtons()).toEqual([]);
    expect(scene.characters.bannerSubText).toBe('甲 · 木阳\n吸纳');

    // 缓冲期内核心状态未被写入（不抢跑），玩家全程零输入。
    const stateBefore = scene.turnManager.getState();
    advance(scene, 0.5);
    expect(scene.turnManager.getState()).toBe(stateBefore);

    // 缓冲结束自动执行唯一动作。
    advance(scene, 0.6);
    expect(scene.turnManager.getState()).not.toBe(stateBefore);
    expect(scene.turnManager.getState().players.P1.board[WuXing.WOOD].yang).toBe(1);
  });

  it('ADR 0006：极位态【亢极散气】同样无按钮直流动画', () => {
    // P1 木亢极 (2,2)：甲木强制散气，回落阳侧 2 -> 1。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 2, yang: 2 } } }),
      prng: scriptedPrng([0]),
    });

    scene.start();
    advance(scene, 0.15);

    expect(scene.turnManager.getAvailableActions().map((action) => action.actionType)).toEqual([
      ActionType.DISSIPATE,
    ]);
    expect(scene.phase).toBe('auto-pending');
    expect(scene.actionBar.visible).toBe(false);
    expect(scene.characters.bannerSubText).toBe('甲 · 木阳\n散气');

    advance(scene, 0.5);
    expect(scene.turnManager.getState().players.P1.board[WuXing.WOOD].yang).toBe(1);
  });

  it('自动流转期间点屏幕任意处可加速结算', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      autoExecuteDelay: 5,
      initialState: createInitialGameState(),
      prng: scriptedPrng([0]),
    });
    scene.start();
    advance(scene, 0.15);
    expect(scene.phase).toBe('auto-pending');
    const stateBefore = scene.turnManager.getState();

    scene.handleTap();
    expect(scene.turnManager.getState()).not.toBe(stateBefore);
    expect(scene.phase).toBe('flying');
  });

  it('天道回合由内置 AI 策略决策，玩家无需输入', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({ currentPlayer: 'P2' }),
      prng: scriptedPrng([0]),
    });
    scene.start();
    advance(scene, 0.15);
    expect(scene.phase).toBe('ai-thinking');
    expect(scene.actionBar.visible).toBe(false);
    expect(scene.characters.bannerSubText).toBe('甲 · 木阳\n天道选择法术');

    const stateBefore = scene.turnManager.getState();
    advance(scene, 0.15);
    expect(scene.turnManager.getState()).not.toBe(stateBefore);
    expect(scene.turnManager.getState().players.P2.board[WuXing.WOOD].yang).toBe(1);
  });

  it('符文飞向目标槽位，落点后才把结算结果投影到棋盘', () => {
    // P1 木归一 (1,1) 且相生火已满 (2,2)：甲木只剩【破】【强破】；破的目标是 P2 的土阴侧。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: {
          [WuXing.WOOD]: { yin: 1, yang: 1 },
          [WuXing.FIRE]: { yin: 2, yang: 2 },
          [WuXing.EARTH]: { yin: 1 },
        },
        P2: { [WuXing.EARTH]: { yin: 0 } },
      }),
      prng: scriptedPrng([0]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);
    expect(scene.actionBar.getButtons().map((button) => button.label)).toEqual([
      '【破】',
      '【强化】',
      '【强破】',
    ]);

    const atk = scene.actionBar.getButtons()[0];
    tapButton(input, atk);
    expect(scene.phase).toBe('flying');
    // 飞行期间法盘不再换盘：双环保持行动前的等级（对方土阴仍为虚空）。
    expect(scene.board.getSlot('P2', WuXing.EARTH, Polarity.YIN).level).toBe(0);
    expect(scene.board.getSlot('P1', WuXing.WOOD, Polarity.YIN).level).toBe(1);

    advance(scene, 0.35);
    // 落点后投影结算结果：P2 土阴侧 0 -> -1，且行动权已交给天道。
    expect(scene.board.getSlot('P2', WuXing.EARTH, Polarity.YIN).level).toBe(-1);
    expect(scene.characters.currentPlayer).toBe('P2');
  });

  it('连动额外行动不渲染按钮、不再允许二次爆发', () => {
    // 首回合：木归一 (1,1) + 相生火 (1,1) + P2 土 (0,0) -> 【破】【强化】【强破】。
    // 强破消耗木阳并击损土阴，获得连动；连动抽到火（丙）时只剩唯一【破】。
    const scene = new GameScene({
      ...FAST_TIMING,
      autoExecuteDelay: 0.5,
      initialState: gameStateWith({
        round: 3,
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 }, [WuXing.FIRE]: { yin: 1, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: 0 } },
      }),
      prng: scriptedPrng([0, 2]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);

    const burstAtk = scene.actionBar.getButtons().find((button) => button.label === '【强破】');
    expect(burstAtk).toBeDefined();
    tapButton(input, burstAtk as Button);
    expect(scene.turnManager.isExtraTurnActive()).toBe(true);
    expect(scene.characters.isExtraTurn).toBe(true);

    // 跑完飞行与连动回合的降临。
    advance(scene, 0.35);
    expect(scene.turnManager.isExtraTurnActive()).toBe(true);
    expect(scene.characters.currentPlayer).toBe('P1');
    expect(scene.characters.bannerText).toBe('你的连动回合');
    expect(scene.turnManager.getAvailableActions().map((action) => action.actionType)).toEqual([
      ActionType.ATK,
    ]);

    // 结算停留后连动回合的唯一【破】走自动流转：无按钮、无输入。
    advanceUntil(scene, () => scene.phase === 'auto-pending');
    expect(scene.phase).toBe('auto-pending');
    expect(scene.actionBar.visible).toBe(false);
    expect(scene.characters.bannerSubText).toContain('破');

    advance(scene, 0.6);
    expect(scene.turnManager.isExtraTurnActive()).toBe(false);
  });
});

/**
 * 法盘双环的场景级契约（ADR 0015）：同一时刻两块盘都在投影，攻击飞向外环、养己飞向内环。
 */
describe('GameScene：法盘双环投影', () => {
  /** 某个主印到盘心的距离：内环应等于 innerRadius、外环应等于 outerRadius。 */
  function sealDistance(scene: GameScene, player: 'P1' | 'P2', element: WuXing): number {
    const seal = scene.board.elements.find(
      (entry) => entry.player === player && entry.element === element,
    );
    if (seal === undefined) {
      throw new Error(`法盘上找不到 ${player} 的 ${element} 主印。`);
    }
    return Math.hypot(seal.x - scene.board.layout.centerX, seal.y - scene.board.layout.centerY);
  }

  it('同一时刻两块盘都在投影：内环是己方、外环是对方，等级互不串台', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.EARTH]: { yang: 1 } },
      }),
      prng: scriptedPrng([0]),
    });

    scene.start();

    // 开局投影即同时包含两块盘：己方木归一在内环、对方土阳点亮在外环。
    expect(scene.board.getSlot('P1', WuXing.WOOD, Polarity.YIN).level).toBe(1);
    expect(scene.board.getSlot('P2', WuXing.EARTH, Polarity.YANG).level).toBe(1);
    // 两块盘不是同一份快照投影两次：同一五行在对方盘上仍是虚空。
    expect(scene.board.getSlot('P2', WuXing.WOOD, Polarity.YIN).level).toBe(0);
    expect(scene.board.getSlot('P1', WuXing.EARTH, Polarity.YANG).level).toBe(0);
    expect(sealDistance(scene, 'P1', WuXing.WOOD)).toBeCloseTo(scene.board.layout.innerRadius, 5);
    expect(sealDistance(scene, 'P2', WuXing.EARTH)).toBeCloseTo(scene.board.layout.outerRadius, 5);
  });

  it('攻击动作（破）飞向对方环，飞行期间法盘保持行动前等级', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: {
          [WuXing.WOOD]: { yin: 1, yang: 1 },
          [WuXing.FIRE]: { yin: 2, yang: 2 },
          [WuXing.EARTH]: { yin: 1 },
        },
        P2: { [WuXing.EARTH]: { yin: 0 } },
      }),
      prng: scriptedPrng([0]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);
    expect(scene.actionBar.getButtons().map((button) => button.label)).toEqual([
      '【破】',
      '【强化】',
      '【强破】',
    ]);

    tapButton(input, scene.actionBar.getButtons()[0]);
    // 飞行期间不再换盘：对方土阴仍是行动前的虚空，己方盘也还在。
    expect(scene.board.getSlot('P2', WuXing.EARTH, Polarity.YIN).level).toBe(0);
    expect(scene.board.getSlot('P1', WuXing.WOOD, Polarity.YIN).level).toBe(1);

    advanceUntil(scene, () => scene.runeFlight.phase === 'impact');
    const target = scene.board.getSlot('P2', WuXing.EARTH, Polarity.YIN);
    expect(scene.runeFlight.position.x).toBeCloseTo(target.x, 5);
    expect(scene.runeFlight.position.y).toBeCloseTo(target.y, 5);
    // 落点在对方环上：到盘心的距离大于己方环半径。
    const distance = Math.hypot(
      scene.runeFlight.position.x - scene.board.layout.centerX,
      scene.runeFlight.position.y - scene.board.layout.centerY,
    );
    expect(distance).toBeGreaterThan(scene.board.layout.innerRadius);
  });

  it('养己动作（化）飞向己方环', () => {
    // 乙木（木·阴）：木已归一 -> 【化】【强化】；P2 土双道损把【破】封死，但强破门槛放开后【强破】仍在候选集内；化的目标是己方相生节点火。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: -1, yang: -1 } },
      }),
      prng: scriptedPrng([1]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);
    expect(scene.actionBar.getButtons().map((button) => button.label)).toEqual([
      '【化】',
      '【强化】',
      '【强破】',
    ]);

    tapButton(input, scene.actionBar.getButtons()[0]);
    advanceUntil(scene, () => scene.runeFlight.phase === 'impact');

    const target = scene.board.getSlot('P1', WuXing.FIRE, Polarity.YIN);
    expect(scene.runeFlight.position.x).toBeCloseTo(target.x, 5);
    expect(scene.runeFlight.position.y).toBeCloseTo(target.y, 5);
    // 落点在己方环一侧：到盘心的距离小于外环半径。
    const distance = Math.hypot(
      scene.runeFlight.position.x - scene.board.layout.centerX,
      scene.runeFlight.position.y - scene.board.layout.centerY,
    );
    expect(distance).toBeLessThan(scene.board.layout.outerRadius);
  });
});

/**
 * 连线高亮的语义：只由「当前天干 + 待定动作」驱动，告诉玩家这一手会走哪条线（票 02）。
 * 期望值来自票面契约：化 / 强化 = 内环相生边（内环顺时针一格），破 / 强破 = 跨环径向线（向外一格）。
 */
describe('GameScene：连线高亮 = 当前动作会走的路径（票 02）', () => {
  /** 当前点亮的连线，读作 `类型:起点->终点`。 */
  function activeLines(scene: GameScene): string[] {
    return scene.board.connections
      .filter((line) => line.isActive)
      .map((line) => `${line.kind}:${line.from}->${line.to}`);
  }

  it('玩家抉择时点亮候选动作会走的线：破 / 强破走径向线，强化走内环相生边', () => {
    // 甲木（木·阳）归一 (1,1)、相生火虚空、对方土可破 -> 候选【破】【强化】【强破】。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: 0, yang: 0 } },
      }),
      prng: scriptedPrng([0]),
    });
    scene.start();
    advance(scene, 0.15);

    expect(scene.phase).toBe('awaiting-player');
    expect(scene.turnManager.getAvailableActions().map((action) => action.actionType)).toEqual([
      ActionType.ATK,
      ActionType.BURST,
      ActionType.BURST_ATK,
    ]);
    expect(activeLines(scene)).toEqual(['generation:WOOD->FIRE', 'attack:WOOD->EARTH']);
  });

  it('候选里没有攻击动作时只点亮相生线，攻击线保持静默', () => {
    // 乙木（木·阴）已点亮、对侧虚空、木未归一 -> 候选【调息】【化】都不指向攻击线。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 0 } },
      }),
      prng: scriptedPrng([1]),
    });
    scene.start();
    advance(scene, 0.15);

    expect(scene.phase).toBe('awaiting-player');
    expect(scene.turnManager.getAvailableActions().map((action) => action.actionType)).toEqual([
      ActionType.CONVERT,
      ActionType.TRANS,
    ]);
    expect(activeLines(scene)).toEqual(['generation:WOOD->FIRE']);
  });

  it('自动流转与天道推演没有待定抉择，不点亮任何连线', () => {
    // 初盘甲木：木阳虚空 -> 唯一【吸纳】，无按钮自动流转。
    const auto = new GameScene({
      ...FAST_TIMING,
      initialState: createInitialGameState(),
      prng: scriptedPrng([0]),
    });
    auto.start();
    advance(auto, 0.15);
    expect(auto.phase).toBe('auto-pending');
    expect(activeLines(auto)).toEqual([]);

    // 天道回合：AI 自己决策，玩家侧没有待定动作。
    const ai = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({ currentPlayer: 'P2' }),
      prng: scriptedPrng([0]),
    });
    ai.start();
    advance(ai, 0.15);
    expect(ai.phase).toBe('ai-thinking');
    expect(activeLines(ai)).toEqual([]);
  });

  it('玩家选定动作后进入飞行，高亮立即熄灭', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: 0, yang: 0 } },
      }),
      prng: scriptedPrng([0]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);
    expect(activeLines(scene)).toHaveLength(2);

    tapButton(input, scene.actionBar.getButtons()[0]);
    expect(scene.phase).toBe('flying');
    expect(activeLines(scene)).toEqual([]);

    // 飞行结束、换到天道回合后仍无高亮。
    advanceUntil(scene, () => scene.phase === 'ai-thinking');
    expect(scene.phase).toBe('ai-thinking');
    expect(activeLines(scene)).toEqual([]);
  });

  it('终局（含天命揭牌）不残留高亮', () => {
    // 常规终局：开局即终局，盘面全归一也不点亮任何连线。
    const normal = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        round: 5,
        isGameOver: true,
        winner: 'P1',
        endReason: 'GUI_YUAN',
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
      }),
      prng: scriptedPrng([0]),
    });
    normal.start();
    expect(normal.phase).toBe('game-over');
    expect(activeLines(normal)).toEqual([]);

    // 天命揭牌：定格在揭牌前的双盘（己方盘多处点亮），同样不残留高亮。
    const showdown = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        round: 6,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.WATER]: { yin: 1, yang: 0 } },
      }),
      prng: scriptedPrng([8]),
    });
    showdown.start();
    expect(showdown.phase).toBe('game-over');
    expect(activeLines(showdown)).toEqual([]);

    // 揭牌飞行动效跑完、法盘定格在结算结果上，仍无高亮。
    advance(showdown, 0.5);
    expect(activeLines(showdown)).toEqual([]);
  });
});

/**
 * 候选落点弧（票 03）：决策期为每个候选在「会变的那一侧」外沿画弧，让玩家一眼看到可作用的位置。
 * 三种决策局面对齐 spec 验收：低位态（1 候选）、中位态未归一（2 候选）、归一非连动（3 候选 / 2 个落点）。
 */
describe('GameScene：候选落点弧（票 03）', () => {
  /** 当前候选弧的落点，读作 `玩家:五行:极性`。 */
  function arcTargets(scene: GameScene): string[] {
    return scene.board.candidates.map(
      (candidate) => `${candidate.player}:${candidate.element}:${candidate.polarity}`,
    );
  }

  /** 推进到玩家抉择期。 */
  function awaitingPlayer(scene: GameScene): void {
    scene.start();
    advance(scene, 0.15);
    expect(scene.phase).toBe('awaiting-player');
  }

  it('低位态：唯一候选不画弧（自动流转，玩家没有抉择）', () => {
    // 初盘抽中阳木：木阳虚空 -> 唯一【吸纳】，走 ADR 0008 的自动流转。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: createInitialGameState(),
      prng: scriptedPrng([0]),
    });
    scene.start();
    advanceUntil(scene, () => scene.phase === 'auto-pending');
    expect(arcTargets(scene)).toEqual([]);
  });

  it('中位态未归一：两个候选各自落在自己会变的那一侧（2 候选 / 2 个落点）', () => {
    // 乙木（木·阴）已点亮、对侧虚空、木未归一 -> 候选【调息】（转阳）与【化】（生火）。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 0 } },
      }),
      prng: scriptedPrng([1]),
    });
    awaitingPlayer(scene);
    expect(scene.turnManager.getAvailableActions()).toHaveLength(2);
    // 调息把木的阳侧从虚空抬起；化让火（相生目标）按阴优先落到阴侧。
    expect(arcTargets(scene)).toEqual(['P1:WOOD:yang', 'P1:FIRE:yin']);
  });

  it('归一非连动：三个候选共享内环 / 外环两个落点，同侧不叠成两段', () => {
    // 甲木（木·阳）归一 (1,1)、相生火虚空、对方土可破 -> 候选【破】【强化】【强破】。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: 0, yang: 0 } },
      }),
      prng: scriptedPrng([0]),
    });
    awaitingPlayer(scene);
    expect(scene.turnManager.getAvailableActions().map((action) => action.actionType)).toEqual([
      ActionType.ATK,
      ActionType.BURST,
      ActionType.BURST_ATK,
    ]);
    // 三个候选只有两个落点：破与强破都打对方土阴侧（同一段弧），强化打己方火阴侧。
    expect(arcTargets(scene)).toEqual(['P2:EARTH:yin', 'P1:FIRE:yin']);
  });

  it('候选弧只在决策期存在：结算、自动流转与天道回合都不画', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: 0, yang: 0 } },
      }),
      prng: scriptedPrng([0]),
    });
    const input = new InputManager(scene);
    awaitingPlayer(scene);
    expect(arcTargets(scene)).toHaveLength(2);

    // 玩家出手：弧立刻消失（同阶段只管当前回合，与连线高亮一致）。
    tapButton(input, scene.actionBar.getButtons()[0]);
    expect(scene.phase).toBe('flying');
    expect(arcTargets(scene)).toEqual([]);

    // 之后是天道回合，玩家侧仍无候选弧。
    advanceUntil(scene, () => scene.phase === 'ai-thinking');
    expect(arcTargets(scene)).toEqual([]);
  });
});

/**
 * 按住预览（票 04）：按下按钮时收窄连线高亮、叠加路径箭头与目标侧幽灵态，松开或取消回决策期。
 * 幽灵态必须真跑解析器：这里按下后读到的预览，与同一动作结算后的真实盘面逐侧对照。
 */
describe('GameScene：按住预览的路径箭头与幽灵态（票 04）', () => {
  /** 当前点亮的连线，读作 `类型:起点->终点`。 */
  function activeLines(scene: GameScene): string[] {
    return scene.board.connections
      .filter((line) => line.isActive)
      .map((line) => `${line.kind}:${line.from}->${line.to}`);
  }

  function findButton(scene: GameScene, label: string): Button {
    const button = scene.actionBar.getButtons().find((entry) => entry.label === label);
    expect(button, `找不到按钮 ${label}`).toBeDefined();
    return button as Button;
  }

  /** 按住按钮中心（不抬指）：触发预览。 */
  function pressButton(input: InputManager, button: Button): void {
    const point = buttonScreenPosition(button);
    input.handleTouchStart(point.x, point.y);
  }

  /** 按住后把手指移出按钮再抬起：取消这一下，不结算。 */
  function cancelPress(input: InputManager, button: Button): void {
    const point = buttonScreenPosition(button);
    input.handleTouchStart(point.x, point.y);
    input.handleTouchEnd(-1, -1);
  }

  /** 按住按钮、记下预览，再在同一按钮上抬指结算；返回按下时的预览。 */
  function pressThenSettle(
    scene: GameScene,
    input: InputManager,
    label: string,
  ): NonNullable<GameScene['board']['preview']> {
    const button = findButton(scene, label);
    const point = buttonScreenPosition(button);
    input.handleTouchStart(point.x, point.y);
    const preview = scene.board.preview;
    expect(preview, `${label} 按下后应有预览`).not.toBeNull();
    input.handleTouchEnd(point.x, point.y);
    advanceUntil(scene, () => scene.phase === 'result' || scene.phase === 'game-over');
    return preview as NonNullable<GameScene['board']['preview']>;
  }

  it('按住按钮：路径箭头收窄到这一下 + 目标侧幽灵态 + 候选呼吸加快；取消回到决策期', () => {
    // 甲木（阳）：木归一 (1,1)、相生火虚空、对方土可破 -> 候选【破】【强化】【强破】。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: 0, yang: 0 } },
      }),
      prng: scriptedPrng([0]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);
    expect(scene.phase).toBe('awaiting-player');

    pressButton(input, findButton(scene, '【破】'));
    const preview = scene.board.preview;
    expect(preview).not.toBeNull();
    expect(preview!.path).toEqual({ kind: 'attack', from: WuXing.WOOD });
    expect(preview!.ghost).toEqual({
      player: 'P2',
      element: WuXing.EARTH,
      yin: -1,
      yang: 0,
    });
    // 只强调被按住那一下的路径：相生线静默。
    expect(activeLines(scene)).toEqual(['attack:WOOD->EARTH']);

    // 候选呼吸加快（共用票 02 的时钟，不另起）。
    const before = scene.board.breathPhase;
    scene.update(CANDIDATE_BREATH_PERIOD / 4);
    expect(scene.board.breathPhase).toBeCloseTo((before + 0.25 * PREVIEW_BREATH_SPEED) % 1, 9);

    // 取消：手指移出后抬起，不结算，预览清空且回到决策期口径。
    input.handleTouchEnd(-1, -1);
    expect(scene.board.preview).toBeNull();
    expect(scene.phase).toBe('awaiting-player');
    expect(activeLines(scene)).toEqual(['generation:WOOD->FIRE', 'attack:WOOD->EARTH']);
  });

  it('破：幽灵态与结算后的盘面逐侧一致', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: 0, yang: 0 } },
      }),
      prng: scriptedPrng([0]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);

    const preview = pressThenSettle(scene, input, '【破】');
    expect(preview.path).toEqual({ kind: 'attack', from: WuXing.WOOD });
    const settled = scene.turnManager.getState().players.P2.board[WuXing.EARTH];
    expect(settled).toEqual({ yin: preview.ghost!.yin, yang: preview.ghost!.yang });
  });

  it('化：幽灵态指向己方相生节点，与结算后一致', () => {
    // 乙木（阴）：木归一、对侧已点亮禁调息 -> 候选【化】【强化】【强破】。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } } }),
      prng: scriptedPrng([1]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);

    const preview = pressThenSettle(scene, input, '【化】');
    expect(preview.path).toEqual({ kind: 'generation', from: WuXing.WOOD });
    expect(preview.ghost?.player).toBe('P1');
    expect(preview.ghost?.element).toBe(WuXing.FIRE);
    const settled = scene.turnManager.getState().players.P1.board[WuXing.FIRE];
    expect(settled).toEqual({ yin: preview.ghost!.yin, yang: preview.ghost!.yang });
  });

  it('强化：幽灵态是两次 +1 的真实结果（同侧连加），与结算后一致', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: 0, yang: 0 } },
      }),
      prng: scriptedPrng([0]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);

    const preview = pressThenSettle(scene, input, '【强化】');
    expect(preview.ghost?.player).toBe('P1');
    expect(preview.ghost?.element).toBe(WuXing.FIRE);
    // 火 (0,0) 连抬两级落在阴侧，不是一次 +1 的 (1,0)。
    expect(preview.ghost).toEqual({ player: 'P1', element: WuXing.FIRE, yin: 2, yang: 0 });
    const settled = scene.turnManager.getState().players.P1.board[WuXing.FIRE];
    expect(settled).toEqual({ yin: preview.ghost!.yin, yang: preview.ghost!.yang });
  });

  it('强破：幽灵态是两次 -1 的真实结果（先阴后阳），与结算后一致', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: 0, yang: 0 } },
      }),
      prng: scriptedPrng([0]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);

    const preview = pressThenSettle(scene, input, '【强破】');
    expect(preview.path).toEqual({ kind: 'attack', from: WuXing.WOOD });
    expect(preview.ghost).toEqual({ player: 'P2', element: WuXing.EARTH, yin: -1, yang: -1 });
    const settled = scene.turnManager.getState().players.P2.board[WuXing.EARTH];
    expect(settled).toEqual({ yin: preview.ghost!.yin, yang: preview.ghost!.yang });
  });

  it('净零变化不伪造幽灵态：强化打相生 (2,2) 时仍显示路径但不画幽灵态', () => {
    // 相生火已亢极 (2,2)：强化两次 ±1 互相抵消，目标净零变化。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: {
          [WuXing.WOOD]: { yin: 1, yang: 1 },
          [WuXing.FIRE]: { yin: 2, yang: 2 },
        },
        P2: { [WuXing.EARTH]: { yin: 0, yang: 0 } },
      }),
      prng: scriptedPrng([0]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);

    pressButton(input, findButton(scene, '【强化】'));
    expect(scene.board.preview?.path).toEqual({ kind: 'generation', from: WuXing.WOOD });
    expect(scene.board.preview?.ghost).toBeNull();
  });

  it('强破打双侧已道损的目标：有路径但无幽灵态（核心层见底即止）', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: -1, yang: -1 } },
      }),
      prng: scriptedPrng([0]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);
    // 破被封死，只剩【强化】【强破】。
    expect(scene.actionBar.getButtons().map((button) => button.label)).toEqual([
      '【强化】',
      '【强破】',
    ]);

    pressButton(input, findButton(scene, '【强破】'));
    expect(scene.board.preview?.path).toEqual({ kind: 'attack', from: WuXing.WOOD });
    expect(scene.board.preview?.ghost).toBeNull();

    // 取消后回到决策期。
    cancelPress(input, findButton(scene, '【强破】'));
    expect(scene.board.preview).toBeNull();
    expect(scene.phase).toBe('awaiting-player');
  });
});

describe('GameScene：终轮天命揭牌与终局', () => {
  /** 全五行归一的 P1 棋盘（10 侧点亮）。 */
  const fullGuiYuanBoard = boardWith({
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 1 },
    [WuXing.WATER]: { yin: 1, yang: 1 },
  });
  /** P2 差水阳一侧听牌。 */
  const tingPaiBoard = boardWith({
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 1 },
    [WuXing.WATER]: { yin: 1, yang: 0 },
  });

  function showdownState(): GameState {
    return gameStateWith({
      round: 6,
      currentPlayer: 'P2',
      lockedGuiYuan: { P1: true, P2: false },
      P1: fullGuiYuanBoard,
      P2: tingPaiBoard,
    });
  }

  it('天命揭牌命中：横幅播报【天命逆转】并定格 P2 获胜', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: showdownState(),
      prng: scriptedPrng([8]),
    });

    scene.start();

    const state = scene.turnManager.getState();
    expect(state.isGameOver).toBe(true);
    expect(state.winner).toBe('P2');
    expect(state.endReason).toBe('GUI_YUAN');
    expect(scene.phase).toBe('game-over');
    expect(scene.actionBar.visible).toBe(false);
    expect(scene.actionBar.getButtons()).toEqual([]);
    expect(scene.turnManager.getAvailableActions()).toEqual([]);

    expect(scene.characters.bannerText).toBe('【终轮绝杀·天命抽牌】');
    expect(scene.characters.bannerSubText).toContain('【天命逆转】五行归元·后发制人！');
    expect(scene.characters.bannerSubText).toContain('壬水');
    // 揭牌动效：符文降临并飞向抽中的水阳槽位。
    expect(scene.runeFlight.tianGan?.name).toBe('壬');
    expect(scene.characters.currentPlayer).toBe('P2');
    expect(scene.board.getSlot('P2', WuXing.WATER, Polarity.YANG).level).toBe(0);
    expect(scene.lastAction.visible).toBe(false);
    advance(scene, 0.15);
    expect(scene.runeFlight.phase).toBe('flying');
    advance(scene, 0.35);
    expect(scene.board.getSlot('P2', WuXing.WATER, Polarity.YANG).level).toBe(1);
    expect(scene.lastAction.title).toContain('天道用壬');
    expect(scene.lastAction.title).toContain('天命抽牌');
    expect(scene.lastAction.changes).toEqual([
      { player: 'P2', element: WuXing.WATER, polarity: Polarity.YANG, before: 0, after: 1 },
    ]);
  });

  it('天命揭牌落空：横幅播报【天命难违】并定格 P1 获胜', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: showdownState(),
      prng: scriptedPrng([2]),
    });

    scene.start();

    const state = scene.turnManager.getState();
    expect(state.isGameOver).toBe(true);
    expect(state.winner).toBe('P1');
    expect(scene.characters.bannerText).toBe('【终轮绝杀·天命抽牌】');
    expect(scene.characters.bannerSubText).toContain('【天命难违】差之一线·先手锁定胜局！');
    expect(scene.characters.bannerSubText).toContain('丙火');
  });

  it('终局后点击屏幕任意处重新开局', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: showdownState(),
      prng: scriptedPrng([8]),
    });
    scene.start();
    expect(scene.phase).toBe('game-over');

    scene.handleTap();

    const restarted = scene.turnManager.getState();
    expect(restarted.isGameOver).toBe(false);
    expect(restarted.round).toBe(1);
    expect(restarted.currentPlayer).toBe('P1');
    expect(scene.phase).toBe('entrance');
    expect(scene.characters.bannerText).toContain('你的回合');
  });

  it('重开新局不继承上一局的揭牌定格：新一局的终局横幅由本局结局决定', () => {
    // 第一局：终轮天命揭牌命中 -> 横幅定格在揭牌播报。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: showdownState(),
      prng: scriptedPrng([8]),
    });
    scene.start();
    expect(scene.characters.bannerText).toBe('【终轮绝杀·天命抽牌】');

    // 重开：横幅立刻换成本回合播报，上一局的揭牌定格不再挂着。
    scene.restart(2);
    expect(scene.characters.bannerText).not.toBe('【终轮绝杀·天命抽牌】');
    expect(scene.characters.bannerSubText).not.toContain('天命');

    // 把新一局打完：终局横幅只能来自本局结局，不能残留上一局的揭牌数据。
    const input = new InputManager(scene);
    const dt = 1 / 60;
    let frames = 0;
    while (!scene.turnManager.getState().isGameOver && frames < 60 * 60 * 30) {
      if (scene.phase === 'awaiting-player') {
        tapButton(input, scene.actionBar.getButtons()[0]);
      }
      scene.update(dt);
      frames += 1;
    }
    // 终局后可能仍有飞行动效在跑，等它落点再读横幅。
    advance(scene, 1);

    const state = scene.turnManager.getState();
    expect(state.isGameOver).toBe(true);
    expect(scene.phase).toBe('game-over');
    // 爆发双级作用 + 平衡重调（化 30→160）改变了种子 2 的推演轨迹：
    // 新局以「五行归元」收场（后手归元获胜），横幅与副文案都不是揭牌定格。
    expect(state.endReason).toBe('GUI_YUAN');
    expect(scene.characters.bannerText).toBe('天道通玄 · 遗憾惜败！');
    expect(scene.characters.bannerSubText).toBe('五行归元');
  });

  it('非揭牌的常规终局使用胜负横幅', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        round: 5,
        isGameOver: true,
        winner: 'P1',
        endReason: 'GUI_YUAN',
        P1: fullGuiYuanBoard,
        P2: boardWith({ [WuXing.WATER]: { yin: 0, yang: 0 } }),
      }),
      prng: scriptedPrng([0]),
    });

    scene.start();
    expect(scene.phase).toBe('game-over');
    expect(scene.characters.bannerText).toBe('★ 五行归元 ★ 玩家大胜！');
    expect(scene.characters.bannerSubText).toBe('五行归元');
  });

  it('常规终局：胜方角色播「胜」、负方播「负」，且姿势不随时间回落', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        round: 5,
        isGameOver: true,
        winner: 'P1',
        endReason: 'GUI_YUAN',
        P1: fullGuiYuanBoard,
        P2: boardWith({ [WuXing.WATER]: { yin: 0, yang: 0 } }),
      }),
      prng: scriptedPrng([0]),
    });

    scene.start();
    expect(scene.characters.getExpression('P1')).toBe('win');
    expect(scene.characters.getExpression('P2')).toBe('lose');

    // 终局姿势是持续的：推进 10 秒仍是胜 / 负，不回到待机。
    advance(scene, 10);
    expect(scene.characters.getExpression('P1')).toBe('win');
    expect(scene.characters.getExpression('P2')).toBe('lose');
  });

  it('天命揭牌的终局：揭牌落点后胜方播「胜」、负方播「负」', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: showdownState(),
      prng: scriptedPrng([8]),
    });

    scene.start();
    // 揭牌动效期间先播施法 / 受击（P2 抽中揭牌 -> P2 施法、P1 受击）。
    expect(scene.characters.getExpression('P2')).toBe('cast');
    expect(scene.characters.getExpression('P1')).toBe('idle');

    advance(scene, 1);
    expect(scene.turnManager.getState().winner).toBe('P2');
    expect(scene.characters.getExpression('P2')).toBe('win');
    expect(scene.characters.getExpression('P1')).toBe('lose');
  });

  it('重开一局清掉上一局的终局姿势', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: showdownState(),
      prng: scriptedPrng([8]),
    });
    scene.start();
    advance(scene, 1);
    expect(scene.characters.getExpression('P2')).toBe('win');
    expect(scene.characters.getExpression('P1')).toBe('lose');

    scene.handleTap();
    expect(scene.characters.getExpression('P1')).toBe('idle');
    expect(scene.characters.getExpression('P2')).toBe('idle');
  });
});

/**
 * 归一庆祝（票 03）：`node:stateChanged` 里某侧由 <1 变 ≥1 且同一节点对侧已 ≥1 时，
 * 按归属方在对应角色上播庆祝。触发信号来自核心事件，场景里不做盘面比对。
 */
describe('GameScene：归一庆祝由 node:stateChanged 触发', () => {
  it('己方补全归一节点：玩家角色庆祝，天道不动', () => {
    // 甲木（木·阳）已点亮、木阴虚空 -> 唯一【调息】把木阴 0 -> 1，木节点归一。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 0, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: -1, yang: -1 } },
      }),
      prng: scriptedPrng([0]),
    });
    scene.start();
    const before = scene.turnManager.getState();
    advanceUntil(scene, () => scene.turnManager.getState() !== before);

    expect(scene.turnManager.getState().players.P1.board[WuXing.WOOD]).toEqual({
      yin: 1,
      yang: 1,
    });
    expect(scene.characters.getExpression('P1')).not.toBe('celebrate');
    advanceUntil(scene, () => scene.runeFlight.phase === 'impact');
    expect(scene.characters.getExpression('P1')).toBe('celebrate');
    expect(scene.characters.getExpression('P2')).toBe('idle');
  });

  it('天道补全自己的归一节点：庆祝的是天道，玩家不动', () => {
    // 天道木阴已点亮、木阳虚空 -> 甲木只给唯一【吸纳】，补全木阳 -> 木节点归一。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        currentPlayer: 'P2',
        P2: { [WuXing.WOOD]: { yin: 1 } },
      }),
      prng: scriptedPrng([0]),
    });
    scene.start();
    advanceUntil(scene, () => scene.turnManager.getState().players.P2.board[WuXing.WOOD].yang >= 1);

    expect(scene.characters.getExpression('P2')).not.toBe('celebrate');
    advanceUntil(scene, () => scene.runeFlight.phase === 'impact');
    expect(scene.characters.getExpression('P2')).toBe('celebrate');
    expect(scene.characters.getExpression('P1')).toBe('idle');
  });

  it('只点亮一侧不算归一：对侧仍虚空时不庆祝', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: createInitialGameState(),
      prng: scriptedPrng([0]),
    });
    scene.start();
    const before = scene.turnManager.getState();
    advanceUntil(scene, () => scene.turnManager.getState() !== before);

    expect(scene.turnManager.getState().players.P1.board[WuXing.WOOD]).toEqual({
      yin: 0,
      yang: 1,
    });
    // 行动本身的表情（吸纳 -> 施法）照常，但不得升级成归一庆祝。
    expect(scene.characters.getExpression('P1')).not.toBe('celebrate');
  });

  it('已归一的节点再抬升一侧（1 -> 2）不重复庆祝', () => {
    // 甲木（木·阳）与相生火都已归一 (1,1)：P2 土双道损，【破】封死、【强破】净零但可选，
    // 候选并列【强化】【强破】，点【强化】：消耗木阴，火先阴侧 1 -> 2、再阳侧 1 -> 2 到 (2, 2)。
    // 火节点早已归一，这一手不是「新达成归一」，不该再播庆祝。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: {
          [WuXing.WOOD]: { yin: 1, yang: 1 },
          [WuXing.FIRE]: { yin: 1, yang: 1 },
        },
        P2: { [WuXing.EARTH]: { yin: -1, yang: -1 } },
      }),
      prng: scriptedPrng([0]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);

    const before = scene.turnManager.getState();
    const burst = scene.actionBar.getButtons().find((button) => button.label === '【强化】');
    expect(burst).toBeDefined();
    tapButton(input, burst as Button);
    advanceUntil(scene, () => scene.turnManager.getState() !== before);

    // 强化：木阴被消耗 (1 -> 0)，相生火连抬两级到 (2, 2)（火两侧仍均 ≥ 1，但没有「新归一」）。
    const board = scene.turnManager.getState().players.P1.board;
    expect(board[WuXing.WOOD]).toEqual({ yin: 0, yang: 1 });
    expect(board[WuXing.FIRE]).toEqual({ yin: 2, yang: 2 });
    expect(scene.characters.getExpression('P1')).toBe('cast');
    expect(scene.characters.getExpression('P1')).not.toBe('celebrate');
  });

  it('等级下降（1 -> 0）不庆祝：这不是达成归一的时刻', () => {
    // 甲木归一、P2 土阴侧点亮 (1,-1)：点【破】把土阴侧打回 0。
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.EARTH]: { yin: 1, yang: -1 } },
      }),
      prng: scriptedPrng([0]),
    });
    const input = new InputManager(scene);
    scene.start();
    advance(scene, 0.15);

    const atk = scene.actionBar.getButtons().find((button) => button.label === '【破】');
    expect(atk).toBeDefined();
    tapButton(input, atk as Button);
    advanceUntil(
      scene,
      () => scene.turnManager.getState().players.P2.board[WuXing.EARTH].yin === 0,
    );

    expect(scene.turnManager.getState().players.P2.board[WuXing.EARTH].yin).toBe(0);
    // 落点前不受击，抵达后只播受击、不播庆祝。
    expect(scene.characters.getExpression('P2')).toBe('idle');
    advanceUntil(scene, () => scene.runeFlight.phase === 'impact');
    expect(scene.characters.getExpression('P2')).toBe('hurt');
    expect(scene.characters.getExpression('P2')).not.toBe('celebrate');
  });
});

describe('GameScene：视口自适应', () => {
  it('抉择中缩窄屏幕后按钮仍在安全边界内且右列可触摸出手', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      width: 390,
      height: 844,
      initialState: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 0, yang: 1 } } }),
      prng: scriptedPrng([0]),
    });
    scene.start();
    advanceUntil(scene, () => scene.phase === 'awaiting-player');
    expect(scene.phase).toBe('awaiting-player');
    scene.resize(320, 568, 24, 20);
    const buttons = scene.actionBar.getButtons();
    expect(buttons.length).toBeGreaterThan(1);
    for (const button of buttons) {
      const point = buttonScreenPosition(button);
      expect(point.x - button.width / 2).toBeGreaterThanOrEqual(14);
      expect(point.x + button.width / 2).toBeLessThanOrEqual(306);
      expect(point.y + button.height / 2).toBeLessThanOrEqual(548);
    }
    const ctx = new RecordingContext();
    scene.render(ctx.asContext());
    expect(ctx.texts.some((entry) => entry.text === '左阴 · 右阳')).toBe(true);
    // 图例四档文案与盘面 / 上一招变化条共用同一套正名（ADR 0018），首格标「木示例」。
    for (const label of ['道损', '虚空', '点亮', '加持', '木示例']) {
      expect(ctx.texts.some((entry) => entry.text === label)).toBe(true);
    }
    expect([LEVEL_LABEL[-1], LEVEL_LABEL[0], LEVEL_LABEL[1], LEVEL_LABEL[2]]).toEqual([
      '道损',
      '虚空',
      '点亮',
      '加持',
    ]);
    tapButton(new InputManager(scene), buttons[1]);
    expect(scene.phase).toBe('flying');
    scene.dispose();
  });

  it('空闲时重建符文层并重新排布法盘与操作台', () => {
    const scene = new GameScene({ ...FAST_TIMING, initialState: createInitialGameState() });
    const before = scene.runeFlight;

    scene.resize(320, 568, 20, 8);

    expect(scene.runeFlight).not.toBe(before);
    expect(scene.board.layout.centerX).toBe(160);
    expect(scene.runeFlight.position.y).toBe(scene.board.layout.centerY);
    // 操作台底对齐到安全区：按钮实测多高就占多高（空闲态无按钮时贴在安全区底边）。
    expect(scene.actionBar.y).toBe(568 - 8 - scene.actionBar.contentHeight);
    expect(scene.actionBar.x).toBe(14);
    // 挂载顺序仍是：法盘 -> 符文 -> 角色卡 -> 操作台。
    expect(scene.children.length).toBe(5);
    expect(scene.children.indexOf(scene.runeFlight)).toBe(1);
    expect(scene.children.indexOf(scene.actionBar)).toBe(3);

    const ctx = new RecordingContext();
    scene.start();
    advance(scene, 0.2);
    expect(() => scene.render(ctx.asContext())).not.toThrow();
  });

  it('对局中途改变视口不打断当前回合，下一回合开始前生效', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: createInitialGameState(),
      prng: scriptedPrng([0]),
    });
    scene.start();
    advance(scene, 0.15);
    const during = scene.runeFlight;

    scene.resize(320, 568, 20, 8);
    expect(scene.runeFlight).toBe(during);

    advance(scene, 0.5);
    expect(scene.runeFlight).not.toBe(during);
  });
});

describe('GameScene：端到端对局（模拟时钟 + 真实 TurnManager + 真实 AI）', () => {
  it('从第 1 回合推进到终局结算：唯一候选自动流转、多重抉择由触摸派发', () => {
    const scene = new GameScene({
      width: 375,
      height: 667,
      safeTop: 24,
      safeBottom: 10,
      seed: 2024,
    });
    const input = new InputManager(scene);
    const ctx = new RecordingContext();
    const dt = 1 / 60;
    /** 允许的最长模拟时长：60 回合 + 连动，按每回合约 2 秒估算的十倍余量。 */
    const maxFrames = 60 * 60 * 30;

    scene.start();

    let frames = 0;
    let autoFlowFrames = 0;
    let choiceFrames = 0;
    const violations: string[] = [];
    while (!scene.turnManager.getState().isGameOver && frames < maxFrames) {
      const candidates = scene.turnManager.getAvailableActions();
      if (scene.phase === 'auto-pending') {
        autoFlowFrames += 1;
        if (candidates.length !== 1) {
          violations.push(`auto-pending 时候选数为 ${candidates.length}`);
        }
        if (scene.actionBar.visible) {
          violations.push('唯一候选时仍渲染了交互按钮');
        }
      } else if (scene.phase === 'awaiting-player') {
        choiceFrames += 1;
        if (candidates.length < 2) {
          violations.push(`等待玩家时候选数只有 ${candidates.length}`);
        }
        const button = scene.actionBar.getButtons()[0];
        if (button === undefined) {
          violations.push('等待玩家时没有可点按钮');
        } else {
          tapButton(input, button);
        }
      }
      scene.update(dt);
      if (frames % 60 === 0) {
        expect(() => scene.render(ctx.asContext())).not.toThrow();
      }
      frames += 1;
    }

    // 终局可能在最后一次飞行动效落点前就写入状态：等它落点再读相位。
    advance(scene, 1);

    const state = scene.turnManager.getState();
    expect(violations).toEqual([]);
    expect(frames).toBeLessThan(maxFrames);
    expect(state.isGameOver).toBe(true);
    expect(['P1', 'P2', 'DRAW']).toContain(state.winner);
    expect(['GUI_YUAN', 'MAX_ROUNDS']).toContain(state.endReason);
    expect(state.round).toBeGreaterThan(1);
    // 自动流转与人工抉择都真实发生过。
    expect(autoFlowFrames).toBeGreaterThan(0);
    expect(choiceFrames).toBeGreaterThan(0);
    advanceUntil(scene, () => scene.phase === 'game-over');
    expect(scene.phase).toBe('game-over');
    expect(scene.actionBar.visible).toBe(false);
    expect(() => scene.render(ctx.asContext())).not.toThrow();
  });

  it('同一颗种子的两局对局产生完全一致的最终状态（确定性）', () => {
    const play = (): GameState => {
      const scene = new GameScene({
        width: 375,
        height: 667,
        seed: 777,
        autoExecuteDelay: 0.2,
        aiThinkDelay: 0.2,
      });
      const input = new InputManager(scene);
      scene.start();
      let frames = 0;
      while (!scene.turnManager.getState().isGameOver && frames < 60 * 60 * 30) {
        if (scene.phase === 'awaiting-player') {
          tapButton(input, scene.actionBar.getButtons()[0]);
        }
        scene.update(1 / 60);
        frames += 1;
      }
      return scene.turnManager.getState();
    };

    const first = play();
    const second = play();
    expect(first.round).toBe(second.round);
    expect(first.winner).toBe(second.winner);
    expect(first.endReason).toBe(second.endReason);
    expect(first.players.P1.score).toBe(second.players.P1.score);
    expect(first.players.P2.score).toBe(second.players.P2.score);
    expect(first.players.P1.board).toEqual(second.players.P1.board);
    expect(first.players.P2.board).toEqual(second.players.P2.board);
  });

  it('渲染整局画面不抛错（伪上下文）', () => {
    const scene = new GameScene({ width: 375, height: 667, seed: 99 });
    const ctx = new RecordingContext();
    scene.start();
    for (let index = 0; index < 120; index += 1) {
      scene.update(1 / 60);
      scene.render(ctx.asContext());
    }
    expect(ctx.drawCallCount()).toBeGreaterThan(0);
  });

  it('createPRNG 播种的对局在推进若干帧后仍在合法阶段内', () => {
    const scene = new GameScene({
      width: 375,
      height: 667,
      prng: createPRNG(4242),
    });
    scene.start();
    advance(scene, 1);
    expect(['entrance', 'awaiting-player', 'auto-pending', 'ai-thinking', 'flying']).toContain(
      scene.phase,
    );
  });
});

describe('GameScene：可读结算与回合交接', () => {
  it('落点才更新盘面与比分，结算停留期间保留行动方和天干，之后交接', () => {
    const scene = new GameScene({ ...FAST_TIMING, resultHold: 0.6, prng: scriptedPrng([0, 2]) });
    scene.start();
    advanceUntil(scene, () => scene.phase === 'flying');
    expect(scene.board.getSlot('P1', WuXing.WOOD, Polarity.YANG).level).toBe(0);
    expect(scene.lastAction.visible).toBe(false);
    expect(scene.characters.scoreOf('P1')).toBe(0);
    expect(scene.characters.round).toBe(1);
    advanceUntil(scene, () => scene.runeFlight.phase === 'impact');
    expect(scene.board.getSlot('P1', WuXing.WOOD, Polarity.YANG).level).toBe(1);
    expect(scene.lastAction.changes).toEqual([
      { player: 'P1', element: WuXing.WOOD, polarity: Polarity.YANG, before: 0, after: 1 },
    ]);
    expect(scene.characters.scoreOf('P1')).toBe(scene.turnManager.getState().players.P1.score);
    expect(scene.characters.round).toBe(1);
    const snapshot = scene.lastAction.title;
    advanceUntil(scene, () => scene.phase === 'result');
    advance(scene, 0.3);
    expect(scene.phase).toBe('result');
    const ctx = new RecordingContext();
    scene.render(ctx.asContext());
    expect(ctx.texts.some(({ text }) => text.includes('你') && text.includes('甲'))).toBe(true);
    advanceUntil(scene, () => scene.phase === 'entrance');
    expect(scene.characters.bannerText).toContain('天道');
    expect(scene.lastAction.title).toBe(snapshot);
    scene.dispose();
  });

  it('强化目标已满时只报告真实源消耗，明确目标未变且无目标冲击', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      initialState: gameStateWith({
        P1: {
          [WuXing.WOOD]: { yin: 1, yang: 1 },
          [WuXing.FIRE]: { yin: 2, yang: 2 },
        },
      }),
      prng: scriptedPrng([0]),
    });
    scene.start();
    advanceUntil(scene, () => scene.phase === 'awaiting-player');
    const burst = scene.actionBar.getButtons().find(({ label }) => label === '【强化】')!;
    tapButton(new InputManager(scene), burst);
    advanceUntil(scene, () => scene.phase === 'result');
    expect(scene.lastAction.note).toBe('目标阴阳未变');
    expect(scene.lastAction.changes).toHaveLength(1);
    expect(scene.lastAction.changes[0]).toMatchObject({
      element: WuXing.WOOD,
      before: 1,
      after: 0,
    });
    expect(scene.lastAction.changes.some(({ element }) => element === WuXing.FIRE)).toBe(false);
    scene.dispose();
  });

  it('微信胶囊下的窄屏二行按钮缩放后，棋盘与上一招均在操作区上方', () => {
    const scene = new GameScene({
      ...FAST_TIMING,
      width: 460,
      height: 900,
      initialState: gameStateWith({ P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } } }),
      prng: scriptedPrng([0]),
    });
    scene.start();
    advanceUntil(scene, () => scene.phase === 'awaiting-player');
    scene.resize(320, 568, 88, 20);
    expect(scene.actionBar.contentHeight).toBeGreaterThan(58);
    const board = scene.board.layout;
    expect(board.centerY - board.outerRadius - board.sealSize).toBeGreaterThanOrEqual(188);
    expect(board.centerY + board.outerRadius + board.sealSize * 2).toBeLessThan(
      scene.actionBar.y - 34,
    );
    expect(scene.runeFlight.position.y).toBe(board.centerY);
    scene.dispose();
  });
});
