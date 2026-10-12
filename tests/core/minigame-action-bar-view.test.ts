import { describe, it, expect, vi } from 'vitest';
import { ActionType, GameState, NodeLevel, Polarity, WuXing } from '../../src/core/types/domain.js';
import { TurnManager, TurnPhase } from '../../src/core/logic/TurnManager.js';
import { createPRNG, PRNG } from '../../src/core/utils/prng.js';
import { Container } from '../../src/minigame/scene/container.js';
import { InputManager } from '../../src/minigame/scene/input-manager.js';
import { ActionBarView } from '../../src/minigame/views/action-bar-view.js';
import { gameStateWith } from '../../tools/BoardFixture.js';
import { RecordingContext } from './helpers/recording-context.js';

/** `createPRNG(7)` 的首抽天干是「甲」（木·阳），后续断言依赖这个确定性事实。 */
const SEED_JIA = 7;

/** 把 P1 的木节点设成指定等级，其余盘面保持初始状态（fixture 见 `tools/BoardFixture.ts`）。 */
function stateWithWood(wood: { yin: NodeLevel; yang: NodeLevel }): GameState {
  return gameStateWith({ P1: { [WuXing.WOOD]: wood } });
}

/** 用指定 P1 木节点盘面 + 固定种子构造真实 TurnManager。 */
function seededManager(wood: { yin: NodeLevel; yang: NodeLevel }): TurnManager {
  return new TurnManager({ prng: createPRNG(SEED_JIA), initialState: stateWithWood(wood) });
}

/** 脚本化 PRNG：只控制抽天干，核心逻辑仍由真实 TurnManager 执行。 */
function scriptedPrng(indices: number[]): PRNG {
  let cursor = 0;
  return {
    next: () => 0,
    nextInt: (min: number, max: number) => {
      const index = indices[Math.min(cursor, indices.length - 1)];
      cursor += 1;
      return Math.min(Math.max(index, min), max);
    },
    getState: () => 0,
  };
}

/** 把面板挂到舞台上，返回可按屏幕坐标驱动触摸的 InputManager。 */
function mountView(view: ActionBarView): InputManager {
  const stage = new Container();
  stage.addChild(view);
  return new InputManager(stage);
}

/** 按钮中心的屏幕坐标（面板自身带 y 偏移）。 */
function centerOf(view: ActionBarView, index: number): { x: number; y: number } {
  const button = view.getButtons()[index];
  return { x: view.x + button.x, y: view.y + button.y };
}

describe('ActionBarView: 合法动作排版', () => {
  it('按候选动作逐个排版按钮，标题与副标题取自动作格式化器', () => {
    const manager = seededManager({ yin: 0, yang: 1 });
    const actions = manager.startTurn();
    expect(manager.getCurrentTianGan()?.name).toBe('甲');
    expect(actions.map((action) => action.actionType)).toEqual([
      ActionType.CONVERT,
      ActionType.ATK,
    ]);

    const view = new ActionBarView({
      turnManager: manager,
      width: 300,
      y: 400,
      maxColumns: 2,
      gapX: 12,
      gapY: 10,
    });
    view.refresh();

    const buttons = view.getButtons();
    // 工作示例：300 宽、2 列、列间距 12 → 单元宽 (300 - 12) / 2 = 144，列心 72 与 228
    // 按钮高 50（标题行 20 + 副标题行 14 + 上下内边距 16）→ 首行中心 y = 25
    expect(buttons.map((button) => button.label)).toEqual(['【调息】', '【破】']);
    expect(buttons.map((button) => button.width)).toEqual([144, 144]);
    expect(buttons.map((button) => button.x)).toEqual([72, 228]);
    expect(buttons.map((button) => button.y)).toEqual([25, 25]);
    expect(buttons.map((button) => button.height)).toEqual([50, 50]);
  });
});

