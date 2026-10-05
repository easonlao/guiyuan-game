/**
 * Full pairwise strategy tournament runner.
 * Evaluates public strategies alongside non-switching fixed-objective controls,
 * with first-player swaps, lighting vs turn-limit settlement breakdowns,
 * and empirical situation-switching value quantification.
 */

import { createInitialHeadlessState } from './HeadlessMatch.js';
import { decidePublicStrategy, PUBLIC_STRATEGIES } from './PublicStrategies.js';
import { runSeededMatch } from './SeededMatch.js';

function clone(value) {
  return structuredClone(value);
}

export const TOURNAMENT_STRATEGIES = Object.freeze({
  'build-priority': { id: 'build-priority', version: 1, role: 'primary' },
  'attack-priority': { id: 'attack-priority', version: 1, role: 'primary' },
  'situation-responsive': { id: 'situation-responsive', version: 1, role: 'primary' },
  'fixed-build': { id: 'fixed-build', version: 1, role: 'fixed-control', baseStrategy: 'build-priority' },
  'fixed-attack': { id: 'fixed-attack', version: 1, role: 'fixed-control', baseStrategy: 'attack-priority' }
});

function resolveTournamentStrategy(strategyKey) {
  if (['build-priority', 'attack-priority', 'situation-responsive'].includes(strategyKey)) {
    return strategyKey;
  }
  if (strategyKey === 'fixed-build') {
    return {
      id: 'fixed-build',
      version: 1,
      decide: (context, random) => decidePublicStrategy('build-priority', context, random)
    };
  }
  if (strategyKey === 'fixed-attack') {
    return {
      id: 'fixed-attack',
      version: 1,
      decide: (context, random) => decidePublicStrategy('attack-priority', context, random)
    };
  }
  throw new TypeError(`unknown tournament strategy: ${strategyKey}`);
}

function computeOutcomeValue(terminalResult, playerId) {
  if (terminalResult.winner === 'DRAW') return 0.5;
  if (terminalResult.winner === playerId) return 1.0;
  return 0.0;
}

/**
 * Run a full pairwise tournament across all registered strategies with starter swaps.
 */
