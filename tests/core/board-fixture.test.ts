import { describe, it, expect } from 'vitest';
import { WuXing } from '../../src/core/types/domain.js';
import {
  boardWith,
  gameStateWith
} from '../../src/core/headless/BoardFixture.js';
import { createEmptyBoard, createInitialGameState } from '../../src/core/logic/State.js';

describe('盘面 fixture 构造器 (Board Fixture)', () => {
  describe('boardWith: 在空盘面之上覆盖指定节点阴阳等级', () => {
    it('只覆盖列出的侧，其余侧与节点保持虚空 (0,0)', () => {
      const board = boardWith({ [WuXing.WOOD]: { yin: -1 } });

      expect(board[WuXing.WOOD]).toEqual({ yin: -1, yang: 0 });
      expect(board[WuXing.FIRE]).toEqual({ yin: 0, yang: 0 });
      expect(board[WuXing.WATER]).toEqual({ yin: 0, yang: 0 });
    });

    it('可同时覆盖阴阳两侧与多个节点', () => {
      const board = boardWith({
        [WuXing.WOOD]: { yin: 1, yang: 1 },
        [WuXing.WATER]: { yin: 0, yang: -1 }
      });

      expect(board[WuXing.WOOD]).toEqual({ yin: 1, yang: 1 });
      expect(board[WuXing.WATER]).toEqual({ yin: 0, yang: -1 });
      expect(board[WuXing.METAL]).toEqual({ yin: 0, yang: 0 });
    });

    it('空覆盖等于空盘面', () => {
      expect(boardWith()).toEqual(createEmptyBoard());
    });
  });

  describe('gameStateWith: 在初始总状态之上构造完整 GameState', () => {
    it('覆盖 P1 盘面，P2 与其余字段保持初始', () => {
      const state = gameStateWith({ P1: { [WuXing.WOOD]: { yin: -1 } } });

      expect(state.players.P1.board[WuXing.WOOD]).toEqual({ yin: -1, yang: 0 });
      expect(state.players.P2.board).toEqual(createEmptyBoard());
      expect(state.round).toBe(1);
      expect(state.currentPlayer).toBe('P1');
      expect(state.maxRounds).toBe(30);
      expect(state.isGameOver).toBe(false);
      expect(state.winner).toBeNull();
      expect(state.endReason).toBeNull();
    });

    it('覆盖双方盘面与回合、当前玩家、归元锁定等终局元数据', () => {
      const state = gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
        P2: { [WuXing.WATER]: { yin: 1 } },
        round: 6,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        isGameOver: true,
        winner: 'P1',
        endReason: 'GUI_YUAN'
      });

      expect(state.players.P1.board[WuXing.WOOD]).toEqual({ yin: 1, yang: 1 });
      expect(state.players.P2.board[WuXing.WATER]).toEqual({ yin: 1, yang: 0 });
      expect(state.round).toBe(6);
      expect(state.currentPlayer).toBe('P2');
      expect(state.lockedGuiYuan).toEqual({ P1: true, P2: false });
      expect(state.isGameOver).toBe(true);
      expect(state.winner).toBe('P1');
      expect(state.endReason).toBe('GUI_YUAN');
    });

    it('覆盖双方分数', () => {
      const state = gameStateWith({ score: { P1: 200, P2: 100 } });

      expect(state.players.P1.score).toBe(200);
      expect(state.players.P2.score).toBe(100);
    });

    it('不修改初始总状态的返回对象', () => {
      const initial = createInitialGameState();
      const state = gameStateWith({ P1: { [WuXing.WOOD]: { yang: 2 } } });

      expect(initial.players.P1.board[WuXing.WOOD]).toEqual({ yin: 0, yang: 0 });
      expect(state.players.P1.board[WuXing.WOOD]).toEqual({ yin: 0, yang: 2 });
    });
  });
});
