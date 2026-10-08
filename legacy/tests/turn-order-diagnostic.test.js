import { describe, expect, it } from 'vitest';
import {
  runTurnOrderDiagnostic
} from '../src/js/logic/headless/TurnOrderDiagnostic.js';
import { extractReachableFixedPosition } from '../src/js/logic/headless/FixedPositionContinuations.js';
import { baselineMatch } from './fixtures/fixed-position-continuations/reachable-positions.js';

describe('TurnOrderDiagnostic', () => {
  it('isolates turn-order contribution for positions with burst opportunities', () => {
    // Opportunity 10 in baselineMatch has TRANS, BURST, BURST_ATK
    const position = extractReachableFixedPosition(baselineMatch, {
      id: 'reachable-burst-opportunity-turn-10',
      classification: 'has-burst-opportunity',
      opportunity: 10,
      playerId: 'P2'
    });

    const result = runTurnOrderDiagnostic({
      position,
      strategies: {
        P1: 'build-priority',
        P2: 'attack-priority'
      },
      seeds: [101, 102],
      scoringConfig: {}
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
      variant: 'diagnostic-no-extra-action',
      ruleIdentity: 'diagnostic-control-only-isolated-from-formal-rules',
      positionId: position.id,
      formalComparison: expect.any(Object),
      diagnosticComparison: expect.any(Object),
      turnOrderContributions: expect.any(Array)
    });

    // Check that burst actions have an explicit turnOrderContribution metric
    const burstActions = result.turnOrderContributions.filter(item =>
      ['BURST', 'BURST_ATK'].includes(item.action.type)
    );
    expect(burstActions.length).toBeGreaterThan(0);
    for (const item of burstActions) {
      expect(item).toMatchObject({
        action: expect.any(Object),
        formalValue: expect.any(Number),
        diagnosticValue: expect.any(Number),
        turnOrderValueDelta: expect.any(Number), // formalValue - diagnosticValue
        interpretation: expect.any(String)
      });
    }
  });
});
