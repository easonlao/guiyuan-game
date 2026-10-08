import { describe, expect, it } from 'vitest';
import {
  computeTheoreticalStateSpace,
  analyzeStateStructure,
  classifyPositionSituation
} from '../src/js/logic/headless/StateStructureAnalysis.js';
import { reachableFixedPositions } from './fixtures/fixed-position-continuations/reachable-positions.js';

describe('StateStructureAnalysis', () => {
  describe('computeTheoreticalStateSpace', () => {
    it('computes exact combinatorial and symmetry-reduced theoretical state space', () => {
      const metrics = computeTheoreticalStateSpace();

      expect(metrics).toMatchObject({
        schemaVersion: 1,
        singlePlayer: {
          nodeCount: 5,
          sidesPerNode: 2,
          totalStateBits: 10,
          statesPerSide: 4, // -1, 0, 1, 2
          theoreticalCombinations: 1048576, // 4^10
          symmetryGroup: 'Z5-cyclic-permutation',
          reducedEquivalenceClasses: 209728, // Burnside: (4^10 + 4 * 4^2) / 5
          notes: expect.any(String)
        },
        twoPlayers: {
          totalStateBits: 20,
          theoreticalCombinations: 1099511627776, // 4^20
          notes: expect.any(String)
        },
        inferenceBoundary: expect.stringContaining('状态组合分析不等于对所有完整游戏状态穷举续局')
      });
    });
  });

  describe('analyzeStateStructure', () => {
    it('analyzes individual player and combined state structure without loss of node detail', () => {
      const state = reachableFixedPositions[0].state;
      const analysis = analyzeStateStructure(state);

      expect(analysis).toMatchObject({
        schemaVersion: 1,
        turnCount: state.turnCount,
        maxTurns: state.maxTurns,
        currentPlayer: state.currentPlayer,
        scores: expect.any(Object),
        scoreDifference: expect.any(Number),
        P1: {
          litSideCount: expect.any(Number),
          damagedSideCount: expect.any(Number),
          voidSideCount: expect.any(Number),
          boostedSideCount: expect.any(Number),
          unityNodeCount: expect.any(Number), // both sides >= 1
          harmonyNodeCount: expect.any(Number), // both sides == 2
          nearUnityThreat: expect.any(Boolean) // litSideCount >= 8
        },
        P2: {
          litSideCount: expect.any(Number),
          damagedSideCount: expect.any(Number),
          voidSideCount: expect.any(Number),
          boostedSideCount: expect.any(Number),
          unityNodeCount: expect.any(Number),
          harmonyNodeCount: expect.any(Number),
          nearUnityThreat: expect.any(Boolean)
        }
      });
      // Ensure node-level fidelity is retained
      expect(analysis.nodeStates).toEqual(state.nodeStates);
    });
  });

  describe('classifyPositionSituation', () => {
    it('classifies reachable positions into standardized situation categories', () => {
      for (const position of reachableFixedPositions) {
        const situation = classifyPositionSituation(position);
        expect(situation).toMatchObject({
          positionId: position.id,
          source: position.source,
          stage: expect.stringMatching(/^(early|mid|near-limit)$/),
          scoreStatus: expect.stringMatching(/^(leading|trailing|tied)$/),
          threatLevel: expect.stringMatching(/^(urgent-threat|normal)$/),
          hasBurstOpportunity: expect.any(Boolean),
          primaryContextTag: expect.any(String)
        });
      }
    });
  });
});
