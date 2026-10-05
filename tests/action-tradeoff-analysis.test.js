import { describe, expect, it } from 'vitest';
import {
  simulateImmediateActionEffect,
  generatePositionTradeoffTable,
  declareStrategyIntent,
  verifyStrategyContract
} from '../src/js/logic/headless/ActionTradeoffAnalysis.js';
import { reachableFixedPositions } from './fixtures/fixed-position-continuations/reachable-positions.js';

describe('ActionTradeoffAnalysis', () => {
  describe('simulateImmediateActionEffect', () => {
    it('accurately captures progress, disruption, self-cost, score, and turn-order changes', () => {
      const position = reachableFixedPositions[1]; // reachable-extra-opportunity-turn-11 (already an extra turn)
      const action = { type: 'BURST_ATK', executorId: 'P2', targetEl: 1 }; // Wood attacks Earth

      const effect = simulateImmediateActionEffect(position, action);

      expect(effect).toMatchObject({
        actionType: 'BURST_ATK',
        executorId: 'P2',
        opponentId: 'P1',
        progress: {
          nodesChanged: expect.any(Number),
          damageRepaired: expect.any(Number),
          newLitSides: expect.any(Number)
        },
        disruption: {
          nodesDisrupted: expect.any(Number),
          damageInflicted: expect.any(Number),
          litSidesDestroyed: expect.any(Number)
        },
        selfCost: {
          costPoints: expect.any(Number), // consumed harmony/unity
          sidesReduced: expect.any(Number)
        },
        immediateScoreDelta: expect.any(Number),
        turnOrder: {
          grantsExtraAction: false, // chained extra-turn is suppressed by game rules
          nextPlayer: 'P1'
        },
        tags: expect.arrayContaining(['disrupt-opponent', 'consume-self'])
      });

      // Test a normal turn (not already an extra turn) where BURST grants an extra turn
      const normalPosition = {
        ...position,
        state: { ...position.state, isExtraTurn: false }
      };
      const normalEffect = simulateImmediateActionEffect(normalPosition, action);
      expect(normalEffect.turnOrder).toMatchObject({
        grantsExtraAction: true,
        nextPlayer: 'P2'
      });
      expect(normalEffect.tags).toContain('gain-extra-turn');
    });
  });

  describe('generatePositionTradeoffTable', () => {
    it('produces a full legal first-action trade-off table with board context and immediate effects', () => {
      const position = reachableFixedPositions[0];
      const table = generatePositionTradeoffTable(position);

      expect(table).toMatchObject({
        positionId: position.id,
        turnCount: position.state.turnCount,
        currentPlayer: position.currentPlayer,
        stem: position.currentStem,
        context: {
          remainingTurns: expect.any(Number),
          scoreDifference: expect.any(Number),
          isExtraTurn: expect.any(Boolean),
          pendingBurstPlayer: position.state.pendingBurstPlayer
        },
        isForcedDecision: expect.any(Boolean),
        actions: expect.any(Array)
      });
      expect(table.actions.length).toBeGreaterThan(0);
      for (const entry of table.actions) {
        expect(entry).toMatchObject({
          action: expect.any(Object),
          immediateEffect: expect.any(Object),
          potentialUtility: expect.any(String),
          tags: expect.any(Array)
        });
      }
    });
  });

  describe('declareStrategyIntent & verifyStrategyContract', () => {
    it('declares pre-decision intent and verifies post-decision execution contract', () => {
      const position = reachableFixedPositions[2]; // reachable-trailing-needs-disruption-turn-14
      const context = {
        playerId: position.currentPlayer,
        stem: position.currentStem,
        state: position.state,
        candidates: [{ type: 'ATK', executorId: 'P1', target: { playerId: 'P2', elementIndex: 2, isYang: false } }]
      };

      const intent = declareStrategyIntent('attack-priority', context);
      expect(intent).toMatchObject({
        strategyId: 'attack-priority',
        primaryObjective: 'disrupt-opponent',
        rationale: expect.any(String)
      });

      const selectedAction = context.candidates[0];
      const immediateEffect = simulateImmediateActionEffect(position, selectedAction);
      const verification = verifyStrategyContract(intent, selectedAction, immediateEffect);

      expect(verification).toMatchObject({
        contractFulfilled: true,
        alignment: expect.stringMatching(/^(full|fallback)$/),
        rationale: expect.any(String)
      });
    });

    it('identifies situation-responsive intent switching based on opponent lit-sides threat', () => {
      const positionThreat = reachableFixedPositions[2];
      const threatContext = {
        playerId: 'P1',
        stem: positionThreat.currentStem,
        state: {
          ...positionThreat.state,
          nodeStates: {
            ...positionThreat.state.nodeStates,
            'P2-0': { yang: 1, yin: 1 },
            'P2-1': { yang: 1, yin: 1 },
            'P2-2': { yang: 1, yin: 1 },
            'P2-3': { yang: 1, yin: 1 } // 8 lit sides!
          }
        },
        candidates: [{ type: 'ATK' }]
      };

      const threatIntent = declareStrategyIntent('situation-responsive', threatContext);
      expect(threatIntent.primaryObjective).toBe('urgent-block');

      const normalContext = {
        playerId: 'P1',
        stem: positionThreat.currentStem,
        state: {
          ...positionThreat.state,
          nodeStates: {
            ...positionThreat.state.nodeStates,
            'P2-0': { yang: 1, yin: 0 },
            'P2-1': { yang: 0, yin: 0 },
            'P2-2': { yang: 0, yin: 0 },
            'P2-3': { yang: 0, yin: 0 }
          }
        },
        candidates: [{ type: 'CONVERT' }]
      };

      const normalIntent = declareStrategyIntent('situation-responsive', normalContext);
      expect(normalIntent.primaryObjective).toBe('develop-lead');
    });
  });
});
