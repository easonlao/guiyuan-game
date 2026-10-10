import { describe, it, expect } from 'vitest';
import { WuXing, Polarity, type BoardState } from '../../src/core/types/index.js';
import {
  createEmptyBoard,
  createInitialGameState,
  isNodeGuiYi,
  isNodeKangJi,
  isBoardGuiYuan,
  clampNodeLevel,
  measureBoardDiff,
  canTianGanLightUnlightedSide
} from '../../src/core/logic/State.js';

/** 构造全点亮盘面（每侧均为 1），作为「单一未点亮侧」用例的基底 */
function fullyLitBoard(): BoardState {
  return {
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 1 },
    [WuXing.WATER]: { yin: 1, yang: 1 }
  };
}

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
    expect(state.maxRounds).toBe(30);
    expect(state.currentPlayer).toBe('P1');
    expect(state.isGameOver).toBe(false);
    expect(state.winner).toBeNull();
  });

  describe('measureBoardDiff', () => {
    it('should count one-step level rises on both polarities as construction', () => {
      const prev = createEmptyBoard();
      const next: BoardState = {
        ...prev,
        [WuXing.WOOD]: { yin: 1, yang: 0 },
        [WuXing.FIRE]: { yin: 0, yang: 2 }
      };

      expect(measureBoardDiff(prev, next)).toEqual({
        constructionLevels: 3,
        suppressionLevels: 0
      });
    });

    it('should count level drops (including 2 -> 1) as suppression, not construction', () => {
      const prev: BoardState = {
        ...createEmptyBoard(),
        [WuXing.WOOD]: { yin: 1, yang: 1 }
      };
      const next: BoardState = {
        ...prev,
        [WuXing.WOOD]: { yin: 0, yang: -1 }
      };

      expect(measureBoardDiff(prev, next)).toEqual({
        constructionLevels: 0,
        suppressionLevels: 3
      });
    });
  });

  describe('canTianGanLightUnlightedSide', () => {
    const yangStem = { name: '甲', element: WuXing.WOOD, polarity: Polarity.YANG };

    it('should return false when the board has no unique unlighted side', () => {
      // 全点亮：未点亮侧数为 0
      expect(canTianGanLightUnlightedSide(fullyLitBoard(), yangStem)).toBe(false);
      // 空白盘：未点亮侧数为 10，不唯一
      expect(canTianGanLightUnlightedSide(createEmptyBoard(), yangStem)).toBe(false);
    });

    it('should return true for AUTO when the drawn stem matches the sole unlighted side', () => {
      const board: BoardState = {
        ...fullyLitBoard(),
        [WuXing.WOOD]: { yin: 1, yang: 0 }
      };
      expect(canTianGanLightUnlightedSide(board, yangStem)).toBe(true);
    });

    it('should return true for CONVERT when the opposite polarity side is already lit', () => {
      const board: BoardState = {
        ...fullyLitBoard(),
        [WuXing.WOOD]: { yin: 1, yang: 0 }
      };
      // 未点亮侧为 木·阳；抽中 乙 (木·阴)，阴阳相反且木阴已点亮
      expect(
        canTianGanLightUnlightedSide(board, { name: '乙', element: WuXing.WOOD, polarity: Polarity.YIN })
      ).toBe(true);
    });

    it('should return false when the drawn stem shares neither the element nor a valid generation route', () => {
      const board: BoardState = {
        ...fullyLitBoard(),
        [WuXing.WOOD]: { yin: 1, yang: 0 }
      };
      // 抽中 庚 (金·阳)：五行不同，也不能靠化气点亮木
      expect(
        canTianGanLightUnlightedSide(board, { name: '庚', element: WuXing.METAL, polarity: Polarity.YANG })
      ).toBe(false);
    });
  });
});