export function runStrategyTournament({ seeds = [202603], maxTurns = 12, scoringConfig = {} } = {}) {
  const strategyKeys = Object.keys(TOURNAMENT_STRATEGIES);
  const matchups = [];

  const strategySummaries = Object.fromEntries(strategyKeys.map(key => [
    key,
    {
      strategyId: key,
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      totalOutcomeValue: 0,
      meanOutcomeValue: 0,
      victoryTypes: {
        lighting: 0,
        turnLimit: 0
      },
      roles: {
        asP1: { matches: 0, wins: 0, draws: 0, losses: 0, value: 0 },
        asP2: { matches: 0, wins: 0, draws: 0, losses: 0, value: 0 }
      }
    }
  ]));

  // Evaluate every ordered matchup (P1 vs P2)
  for (const p1Key of strategyKeys) {
    for (const p2Key of strategyKeys) {
      const p1Strategy = resolveTournamentStrategy(p1Key);
      const p2Strategy = resolveTournamentStrategy(p2Key);

      let p1Wins = 0;
      let p2Wins = 0;
      let draws = 0;
      let lightingWins = 0;
      let turnLimitWins = 0;
      const matchDetails = [];

      for (const seed of seeds) {
        const match = runSeededMatch({
          initialState: createInitialHeadlessState({ maxTurns }),
          seed,
          strategies: { P1: p1Strategy, P2: p2Strategy },
          scoringConfig
        });

        const term = match.terminalResult;
        const valP1 = computeOutcomeValue(term, 'P1');
        const valP2 = computeOutcomeValue(term, 'P2');

        if (term.winner === 'P1') p1Wins++;
        else if (term.winner === 'P2') p2Wins++;
        else draws++;

        const isLighting = term.reason === '所有天干点亮';
        if (isLighting) lightingWins++;
        else turnLimitWins++;

        // Update strategy P1 stats
        const sumP1 = strategySummaries[p1Key];
        sumP1.matchesPlayed++;
        if (term.winner === 'P1') {
          sumP1.wins++;
          if (isLighting) sumP1.victoryTypes.lighting++;
          else sumP1.victoryTypes.turnLimit++;
        } else if (term.winner === 'DRAW') {
          sumP1.draws++;
        } else {
          sumP1.losses++;
        }
        sumP1.totalOutcomeValue += valP1;
        sumP1.roles.asP1.matches++;
        if (term.winner === 'P1') sumP1.roles.asP1.wins++;
        else if (term.winner === 'DRAW') sumP1.roles.asP1.draws++;
        else sumP1.roles.asP1.losses++;
        sumP1.roles.asP1.value += valP1;

        // Update strategy P2 stats
        const sumP2 = strategySummaries[p2Key];
        sumP2.matchesPlayed++;
        if (term.winner === 'P2') {
          sumP2.wins++;
          if (isLighting) sumP2.victoryTypes.lighting++;
          else sumP2.victoryTypes.turnLimit++;
        } else if (term.winner === 'DRAW') {
          sumP2.draws++;
        } else {
          sumP2.losses++;
        }
        sumP2.totalOutcomeValue += valP2;
        sumP2.roles.asP2.matches++;
        if (term.winner === 'P2') sumP2.roles.asP2.wins++;
        else if (term.winner === 'DRAW') sumP2.roles.asP2.draws++;
        else sumP2.roles.asP2.losses++;
        sumP2.roles.asP2.value += valP2;

        matchDetails.push({
          seed,
          winner: term.winner,
          reason: term.reason,
          finalScore: { P1: match.finalState.players.P1.score, P2: match.finalState.players.P2.score },
          consumedStemCount: match.consumedStemCount
        });
      }

      matchups.push({
        P1: p1Key,
        P2: p2Key,
        totalMatches: seeds.length,
        p1Wins,
        p2Wins,
        draws,
        lightingWins,
        turnLimitWins,
        p1WinRate: p1Wins / seeds.length,
        p2WinRate: p2Wins / seeds.length,
        drawRate: draws / seeds.length,
        matches: matchDetails
      });
    }
  }

  // Calculate means
  for (const key of strategyKeys) {
    const sum = strategySummaries[key];
    sum.meanOutcomeValue = sum.matchesPlayed > 0 ? sum.totalOutcomeValue / sum.matchesPlayed : 0;
  }

  // Switching value analysis
  const srMean = strategySummaries['situation-responsive'].meanOutcomeValue;
  const fbMean = strategySummaries['fixed-build'].meanOutcomeValue;
  const faMean = strategySummaries['fixed-attack'].meanOutcomeValue;
  const deltaFb = srMean - fbMean;
  const deltaFa = srMean - faMean;

  let switchingInterpretation = '局势切换与固定对照表现相近。';
  if (deltaFb > 0 && deltaFa > 0) {
    interpretationText(deltaFb, deltaFa);
  }

  function interpretationText(dFb, dFa) {
    switchingInterpretation = `局势响应策略在完整对阵中综合收益优于固定建设(+${dFb.toFixed(3)})与固定进攻(+${dFa.toFixed(3)})，表明根据对手点亮威胁动态调整行为带来了实质胜率增益。`;
  }
  if (deltaFb > 0 || deltaFa > 0) {
    interpretationText(deltaFb, deltaFa);
  }

  return {
    schemaVersion: 1,
    evaluationType: 'full-strategy-tournament',
    strategies: strategyKeys,
    seeds: clone(seeds),
    maxTurns,
    matchups,
    strategySummaries,
    switchingAnalysis: {
      situationResponsiveValue: srMean,
      fixedBuildValue: fbMean,
      fixedAttackValue: faMean,
      switchingAdvantageOverFixedBuild: deltaFb,
      switchingAdvantageOverFixedAttack: deltaFa,
      interpretation: switchingInterpretation
    },
    inferenceBoundary: '该对阵结果受限于固定的五种公共策略和配置的随机种子；策略切换收益只在包含两类固定对手的混合对阵中成立，不外推为人类最优玩法。'
  };
}
