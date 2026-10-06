/**
 * Full pairwise strategy tournament runner.
 * Evaluates public strategies alongside non-switching fixed-objective controls,
 * with first-player swaps, lighting vs turn-limit settlement breakdowns,
 * and empirical situation-switching value quantification.
 */

import { createInitialHeadlessState } from './HeadlessMatch.js';
import { decidePublicStrategy, decideFixedBuild, decideFixedAttack, isSituationResponsiveThreatMode, PUBLIC_STRATEGIES } from './PublicStrategies.js';
import { summarizePairedDeltas } from './EvaluationStatistics.js';
import { runSeededMatch } from './SeededMatch.js';

function clone(value) {
  return structuredClone(value);
}

export const TOURNAMENT_STRATEGIES = Object.freeze({
  'build-priority': { id: 'build-priority', version: 1, role: 'primary' },
  'attack-priority': { id: 'attack-priority', version: 1, role: 'primary' },
  'situation-responsive': { id: 'situation-responsive', version: 1, role: 'primary' },
  'fixed-build': { id: 'fixed-build', version: 1, role: 'fixed-control', baseStrategy: 'situation-responsive' },
  'fixed-attack': { id: 'fixed-attack', version: 1, role: 'fixed-control', baseStrategy: 'situation-responsive' }
});

function resolveTournamentStrategy(strategyKey) {
  if (['build-priority', 'attack-priority', 'situation-responsive'].includes(strategyKey)) {
    return strategyKey;
  }
  if (strategyKey === 'fixed-build') {
    return {
      id: 'fixed-build',
      version: 1,
      decide: (context, random) => decideFixedBuild(context, random)
    };
  }
  if (strategyKey === 'fixed-attack') {
    return {
      id: 'fixed-attack',
      version: 1,
      decide: (context, random) => decideFixedAttack(context, random)
    };
  }
  throw new TypeError(`unknown tournament strategy: ${strategyKey}`);
}


function computeOutcomeValue(terminalResult, playerId) {
  if (terminalResult.winner === 'DRAW') return 0.5;
  if (terminalResult.winner === playerId) return 1.0;
  return 0.0;
}

function countLitSides(state, playerId) {
  let count = 0;
  for (let element = 0; element < 5; element++) {
    const node = state?.nodeStates?.[`${playerId}-${element}`] ?? { yang: 0, yin: 0 };
    if (node.yang >= 1) count++;
    if (node.yin >= 1) count++;
  }
  return count;
}

/**
 * Run a full pairwise tournament across all registered strategies with starter swaps.
 */
