import { describe, it, expect } from 'vitest';
import {
  WuXing,
  Polarity,
  ActionType,
  BoardState
} from '../../src/core/types/domain.js';
import {
  createEmptyBoard,
  createInitialGameState,
  isBoardTingPai,
  isBoardGuiYuan
} from '../../src/core/logic/State.js';
import { ActionResolver } from '../../src/core/logic/ActionResolver.js';
import { TurnManager } from '../../src/core/logic/TurnManager.js';
import { EventBus } from '../../src/core/logic/EventBus.js';

describe('Ticket 03: 智能快刀终局裁决与听牌绝地追平全链路', () => {
  const resolver = new ActionResolver();

  // 辅助棋盘：全五行归一 (归元棋盘)
  const fullGuiYuanBoard: BoardState = {
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 1 },
    [WuXing.WATER]: { yin: 1, yang: 1 }
  };

  // 辅助棋盘：差 1 侧达成归元 (9 侧点亮，未点亮 1 侧 -> 听牌临界态)
  const tingPaiBoard9Sides: BoardState = {
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 1 },
    [WuXing.WATER]: { yin: 1, yang: 0 } // 水阳未点亮
  };

  // 辅助棋盘：差 2 侧达成归元 (8 侧点亮，未点亮 2 侧 -> 听牌临界态)
  const tingPaiBoard8Sides: BoardState = {
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 1 },
    [WuXing.WATER]: { yin: 0, yang: 0 } // 水阴阳皆未点亮
  };

  // 辅助棋盘：未听牌 (7 侧点亮，未点亮 3 侧)
  const notTingPaiBoard7Sides: BoardState = {
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 0 }, // 金阳未点亮
    [WuXing.WATER]: { yin: 0, yang: 0 }  // 水阴阳未点亮
  };

  describe('1. 先手归元 + 后手未听牌 -> 智能快刀常规秒结 (占 ~93%)', () => {
    it('P1 达成归元且 P2 未听牌时，立即终结对局并判定 P1 获胜', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            board: tingPaiBoard9Sides // P1 差 1 侧归元
          },
          P2: {
            ...state.players.P2,
            board: notTingPaiBoard7Sides // P2 剩余未点亮 3 侧 (未听牌)
          }
        }
      };

      expect(isBoardTingPai(state.players.P2.board)).toBe(false);

      // P1 吸纳水阳达成归元
      const result = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WATER,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(true);
      expect(result.nextState.isGameOver).toBe(true);
      expect(result.nextState.winner).toBe('P1');
      expect(result.nextState.endReason).toBe('GUI_YUAN');
      expect(result.nextState.lockedGuiYuan?.P1).toBe(true);
      expect(result.nextState.lockedGuiYuan?.P2).toBe(false);
      expect(result.extraTurn).toBe(false);
    });

    it('P1 通过 BURST 达成归元且 P2 未听牌时，秒结对局，不发放额外行动', () => {
      let state = createInitialGameState();
      // P1 木阴阳加持 (2, 2)，火阴点亮 (1)，火阳为 0，土金水均已归一
      const burstPrepBoard: BoardState = {
        [WuXing.WOOD]: { yin: 2, yang: 2 },
        [WuXing.FIRE]: { yin: 1, yang: 0 },
        [WuXing.EARTH]: { yin: 1, yang: 1 },
        [WuXing.METAL]: { yin: 1, yang: 1 },
        [WuXing.WATER]: { yin: 1, yang: 1 }
      };

      state = {
        ...state,
        players: {
          ...state.players,
          P1: { ...state.players.P1, board: burstPrepBoard },
          P2: { ...state.players.P2, board: createEmptyBoard() } // P2 空盘，未听牌
        }
      };

      // P1 发动 BURST: 消耗木阴，强化相生火阳 -> 达成五行归元
      const result = resolver.resolve(state, {
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(true);
      expect(result.nextState.isGameOver).toBe(true);
      expect(result.nextState.winner).toBe('P1');
      expect(result.nextState.endReason).toBe('GUI_YUAN');
      expect(result.extraTurn).toBe(false);
    });
  });

  describe('2. 先手归元 + 后手已听牌 -> 终轮追平不秒结，交接给 P2 (占 ~7%)', () => {
    it('P1 常规行动达成归元，P2 已听牌时，维持对局流转至 P2 行动', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        round: 3,
        currentPlayer: 'P1',
        players: {
          ...state.players,
          P1: { ...state.players.P1, board: tingPaiBoard9Sides },
          P2: { ...state.players.P2, board: tingPaiBoard8Sides } // P2 听牌
        }
      };

      expect(isBoardTingPai(state.players.P2.board)).toBe(true);

      const result = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WATER,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(true);
      // 对局未结束！
      expect(result.nextState.isGameOver).toBe(false);
      expect(result.nextState.winner).toBeNull();
      // P1 归元成就已被锁定
      expect(result.nextState.lockedGuiYuan?.P1).toBe(true);
      // 半回合交接给 P2，回合保持在 round 3
      expect(result.nextState.currentPlayer).toBe('P2');
      expect(result.nextState.round).toBe(3);
    });

    it('P1 通过 BURST 达成归元且 P2 已听牌时，P1 保留额外行动，额外行动完成后交接给 P2', () => {
      let state = createInitialGameState();
      const burstPrepBoard: BoardState = {
        [WuXing.WOOD]: { yin: 2, yang: 2 },
        [WuXing.FIRE]: { yin: 1, yang: 0 },
        [WuXing.EARTH]: { yin: 1, yang: 1 },
        [WuXing.METAL]: { yin: 1, yang: 1 },
        [WuXing.WATER]: { yin: 1, yang: 1 }
      };

      state = {
        ...state,
        round: 4,
        currentPlayer: 'P1',
        players: {
          ...state.players,
          P1: { ...state.players.P1, board: burstPrepBoard },
          P2: { ...state.players.P2, board: tingPaiBoard8Sides }
        }
      };

      // P1 BURST 达成归元
      const burstResult = resolver.resolve(state, {
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YANG
      });

      expect(burstResult.success).toBe(true);
      expect(burstResult.extraTurn).toBe(true);
      expect(burstResult.nextState.isGameOver).toBe(false);
      expect(burstResult.nextState.currentPlayer).toBe('P1');
      expect(burstResult.nextState.lockedGuiYuan?.P1).toBe(true);

      // P1 执行额外行动 (AUTO 点亮木阴，不产生连动)
      const extraActionResult = resolver.resolve(burstResult.nextState, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YIN
      });

      expect(extraActionResult.success).toBe(true);
      expect(extraActionResult.extraTurn).toBe(false);
      expect(extraActionResult.nextState.isGameOver).toBe(false);
      // 额外行动结束，半回合切换至 P2 进行追平行动
      expect(extraActionResult.nextState.currentPlayer).toBe('P2');
      expect(extraActionResult.nextState.round).toBe(4);
      expect(extraActionResult.nextState.lockedGuiYuan?.P1).toBe(true);
    });
  });

  describe('3. 听牌追平成功 -> P2 在追平轮中达成五行归元 (后发制人双归元平局优势)', () => {
    it('P1 锁定归元后，P2 在追平轮中亦达成五行归元，判定后手 P2 获胜', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        round: 5,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        players: {
          ...state.players,
          P1: { ...state.players.P1, board: fullGuiYuanBoard },
          P2: { ...state.players.P2, board: tingPaiBoard9Sides } // P2 差水阳归元
        }
      };

      // P2 执行 AUTO 点亮水阳达成归元
      const result = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P2',
        element: WuXing.WATER,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(true);
      expect(result.nextState.isGameOver).toBe(true);
      // 平局后手胜原则：双方同轮归元，后发制人判定 P2 获胜
      expect(result.nextState.winner).toBe('P2');
      expect(result.nextState.endReason).toBe('GUI_YUAN');
      expect(result.nextState.lockedGuiYuan?.P1).toBe(true);
      expect(result.nextState.lockedGuiYuan?.P2).toBe(true);
    });
  });

  describe('4. 听牌追平失败 -> P2 在追平轮中未能达成归元，大回合闭合裁决先手胜', () => {
    it('P1 锁定归元后，P2 追平轮未能达成归元，非连动行动结束时判定 P1 获胜', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        round: 5,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        players: {
          ...state.players,
          P1: { ...state.players.P1, board: fullGuiYuanBoard },
          P2: { ...state.players.P2, board: tingPaiBoard8Sides } // P2 差水阴水阳两侧
        }
      };

      // P2 执行 AUTO 仅点亮水阳一侧，水阴仍为 0，未能达成五行归元
      const result = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P2',
        element: WuXing.WATER,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(true);
      expect(result.extraTurn).toBe(false);
      // P2 大回合闭合且未达成归元 -> 裁决 P1 获胜
      expect(result.nextState.isGameOver).toBe(true);
      expect(result.nextState.winner).toBe('P1');
      expect(result.nextState.endReason).toBe('GUI_YUAN');
      expect(result.nextState.lockedGuiYuan?.P1).toBe(true);
      expect(result.nextState.lockedGuiYuan?.P2).toBe(false);
    });
  });

  describe('5. 听牌追平连动 -> P2 在追平轮中触发 BURST 连动与绝地反杀', () => {
    it('P2 触发 BURST 时保留额外行动，并在额外行动中达成归元反杀 P1', () => {
      let state = createInitialGameState();
      // P2 盘面：金阴阳为 (2, 2)，水阳已点亮 (1)，水阴为 0，其余归一
      const p2BurstBoard: BoardState = {
        [WuXing.WOOD]: { yin: 1, yang: 1 },
        [WuXing.FIRE]: { yin: 1, yang: 1 },
        [WuXing.EARTH]: { yin: 1, yang: 1 },
        [WuXing.METAL]: { yin: 2, yang: 2 },
        [WuXing.WATER]: { yin: 0, yang: 1 }
      };

      state = {
        ...state,
        round: 6,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        players: {
          ...state.players,
          P1: { ...state.players.P1, board: fullGuiYuanBoard },
          P2: { ...state.players.P2, board: p2BurstBoard }
        }
      };

      // P2 发动 BURST: 金生水，消耗金阴，强化相生水阴至 1 -> 直接达成归元！
      const result = resolver.resolve(state, {
        actionType: ActionType.BURST,
        player: 'P2',
        sourceElement: WuXing.METAL,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YIN
      });

      expect(result.success).toBe(true);
      // 无论是否原本带连动，达成归元当场裁决 P2 获胜！
      expect(result.nextState.isGameOver).toBe(true);
      expect(result.nextState.winner).toBe('P2');
      expect(result.nextState.endReason).toBe('GUI_YUAN');
    });

    it('P2 触发 BURST 但未达成归元，允许继续执行额外行动；额外行动仍未归元时判定 P1 胜', () => {
      let state = createInitialGameState();
      // P2 差水阴与火阳，木 (2, 2)
      const p2BurstBoard: BoardState = {
        [WuXing.WOOD]: { yin: 2, yang: 2 },
        [WuXing.FIRE]: { yin: 1, yang: 0 },
        [WuXing.EARTH]: { yin: 1, yang: 1 },
        [WuXing.METAL]: { yin: 1, yang: 1 },
        [WuXing.WATER]: { yin: 0, yang: 1 }
      };

      state = {
        ...state,
        round: 6,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        players: {
          ...state.players,
          P1: { ...state.players.P1, board: fullGuiYuanBoard },
          P2: { ...state.players.P2, board: p2BurstBoard }
        }
      };

      // 动作 1: P2 发动 BURST (木生火，点亮火阳)，此时水阴依然为 0，未达成归元
      const burstResult = resolver.resolve(state, {
        actionType: ActionType.BURST,
        player: 'P2',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YANG
      });

      expect(burstResult.success).toBe(true);
      expect(burstResult.extraTurn).toBe(true);
      // 对局不立即结束，允许 P2 执行额外行动
      expect(burstResult.nextState.isGameOver).toBe(false);
      expect(burstResult.nextState.currentPlayer).toBe('P2');

      // 动作 2: P2 额外行动执行 AUTO 调和金，仍未点亮水阴
      const extraResult = resolver.resolve(burstResult.nextState, {
        actionType: ActionType.AUTO,
        player: 'P2',
        element: WuXing.METAL,
        polarity: Polarity.YANG
      });

      expect(extraResult.success).toBe(true);
      expect(extraResult.extraTurn).toBe(false);
      // 额外行动走完仍未达成归元 -> 大回合闭合判定 P1 获胜
      expect(extraResult.nextState.isGameOver).toBe(true);
      expect(extraResult.nextState.winner).toBe('P1');
      expect(extraResult.nextState.endReason).toBe('GUI_YUAN');
    });
  });

  describe('6. 后手破坏无法撤销先手已锁定的归元成就', () => {
    it('P2 在追平轮对 P1 发动“破”使其节点等级下降，但 P2 未能归元，依然判定先手获胜', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        round: 7,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        players: {
          ...state.players,
          P1: { ...state.players.P1, board: fullGuiYuanBoard }, // P1 达成五行归元
          P2: { ...state.players.P2, board: tingPaiBoard8Sides }  // P2 听牌
        }
      };

      // P2 发动 ATK: 用 WOOD 克 EARTH，削弱 P1 的 EARTH 节点阳极
      const atkResult = resolver.resolve(state, {
        actionType: ActionType.ATK,
        player: 'P2',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(atkResult.success).toBe(true);
      // P1 的土阳被从 1 降级为 0
      expect(atkResult.nextState.players.P1.board[WuXing.EARTH].yang).toBe(0);
      // 此时 P1 盘面在形式上已非归元
      expect(isBoardGuiYuan(atkResult.nextState.players.P1.board)).toBe(false);
      // 但 P1 锁定的归元成就记录不可逆撤销！
      expect(atkResult.nextState.lockedGuiYuan?.P1).toBe(true);

      // P2 未能达成归元，大回合闭合判定 P1 获胜！
      expect(atkResult.nextState.isGameOver).toBe(true);
      expect(atkResult.nextState.winner).toBe('P1');
      expect(atkResult.nextState.endReason).toBe('GUI_YUAN');
    });
  });

  describe('7. 后手 (P2) 先达成归元 -> 直接判定 P2 获胜', () => {
    it('P1 未达成归元，P2 在自身行动中达成归元，直接判定 P2 获胜', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        round: 8,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: false, P2: false },
        players: {
          ...state.players,
          P1: { ...state.players.P1, board: createEmptyBoard() },
          P2: { ...state.players.P2, board: tingPaiBoard9Sides }
        }
      };

      const result = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P2',
        element: WuXing.WATER,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(true);
      expect(result.nextState.isGameOver).toBe(true);
      expect(result.nextState.winner).toBe('P2');
      expect(result.nextState.endReason).toBe('GUI_YUAN');
      expect(result.nextState.lockedGuiYuan?.P2).toBe(true);
      expect(result.nextState.lockedGuiYuan?.P1).toBe(false);
    });
  });

  describe('8. TurnManager 状态机驱动与事件广播全链路', () => {
    // 固化 PRNG 使得 drawTianGan 确定性抽取 壬水 (阳，索引 8)
    const waterYangPrng = {
      next: () => 0.85,
      nextInt: () => 8,
      getState: () => 8
    };

    it('常规秒结场景：TurnManager 正确转换 GAME_OVER 并广播终局事件', () => {
      const bus = new EventBus();
      let gameOverEvent: { winner: any; endReason: any } | null = null;
      bus.on('game:over', (data) => {
        gameOverEvent = data;
      });

      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: { ...state.players.P1, board: tingPaiBoard9Sides },
          P2: { ...state.players.P2, board: notTingPaiBoard7Sides }
        }
      };

      const manager = new TurnManager({
        initialState: state,
        eventBus: bus,
        prng: waterYangPrng
      });

      const actions = manager.startTurn();
      const autoWaterYang = actions.find(
        (a) => a.actionType === ActionType.AUTO && a.element === WuXing.WATER && a.polarity === Polarity.YANG
      );
      expect(autoWaterYang).toBeDefined();

      const res = manager.executeAction(autoWaterYang!);

      expect(res.success).toBe(true);
      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getCurrentPhase()).toBe('GAME_OVER');
      expect(gameOverEvent).toEqual({
        winner: 'P1',
        endReason: 'GUI_YUAN'
      });
    });

    it('听牌追平场景：P1 归元不触发 game:over，P2 追平失败才触发 game:over', () => {
      const bus = new EventBus();
      const gameOverEvents: any[] = [];
      bus.on('game:over', (data) => {
        gameOverEvents.push(data);
      });

      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: { ...state.players.P1, board: tingPaiBoard9Sides },
          P2: { ...state.players.P2, board: tingPaiBoard8Sides }
        }
      };

      const manager = new TurnManager({
        initialState: state,
        eventBus: bus,
        prng: waterYangPrng
      });

      // 阶段 1: P1 达成归元
      const p1Actions = manager.startTurn();
      const p1Auto = p1Actions.find(
        (a) => a.actionType === ActionType.AUTO && a.element === WuXing.WATER && a.polarity === Polarity.YANG
      );
      const res1 = manager.executeAction(p1Auto!);

      expect(res1.success).toBe(true);
      // P2 已听牌，此时不触发 game:over
      expect(manager.getState().isGameOver).toBe(false);
      expect(gameOverEvents.length).toBe(0);
      expect(manager.getState().currentPlayer).toBe('P2');

      // 阶段 2: P2 追平轮行动 (仅点亮水阳，水阴未点亮)
      manager.endTurn();
      const p2Actions = manager.startTurn();
      const p2Auto = p2Actions.find(
        (a) => a.actionType === ActionType.AUTO && a.element === WuXing.WATER && a.polarity === Polarity.YANG
      );
      const res2 = manager.executeAction(p2Auto!);

      expect(res2.success).toBe(true);
      // P2 追平失败，此时触发 game:over，P1 获胜
      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getCurrentPhase()).toBe('GAME_OVER');
      expect(gameOverEvents.length).toBe(1);
      expect(gameOverEvents[0]).toEqual({
        winner: 'P1',
        endReason: 'GUI_YUAN'
      });
    });
  });
});
