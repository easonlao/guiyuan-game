const PLAYER_IDS = ['P1', 'P2'];
const NODE_KEYS = PLAYER_IDS.flatMap(playerId => Array.from({ length: 5 }, (_, elementIndex) => `${playerId}-${elementIndex}`));
const REPEATED_KEY_CAVEAT = 'The key omits score, turn count, and random-stream position; a repeated key is not proof of an infinite loop.';

function countLitSides(nodeStates, playerId) {
  let count = 0;
  for (let elementIndex = 0; elementIndex < 5; elementIndex++) {
    const node = nodeStates[`${playerId}-${elementIndex}`];
    if (node.yang >= 1) count++;
    if (node.yin >= 1) count++;
  }
  return count;
}

function countNormalizedNodes(nodeStates, playerId) {
  let count = 0;
  for (let elementIndex = 0; elementIndex < 5; elementIndex++) {
    const node = nodeStates[`${playerId}-${elementIndex}`];
    if (node.yang >= 1 && node.yin >= 1) count++;
  }
  return count;
}

function boardKeyFor(state) {
  const nodeStates = Object.fromEntries(NODE_KEYS.map(key => [key, {
    yang: state.nodeStates[key].yang,
    yin: state.nodeStates[key].yin
  }]));
  return JSON.stringify({ nodeStates, currentPlayer: state.currentPlayer, isExtraTurn: state.isExtraTurn });
}

/** Create a compact, score-independent board trajectory from a complete match result. */
export function createPositionTrajectory(result) {
  const completed = result.trajectory.filter(entry => entry.event === 'opportunity-complete');
  return completed.map((entry, index) => {
    const record = result.actionRecords[index];
    let progressTransitions = 0;
    let destructionTransitions = 0;
    let progressAmount = 0;
    let destructionAmount = 0;
    for (const change of record?.stateChanges ?? []) {
      const difference = change.after - change.before;
      if (difference > 0) {
        progressTransitions++;
        progressAmount += difference;
      } else if (difference < 0) {
        destructionTransitions++;
        destructionAmount += Math.abs(difference);
      }
    }
    const state = entry.state;
    return {
      opportunity: entry.opportunity,
      actingPlayer: record?.playerId ?? null,
      boardKey: boardKeyFor(state),
      litSides: Object.fromEntries(PLAYER_IDS.map(playerId => [playerId, countLitSides(state.nodeStates, playerId)])),
      normalizedNodes: Object.fromEntries(PLAYER_IDS.map(playerId => [playerId, countNormalizedNodes(state.nodeStates, playerId)])),
      scores: Object.fromEntries(PLAYER_IDS.map(playerId => [playerId, state.players[playerId].score])),
      progressTransitions,
      destructionTransitions,
      progressAmount,
      destructionAmount
    };
  });
}

export function findRepeatedBoardKeys(positionTrajectory) {
  const occurrences = new Map();
  for (const point of positionTrajectory) {
    if (!occurrences.has(point.boardKey)) occurrences.set(point.boardKey, []);
    occurrences.get(point.boardKey).push(point.opportunity);
  }
  return [...occurrences.entries()]
    .filter(([, opportunities]) => opportunities.length > 1)
    .map(([boardKey, opportunities]) => ({
      boardKey,
      count: opportunities.length,
      firstOpportunity: opportunities[0],
      opportunities
    }));
}

function createWinLossDrawMatrix(strategyIds) {
  return Object.fromEntries(strategyIds.map(p1Strategy => [p1Strategy, Object.fromEntries(
    strategyIds.map(p2Strategy => [p2Strategy, {
      P1: 0,
      P2: 0,
      draws: 0,
      completedMatches: 0,
      comparisonIds: [],
      winValue: { P1: null, P2: null }
    }])
  )]));
}

function addOutcome(cell, winner, comparisonId) {
  if (winner === 'P1') cell.P1++;
  else if (winner === 'P2') cell.P2++;
  else if (winner === 'DRAW') cell.draws++;
  cell.completedMatches++;
  cell.comparisonIds.push(comparisonId);
}

function finalizeMatrix(matrix) {
  for (const row of Object.values(matrix)) {
    for (const cell of Object.values(row)) {
      if (cell.completedMatches === 0) continue;
      cell.winValue = {
        P1: (cell.P1 + cell.draws / 2) / cell.completedMatches,
        P2: (cell.P2 + cell.draws / 2) / cell.completedMatches
      };
    }
  }
}

