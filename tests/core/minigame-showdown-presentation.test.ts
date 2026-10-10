import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/minigame/game-manager.js';
import { WuXing } from '../../src/core/types/domain.js';
import { boardWith, gameStateWith } from '../../src/core/headless/BoardFixture.js';

describe('Minigame Showdown Draw Presentation & Transition (Ticket 02)', () => {
  // 辅助棋盘：全五行归一 (10 侧点亮，归元棋盘)
  const fullGuiYuanBoard = boardWith({
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 1 },
    [WuXing.WATER]: { yin: 1, yang: 1 }
  });

  // 辅助棋盘：差 1 侧水阳达成归元 (9 侧点亮，未点亮 1 侧 -> 听牌临界态)
  const tingPaiBoard9SidesWaterYang = boardWith({
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 1 },
    [WuXing.WATER]: { yin: 1, yang: 0 } // 水阳未点亮 (0)
  });

  // 辅助棋盘：差 2 侧达成归元 (8 侧点亮，未点亮 2 侧 -> 未听牌)
  const notTingPaiBoard8Sides = boardWith({
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 1 },
    [WuXing.WATER]: { yin: 0, yang: 0 } // 水阴阳皆未点亮
  });

  // 固化 PRNG 工厂：用于按天干索引稳定抽取天干
  const createMockPrng = (tianGanIndex: number) => ({
    next: () => (tianGanIndex + 0.1) / 10,
    nextInt: () => tianGanIndex,
    getState: () => tianGanIndex
  });

  it('triggers showdown draw presentation when P1 achieved Guiyuan and P2 is strictly tingpai, succeeding on hit', () => {
    const state = gameStateWith({
      round: 6,
      currentPlayer: 'P2',
      lockedGuiYuan: { P1: true, P2: false },
      P1: fullGuiYuanBoard,
      P2: tingPaiBoard9SidesWaterYang
    });

    // 壬水 (WATER, YANG, index 8) -> 成功点亮水阳
    const renWaterPrng = createMockPrng(8);
    const gm = new GameManager({
      initialState: state,
      prng: renWaterPrng
    });

    const finalState = gm.getState();
    expect(finalState.isGameOver).toBe(true);
    expect(finalState.winner).toBe('P2');
    expect(finalState.endReason).toBe('GUI_YUAN');

    // 清空所有常规按键交互
    expect(gm.getAvailableButtons()).toEqual([]);
    expect(gm.getAvailableActions()).toEqual([]);

    // 战斗播报横幅与子文案专属展示
    expect(gm.getBannerText()).toBe('【终轮绝杀·天命抽牌】');
    expect(gm.getBannerSubText()).toContain('【天命逆转】五行归元·后发制人！');
    expect(gm.getBannerSubText()).toContain('壬水');

    // Showdown info 校验
    const showdownInfo = gm.getLastShowdownInfo();
    expect(showdownInfo).not.toBeNull();
    expect(showdownInfo?.success).toBe(true);
    expect(showdownInfo?.winner).toBe('P2');
    expect(showdownInfo?.tianGan.name).toBe('壬');
  });

  it('triggers showdown draw presentation when P1 achieved Guiyuan and P2 is strictly tingpai, failing on miss', () => {
    const state = gameStateWith({
      round: 6,
      currentPlayer: 'P2',
      lockedGuiYuan: { P1: true, P2: false },
      P1: fullGuiYuanBoard,
      P2: tingPaiBoard9SidesWaterYang
    });

    // 丙火 (FIRE, YANG, index 2) -> 无法点亮水阳
    const bingFirePrng = createMockPrng(2);
    const gm = new GameManager({
      initialState: state,
      prng: bingFirePrng
    });

    const finalState = gm.getState();
    expect(finalState.isGameOver).toBe(true);
    expect(finalState.winner).toBe('P1');
    expect(finalState.endReason).toBe('GUI_YUAN');

    // 清空按键交互
    expect(gm.getAvailableButtons()).toEqual([]);
    expect(gm.getAvailableActions()).toEqual([]);

    // 战斗播报横幅与子文案展示
    expect(gm.getBannerText()).toBe('【终轮绝杀·天命抽牌】');
    expect(gm.getBannerSubText()).toContain('【天命难违】差之一线·先手锁定胜局！');
    expect(gm.getBannerSubText()).toContain('丙火');

    // Showdown info 校验
    const showdownInfo = gm.getLastShowdownInfo();
    expect(showdownInfo).not.toBeNull();
    expect(showdownInfo?.success).toBe(false);
    expect(showdownInfo?.winner).toBe('P1');
    expect(showdownInfo?.tianGan.name).toBe('丙');
  });

  it('renders cleanly in canvas without throwing errors on showdown game over', () => {
    const state = gameStateWith({
      round: 6,
      currentPlayer: 'P2',
      lockedGuiYuan: { P1: true, P2: false },
      P1: fullGuiYuanBoard,
      P2: tingPaiBoard9SidesWaterYang
    });

    const renWaterPrng = createMockPrng(8);
    const gm = new GameManager({
      initialState: state,
      prng: renWaterPrng
    });

    // 创建虚拟 Canvas 2D 上下文以验证渲染流程
    const mockCtx: any = new Proxy(
      {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: 'left',
        measureText: () => ({ width: 50 })
      },
      {
        get(target: any, prop: string) {
          if (prop in target) return target[prop];
          return () => {};
        }
      }
    );

    expect(() => gm.render(mockCtx)).not.toThrow();
  });

  it('restarts game on touch when game is over from showdown, resetting showdown info', () => {
    const state = gameStateWith({
      round: 6,
      currentPlayer: 'P2',
      lockedGuiYuan: { P1: true, P2: false },
      P1: fullGuiYuanBoard,
      P2: tingPaiBoard9SidesWaterYang
    });

    const renWaterPrng = createMockPrng(8);
    const gm = new GameManager({
      initialState: state,
      prng: renWaterPrng
    });

    expect(gm.getState().isGameOver).toBe(true);
    expect(gm.getLastShowdownInfo()).not.toBeNull();

    // 点击任意位置触发重新开局
    gm.handleTouch(100, 100);

    const restartedState = gm.getState();
    expect(restartedState.isGameOver).toBe(false);
    expect(restartedState.round).toBe(1);
    expect(restartedState.currentPlayer).toBe('P1');
    expect(gm.getLastShowdownInfo()).toBeNull();
  });

  it('handles conventional sudden death when P2 is not tingpai without triggering showdown banner', () => {
    const state = gameStateWith({
      round: 5,
      currentPlayer: 'P1',
      lockedGuiYuan: { P1: true, P2: false },
      isGameOver: true,
      winner: 'P1',
      endReason: 'GUI_YUAN',
      P1: fullGuiYuanBoard,
      P2: notTingPaiBoard8Sides
    });

    const gm = new GameManager({
      initialState: state,
      seed: 999
    });

    expect(gm.getState().isGameOver).toBe(true);
    expect(gm.getLastShowdownInfo()).toBeNull();
    expect(gm.getBannerText()).toBe('★ 五行归元 ★ 玩家大胜！');
  });
});