export function runStrategyTournament({ seeds = [202603], maxTurns = 60, scoringConfig = {} } = {}) {
  const strategyKeys = Object.keys(TOURNAMENT_STRATEGIES);
  const matchups = [];
  const allActionSequences = new Set();
  let totalRuns = 0;
  let totalStarterWins = 0;
  let totalLightingWins = 0;
  let totalTurnLimitWins = 0;
  let threatModeTriggerCount = 0;
  const onThreatTrigger = () => {
    threatModeTriggerCount++;
  };

  const strategySeedOutcomes = Object.fromEntries(
    strategyKeys.map(key => [key, Object.fromEntries(seeds.map(s => [s, []]))])
  );

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
        turnLimit: 0,
        unity: 0,
        turnLimitSettlement: 0
      },
      roles: {
        asP1: { matches: 0, wins: 0, draws: 0, losses: 0, value: 0 },
        asP2: { matches: 0, wins: 0, draws: 0, losses: 0, value: 0 },
        asStarter: { matches: 0, wins: 0, draws: 0, losses: 0, value: 0 },
        asFollower: { matches: 0, wins: 0, draws: 0, losses: 0, value: 0 }
      }
    }
  ]));

  // Evaluate every ordered matchup (P1 vs P2) with both starting players
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
        for (const startingPlayer of ['P1', 'P2']) {
          totalRuns++;
          const match = runSeededMatch({
            initialState: createInitialHeadlessState({ maxTurns, currentPlayer: startingPlayer }),
            seed,
            strategies: { P1: p1Strategy, P2: p2Strategy },
            scoringConfig
          });

          if (p1Key === 'situation-responsive' || p2Key === 'situation-responsive') {
            for (const record of match.actionRecords) {
              if (record.action?.type === 'AUTO') continue;
              const actingStrategy = record.playerId === 'P1' ? p1Key : p2Key;
              if (actingStrategy === 'situation-responsive') {
                const turnEntry = match.trajectory.find(t => t.event === 'turn-start' && t.opportunity === record.opportunity);
                if (turnEntry && isSituationResponsiveThreatMode({ playerId: record.playerId, state: turnEntry.state })) {
                  threatModeTriggerCount++;
                }
              }
            }
          }

          const term = match.terminalResult;
          const valP1 = computeOutcomeValue(term, 'P1');
          const valP2 = computeOutcomeValue(term, 'P2');
          strategySeedOutcomes[p1Key][seed].push(valP1);
          strategySeedOutcomes[p2Key][seed].push(valP2);
          const isLighting = term.reason === '所有天干点亮';
          const terminalCategory = isLighting ? '五行归元' : '回合上限结算';
          const litSides = {
            P1: countLitSides(match.finalState, 'P1'),
            P2: countLitSides(match.finalState, 'P2')
          };
          const actionSequence = match.actionRecords.map(r => `${r.playerId}:${r.action.type}:${r.stem.name}`).join(';');
          allActionSequences.add(actionSequence);

          if (term.winner === 'P1') p1Wins++;
          else if (term.winner === 'P2') p2Wins++;
          else draws++;

          if (term.winner === startingPlayer) totalStarterWins++;

          if (isLighting) {
            lightingWins++;
            totalLightingWins++;
          } else {
            turnLimitWins++;
            totalTurnLimitWins++;
          }

          const p1IsStarter = startingPlayer === 'P1';
          // Update strategy P1 stats
          const sumP1 = strategySummaries[p1Key];
          sumP1.matchesPlayed++;
          if (term.winner === 'P1') {
            sumP1.wins++;
            if (isLighting) {
              sumP1.victoryTypes.lighting++;
              sumP1.victoryTypes.unity++;
            } else {
              sumP1.victoryTypes.turnLimit++;
              sumP1.victoryTypes.turnLimitSettlement++;
            }
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

          const p1StarterBucket = p1IsStarter ? sumP1.roles.asStarter : sumP1.roles.asFollower;
          p1StarterBucket.matches++;
          if (term.winner === 'P1') p1StarterBucket.wins++;
          else if (term.winner === 'DRAW') p1StarterBucket.draws++;
          else p1StarterBucket.losses++;
          p1StarterBucket.value += valP1;

          // Update strategy P2 stats
          const sumP2 = strategySummaries[p2Key];
          sumP2.matchesPlayed++;
          if (term.winner === 'P2') {
            sumP2.wins++;
            if (isLighting) {
              sumP2.victoryTypes.lighting++;
              sumP2.victoryTypes.unity++;
            } else {
              sumP2.victoryTypes.turnLimit++;
              sumP2.victoryTypes.turnLimitSettlement++;
            }
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

          const p2StarterBucket = !p1IsStarter ? sumP2.roles.asStarter : sumP2.roles.asFollower;
          p2StarterBucket.matches++;
          if (term.winner === 'P2') p2StarterBucket.wins++;
          else if (term.winner === 'DRAW') p2StarterBucket.draws++;
          else p2StarterBucket.losses++;
          p2StarterBucket.value += valP2;

          matchDetails.push({
            seed,
            startingPlayer,
            winner: term.winner,
            reason: term.reason,
            terminalCategory,
            litSides,
            finalScore: { P1: match.finalState.players.P1.score, P2: match.finalState.players.P2.score },
            consumedStemCount: match.consumedStemCount,
            actionSequence
          });
        }
      }

      const totalMatches = matchDetails.length;
      matchups.push({
        P1: p1Key,
        P2: p2Key,
        totalMatches,
        p1Wins,
        p2Wins,
        draws,
        lightingWins,
        turnLimitWins,
        p1WinRate: totalMatches > 0 ? p1Wins / totalMatches : 0,
        p2WinRate: totalMatches > 0 ? p2Wins / totalMatches : 0,
        drawRate: totalMatches > 0 ? draws / totalMatches : 0,
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

  const seedDeltasFb = [];
  const seedDeltasFa = [];
  for (const seed of seeds) {
    const srVals = strategySeedOutcomes['situation-responsive'][seed];
    const fbVals = strategySeedOutcomes['fixed-build'][seed];
    const faVals = strategySeedOutcomes['fixed-attack'][seed];
    const srSeedMean = srVals.reduce((a, b) => a + b, 0) / (srVals.length || 1);
    const fbSeedMean = fbVals.reduce((a, b) => a + b, 0) / (fbVals.length || 1);
    const faSeedMean = faVals.reduce((a, b) => a + b, 0) / (faVals.length || 1);
    seedDeltasFb.push({ seed, delta: srSeedMean - fbSeedMean });
    seedDeltasFa.push({ seed, delta: srSeedMean - faSeedMean });
  }

  const deltaFbStats = summarizePairedDeltas(seedDeltasFb);
  const deltaFaStats = summarizePairedDeltas(seedDeltasFa);
  const ciFb = deltaFbStats.confidenceInterval95;
  const ciFa = deltaFaStats.confidenceInterval95;

  let switchingInterpretation = '局势切换与固定对照表现相近。';
  if (threatModeTriggerCount === 0) {
    switchingInterpretation = '局势响应策略在所有对局中威胁模式触发 0 次；未触发，与建设优先不可区分。';
  } else if (seeds.length < 6) {
    switchingInterpretation = `种子样本量不足 (n=${seeds.length} < 6)，证据不足，无法做出方向性推断。`;
  } else if (ciFb && ciFa && ciFb.lower > 0 && ciFa.lower > 0 && deltaFb > 0 && deltaFa > 0) {
    switchingInterpretation = `局势响应策略在完整对阵中综合表现优于固定建设 (Δ=+${deltaFb.toFixed(3)}, 95% CI [${ciFb.lower.toFixed(3)}, ${ciFb.upper.toFixed(3)}]) 与固定进攻 (Δ=+${deltaFa.toFixed(3)}, 95% CI [${ciFa.lower.toFixed(3)}, ${ciFa.upper.toFixed(3)}])，置信区间均不跨 0，表明局势响应切换带来了统计上稳健的胜率增益。`;
  } else {
    switchingInterpretation = `局势响应策略相对于固定建设 (Δ=${deltaFb.toFixed(3)}, 95% CI [${ciFb ? `${ciFb.lower.toFixed(3)}, ${ciFb.upper.toFixed(3)}` : 'n/a'}]) 或固定进攻 (Δ=${deltaFa.toFixed(3)}, 95% CI [${ciFa ? `${ciFa.lower.toFixed(3)}, ${ciFa.upper.toFixed(3)}` : 'n/a'}]) 未能同时满足置信区间不跨 0（或未能同时优于两对照），证据不足以支持策略切换带来独立超额优势。`;
  }

  return {
    schemaVersion: 1,
    evaluationType: 'full-strategy-tournament',
    strategies: strategyKeys,
    seeds: clone(seeds),
    maxTurns,
    totalRuns,
    effectiveSamples: allActionSequences.size,
    uniqueActionSequenceCount: allActionSequences.size,
    starterWinRate: totalRuns > 0 ? totalStarterWins / totalRuns : 0,
    terminalDistribution: {
      '五行归元': totalLightingWins,
      '回合上限结算': totalTurnLimitWins
    },
    matchups,
    strategySummaries,
    switchingAnalysis: {
      situationResponsiveValue: srMean,
      fixedBuildValue: fbMean,
      fixedAttackValue: faMean,
      switchingAdvantageOverFixedBuild: deltaFb,
      switchingAdvantageOverFixedAttack: deltaFa,
      threatModeTriggerCount,
      deltaFixedBuildStats: deltaFbStats,
      deltaFixedAttackStats: deltaFaStats,
      hasSignificantAdvantage: Boolean(
        threatModeTriggerCount > 0 &&
        seeds.length >= 6 &&
        ciFb?.lower > 0 &&
        ciFa?.lower > 0
      ),
      interpretation: switchingInterpretation
    },
    inferenceBoundary: '该对阵结果受限于固定的五种公共策略和配置的随机种子；策略切换收益只在包含两类固定对手的混合对阵中成立，不外推为人类最优玩法。'
  };
}
