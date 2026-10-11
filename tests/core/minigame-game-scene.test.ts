import { describe, it, expect } from 'vitest';
import { GameScene, describeAutoFlow } from '../../src/minigame/game-scene.js';
import { InputManager } from '../../src/minigame/scene/input-manager.js';
import { Button } from '../../src/minigame/scene/button.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import { createPRNG, PRNG } from '../../src/core/utils/prng.js';
import { ActionType, GameState, Polarity, WuXing } from '../../src/core/types/domain.js';
import { boardWith, gameStateWith } from '../../tools/BoardFixture.js';

/** 记录绘制调用的伪 Canvas 2D 上下文：只关心「有没有画东西」，不关心具体像素。 */
class RecordingContext {
  public globalAlpha = 1;
  public fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  public strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  public lineWidth = 1;
  public lineCap: CanvasLineCap = 'butt';
  public font = '';
  public textAlign: CanvasTextAlign = 'start';
  public textBaseline: CanvasTextBaseline = 'alphabetic';
  public shadowColor = '#000';
  public shadowBlur = 0;
  public readonly calls: string[] = [];

  public save(): void {
    this.calls.push('save');
  }
  public restore(): void {
    this.calls.push('restore');
  }
  public translate(_x: number, _y: number): void {
    this.calls.push('translate');
  }
  public scale(_x: number, _y: number): void {
    this.calls.push('scale');
  }
  public rotate(_angle: number): void {
    this.calls.push('rotate');
  }
  public beginPath(): void {
    this.calls.push('beginPath');
  }
  public arc(
    _x: number,
    _y: number,
    _radius: number,
    _start: number,
    _end: number,
    _anticlockwise?: boolean,
  ): void {
    this.calls.push('arc');
  }
  public rect(_x: number, _y: number, _w: number, _h: number): void {
    this.calls.push('rect');
  }
  public roundRect(
    _x: number,
    _y: number,
    _w: number,
    _h: number,
    _radii?: number | number[],
  ): void {
    this.calls.push('roundRect');
  }
  public moveTo(_x: number, _y: number): void {
    this.calls.push('moveTo');
  }
  public lineTo(_x: number, _y: number): void {
    this.calls.push('lineTo');
  }
  public stroke(): void {
    this.calls.push('stroke');
  }
  public fill(): void {
    this.calls.push('fill');
  }
  public fillRect(_x: number, _y: number, _w: number, _h: number): void {
    this.calls.push('fillRect');
  }
  public strokeRect(_x: number, _y: number, _w: number, _h: number): void {
    this.calls.push('strokeRect');
  }
  public fillText(_text: string, _x: number, _y: number): void {
    this.calls.push('fillText');
  }
  public setLineDash(_segments: number[]): void {
    this.calls.push('setLineDash');
  }
  public createRadialGradient(
    _x0: number,
    _y0: number,
    _r0: number,
    _x1: number,
    _y1: number,
    _r1: number,
  ): CanvasGradient {
    this.calls.push('createRadialGradient');
    return { addColorStop: () => {} } as unknown as CanvasGradient;
  }
  public asContext(): CanvasRenderingContext2D {
    return this as unknown as CanvasRenderingContext2D;
  }
  public drawCallCount(): number {
    return this.calls.filter(
      (call) => call === 'fill' || call === 'stroke' || call === 'fillRect' || call === 'fillText',
    ).length;
  }
}

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
    expect(scene.characters.bannerText).toBe('玩家回合 · 天干【甲】降临');
    expect(scene.characters.bannerSubText).toBe('属性: 木 (阳)');

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
    expect(scene.characters.bannerSubText).toBe('自动吸纳中');

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
    expect(scene.characters.bannerSubText).toBe('亢极满溢·散气回落中');

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
    expect(scene.characters.bannerSubText).toBe('天道推演生克决策中...');

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
      '【强破】',
    ]);

    const atk = scene.actionBar.getButtons()[0];
    tapButton(input, atk);
    expect(scene.phase).toBe('flying');
    // 飞行期间法盘切到受击方（P2）的棋盘，并保持行动前的等级。
    expect(scene.board.getSlot(WuXing.EARTH, Polarity.YIN).level).toBe(0);

    advance(scene, 0.35);
    // 落点后投影结算结果：P2 土阴侧 0 -> -1，且行动权已交给天道。
    expect(scene.board.getSlot(WuXing.EARTH, Polarity.YIN).level).toBe(-1);
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
    expect(scene.characters.bannerText).toBe('【连动回合】玩家额外行动！');
    expect(scene.turnManager.getAvailableActions().map((action) => action.actionType)).toEqual([
      ActionType.ATK,
    ]);

    // 连动回合的唯一【破】走自动流转：无按钮、无输入。
    expect(scene.phase).toBe('auto-pending');
    expect(scene.actionBar.visible).toBe(false);
    expect(scene.characters.bannerSubText).toBe('唯一机缘·破');

    advance(scene, 0.6);
    expect(scene.turnManager.isExtraTurnActive()).toBe(false);
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
    advance(scene, 0.15);
    expect(scene.runeFlight.phase).toBe('flying');
    advance(scene, 0.35);
    expect(scene.board.getSlot(WuXing.WATER, Polarity.YANG).level).toBe(1);
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
    expect(scene.characters.bannerText).toContain('天干');
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
});

describe('GameScene：视口自适应', () => {
  it('空闲时重建符文层并重新排布法盘与操作台', () => {
    const scene = new GameScene({ ...FAST_TIMING, initialState: createInitialGameState() });
    const before = scene.runeFlight;

    scene.resize(320, 568, 20, 8);

    expect(scene.runeFlight).not.toBe(before);
    expect(scene.board.layout.centerX).toBe(160);
    expect(scene.board.layout.centerY).toBe(284);
    expect(scene.actionBar.y).toBe(568 - 8 - 130);
    // 挂载顺序仍是：法盘 -> 符文 -> 角色卡 -> 操作台。
    expect(scene.children.length).toBe(4);
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
