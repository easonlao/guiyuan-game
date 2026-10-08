import { describe, expect, it } from 'vitest';
import { runStrategyTournament, TOURNAMENT_STRATEGIES } from '../src/js/logic/headless/StrategyTournament.js';
import { runTurnOrderDiagnostic } from '../src/js/logic/headless/TurnOrderDiagnostic.js';
import { runStrategyEvaluationStudy } from '../src/js/logic/headless/StrategyEvaluation.js';
import { reachableFixedPositions } from './fixtures/fixed-position-continuations/reachable-positions.js';

describe('issue 03: data-driven report and unbiased controls', () => {
  it('records threatModeTriggerCount and outputs "未触发，与建设优先不可区分" when count is 0', () => {
    // In maxTurns: 12 with 1 seed, threat mode (>=8 lit sides) never triggers
    const tournament = runStrategyTournament({
      seeds: [202603],
      maxTurns: 12
    });

    expect(tournament.switchingAnalysis).toBeDefined();
    expect(tournament.switchingAnalysis.threatModeTriggerCount).toBe(0);
    expect(tournament.switchingAnalysis.interpretation).toContain('未触发，与建设优先不可区分');
    expect(tournament.switchingAnalysis.hasSignificantAdvantage).toBe(false);
  });

  it('suppresses directional conclusions when seeds < 6 in strategy tournament and turn order diagnostic', () => {
    const tournament = runStrategyTournament({
      seeds: [201, 202],
      maxTurns: 20
    });
    // seeds.length = 2 < 6
    expect(tournament.switchingAnalysis.interpretation).toMatch(/(未触发，与建设优先不可区分|证据不足)/);
    expect(tournament.switchingAnalysis.hasSignificantAdvantage).toBe(false);

    const diagnostic = runTurnOrderDiagnostic({
      position: reachableFixedPositions[0],
      strategies: { P1: 'build-priority', P2: 'attack-priority' },
      seeds: [201, 202]
    });
    const burstContrib = diagnostic.turnOrderContributions.find(c => c.isBurst);
    if (burstContrib) {
      expect(burstContrib.interpretation).toContain('证据不足');
    }
  });

  it('does not include "收益" or "显著" in conclusions when deltas are zero or evidence is insufficient', () => {
    // Run small study with 2 seeds
    const study = runStrategyEvaluationStudy({
      positions: reachableFixedPositions.slice(0, 1),
      seeds: 2,
      maxTurns: 12,
      config: 'formal-baseline'
    });

    const markdown = study.researchMarkdown;
    // Extract Section 1 Core Questions answers (lines between ## 1. and ## 2.)
    const section1Match = markdown.match(/## 1\. 核心问题回答([\s\S]*?)## 2\./);
    expect(section1Match).not.toBeNull();
    const section1Text = section1Match[1];

    // Filter out the static question 3 title "问题三：局势切换是否提高获胜机会？"
    const lines = section1Text.split('\n');
    for (const line of lines) {
      if (line.includes('### 问题')) continue;
      // In zero delta / insufficient data scenarios, the conclusion lines should not claim positive directional words
      if (line.includes('判定结论') || line.includes('数据结论') || line.includes('次序价值实测')) {
        expect(line).not.toContain('显著');
        expect(line).not.toContain('胜率收益');
        expect(line).not.toContain('超额收益');
      }
    }
  });

  it('cites specific evaluation.json paths and adheres strictly to GLOSSARY.md terminology', () => {
    const study = runStrategyEvaluationStudy({
      positions: reachableFixedPositions.slice(0, 1),
      seeds: 2,
      maxTurns: 12,
      config: 'formal-baseline'
    });

    const markdown = study.researchMarkdown;
    expect(markdown).toContain('evaluation.json#/theoreticalStateSpace');
    expect(markdown).toContain('evaluation.json#/summary/effectiveSamples');
    expect(markdown).toContain('evaluation.json#/tournament/switchingAnalysis');
    expect(markdown).toContain('evaluation.json#/positionAnalyses');

    // Terminology check
    expect(markdown).toContain('五行归元');
    expect(markdown).toContain('回合上限结算');
    expect(markdown).toContain('计分');
    expect(markdown).toContain('化(TRANS)');
    // Must NOT contain old term "化生"
    expect(markdown).not.toContain('化生');
  });

  it('configures fixed-build and fixed-attack as genuine non-switching controls sharing responsive preference table', () => {
    expect(TOURNAMENT_STRATEGIES['fixed-build'].baseStrategy).toBe('situation-responsive');
    expect(TOURNAMENT_STRATEGIES['fixed-attack'].baseStrategy).toBe('situation-responsive');
  });
});
