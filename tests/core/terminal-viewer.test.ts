import { describe, it, expect, vi } from 'vitest';
import {
  ActionType,
  GameState,
  Polarity,
  WuXing
} from '../../src/core/types/domain.js';
import {
  createInitialGameState
} from '../../src/core/logic/State.js';
import { EventBus } from '../../src/core/logic/EventBus.js';
import { TurnManager } from '../../src/core/logic/TurnManager.js';
import {
  TerminalBoardViewer
} from '../../src/core/headless/TerminalBoardViewer.js';
import { balancedStrategy } from '../../src/core/ai/Strategy.js';

describe('TerminalBoardViewer (src/core/headless/TerminalBoardViewer)', () => {
  const viewer = new TerminalBoardViewer();

  describe('1. formatBoard()', () => {
    it('renders clean and aligned ASCII/Unicode board for initial state', () => {
      const state = createInitialGameState();
      const output = viewer.formatBoard(state);

      expect(output).toContain('归元弈棋盘 [回合: 1/30] [当前行动: P1]');
      expect(output).toContain('[P1] 得分: 0 | 归一进度: 0/5');
      expect(output).toContain('[P2] 得分: 0 | 归一进度: 0/5');
      expect(output).toContain('木    空     空');
      expect(output).toContain('火    空     空');
      expect(output).toContain('土    空     空');
      expect(output).toContain('金    空     空');
      expect(output).toContain('水    空     空');
    });

    it('renders damage, gui-yi, and kang-ji markers correctly', () => {
      const state = createInitialGameState();
      const customState: GameState = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            score: 150,
            board: {
              ...state.players.P1.board,
              [WuXing.WOOD]: { yin: 1, yang: 1 },  // ⭐ 归一
              [WuXing.FIRE]: { yin: 2, yang: 2 },  // ⭐ 亢极
              [WuXing.EARTH]: { yin: -1, yang: -1 }, // ⚠️ 道损
              [WuXing.METAL]: { yin: -1, yang: 1 },  // 损 / 明
              [WuXing.WATER]: { yin: 0, yang: 2 }    // 空 / 亢
            }
          }
        }
      };

      const output = viewer.formatBoard(customState);
      expect(output).toContain('⭐ 归一');
      expect(output).toContain('⭐ 亢极');
      expect(output).toContain('⚠️ 道损');
      expect(output).toContain('损     明');
      expect(output).toContain('空     亢');
    });

    it('renders game over banner when isGameOver is true', () => {
      const state = createInitialGameState();
      const gameOverState: GameState = {
        ...state,
        isGameOver: true,
        winner: 'P1',
        endReason: 'GUI_YUAN'
      };

      const output = viewer.formatBoard(gameOverState);
      expect(output).toContain('[对局结束] 胜者: P1 | 原因: GUI_YUAN');
    });
  });

  describe('2. formatAction()', () => {
    it('formats AUTO action', () => {
      const action = {
        actionType: ActionType.AUTO,
        player: 'P1' as const,
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      };
      expect(viewer.formatAction(action)).toBe('P1 执行 [吸纳 AUTO] 木 (阳)');
    });

    it('formats CONVERT action', () => {
      const action = {
        actionType: ActionType.CONVERT,
        player: 'P1' as const,
        element: WuXing.FIRE,
        polarity: Polarity.YIN
      };
      expect(viewer.formatAction(action)).toBe('P1 执行 [调息 CONVERT] 火 (阴)');
    });

    it('formats TRANS action with generation target', () => {
      const action = {
        actionType: ActionType.TRANS,
        player: 'P1' as const,
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YIN
      };
      // 木生火
      expect(viewer.formatAction(action)).toBe('P1 执行 [化 TRANS] 木 -> 火 (阴)');
    });

    it('formats ATK action with overcoming target', () => {
      const action = {
        actionType: ActionType.ATK,
        player: 'P1' as const,
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YIN
      };
      // 木克土
      expect(viewer.formatAction(action)).toBe('P1 执行 [破 ATK] 木 -> 土 (阴)');
    });

    it('formats BURST action', () => {
      const action = {
        actionType: ActionType.BURST,
        player: 'P2' as const,
        sourceElement: WuXing.WATER,
        polarity: Polarity.YIN
      };
      // 水生木
      expect(viewer.formatAction(action)).toBe('P2 执行 [强化 BURST] 水 -> 木 (阴)');
    });

    it('formats BURST_ATK action', () => {
      const action = {
        actionType: ActionType.BURST_ATK,
        player: 'P2' as const,
        sourceElement: WuXing.WATER,
        polarity: Polarity.YANG
      };
      // 水克火
      expect(viewer.formatAction(action)).toBe('P2 执行 [强破 BURST_ATK] 水 -> 火 (阳)');
    });

    it('formats PASS action', () => {
      const action = {
        actionType: ActionType.PASS,
        player: 'P1' as const
      };
      expect(viewer.formatAction(action)).toBe('P1 执行 [消散 PASS]');
    });
  });

  describe('3. EventBus Subscription & History Tracking', () => {
    it('attaches to eventBus and records game events', () => {
      const testViewer = new TerminalBoardViewer();
      const bus = new EventBus();
      const loggerMock = vi.fn();

      const unsubscribe = testViewer.attach(bus, {
        autoPrint: true,
        logger: loggerMock
      });

      // 模拟派发事件
      bus.emit('turn:start', { round: 1, player: 'P1', isExtraTurn: false });
      bus.emit('action:execute', {
        action: {
          actionType: ActionType.AUTO,
          player: 'P1',
          element: WuXing.WOOD,
          polarity: Polarity.YANG
        }
      });
      bus.emit('action:executed', {
        player: 'P1',
        actionType: ActionType.AUTO,
        scoreDelta: 10,
        extraTurn: false
      });
      bus.emit('burst:extra_turn', { player: 'P1' });
      bus.emit('game:over', { winner: 'P1', endReason: 'GUI_YUAN' });

      const history = testViewer.getHistory();
      expect(history.length).toBe(5);
      expect(history[0]).toContain('[回合开始] 回合 1 - 玩家 P1');
      expect(history[1]).toContain('[动作开始] P1 执行 [吸纳 AUTO] 木 (阳)');
      expect(history[2]).toContain('[动作结算] 玩家 P1 执行 [AUTO] 完成 (得分: +10)');
      expect(history[3]).toContain('[爆发连动] 玩家 P1 获得连动额外回合！');
      expect(history[4]).toContain('[对局结束] 胜者: P1, 原因: GUI_YUAN');

      expect(loggerMock).toHaveBeenCalledTimes(5);

      // 测试清空
      testViewer.clearHistory();
      expect(testViewer.getHistory().length).toBe(0);

      // 测试取消订阅
      unsubscribe();
      bus.emit('turn:start', { round: 2, player: 'P2', isExtraTurn: false });
      expect(testViewer.getHistory().length).toBe(0);
      expect(loggerMock).toHaveBeenCalledTimes(5); // 没有增加调用
    });

    it('integrates with TurnManager and captures full turn cycle', () => {
      const bus = new EventBus();
      const testViewer = new TerminalBoardViewer();
      testViewer.attach(bus);

      const manager = new TurnManager({ eventBus: bus });
      manager.executeTurnWithStrategy(balancedStrategy);

      const history = testViewer.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(3);
      expect(history.some(h => h.includes('[回合开始]'))).toBe(true);
      expect(history.some(h => h.includes('[动作开始]'))).toBe(true);
      expect(history.some(h => h.includes('[动作结算]'))).toBe(true);
    });
  });
});
