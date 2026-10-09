import { describe, it, expect, vi } from 'vitest';
import { GameManager } from '../../src/minigame/game-manager';
import { TurnManager } from '../../src/core/logic/TurnManager';
import { ActionType, WuXing, Polarity } from '../../src/core/types/domain';

describe('GameManager - P1 First-Turn & Single AUTO Auto-Absorption Scheduler', () => {
  it('activates p1AutoAbsorbTimer when P1 starts turn with single AUTO action', () => {
    const gm = new GameManager(12345);
    const state = gm.getState();
    expect(state.currentPlayer).toBe('P1');
    const actions = gm.getAvailableActions();
    expect(actions.length).toBe(1);
    expect(actions[0].actionType).toBe(ActionType.AUTO);

    expect(gm.getP1AutoTimer()).toBeGreaterThan(0);
    expect(gm.isAutoAbsorbing()).toBe(true);
    expect(gm.getBannerSubText()).toBe('自动吸纳中');
    const buttons = gm.getAvailableButtons();
    expect(buttons.length).toBe(1);
    expect(buttons[0].label).toBe('【自动吸纳】');
  });

  it('decrements timer on update() and triggers action dispatch upon reaching 0', () => {
    const gm = new GameManager(12345);
    const initialTimer = gm.getP1AutoTimer();
    expect(initialTimer).toBeGreaterThan(0);

    // Advance frames but not to 0
    gm.update();
    expect(gm.getP1AutoTimer()).toBe(initialTimer - 1);

    // Advance until 1 frame left
    while (gm.getP1AutoTimer() > 1) {
      gm.update();
    }
    expect(gm.getP1AutoTimer()).toBe(1);

    // Next frame reaches 0, which should trigger dispatchAction (projectile animation starts)
    gm.update();
    expect(gm.getP1AutoTimer()).toBe(0);
    expect(gm.isAnimatingState()).toBe(true);
  });

  it('clicking anywhere on screen during countdown immediately executes absorption', () => {
    const gm = new GameManager(12345);
    expect(gm.getP1AutoTimer()).toBeGreaterThan(0);

    // Touch arbitrary coordinates outside button
    gm.handleTouch(10, 10);

    // Timer cancelled and action dispatched immediately
    expect(gm.getP1AutoTimer()).toBe(0);
    expect(gm.isAnimatingState()).toBe(true);
  });

  it('clicking the button during countdown immediately executes absorption', () => {
    const gm = new GameManager(12345);
    const buttons = gm.getAvailableButtons();
    expect(buttons.length).toBe(1);
    const btn = buttons[0];

    gm.handleTouch(btn.x + btn.width / 2, btn.y + btn.height / 2);

    expect(gm.getP1AutoTimer()).toBe(0);
    expect(gm.isAnimatingState()).toBe(true);
  });

  it('does NOT activate auto-absorption timer when P1 has multiple actions available', () => {
    const gm = new GameManager(12345);
    const tm = gm.getTurnManager();
    // Spy on getAvailableActions to return multiple candidate actions
    const currentActions = tm.getAvailableActions();
    vi.spyOn(tm, 'getAvailableActions').mockReturnValue([
      currentActions[0],
      {
        actionType: ActionType.CONVERT,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      }
    ]);

    // Trigger resize to invoke updateButtons with mocked multiple actions
    gm.resize(375, 667, 2);

    expect(gm.getAvailableActions().length).toBe(2);
    expect(gm.getP1AutoTimer()).toBe(0);
    expect(gm.isAutoAbsorbing()).toBe(false);
    const buttons = gm.getAvailableButtons();
    expect(buttons.length).toBe(2);
    expect(buttons[0].label).toBe('【吸纳】');
  });

  it('pauses timer countdown while isAnimating is true', () => {
    const gm = new GameManager(12345);
    const initialTimer = gm.getP1AutoTimer();
    expect(initialTimer).toBeGreaterThan(0);

    // Trigger preview absorption so isAnimating becomes true
    gm.triggerPreviewAbsorption();
    expect(gm.isAnimatingState()).toBe(true);

    const timerBefore = gm.getP1AutoTimer();
    gm.update();
    // Countdown should not decrement or trigger auto absorption while animating
    expect(gm.getP1AutoTimer()).toBe(timerBefore);
  });

  it('activates auto timer and sets subtext when P1 encounters single PASS action', () => {
    const tmSpy = vi.spyOn(TurnManager.prototype, 'getAvailableActions').mockReturnValue([
      {
        actionType: ActionType.PASS,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      }
    ]);

    const gm = new GameManager(12345);

    expect(gm.getP1AutoTimer()).toBe(45);
    expect(gm.isAutoAbsorbing()).toBe(true);
    expect(gm.getBannerSubText()).toBe('道法受阻·消散过牌中');
    const buttons = gm.getAvailableButtons();
    expect(buttons.length).toBe(1);
    expect(buttons[0].label).toBe('【消散】');
    expect(buttons[0].subLabel).toContain('点击立即消散');
    tmSpy.mockRestore();
  });

  it('activates auto timer and auto-executes when P1 encounters single ATK action', () => {
    const tmSpy = vi.spyOn(TurnManager.prototype, 'getAvailableActions').mockReturnValue([
      {
        actionType: ActionType.ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YANG
      }
    ]);

    const gm = new GameManager(12345);

    expect(gm.getP1AutoTimer()).toBe(45);
    expect(gm.isAutoAbsorbing()).toBe(true);
    expect(gm.getBannerSubText()).toBe('唯一机缘·破');
    const buttons = gm.getAvailableButtons();
    expect(buttons.length).toBe(1);
    expect(buttons[0].label).toBe('【自动击破】');
    expect(buttons[0].subLabel).toContain('点击立即击破');

    // Countdown ticks down to 0 and automatically triggers execution
    while (gm.getP1AutoTimer() > 0) {
      gm.update();
    }
    expect(gm.getP1AutoTimer()).toBe(0);
    expect(gm.isAnimatingState()).toBe(true);

    tmSpy.mockRestore();
  });

  it('activates auto timer and displays correct subtext/labels for single TRANS action', () => {
    const tmSpy = vi.spyOn(TurnManager.prototype, 'getAvailableActions').mockReturnValue([
      {
        actionType: ActionType.TRANS,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YIN
      }
    ]);

    const gm = new GameManager(12345);

    expect(gm.getP1AutoTimer()).toBe(45);
    expect(gm.isAutoAbsorbing()).toBe(true);
    expect(gm.getBannerSubText()).toBe('唯一机缘·化');
    const buttons = gm.getAvailableButtons();
    expect(buttons.length).toBe(1);
    expect(buttons[0].label).toBe('【自动化气】');
    expect(buttons[0].subLabel).toContain('点击立即化气');

    tmSpy.mockRestore();
  });

  it('activates auto timer and displays correct subtext/labels for single CONVERT action', () => {
    const tmSpy = vi.spyOn(TurnManager.prototype, 'getAvailableActions').mockReturnValue([
      {
        actionType: ActionType.CONVERT,
        player: 'P1',
        element: WuXing.FIRE,
        polarity: Polarity.YANG
      }
    ]);

    const gm = new GameManager(12345);

    expect(gm.getP1AutoTimer()).toBe(45);
    expect(gm.isAutoAbsorbing()).toBe(true);
    expect(gm.getBannerSubText()).toBe('势在必行·调息');
    const buttons = gm.getAvailableButtons();
    expect(buttons.length).toBe(1);
    expect(buttons[0].label).toBe('【自动调息】');
    expect(buttons[0].subLabel).toContain('点击立即调息');

    tmSpy.mockRestore();
  });

  it('activates auto timer and immediately executes when touched for single BURST action', () => {
    const tmSpy = vi.spyOn(TurnManager.prototype, 'getAvailableActions').mockReturnValue([
      {
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WATER,
        polarity: Polarity.YANG
      }
    ]);

    const gm = new GameManager(12345);

    expect(gm.getP1AutoTimer()).toBe(45);
    expect(gm.isAutoAbsorbing()).toBe(true);
    expect(gm.getBannerSubText()).toBe('势在必行·强化');
    const buttons = gm.getAvailableButtons();
    expect(buttons.length).toBe(1);
    expect(buttons[0].label).toBe('【自动强化】');
    expect(buttons[0].subLabel).toContain('点击立即强化');

    // Touching anywhere immediately executes action and cancels countdown
    gm.handleTouch(150, 250);
    expect(gm.getP1AutoTimer()).toBe(0);
    expect(gm.isAnimatingState()).toBe(true);

    tmSpy.mockRestore();
  });

  it('activates auto timer and displays correct subtext/labels for single BURST_ATK action', () => {
    const tmSpy = vi.spyOn(TurnManager.prototype, 'getAvailableActions').mockReturnValue([
      {
        actionType: ActionType.BURST_ATK,
        player: 'P1',
        sourceElement: WuXing.METAL,
        polarity: Polarity.YIN
      }
    ]);

    const gm = new GameManager(12345);

    expect(gm.getP1AutoTimer()).toBe(45);
    expect(gm.isAutoAbsorbing()).toBe(true);
    expect(gm.getBannerSubText()).toBe('势在必行·强破');
    const buttons = gm.getAvailableButtons();
    expect(buttons.length).toBe(1);
    expect(buttons[0].label).toBe('【自动强破】');
    expect(buttons[0].subLabel).toContain('点击立即强破');

    tmSpy.mockRestore();
  });

  it('activates auto timer and displays correct subtext/labels for single DISSIPATE action', () => {
    const tmSpy = vi.spyOn(TurnManager.prototype, 'getAvailableActions').mockReturnValue([
      {
        actionType: ActionType.DISSIPATE,
        player: 'P1',
        element: WuXing.EARTH,
        polarity: Polarity.YANG
      }
    ]);

    const gm = new GameManager(12345);

    expect(gm.getP1AutoTimer()).toBe(45);
    expect(gm.isAutoAbsorbing()).toBe(true);
    expect(gm.getBannerSubText()).toBe('亢极满溢·散气回落中');
    const buttons = gm.getAvailableButtons();
    expect(buttons.length).toBe(1);
    expect(buttons[0].label).toBe('【亢极散气】');
    expect(buttons[0].subLabel).toContain('点击立即散气');

    tmSpy.mockRestore();
  });

  it('does NOT activate auto timer when multiple non-auto actions are available at start of turn', () => {
    const tmSpy = vi.spyOn(TurnManager.prototype, 'getAvailableActions').mockReturnValue([
      {
        actionType: ActionType.ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YANG
      },
      {
        actionType: ActionType.CONVERT,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YIN
      }
    ]);

    const gm = new GameManager(12345);

    expect(gm.getP1AutoTimer()).toBe(0);
    expect(gm.isAutoAbsorbing()).toBe(false);
    expect(gm.getBannerSubText()).toMatch(/属性:/);
    const buttons = gm.getAvailableButtons();
    expect(buttons.length).toBe(2);
    expect(buttons[0].label).toBe('【破】');
    expect(buttons[1].label).toBe('【调息】');

    tmSpy.mockRestore();
  });

  it('Ticket 02: injects lowStateRedirect into the in-game TurnManager (default OFF, opt-in ON)', () => {
    // 默认关闭：低位态首回合仅【吸纳】，触发自动吸纳倒计时
    const off = new GameManager({ seed: 12345 });
    expect(off.getAvailableActions()).toHaveLength(1);
    expect(off.getAvailableActions()[0].actionType).toBe(ActionType.AUTO);
    expect(off.isAutoAbsorbing()).toBe(true);

    // 开启：低位态首回合【吸纳】+ 改道（阴【化】/ 阳【破】），不再自动吸纳
    const on = new GameManager({ seed: 12345, lowStateRedirect: true });
    const actions = on.getAvailableActions();
    expect(actions).toHaveLength(2);
    expect(actions[0].actionType).toBe(ActionType.AUTO);
    expect([ActionType.TRANS, ActionType.ATK]).toContain(actions[1].actionType);
    expect(on.isAutoAbsorbing()).toBe(false);
  });
});