function mean(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function summarizeNumbers(values) {
  return {
    count: values.length,
    mean: mean(values),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null
  };
}

function summarizeConfiguration(results, configuration, strategyIds) {
  const configResults = results.filter(result => result.configurationId === configuration.id);
  const completed = configResults.filter(result => result.status === 'completed');
  const matrix = createWinLossDrawMatrix(strategyIds);
  const matricesByStartingPlayer = Object.fromEntries(PLAYER_IDS.map(playerId => [playerId, createWinLossDrawMatrix(strategyIds)]));
  const actionCounts = {};
  const terminalReasons = {};
  let totalActionRecords = 0;
  let progressTransitions = 0;
  let destructionTransitions = 0;
  let progressAmount = 0;
  let destructionAmount = 0;
  const repeatedMatches = [];

  for (const result of configResults) {
    if (result.status !== 'completed') continue;
    addOutcome(matrix[result.strategies.P1][result.strategies.P2], result.terminalResult.winner, result.comparisonId);
    addOutcome(matricesByStartingPlayer[result.startingPlayer][result.strategies.P1][result.strategies.P2], result.terminalResult.winner, result.comparisonId);
    terminalReasons[result.terminalResult.reason] = (terminalReasons[result.terminalResult.reason] ?? 0) + 1;
    for (const record of result.actionRecords) {
      totalActionRecords++;
      const actionType = record.action?.type ?? 'UNKNOWN';
      actionCounts[actionType] = (actionCounts[actionType] ?? 0) + 1;
      for (const change of record.stateChanges ?? []) {
        const difference = change.after - change.before;
        if (difference > 0) {
          progressTransitions++;
          progressAmount += difference;
        } else if (difference < 0) {
          destructionTransitions++;
          destructionAmount += Math.abs(difference);
        }
      }
    }
    if (result.repeatedBoardKeys.length) {
      repeatedMatches.push({
        comparisonId: result.comparisonId,
        configurationId: result.configurationId,
        repeatedPositions: result.repeatedBoardKeys
      });
    }
  }
  finalizeMatrix(matrix);
  for (const startingPlayer of PLAYER_IDS) finalizeMatrix(matricesByStartingPlayer[startingPlayer]);

  const actionFrequency = Object.fromEntries(Object.entries(actionCounts).map(([type, count]) => [type, {
    count,
    frequency: totalActionRecords ? count / totalActionRecords : 0
  }]));
  const unityVictoryCount = terminalReasons['所有天干点亮'] ?? 0;
  const turnLimitSettlementCount = terminalReasons['回合上限'] ?? 0;
  const repeatOccurrences = repeatedMatches.reduce((total, match) => total + match.repeatedPositions
    .reduce((subtotal, repeated) => subtotal + repeated.count - 1, 0), 0);

  return {
    role: configuration.role,
    scoringConfig: configuration.scoringConfig,
    plannedMatches: configResults.length,
    completedMatches: completed.length,
    failedMatches: configResults.length - completed.length,
    winLossDrawMatrix: matrix,
    winLossDrawMatrixByStartingPlayer: matricesByStartingPlayer,
    sourceComparisonIds: completed.map(result => result.comparisonId),
    actionFrequency: { totalActionRecords, actions: actionFrequency },
    matchLength: {
      opportunities: summarizeNumbers(completed.map(result => result.actionRecords.length)),
      consumedStems: summarizeNumbers(completed.map(result => result.consumedStemCount))
    },
    terminalReasons,
    unityVictory: {
      count: unityVictoryCount,
      rate: completed.length ? unityVictoryCount / completed.length : null
    },
    turnLimitSettlement: {
      count: turnLimitSettlementCount,
      rate: completed.length ? turnLimitSettlementCount / completed.length : null
    },
    progressAndDestruction: {
      progressTransitions,
      destructionTransitions,
      progressAmount,
      destructionAmount
    },
    repeatedBoardKeys: {
      keyFields: ['nodeStates', 'currentPlayer', 'isExtraTurn'],
      matchesWithRepeats: repeatedMatches.length,
      repeatOccurrences,
      matches: repeatedMatches,
      caveat: REPEATED_KEY_CAVEAT
    }
  };
}

function winValueFor(winner, playerId = 'P1') {
  if (winner === 'DRAW') return 0.5;
  return winner === playerId ? 1 : 0;
}

const T_95 = [
  null, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262,
  2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093,
  2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042
];

function summarizePairedDeltas(clusters) {
  const deltas = clusters.map(cluster => cluster.delta);
  const clusterCount = deltas.length;
  const average = mean(deltas);
  let standardError = null;
  let confidenceInterval95 = null;
  if (clusterCount > 1) {
    const squaredDifferenceTotal = deltas.reduce((total, delta) => total + (delta - average) ** 2, 0);
    const sampleStandardDeviation = Math.sqrt(squaredDifferenceTotal / (clusterCount - 1));
    standardError = sampleStandardDeviation / Math.sqrt(clusterCount);
    const criticalValue = clusterCount - 1 <= 30 ? T_95[clusterCount - 1] : 1.96;
    confidenceInterval95 = {
      lower: average - criticalValue * standardError,
      upper: average + criticalValue * standardError
    };
  }
  return {
    mean: average,
    standardError,
    confidenceInterval95,
    sampleClusters: clusterCount,
    clusterUnit: 'seed; averaged over both starting players',
    intervalMethod: 'paired seed-cluster mean with a two-sided 95% Student t interval (normal approximation above 30 clusters)'
  };
}

function summarizePairedComparison(results, configurations, strategyIds) {
  const baseline = configurations.find(configuration => configuration.role === 'baseline');
  const experiment = configurations.find(configuration => configuration.role === 'experiment');
  const byStrategyPair = {};
  for (const p1Strategy of strategyIds) {
    for (const p2Strategy of strategyIds) {
      const pairRuns = results.filter(result => result.strategies.P1 === p1Strategy && result.strategies.P2 === p2Strategy);
      const sampleIndexes = [...new Set(pairRuns.map(result => result.sampleIndex))].sort((left, right) => left - right);
      const clusters = [];
      const incompleteClusters = [];
      for (const sampleIndex of sampleIndexes) {
        const scenarios = PLAYER_IDS.map(startingPlayer => {
          const baselineRun = pairRuns.find(result => result.sampleIndex === sampleIndex
            && result.startingPlayer === startingPlayer && result.configurationId === baseline.id);
          const experimentRun = pairRuns.find(result => result.sampleIndex === sampleIndex
            && result.startingPlayer === startingPlayer && result.configurationId === experiment.id);
          return { startingPlayer, baselineRun, experimentRun };
        });
        const complete = scenarios.every(scenario => scenario.baselineRun?.status === 'completed'
          && scenario.experimentRun?.status === 'completed');
        if (!complete) {
          incompleteClusters.push({
            sampleIndex,
            seed: scenarios.find(scenario => scenario.baselineRun || scenario.experimentRun)?.baselineRun?.seed
              ?? scenarios.find(scenario => scenario.baselineRun || scenario.experimentRun)?.experimentRun?.seed,
            missingOrFailed: scenarios.flatMap(scenario => [scenario.baselineRun, scenario.experimentRun]
              .filter(run => run?.status !== 'completed')
              .map(run => ({ startingPlayer: scenario.startingPlayer, configurationRole: run?.configurationRole ?? null, error: run?.error ?? null })))
          });
          continue;
        }
        const baselineWinValue = mean(scenarios.map(scenario => winValueFor(scenario.baselineRun.terminalResult.winner)));
        const experimentWinValue = mean(scenarios.map(scenario => winValueFor(scenario.experimentRun.terminalResult.winner)));
        clusters.push({
          sampleIndex,
          seed: scenarios[0].baselineRun.seed,
          baselineWinValue,
          experimentWinValue,
          delta: experimentWinValue - baselineWinValue,
          startingPlayers: PLAYER_IDS.slice()
        });
      }
      byStrategyPair[`${p1Strategy}|${p2Strategy}`] = {
        strategies: { P1: p1Strategy, P2: p2Strategy },
        plannedClusters: sampleIndexes.length,
        completeClusters: clusters.length,
        incompleteClusters,
        clusters,
        pairedWinValueDelta: summarizePairedDeltas(clusters)
      };
    }
  }
  return {
    baselineConfigurationId: baseline.id,
    experimentConfigurationId: experiment.id,
    plannedClustersPerStrategyPair: Math.max(0, ...Object.values(byStrategyPair).map(pair => pair.plannedClusters)),
    byStrategyPair
  };
}

export function summarizeBatchResults(results, configurations, strategyIds) {
  return {
    configurations: Object.fromEntries(configurations.map(configuration => [
      configuration.id,
      summarizeConfiguration(results, configuration, strategyIds)
    ])),
    pairedComparison: summarizePairedComparison(results, configurations, strategyIds)
  };
}

export { boardKeyFor };
