import { describe, it, expect } from 'vitest';
import { WuXing } from '../../src/core/types/index.js';
import {
  createEmptyBoard,
  createInitialGameState,
  isNodeGuiYi,
  isNodeKangJi,
  isBoardGuiYuan,
  clampNodeLevel
} from '../../src/core/logic/State.js';

describe('State Management & Boundary Rules', () => {
  it('should initialize empty board with void (0) for all nodes', () => {
    const board = createEmptyBoard();
    Object.values(WuXing).forEach(element => {
      expect(board[element].yin).toBe(0);
      expect(board[element].yang).toBe(0);
    });
  });

  it('should correctly identify 归一 (GuiYi) and 亢极 (KangJi)', () => {
    expect(isNodeGuiYi({ yin: 0, yang: 1 })).toBe(false);
    expect(isNodeGuiYi({ yin: 1, yang: 1 })).toBe(true);
    expect(isNodeGuiYi({ yin: 2, yang: 1 })).toBe(true);

    expect(isNodeKangJi({ yin: 1, yang: 2 })).toBe(false);
    expect(isNodeKangJi({ yin: 2, yang: 2 })).toBe(true);
  });

  it('should detect 五行归元 (GuiYuan) when all 5 elements reach GuiYi', () => {
    const board = createEmptyBoard();
    expect(isBoardGuiYuan(board)).toBe(false);

    const winningBoard = {
      [WuXing.WOOD]: { yin: 1, yang: 1 },
      [WuXing.FIRE]: { yin: 1, yang: 1 },
      [WuXing.EARTH]: { yin: 1, yang: 1 },
      [WuXing.METAL]: { yin: 1, yang: 1 },
      [WuXing.WATER]: { yin: 1, yang: 1 }
    } as const;
    expect(isBoardGuiYuan(winningBoard)).toBe(true);
  });

  it('should clamp node level between -1 (DAMAGE) and 2 (BLESSED)', () => {
    expect(clampNodeLevel(-5)).toBe(-1);
    expect(clampNodeLevel(-1)).toBe(-1);
    expect(clampNodeLevel(0)).toBe(0);
    expect(clampNodeLevel(1)).toBe(1);
    expect(clampNodeLevel(2)).toBe(2);
    expect(clampNodeLevel(10)).toBe(2);
  });

  it('should create initial game state with round 1 and P1 active', () => {
    const state = createInitialGameState();
    expect(state.round).toBe(1);
    expect(state.maxRounds).toBe(60);
    expect(state.currentPlayer).toBe('P1');
    expect(state.isGameOver).toBe(false);
    expect(state.winner).toBeNull();
  });
});