describe('ActionBarView: 动作派发', () => {
  it('点击【破】按钮把该候选载荷交给 TurnManager 并推进核心状态', () => {
    const manager = seededManager({ yin: 0, yang: 1 });
    manager.startTurn();
    const view = new ActionBarView({ turnManager: manager, width: 300, y: 400, maxColumns: 2 });
    view.refresh();
    const input = mountView(view);
    const executeSpy = vi.spyOn(manager, 'executeAction');

    const point = centerOf(view, 1);
    input.handleTouchStart(point.x, point.y);
    input.handleTouchEnd(point.x, point.y);

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith({
      actionType: ActionType.ATK,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      polarity: Polarity.YIN,
    });

    // 破：相克目标为土，阴侧 0 → -1；行动权交给 P2，本回合结束
    const state = manager.getState();
    expect(state.players.P2.board[WuXing.EARTH].yin).toBe(-1);
    expect(state.players.P1.board[WuXing.WOOD]).toEqual({ yin: 0, yang: 1 });
    expect(state.currentPlayer).toBe('P2');
    expect(state.round).toBe(1);
    expect(manager.getCurrentPhase()).toBe(TurnPhase.END_TURN);
  });

  it('候选含爆发动作时换行排版，点【强化】派发爆发载荷并换取连动', () => {
    const manager = seededManager({ yin: 1, yang: 1 });
    const actions = manager.startTurn();
    expect(actions.map((action) => action.actionType)).toEqual([
      ActionType.ATK,
      ActionType.BURST,
      ActionType.BURST_ATK,
    ]);
    const view = new ActionBarView({
      turnManager: manager,
      width: 300,
      maxColumns: 2,
      gapX: 12,
      gapY: 10,
    });
    view.refresh();
    const input = mountView(view);
    const executeSpy = vi.spyOn(manager, 'executeAction');

    const buttons = view.getButtons();
    expect(buttons.map((button) => button.label)).toEqual(['【破】', '【强化】', '【强破】']);
    // 3 个候选、每行 2 个 → 第二行：y = 50 + 10 + 25 = 85
    expect(buttons.map((button) => button.y)).toEqual([25, 25, 85]);
    expect(buttons.map((button) => button.x)).toEqual([72, 228, 72]);

    const point = centerOf(view, 1);
    input.handleTouchStart(point.x, point.y);
    input.handleTouchEnd(point.x, point.y);

    expect(executeSpy).toHaveBeenCalledWith({
      actionType: ActionType.BURST,
      player: 'P1',
      sourceElement: WuXing.WOOD,
      consumePolarity: Polarity.YIN,
      polarity: Polarity.YIN,
    });

    // 强化：消耗归一源节点阴侧 1 级，相生节点（火）阴侧 +1，并换取一次连动
    const state = manager.getState();
    expect(state.players.P1.board[WuXing.WOOD]).toEqual({ yin: 0, yang: 1 });
    expect(state.players.P1.board[WuXing.FIRE].yin).toBe(1);
    expect(manager.isExtraTurnActive()).toBe(true);
    expect(state.currentPlayer).toBe('P1');
    expect(manager.getCurrentPhase()).toBe(TurnPhase.END_TURN);
  });

  it('动作执行后订阅到核心事件自动置灰按钮，再次点击不再派发', () => {
    const manager = seededManager({ yin: 0, yang: 1 });
    manager.startTurn();
    const view = new ActionBarView({ turnManager: manager, width: 300, y: 400, maxColumns: 2 });
    view.refresh();
    const input = mountView(view);
    const executeSpy = vi.spyOn(manager, 'executeAction');

    const point = centerOf(view, 1);
    input.handleTouchStart(point.x, point.y);
    input.handleTouchEnd(point.x, point.y);
    expect(executeSpy).toHaveBeenCalledTimes(1);

    // 核心已推进到 END_TURN，面板无需手动 refresh() 就应把按钮置灰
    const buttons = view.getButtons();
    expect(buttons.map((button) => button.disabled)).toEqual([true, true]);

    input.handleTouchStart(point.x, point.y);
    input.handleTouchEnd(point.x, point.y);
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('面板被置为非交互时按钮置灰且不派发', () => {
    const manager = seededManager({ yin: 0, yang: 1 });
    manager.startTurn();
    const view = new ActionBarView({
      turnManager: manager,
      width: 300,
      y: 400,
      maxColumns: 2,
      interactive: false,
    });
    view.refresh();
    const input = mountView(view);
    const executeSpy = vi.spyOn(manager, 'executeAction');

    expect(view.getButtons().map((button) => button.disabled)).toEqual([true, true]);
    const point = centerOf(view, 0);
    input.handleTouchStart(point.x, point.y);
    input.handleTouchEnd(point.x, point.y);
    expect(executeSpy).not.toHaveBeenCalled();

    view.interactive = true;
    view.refresh();
    expect(view.getButtons().map((button) => button.disabled)).toEqual([false, false]);
  });

  it('候选变化后未重排的陈旧按钮不再把旧载荷提交给核心', () => {
    // 脚本化抽天干：先甲（木·阳）得到【调息】【破】，再丁（火·阴）只剩【吸纳】
    const manager = new TurnManager({
      initialState: stateWithWood({ yin: 0, yang: 1 }),
      prng: scriptedPrng([0, 3]),
    });
    manager.startTurn();
    const view = new ActionBarView({ turnManager: manager, width: 300, maxColumns: 2 });
    view.refresh();
    const input = mountView(view);
    const executeSpy = vi.spyOn(manager, 'executeAction');
    const stalePoint = centerOf(view, 1);

    manager.startTurn();
    expect(manager.getAvailableActions().map((action) => action.actionType)).toEqual([
      ActionType.AUTO,
    ]);

    input.handleTouchStart(stalePoint.x, stalePoint.y);
    input.handleTouchEnd(stalePoint.x, stalePoint.y);

    expect(executeSpy).not.toHaveBeenCalled();
    expect(manager.getState().players.P1.board[WuXing.WOOD]).toEqual({ yin: 0, yang: 1 });
  });
});

describe('ActionBarView: 重排与生命周期', () => {
  it('重新投影时摘掉不再是候选的旧按钮', () => {
    const manager = new TurnManager({
      initialState: stateWithWood({ yin: 0, yang: 1 }),
      prng: scriptedPrng([0, 3]),
    });
    manager.startTurn();
    const view = new ActionBarView({ turnManager: manager, width: 300, maxColumns: 2 });
    view.refresh();
    expect(view.getButtons().map((button) => button.label)).toEqual(['【调息】', '【破】']);

    // 第二次抽中丁（火·阴）：木节点与它无关，只剩低位态【吸纳】
    manager.startTurn();
    view.refresh();

    expect(view.getButtons().map((button) => button.label)).toEqual(['【吸纳】']);
    expect(view.children.length).toBe(1);
  });

  it('渲染时逐个画出按钮的标题与副标题', () => {
    const manager = seededManager({ yin: 0, yang: 1 });
    manager.startTurn();
    const view = new ActionBarView({ turnManager: manager, width: 300, maxColumns: 2 });
    view.refresh();

    const ctx = new RecordingContext();
    view.render(ctx.asContext());

    expect(ctx.texts.map((entry) => entry.text)).toEqual([
      '【调息】',
      '转同属阴',
      '【破】',
      '克敌土(阴)-1',
    ]);
  });

  it('dispose() 后不再跟随核心事件重新投影', () => {
    const manager = seededManager({ yin: 0, yang: 1 });
    manager.startTurn();
    const view = new ActionBarView({ turnManager: manager, width: 300, maxColumns: 2 });
    view.refresh();
    view.dispose();

    manager.executeAction(manager.getAvailableActions()[0]);

    expect(view.getButtons().map((button) => button.disabled)).toEqual([false, false]);
  });
});

describe('ActionBarView: viewport resize', () => {
  it.each([320, 390])(
    'reflows visible controls and hit regions within a %ipx viewport',
    (viewportWidth) => {
      const manager = seededManager({ yin: 0, yang: 1 });
      manager.startTurn();
      const view = new ActionBarView({ turnManager: manager, width: 432, y: 440 });
      view.x = 14;
      view.refresh();
      const previousButtons = [...view.getButtons()];
      view.resize(viewportWidth - 28);
      expect(view.getButtons()).toEqual(previousButtons);
      for (const button of view.getButtons()) {
        expect(view.x + button.x - button.width / 2).toBeGreaterThanOrEqual(14);
        expect(view.x + button.x + button.width / 2).toBeLessThanOrEqual(viewportWidth - 14);
        expect(button.hitArea?.width).toBe(button.width);
        expect(button.height).toBeGreaterThanOrEqual(44);
      }
      const input = mountView(view);
      const action = manager.getAvailableActions()[1];
      const executeSpy = vi.spyOn(manager, 'executeAction');
      const point = centerOf(view, 1);
      input.handleTouchStart(point.x, point.y);
      input.handleTouchEnd(point.x, point.y);
      expect(executeSpy).toHaveBeenCalledWith(action);
    },
  );
});
