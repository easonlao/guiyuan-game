import { describe, it, expect } from 'vitest';
import {
  WuXing,
  Polarity,
  ActionType,
  TIAN_GAN_LIST
} from '../../src/core/types/domain.js';
import {
  isBoardTingPai,
  isBoardGuiYuan
} from '../../src/core/logic/State.js';
import { boardWith, gameStateWith } from '../../src/core/headless/BoardFixture.js';
import { ActionResolver } from '../../src/core/logic/ActionResolver.js';
import { TurnManager } from '../../src/core/logic/TurnManager.js';
import { EventBus } from '../../src/core/logic/EventBus.js';

describe('Ticket 01: 智能快刀终局裁决与终轮天命揭牌决胜全链路', () => {
  const resolver = new ActionResolver();

  // 固化 PRNG 工厂：用于按天干索引稳定抽取天干
  const createMockPrng = (tianGanIndex: number) => ({
    next: () => (tianGanIndex + 0.1) / 10,
    nextInt: () => tianGanIndex,
    getState: () => tianGanIndex
  });

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

  // 辅助棋盘：差 1 侧水阴达成归元 (9 侧点亮，未点亮 1 侧 -> 听牌临界态)
  const tingPaiBoard9SidesWaterYin = boardWith({
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 1 },
    [WuXing.WATER]: { yin: 0, yang: 1 } // 水阴未点亮 (0)
  });

  // 辅助棋盘：差 2 侧达成归元 (8 侧点亮，未点亮 2 侧 -> 未听牌)
  const notTingPaiBoard8Sides = boardWith({
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 1 },
    [WuXing.WATER]: { yin: 0, yang: 0 } // 水阴阳皆未点亮
  });

  // 辅助棋盘：差 3 侧达成归元 (7 侧点亮，未点亮 3 侧 -> 未听牌)
  const notTingPaiBoard7Sides = boardWith({
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 0 }, // 金阳未点亮
    [WuXing.WATER]: { yin: 0, yang: 0 }  // 水阴阳未点亮
  });

  describe('1. 先手归元 + 后手未听牌 (未点亮侧数 >= 2) -> 智能快刀常规秒结 (占 ~97%)', () => {
    it('8 侧已点亮（未点亮 2 侧）时，P1 归元直接常规秒结 P1 获胜！', () => {
      const state = gameStateWith({
        P1: tingPaiBoard9SidesWaterYang, // P1 差 1 侧水阳归元
        P2: notTingPaiBoard8Sides // P2 剩余未点亮 2 侧 (未听牌！)
      });

      // ADR 0007: 8 侧点亮未点亮 2 侧判定为未听牌
      expect(isBoardTingPai(state.players.P2.board)).toBe(false);

      // P1 吸纳水阳达成归元
      const result = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WATER,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(true);
      // 后手未听牌，当场秒结！
      expect(result.nextState.isGameOver).toBe(true);
      expect(result.nextState.winner).toBe('P1');
      expect(result.nextState.endReason).toBe('GUI_YUAN');
      expect(result.nextState.lockedGuiYuan?.P1).toBe(true);
      expect(result.nextState.lockedGuiYuan?.P2).toBe(false);
      expect(result.extraTurn).toBe(false);
    });

    it('7 侧已点亮（未点亮 3 侧）时，P1 达成归元当场秒结 P1 获胜', () => {
      const state = gameStateWith({
        P1: tingPaiBoard9SidesWaterYang,
        P2: notTingPaiBoard7Sides
      });

      expect(isBoardTingPai(state.players.P2.board)).toBe(false);

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
    });

    it('P1 通过 BURST 达成归元且 P2 未听牌时，秒结对局，不发放额外行动', () => {
      const burstPrepBoard = boardWith({
        [WuXing.WOOD]: { yin: 2, yang: 2 },
        [WuXing.FIRE]: { yin: 1, yang: 0 },
        [WuXing.EARTH]: { yin: 1, yang: 1 },
        [WuXing.METAL]: { yin: 1, yang: 1 },
        [WuXing.WATER]: { yin: 1, yang: 1 }
      });

      const state = gameStateWith({
        P1: burstPrepBoard,
        P2: notTingPaiBoard8Sides
      });

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

  describe('2. 先手归元 + 后手严格差 1 侧听牌 -> 状态机流转至 P2 终轮天命揭牌阶段', () => {
    it('P1 常规行动达成归元，P2 9 侧点亮听牌时，维持对局流转至 P2', () => {
      const state = gameStateWith({
        round: 3,
        currentPlayer: 'P1',
        P1: tingPaiBoard9SidesWaterYang,
        P2: tingPaiBoard9SidesWaterYang // P2 严格听牌
      });

      expect(isBoardTingPai(state.players.P2.board)).toBe(true);

      const result = resolver.resolve(state, {
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WATER,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(true);
      // 对局未结束，进入天命揭牌过渡态
      expect(result.nextState.isGameOver).toBe(false);
      expect(result.nextState.winner).toBeNull();
      expect(result.nextState.lockedGuiYuan?.P1).toBe(true);
      // 半回合交接给 P2，回合保持在 round 3
      expect(result.nextState.currentPlayer).toBe('P2');
      expect(result.nextState.round).toBe(3);
    });

    it('P1 通过 BURST 达成归元且 P2 差 1 侧听牌时，直接交接给 P2 进行终轮天命揭牌 (extraTurn=false)', () => {
      const burstPrepBoard = boardWith({
        [WuXing.WOOD]: { yin: 2, yang: 2 },
        [WuXing.FIRE]: { yin: 1, yang: 0 },
        [WuXing.EARTH]: { yin: 1, yang: 1 },
        [WuXing.METAL]: { yin: 1, yang: 1 },
        [WuXing.WATER]: { yin: 1, yang: 1 }
      });

      const state = gameStateWith({
        round: 4,
        currentPlayer: 'P1',
        P1: burstPrepBoard,
        P2: tingPaiBoard9SidesWaterYang
      });

      // P1 BURST 达成归元
      const burstResult = resolver.resolve(state, {
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YANG
      });

      expect(burstResult.success).toBe(true);
      // ADR 0007: P1 达成归元后不再发放额外行动，直接流转至 P2 终轮天命揭牌
      expect(burstResult.extraTurn).toBe(false);
      expect(burstResult.nextState.isGameOver).toBe(false);
      expect(burstResult.nextState.currentPlayer).toBe('P2');
      expect(burstResult.nextState.lockedGuiYuan?.P1).toBe(true);
    });
  });

  describe('3. 终轮天命揭牌 (Showdown Draw) - AUTO、CONVERT、TRANS 各自命中与未命中全分支', () => {
    it('AUTO (自动吸纳) 命中：P2 差水阳，抽中壬水 (水阳)，判定 P2 反败为胜', () => {
      const bus = new EventBus();
      let showdownEvent: any = null;
      bus.on('showdown:draw', (data) => {
        showdownEvent = data;
      });

      // 初始化进入 P2 终轮天命揭牌状态：P1 已锁定归元，当前行动方为 P2
      const state = gameStateWith({
        round: 5,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        P1: fullGuiYuanBoard,
        P2: tingPaiBoard9SidesWaterYang // 差水阳 (0)
      });

      // 索引 8 对应 壬水 (WATER, YANG)
      const renWaterPrng = createMockPrng(8);
      const manager = new TurnManager({
        initialState: state,
        eventBus: bus,
        prng: renWaterPrng
      });

      // P2 startTurn() 直接触发天命揭牌
      const candidateActions = manager.startTurn();

      // 阻断后手常规候选动作，返回 []
      expect(candidateActions).toEqual([]);
      expect(manager.getAvailableActions()).toEqual([]);

      // 状态机直接终结并判定 P2 获胜 (后发制人双归元)
      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getState().winner).toBe('P2');
      expect(manager.getState().endReason).toBe('GUI_YUAN');
      expect(manager.getState().lockedGuiYuan?.P2).toBe(true);
      // P2 盘面水阳被补全点亮至 1
      expect(manager.getState().players.P2.board[WuXing.WATER].yang).toBe(1);

      // 事件总线派发 showdown:draw
      expect(showdownEvent).toEqual({
        round: 5,
        player: 'P2',
        tianGan: TIAN_GAN_LIST[8],
        success: true,
        winner: 'P2'
      });
    });

    it('CONVERT (调息) 命中：P2 差水阳且水阴已点亮，抽中癸水 (水阴)，调息补全水阳，判定 P2 获胜', () => {
      const bus = new EventBus();
      let showdownEvent: any = null;
      bus.on('showdown:draw', (data) => {
        showdownEvent = data;
      });

      const state = gameStateWith({
        round: 5,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        P1: fullGuiYuanBoard,
        P2: tingPaiBoard9SidesWaterYang // 水阴=1, 水阳=0
      });

      // 索引 9 对应 癸水 (WATER, YIN)
      const guiWaterPrng = createMockPrng(9);
      const manager = new TurnManager({
        initialState: state,
        eventBus: bus,
        prng: guiWaterPrng
      });

      manager.startTurn();

      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getState().winner).toBe('P2');
      expect(manager.getState().players.P2.board[WuXing.WATER].yang).toBe(1);

      expect(showdownEvent).toEqual({
        round: 5,
        player: 'P2',
        tianGan: TIAN_GAN_LIST[9],
        success: true,
        winner: 'P2'
      });
    });

    it('TRANS (化气) 命中 (阴极优先)：P2 差水阴，抽中辛金 (阴天干，金生水)，化气补全水阴，判定 P2 获胜', () => {
      const bus = new EventBus();
      let showdownEvent: any = null;
      bus.on('showdown:draw', (data) => {
        showdownEvent = data;
      });

      const state = gameStateWith({
        round: 6,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        P1: fullGuiYuanBoard,
        P2: tingPaiBoard9SidesWaterYin // 差水阴 (0)
      });

      // 索引 7 对应 辛金 (METAL, YIN)
      const xinMetalPrng = createMockPrng(7);
      const manager = new TurnManager({
        initialState: state,
        eventBus: bus,
        prng: xinMetalPrng
      });

      manager.startTurn();

      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getState().winner).toBe('P2');
      expect(manager.getState().players.P2.board[WuXing.WATER].yin).toBe(1);

      expect(showdownEvent).toEqual({
        round: 6,
        player: 'P2',
        tianGan: TIAN_GAN_LIST[7],
        success: true,
        winner: 'P2'
      });
    });

    it('TRANS (化气) 命中 (阳极需阴极满2)：P2 差水阳且水阴已加持满 2，抽中辛金，化气强化阳极，判定 P2 获胜', () => {
      const bus = new EventBus();
      let showdownEvent: any = null;
      bus.on('showdown:draw', (data) => {
        showdownEvent = data;
      });

      const boardWithYinBlessed = boardWith({
        ...tingPaiBoard9SidesWaterYang,
        [WuXing.WATER]: { yin: 2, yang: 0 } // 水阴已满 2，未点亮侧为水阳
      });

      const state = gameStateWith({
        round: 6,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        P1: fullGuiYuanBoard,
        P2: boardWithYinBlessed
      });

      // 辛金 (METAL, YIN, index 7)
      const xinMetalPrng = createMockPrng(7);
      const manager = new TurnManager({
        initialState: state,
        eventBus: bus,
        prng: xinMetalPrng
      });

      manager.startTurn();

      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getState().winner).toBe('P2');
      expect(manager.getState().players.P2.board[WuXing.WATER].yang).toBe(1);
      expect(showdownEvent.success).toBe(true);
    });

    it('TRANS (化气) 未命中 (阳极未点亮但阴极未满 2)：化气优先提升阴极，水阳仍未点亮，判定 P1 获胜', () => {
      const bus = new EventBus();
      let showdownEvent: any = null;
      bus.on('showdown:draw', (data) => {
        showdownEvent = data;
      });

      // 水阴仅为 1 (未满 2)，水阳为 0
      const state = gameStateWith({
        round: 6,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        P1: fullGuiYuanBoard,
        P2: tingPaiBoard9SidesWaterYang // 水阴=1, 水阳=0
      });

      // 辛金 (METAL, YIN, index 7)
      const xinMetalPrng = createMockPrng(7);
      const manager = new TurnManager({
        initialState: state,
        eventBus: bus,
        prng: xinMetalPrng
      });

      manager.startTurn();

      // 阴极优先提升阴极至 2，阳极仍为 0 未点亮 -> 揭牌决胜失败，先手 P1 获胜！
      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getState().winner).toBe('P1');
      expect(manager.getState().endReason).toBe('GUI_YUAN');

      expect(showdownEvent).toEqual({
        round: 6,
        player: 'P2',
        tianGan: TIAN_GAN_LIST[7],
        success: false,
        winner: 'P1'
      });
    });

    it('未命中天干判定先手 P1 获胜：P2 差水阳，抽中丙火，天干无法点亮最后一侧', () => {
      const bus = new EventBus();
      let showdownEvent: any = null;
      bus.on('showdown:draw', (data) => {
        showdownEvent = data;
      });

      const state = gameStateWith({
        round: 7,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        P1: fullGuiYuanBoard,
        P2: tingPaiBoard9SidesWaterYang // 差水阳
      });

      // 索引 2 对应 丙火 (FIRE, YANG)
      const bingFirePrng = createMockPrng(2);
      const manager = new TurnManager({
        initialState: state,
        eventBus: bus,
        prng: bingFirePrng
      });

      manager.startTurn();

      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getState().winner).toBe('P1');
      expect(manager.getState().endReason).toBe('GUI_YUAN');

      expect(showdownEvent).toEqual({
        round: 7,
        player: 'P2',
        tianGan: TIAN_GAN_LIST[2],
        success: false,
        winner: 'P1'
      });
    });

    it('道损未点亮侧无法单抽点亮：P2 最后一侧为水阳 -1 (道损)，即使抽中壬水亦无法当场点亮，判定 P1 获胜', () => {
      const bus = new EventBus();
      let showdownEvent: any = null;
      bus.on('showdown:draw', (data) => {
        showdownEvent = data;
      });

      const boardWithDamage = boardWith({
        ...tingPaiBoard9SidesWaterYang,
        [WuXing.WATER]: { yin: 1, yang: -1 } // 水阳为道损 -1
      });

      const state = gameStateWith({
        round: 7,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        P1: fullGuiYuanBoard,
        P2: boardWithDamage
      });

      // 抽中 壬水 (WATER, YANG, index 8)
      const renWaterPrng = createMockPrng(8);
      const manager = new TurnManager({
        initialState: state,
        eventBus: bus,
        prng: renWaterPrng
      });

      manager.startTurn();

      // 道损 -1 提升 1 级为 0，依然未点亮，无法达成归元
      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getState().winner).toBe('P1');
      expect(showdownEvent.success).toBe(false);
    });
  });

  describe('4. TurnManager 单步驱动与生命周期集成', () => {
    it('step() 自动平稳驱动终轮天命揭牌并安全返回终局结果', () => {
      const state = gameStateWith({
        round: 8,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        P1: fullGuiYuanBoard,
        P2: tingPaiBoard9SidesWaterYang
      });

      // 壬水 (WATER, YANG, index 8) -> 命中
      const manager = new TurnManager({
        initialState: state,
        prng: createMockPrng(8)
      });

      const res = manager.step();

      expect(res.success).toBe(true);
      expect(res.message).toBe('终轮天命揭牌决胜已完成');
      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getState().winner).toBe('P2');
      expect(manager.getCurrentPhase()).toBe('GAME_OVER');
    });

    it('executeTurn() 策略驱动亦能平稳兼容终轮天命揭牌', () => {
      const state = gameStateWith({
        round: 8,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        P1: fullGuiYuanBoard,
        P2: tingPaiBoard9SidesWaterYang
      });

      // 丙火 (index 2) -> 未命中
      const manager = new TurnManager({
        initialState: state,
        prng: createMockPrng(2)
      });

      const res = manager.executeTurn((_state, _tg, actions) => actions[0]);

      expect(res.success).toBe(true);
      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getState().winner).toBe('P1');
    });
  });

  describe('5. 后手常规归元与先手归元成就不可逆锁定', () => {
    it('后手破坏无法撤销先手已锁定的归元成就', () => {
      const state = gameStateWith({
        round: 9,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: true, P2: false },
        P1: fullGuiYuanBoard,
        P2: notTingPaiBoard8Sides
      });

      // P2 发动 ATK 削弱 P1 的 EARTH 节点阳极
      const atkResult = resolver.resolve(state, {
        actionType: ActionType.ATK,
        player: 'P2',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(atkResult.success).toBe(true);
      expect(atkResult.nextState.players.P1.board[WuXing.EARTH].yang).toBe(0);
      expect(isBoardGuiYuan(atkResult.nextState.players.P1.board)).toBe(false);
      // P1 锁定的归元成就记录不可逆撤销！
      expect(atkResult.nextState.lockedGuiYuan?.P1).toBe(true);

      // P2 未能达成归元，判定 P1 获胜
      expect(atkResult.nextState.isGameOver).toBe(true);
      expect(atkResult.nextState.winner).toBe('P1');
      expect(atkResult.nextState.endReason).toBe('GUI_YUAN');
    });

    it('P1 未达成归元，后手 (P2) 自行达成归元，直接判定 P2 获胜', () => {
      const state = gameStateWith({
        round: 10,
        currentPlayer: 'P2',
        lockedGuiYuan: { P1: false, P2: false },
        P2: tingPaiBoard9SidesWaterYang
      });

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
});
