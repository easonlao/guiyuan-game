import { describe, it, expect, vi } from 'vitest';
import {
  ActionType,
  WuXing,
  Polarity,
  TIAN_GAN_LIST
} from '../../src/core/types/domain.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import {
  TurnManager,
  TurnPhase
} from '../../src/core/logic/TurnManager.js';
import { EventBus } from '../../src/core/logic/EventBus.js';
import { createPRNG } from '../../src/core/utils/prng.js';
import { getAvailableActions } from '../../src/core/logic/ActionCandidates.js';

describe('TurnManager (Lifecycle Engine & Burst Lock & Draw Rule)', () => {
  describe('1. Lifecycle and State Machine Flow', () => {
    it('initializes in START_TURN phase with inactive extra turn and null tianGan', () => {
      const manager = new TurnManager();
      expect(manager.getCurrentPhase()).toBe(TurnPhase.START_TURN);
      expect(manager.isExtraTurnActive()).toBe(false);
      expect(manager.getCurrentTianGan()).toBeNull();
      expect(manager.getState().currentPlayer).toBe('P1');
      expect(manager.getState().round).toBe(1);
    });

    it('startTurn() draws TianGan, computes available actions, and transitions to EXECUTE_ACTION', () => {
      // Seed 42 produces a deterministic TianGan
      const prng = createPRNG(42);
      const manager = new TurnManager({ prng });

      const actions = manager.startTurn();
      expect(manager.getCurrentPhase()).toBe(TurnPhase.EXECUTE_ACTION);
      expect(manager.getCurrentTianGan()).not.toBeNull();
      expect(manager.getState().currentTianGan).toEqual(manager.getCurrentTianGan());
      expect(actions.length).toBeGreaterThan(0);
      expect(manager.getAvailableActions()).toEqual(actions);
    });

    it('executeAction() resolves action, switches player to P2 within round, and transitions to END_TURN', () => {
      const manager = new TurnManager();
      const actions = manager.startTurn();
      const action = actions[0];

      const result = manager.executeAction(action);
      expect(result.success).toBe(true);
      expect(manager.getCurrentPhase()).toBe(TurnPhase.END_TURN);
      expect(manager.getState().round).toBe(1);
      expect(manager.getState().currentPlayer).toBe('P2');
    });

    it('step() convenience method automatically starts turn and executes action', () => {
      const manager = new TurnManager();
      const result = manager.step(); // Default chooses first candidate (AUTO)

      expect(result.success).toBe(true);
      expect(manager.getState().round).toBe(1);
      expect(manager.getState().currentPlayer).toBe('P2');
    });

    it('executeTurn() convenience method drives round using custom strategy', () => {
      const manager = new TurnManager();
      const result = manager.executeTurn((_state, _tg, actions) => actions[0]);

      expect(result.success).toBe(true);
      expect(manager.getState().round).toBe(1);
      expect(manager.getState().currentPlayer).toBe('P2');
    });

    it('endTurn() resets phase to START_TURN from END_TURN', () => {
      const manager = new TurnManager();
      manager.step();
      expect(manager.getCurrentPhase()).toBe(TurnPhase.END_TURN);

      manager.endTurn();
      expect(manager.getCurrentPhase()).toBe(TurnPhase.START_TURN);
    });
  });

  describe('2. Action Validation & Legality', () => {
    it('rejects executeAction before calling startTurn', () => {
      const manager = new TurnManager();
      const result = manager.executeAction({
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('当前不在动作执行阶段');
    });

    it('rejects action when player is not currentPlayer', () => {
      const manager = new TurnManager();
      manager.startTurn();

      const result = manager.executeAction({
        actionType: ActionType.AUTO,
        player: 'P2', // Current player is P1!
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('当前不是玩家 P2 的行动回合');
    });

    it('rejects illegal actions not in available candidates list', () => {
      const manager = new TurnManager();
      manager.startTurn();

      // Attempting an ATK action when node is VOID (0)
      const result = manager.executeAction({
        actionType: ActionType.ATK,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        polarity: Polarity.YIN
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('非法动作');
    });

    it('rejects actions after game over', () => {
      let state = createInitialGameState();
      state = { ...state, isGameOver: true, winner: 'P1', endReason: 'GUI_YUAN' };
      const manager = new TurnManager({ initialState: state });

      expect(manager.getCurrentPhase()).toBe(TurnPhase.GAME_OVER);
      expect(manager.startTurn()).toHaveLength(0);

      const result = manager.executeAction({
        actionType: ActionType.AUTO,
        player: 'P1',
        element: WuXing.WOOD,
        polarity: Polarity.YANG
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('对局已结束');
    });
  });

  describe('3. Burst Lock (连动限制: 禁止大回合内二次爆发)', () => {
    it('getAvailableActions respects isExtraTurn: true by excluding BURST and BURST_ATK', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            board: {
              ...state.players.P1.board,
              [WuXing.METAL]: { yin: 1, yang: 1 } // GuiYi node!
            }
          }
        }
      };

      const gengMetal = TIAN_GAN_LIST.find((tg) => tg.name === '庚')!;

      // Normal turn: BURST and BURST_ATK are available
      const normalActions = getAvailableActions(state, gengMetal);
      expect(normalActions.some((a) => a.actionType === ActionType.BURST)).toBe(true);
      expect(normalActions.some((a) => a.actionType === ActionType.BURST_ATK)).toBe(true);

      // Extra turn: BURST and BURST_ATK must be filtered out
      const extraTurnActions = getAvailableActions(state, gengMetal, { isExtraTurn: true });
      expect(extraTurnActions.some((a) => a.actionType === ActionType.BURST)).toBe(false);
      expect(extraTurnActions.some((a) => a.actionType === ActionType.BURST_ATK)).toBe(false);
    });

    it('executing BURST activates extra turn without advancing round or switching player', () => {
      let state = createInitialGameState();
      // Setup P1 with GuiYi on WOOD and METAL
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            board: {
              ...state.players.P1.board,
              [WuXing.WOOD]: { yin: 1, yang: 1 },
              [WuXing.METAL]: { yin: 1, yang: 1 }
            }
          }
        }
      };

      let turnCount = 0;
      const sequencePrng = {
        next: () => 0,
        nextInt: () => (turnCount++ === 0 ? 0 : 6), // turn 1 draws index 0 (甲 WOOD), turn 2 draws index 6 (庚 METAL)
        getState: () => 0
      };

      const manager = new TurnManager({ initialState: state, prng: sequencePrng });
      manager.startTurn();

      // Execute BURST on WOOD
      const burstAction = {
        actionType: ActionType.BURST,
        player: 'P1' as const,
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YIN
      };

      const result = manager.executeAction(burstAction);
      expect(result.success).toBe(true);
      expect(result.extraTurn).toBe(true);
      expect(manager.isExtraTurnActive()).toBe(true);
      expect(manager.getState().currentPlayer).toBe('P1');
      expect(manager.getState().round).toBe(1);

      // Start extra turn: available candidates should NOT have BURST even though METAL is still GuiYi
      const extraCandidates = manager.startTurn();
      expect(extraCandidates.some((a) => a.actionType === ActionType.BURST)).toBe(false);
      expect(extraCandidates.some((a) => a.actionType === ActionType.BURST_ATK)).toBe(false);

      // Attempting to force BURST during extra turn must be rejected
      const illegalBurst = manager.executeAction({
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.METAL,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YIN
      });
      expect(illegalBurst.success).toBe(false);
      expect(illegalBurst.message).toContain('连动行动中禁止再次使用爆发动作');

      // Executing a legal normal action concludes the extra turn
      const legalAction = extraCandidates[0];
      const secondResult = manager.executeAction(legalAction);
      expect(secondResult.success).toBe(true);
      expect(manager.isExtraTurnActive()).toBe(false);
      expect(manager.getState().round).toBe(1);
      expect(manager.getState().currentPlayer).toBe('P2');
    });
  });

  describe('4. Victory and Tie-Break Rules (终局平局判定 P2 获胜)', () => {
    it('achieving 五行归元 (GUI_YUAN) ends game immediately with GUI_YUAN reason', () => {
      let state = createInitialGameState();
      // P1 already has 4 GuiYi nodes, WATER needs 1 yang
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            board: {
              [WuXing.WOOD]: { yin: 1, yang: 1 },
              [WuXing.FIRE]: { yin: 1, yang: 1 },
              [WuXing.EARTH]: { yin: 1, yang: 1 },
              [WuXing.METAL]: { yin: 1, yang: 1 },
              [WuXing.WATER]: { yin: 1, yang: 0 }
            }
          }
        }
      };

      // Custom PRNG that always draws 壬 (WATER, YANG, index 8)
      const prng = {
        next: () => 0.8,
        nextInt: () => 8,
        getState: () => 8
      };

      const manager = new TurnManager({ initialState: state, prng });
      manager.startTurn();

      const winAction = {
        actionType: ActionType.AUTO,
        player: 'P1' as const,
        element: WuXing.WATER,
        polarity: Polarity.YANG
      };

      const result = manager.executeAction(winAction);
      expect(result.success).toBe(true);
      expect(manager.getCurrentPhase()).toBe(TurnPhase.GAME_OVER);
      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getState().winner).toBe('P1');
      expect(manager.getState().endReason).toBe('GUI_YUAN');
    });

    it('at maxRounds limit, strictly awards victory to P2 (后手) when scores are tied', () => {
      // 1 round game: P1 acts, then P2 acts to close round 1
      const initialState = createInitialGameState(1);
      const manager = new TurnManager({ initialState });

      // Round 1 P1: AUTO (+1 pt)
      const res1 = manager.step();
      expect(res1.success).toBe(true);
      expect(manager.getState().round).toBe(1);
      expect(manager.getState().currentPlayer).toBe('P2');
      expect(manager.getState().isGameOver).toBe(false);

      // Round 1 P2: AUTO (+1 pt) -> scores are equal (1 vs 1), round 1 completes, game over!
      const res2 = manager.step();
      expect(res2.success).toBe(true);
      expect(manager.getCurrentPhase()).toBe(TurnPhase.GAME_OVER);
      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getState().endReason).toBe('MAX_ROUNDS');

      // Verify tie condition: scores are tied, P2 (后手) strictly wins!
      expect(manager.getState().players.P1.score).toBe(manager.getState().players.P2.score);
      expect(manager.getState().winner).toBe('P2');
    });

    it('at maxRounds limit, P1 wins when P1 score > P2 score', () => {
      let state = createInitialGameState(1);
      // Give P1 higher score, start at P2's turn in round 1
      state = {
        ...state,
        currentPlayer: 'P2',
        players: {
          ...state.players,
          P1: { ...state.players.P1, score: 200 },
          P2: { ...state.players.P2, score: 10 }
        }
      };

      const manager = new TurnManager({ initialState: state });
      manager.step();

      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getState().winner).toBe('P1');
      expect(manager.getState().endReason).toBe('MAX_ROUNDS');
    });

    it('allows extra action on final round before triggering MAX_ROUNDS game over', () => {
      // Max 2 rounds game, P2 achieves GuiYi on round 2
      let state = createInitialGameState(2);
      state = {
        ...state,
        round: 2,
        currentPlayer: 'P2',
        players: {
          ...state.players,
          P2: {
            ...state.players.P2,
            board: {
              ...state.players.P2.board,
              [WuXing.WOOD]: { yin: 1, yang: 1 }
            }
          }
        }
      };

      const manager = new TurnManager({
        initialState: state,
        prng: {
          next: () => 0,
          nextInt: () => 0, // draws index 0 (甲 WOOD)
          getState: () => 0
        }
      });
      manager.startTurn();

      // P2 performs BURST on round 2
      const burstAction = {
        actionType: ActionType.BURST,
        player: 'P2' as const,
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YIN
      };
      const res1 = manager.executeAction(burstAction);
      expect(res1.success).toBe(true);
      // Game should NOT be over yet because of extraTurn!
      expect(manager.getState().isGameOver).toBe(false);
      expect(manager.isExtraTurnActive()).toBe(true);

      // Now P2 takes extra turn
      manager.startTurn();
      const res2 = manager.executeAction(manager.getAvailableActions()[0]);
      expect(res2.success).toBe(true);

      // Now MAX_ROUNDS game over is triggered!
      expect(manager.getState().isGameOver).toBe(true);
      expect(manager.getState().endReason).toBe('MAX_ROUNDS');
    });
  });

  describe('5. EventBus Integration', () => {
    it('emits lifecycle events: turn:start, tiangan:draw, action:execute, action:executed, turn:end', () => {
      const bus = new EventBus();
      const onTurnStart = vi.fn();
      const onTianganDraw = vi.fn();
      const onActionExecute = vi.fn();
      const onActionExecuted = vi.fn();
      const onTurnEnd = vi.fn();

      bus.on('turn:start', onTurnStart);
      bus.on('tiangan:draw', onTianganDraw);
      bus.on('action:execute', onActionExecute);
      bus.on('action:executed', onActionExecuted);
      bus.on('turn:end', onTurnEnd);

      const manager = new TurnManager({ eventBus: bus });
      const actions = manager.startTurn();

      expect(onTurnStart).toHaveBeenCalledWith({
        round: 1,
        player: 'P1',
        isExtraTurn: false
      });
      expect(onTianganDraw).toHaveBeenCalledWith({
        tianGan: manager.getCurrentTianGan()
      });

      manager.executeAction(actions[0]);

      expect(onActionExecute).toHaveBeenCalledTimes(1);
      expect(onActionExecuted).toHaveBeenCalledWith(
        expect.objectContaining({
          player: 'P1',
          actionType: actions[0].actionType,
          extraTurn: false
        })
      );
      expect(onTurnEnd).toHaveBeenCalledWith({
        round: 1,
        player: 'P1'
      });
    });

    it('emits burst:extra_turn event when BURST action is executed', () => {
      const bus = new EventBus();
      const onBurstExtraTurn = vi.fn();
      bus.on('burst:extra_turn', onBurstExtraTurn);

      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            board: {
              ...state.players.P1.board,
              [WuXing.WOOD]: { yin: 1, yang: 1 }
            }
          }
        }
      };

      const manager = new TurnManager({
        initialState: state,
        eventBus: bus,
        prng: {
          next: () => 0,
          nextInt: () => 0, // draws index 0 (甲 WOOD)
          getState: () => 0
        }
      });
      manager.startTurn();

      manager.executeAction({
        actionType: ActionType.BURST,
        player: 'P1',
        sourceElement: WuXing.WOOD,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YIN
      });

      expect(onBurstExtraTurn).toHaveBeenCalledWith({ player: 'P1' });
    });

    it('emits game:over event when match concludes', () => {
      const bus = new EventBus();
      const onGameOver = vi.fn();
      bus.on('game:over', onGameOver);

      const state = {
        ...createInitialGameState(1),
        currentPlayer: 'P2' as const
      };
      const manager = new TurnManager({ initialState: state, eventBus: bus });
      manager.step();

      expect(onGameOver).toHaveBeenCalledWith(
        expect.objectContaining({
          winner: expect.anything(),
          endReason: 'MAX_ROUNDS'
        })
      );
    });
  });

  describe('6. Ticket 02: Symmetric Low-State Redirect switch injection', () => {
    const drawStem = (index: number) => ({
      next: () => 0,
      nextInt: () => index,
      getState: () => index
    });

    it('defaults to OFF: a low-state drawn stem yields AUTO only', () => {
      const manager = new TurnManager({ prng: drawStem(0) }); // 甲 WOOD YANG, initial board is VOID
      const actions = manager.startTurn();

      expect(actions).toEqual([
        { actionType: ActionType.AUTO, player: 'P1', element: WuXing.WOOD, polarity: Polarity.YANG }
      ]);
    });

    it('threads lowStateRedirect: true into startTurn candidates', () => {
      const manager = new TurnManager({ prng: drawStem(0), lowStateRedirect: true });
      const actions = manager.startTurn();

      expect(actions).toEqual([
        { actionType: ActionType.AUTO, player: 'P1', element: WuXing.WOOD, polarity: Polarity.YANG },
        {
          actionType: ActionType.ATK,
          player: 'P1',
          sourceElement: WuXing.WOOD,
          polarity: Polarity.YIN
        }
      ]);
    });

    it('does not introduce a redirect branch on the extra-turn path', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            board: {
              ...state.players.P1.board,
              [WuXing.METAL]: { yin: 1, yang: 1 }
            }
          }
        }
      };

      let draw = 0;
      const sequencePrng = {
        next: () => 0,
        nextInt: () => (draw++ === 0 ? 6 : 0), // first 庚 METAL YANG, then 甲 WOOD YANG (low-state)
        getState: () => 0
      };

      const manager = new TurnManager({
        initialState: state,
        prng: sequencePrng,
        lowStateRedirect: true
      });
      manager.startTurn();

      const burst = {
        actionType: ActionType.BURST,
        player: 'P1' as const,
        sourceElement: WuXing.METAL,
        consumePolarity: Polarity.YIN,
        polarity: Polarity.YIN
      };
      expect(manager.executeAction(burst).success).toBe(true);
      expect(manager.isExtraTurnActive()).toBe(true);

      const extraCandidates = manager.startTurn();
      expect(extraCandidates).toEqual([
        { actionType: ActionType.AUTO, player: 'P1', element: WuXing.WOOD, polarity: Polarity.YANG }
      ]);
    });
  });
});
