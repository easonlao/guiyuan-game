import { createHash } from 'node:crypto';
import { createScoringConfig } from '../actions/ScoringConfig.js';
import { runBatchComparison } from './BatchComparison.js';
import { evaluateCrossoverConfirmation as runCrossoverConfirmation } from './CrossoverConfirmation.js';
import { enumerateLegalFirstActions } from './FixedPositionContinuations.js';
import { PUBLIC_STRATEGIES, decidePublicStrategy } from './PublicStrategies.js';
import { SEEDED_RANDOM_VERSION } from './SeededRandom.js';

export const SCORING_SELECTIONS = Object.freeze({
  'formal-baseline': Object.freeze({}),
  'no-self-cost-reward': Object.freeze({ version: 1, noSelfCostReward: true }),
  'burst-action-score-once': Object.freeze({ version: 1, burstActionScoreOnce: true }),
  'disable-rarity-bonus': Object.freeze({ version: 1, disableRarityBonus: true }),
  combined: Object.freeze({ version: 1, noSelfCostReward: true, burstActionScoreOnce: true, disableRarityBonus: true })
});

const STRATEGY_IDS = Object.keys(PUBLIC_STRATEGIES);
const STRATEGY_PAIRS = [
  ['build-priority', 'attack-priority'],
  ['build-priority', 'situation-responsive'],
  ['attack-priority', 'situation-responsive']
];

function clone(value) {
  return structuredClone(value);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function scoringConfigOptions(snapshot) {
  return {
    version: snapshot.version,
    noSelfCostReward: snapshot.noSelfCostReward,
    burstActionScoreOnce: snapshot.burstActionScoreOnce,
    disableRarityBonus: snapshot.disableRarityBonus
  };
}

function branchOutcomeCounts(branch) {
  const counts = { wins: 0, draws: 0, losses: 0, failed: 0, budgetSkipped: 0 };
  for (const sample of branch?.samples ?? []) {
    if (sample.status === 'completed') counts[sample.outcome === 'loss' ? 'losses' : `${sample.outcome}s`]++;
    else if (sample.status === 'not-run-budget') counts.budgetSkipped++;
    else counts.failed++;
  }
  return counts;
}

function pairOmissionCounts(branchA, branchB) {
  const statusesBySeed = new Map();
  for (const sample of [...(branchA?.samples ?? []), ...(branchB?.samples ?? [])]) {
    const key = JSON.stringify([typeof sample.seed, sample.seed]);
    const statuses = statusesBySeed.get(key) ?? { failed: false, budgetSkipped: false };
    statuses.failed ||= sample.status === 'failed';
    statuses.budgetSkipped ||= sample.status === 'not-run-budget';
    statusesBySeed.set(key, statuses);
  }
  const seeds = [...statusesBySeed.values()];
  const failed = seeds.filter(statuses => statuses.failed).length;
  const budgetSkipped = seeds.filter(statuses => !statuses.failed && statuses.budgetSkipped).length;
  return { failed, budgetSkipped };
}

function pairCounts(pair, opponent, comparisons) {
  const comparisonIndex = pair.comparisonIndexes?.[opponent.id];
  const comparison = comparisonIndex === null || comparisonIndex === undefined ? null : comparisons[comparisonIndex];
  const [candidateA, candidateB] = pair.candidateIndices ?? [];
  const branchA = comparison?.firstActions.find(branch => branch.candidateIndex === candidateA);
  const branchB = comparison?.firstActions.find(branch => branch.candidateIndex === candidateB);
  const countsA = branchOutcomeCounts(branchA);
  const countsB = branchOutcomeCounts(branchB);
  const omissions = pairOmissionCounts(branchA, branchB);
  return {
    requested: opponent.requestedPairCount ?? 0,
    completed: opponent.pairedCount ?? 0,
    missing: opponent.missingSeeds?.length ?? 0,
    ...omissions,
    actions: { A: countsA, B: countsB }
  };
}

function addPairCounts(pair, comparisons) {
  return {
    ...pair,
    qualified: pair.classification === 'crossover',
    opponents: pair.opponents.map(opponent => ({
      ...opponent,
      counts: pairCounts(pair, opponent, comparisons)
    }))
  };
}

/** Add explicit count and coverage aliases while retaining the crossover module's raw comparisons. */
export function evaluateCrossoverConfirmation(input = {}) {
  const report = runCrossoverConfirmation(input);
  return {
    ...report,
    discovery: { ...report.discovery, pairs: report.discovery.pairs.map(pair => addPairCounts(pair, report.discovery.comparisons)) },
    confirmation: { ...report.confirmation, pairs: report.confirmation.pairs.map(pair => addPairCounts(pair, report.confirmation.comparisons)) },
    summary: {
      ...report.summary,
      coverage: {
        planned: report.summary.plannedMatchCount,
        attempted: report.summary.attemptedMatchCount,
        completed: report.summary.completedMatchCount,
        failed: report.summary.failedMatchCount,
        budgetSkipped: report.summary.budgetSkippedMatchCount
      }
    }
  };
}

function generateSeeds(seed, count, phase, discoverySampleCount) {
  return Array.from({ length: count }, (_, index) => {
    if (typeof seed === 'number') {
      const offset = phase === 'confirmation' ? discoverySampleCount : 0;
      const next = seed + offset + index;
      if (!Number.isSafeInteger(next)) throw new TypeError('seed range exceeds safe integer values');
      return next;
    }
    if (typeof seed !== 'string' || seed.length === 0) throw new TypeError('seed must be a non-empty string or safe integer');
    if (phase === 'discovery') return index === 0 ? seed : `${seed}#sample-${index + 1}`;
    return `${seed}#confirmation-${index + 1}`;
  });
}

function identity(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function provenanceIdentity(provenance) {
  if (provenance?.kind !== 'seeded-match') return clone(provenance ?? null);
  return {
    kind: provenance.kind,
    seed: provenance.seed,
    randomVersion: provenance.randomVersion,
    strategyIdentities: clone(provenance.strategyIdentities),
    opportunity: provenance.opportunity,
    actionRecordIndex: provenance.actionRecordIndex,
    phaseNormalization: clone(provenance.phaseNormalization),
    baselineMatchSha256: identity(provenance.baselineMatch)
  };
}

function replayCheckpoint(position) {
  return {
    schemaVersion: position.schemaVersion,
    id: position.id,
    classification: position.classification,
    source: position.source,
    currentPlayer: position.currentPlayer,
    currentStem: clone(position.currentStem),
    isExtraTurn: position.isExtraTurn,
    pendingBurstPlayer: position.pendingBurstPlayer,
    state: clone(position.state),
    provenance: provenanceIdentity(position.provenance)
  };
}

function resolveScoringSelections(selection) {
  if (selection === 'all') return Object.entries(SCORING_SELECTIONS);
  if (!Object.hasOwn(SCORING_SELECTIONS, selection)) {
    throw new TypeError(`unknown scoring selection ${selection}; choose ${Object.keys(SCORING_SELECTIONS).join(', ')}, all`);
  }
  return [[selection, SCORING_SELECTIONS[selection]]];
}

function choosePolicyAction(position, candidates, strategyId) {
  const state = position.state;
  return decidePublicStrategy(strategyId, {
    playerId: position.currentPlayer,
    stem: position.currentStem,
    state: {
      currentPlayer: position.currentPlayer,
      turnCount: state.turnCount,
      maxTurns: state.maxTurns,
      isExtraTurn: state.isExtraTurn,
      scores: { P1: state.players.P1.score, P2: state.players.P2.score },
      nodeStates: state.nodeStates
    },
    history: [],
    candidates
  }, () => 0);
}

function findHumanReviewCases(evaluations, positions) {
  const cases = [];
  for (const evaluation of evaluations) {
    const positionById = new Map(positions.map(position => [position.id, position]));
    const scoring = scoringConfigOptions(evaluation.scoringConfig);
    for (const position of positions) {
      const candidates = enumerateLegalFirstActions(position, { scoringConfig: scoring }).actions;
      const choices = STRATEGY_IDS.map(strategy => ({
        strategy,
        action: choosePolicyAction(position, candidates, strategy)
      })).filter(choice => choice.action);
      for (let firstIndex = 0; firstIndex < choices.length; firstIndex++) {
        const second = choices.slice(firstIndex + 1).find(choice => !sameValue(choice.action, choices[firstIndex].action));
        if (!second) continue;
        cases.push({
          kind: 'public-policy-action-disagreement',
          positionId: position.id,
          positionClassification: position.classification,
          positionSource: position.source,
          replayCheckpoint: replayCheckpoint(position),
          actions: [clone(choices[firstIndex].action), clone(second.action)],
          strategies: [choices[firstIndex].strategy, second.strategy],
          whySelected: 'These named public policies choose different legal first actions on the same frozen checkpoint.',
          evidence: { scoringConfig: clone(evaluation.scoringConfig), status: 'deterministic policy choice, not an estimated winning action' },
          limits: 'One checkpoint and fixed policy definitions do not predict human choices or prove that players understand the trade-off.'
        });
        break;
      }
    }
    for (const pair of evaluation.result.discovery.pairs) {
      if (pair.opponents.length !== 2 || pair.opponents.some(opponent => opponent.meanDifference === null || opponent.meanDifference === 0)) continue;
      if (Math.sign(pair.opponents[0].meanDifference) === Math.sign(pair.opponents[1].meanDifference)) continue;
      const position = positionById.get(pair.positionId);
      cases.push({
        kind: 'estimated-preferred-action-differs-by-opponent',
        positionId: pair.positionId,
        positionClassification: position?.classification ?? 'unknown',
        positionSource: position?.source ?? 'unknown',
        replayCheckpoint: position ? replayCheckpoint(position) : null,
        actions: clone(pair.actions),
        strategies: [evaluation.focalStrategy, ...evaluation.opponents.map(opponent => opponent.id)],
        whySelected: 'The discovery point estimates prefer opposite actions against the two named opponents, even when the preregistered evidence threshold is not met.',
        evidence: {
          scoringConfig: clone(evaluation.scoringConfig),
          discoveryClassification: pair.classification,
          opponents: clone(pair.opponents),
          confirmation: evaluation.result.confirmation.pairs.find(candidate => candidate.positionId === pair.positionId
            && sameValue(candidate.candidateIndices, pair.candidateIndices)) ?? null
        },
        limits: 'Exploratory point estimates may be noisy and were selected after examining multiple positions and action pairs; this is a playtest lead, not evidence of reliable advantage.'
      });
    }
  }
  const uniqueCases = new Map();
  for (const item of cases) {
    const key = `${item.kind}:${item.positionId}:${JSON.stringify(item.actions)}:${JSON.stringify(item.strategies)}`;
    if (!uniqueCases.has(key)) uniqueCases.set(key, item);
  }
  return [...uniqueCases.values()];
}

function pairedDeltas(batchReport) {
  return Object.values(batchReport.summary.pairedComparison.byStrategyPair).map(pair => ({
    strategies: pair.strategies,
    mean: pair.pairedWinValueDelta.mean,
    interval95: pair.pairedWinValueDelta.confidenceInterval95,
    clusters: pair.pairedWinValueDelta.sampleClusters,
    plannedClusters: pair.plannedClusters
  }));
}

function summarizeEvaluation(report) {
  return {
    focalStrategy: report.configuration.focalStrategy,
    opponents: report.configuration.opponents,
    configuration: report.configuration,
    summary: report.summary,
    discoveryPairs: report.discovery.pairs,
    confirmationPairs: report.confirmation.pairs,
    limitations: report.limitations
  };
}

function buildResearchMarkdown(study) {
  const { coverage } = study.summary;
  const lines = [
    '# Headless strategy evaluation',
    '',
    '## Observed facts',
    '',
    `- Revision: ${study.revision.commit ?? 'unavailable'}; working-tree status: ${study.revision.workingTree ?? 'unavailable'}; source SHA-256: ${study.revision.sourceSha256 ?? 'unavailable'}.`,
    `- Planned / completed / failed / budget-skipped runs: ${coverage.planned} / ${coverage.completed} / ${coverage.failed} / ${coverage.skipped}.`,
    `- Frozen positions: ${study.plan.positions.map(position => `${position.id} (${position.classification}, ${position.source}, sha256 ${position.stateSha256})`).join('; ')}.`,
    `- Scoring selections: ${study.plan.scoringSelections.map(selection => `${selection.id}=${selection.scoringConfig.name}@${selection.scoringConfig.version}`).join('; ')}.`,
    `- Fixed-position reports: ${study.evaluations.length}; paired batch comparison reports: ${study.batchComparisons.length}; repeated formal-baseline controls retained: ${study.summary.baselineControls}.`,
    `- Human-review cases selected from actual records: ${study.humanCases.length}.`
  ];
  for (const comparison of study.batchComparisons) {
    lines.push(`- ${comparison.selection}: paired terminal-value deltas (selection − formal baseline) by ordered strategy assignment: ${comparison.pairedDeltas.map(item => `${item.strategies.P1} vs ${item.strategies.P2} ${item.mean === null ? 'n/a' : item.mean.toFixed(3)} [${item.interval95 ? `${item.interval95.lower.toFixed(3)}, ${item.interval95.upper.toFixed(3)}` : 'n/a'}], seed clusters ${item.clusters}/${item.plannedClusters}`).join('; ')}.`);
    const pointEstimateDeclines = comparison.pairedDeltas.filter(item => item.mean !== null && item.mean < 0);
    lines.push(`- ${comparison.selection}: ${pointEstimateDeclines.length
      ? `lower candidate point estimates observed for ${pointEstimateDeclines.map(item => `${item.strategies.P1} vs ${item.strategies.P2}`).join(', ')}`
      : 'no lower candidate point estimate observed'}; these small paired estimates do not establish absence of a real decline.`);
    for (const config of comparison.result.plan.configurations) {
      const summary = comparison.result.summary.configurations[config.id];
      const actions = Object.entries(summary.actionFrequency.actions).map(([type, metric]) => `${type} ${metric.count}`).join(', ') || 'none';
      lines.push(`- ${comparison.selection} ${config.role}: matches ${summary.completedMatches}/${summary.plannedMatches}; actions ${actions}; mean opportunities ${summary.matchLength.opportunities.mean}; unity wins ${summary.unityVictory.count}; turn-limit settlements ${summary.turnLimitSettlement.count}; repeated-board matches ${summary.repeatedBoardKeys.matchesWithRepeats}; progress/destruction amount ${summary.progressAndDestruction.progressAmount}/${summary.progressAndDestruction.destructionAmount}.`);
    }
  }
  for (const selection of study.plan.scoringSelections) {
    const classifications = study.evaluations.filter(item => item.selection === selection.id)
      .flatMap(item => item.result.discovery.pairs).reduce((counts, pair) => {
        counts[pair.classification] = (counts[pair.classification] ?? 0) + 1;
        return counts;
      }, {});
    const confirmed = study.evaluations.filter(item => item.selection === selection.id)
      .reduce((total, item) => total + item.result.summary.confirmedPairCount, 0);
    lines.push(`- ${selection.id} fixed-position discovery classifications: ${JSON.stringify(classifications)}; independent confirmations: ${confirmed}.`);
  }
  lines.push('', '## Limited inference', '');
  lines.push('- Outcomes are conditional on the finite frozen checkpoint set, the stated public continuation policies, paired seeds, and the formal win/draw/loss value scale. They do not identify globally optimal actions or establish general player advantage.');
  lines.push('- A confirmed reversal supports a conditional trade-off only in the tested states and policy range. Action frequency, close scores, and longer matches are descriptive diagnostics, not standalone evidence of better play.');
  lines.push('- Crossover search examines multiple positions and action pairs, so exploration results are selected estimates; only declared discovery qualifications are checked on disjoint confirmation seeds.');
  lines.push('- The report retains failures and budget skips rather than converting them to draws. No automatic formal-scoring change follows from these findings.');
  lines.push('', '## Human questions', '');
  if (study.humanCases.length === 0) lines.push('- No actual public-policy action disagreement or opponent-conditioned estimated action-preference reversal appeared; no case is fabricated.');
  else {
    for (const [index, item] of study.humanCases.entries()) {
      lines.push(`- Case ${index + 1}: ${item.kind} at ${item.positionId}; exact actions ${JSON.stringify(item.actions)}. ${item.whySelected} Evidence limit: ${item.limits}`);
    }
  }
  lines.push('', 'For each actual case, ask:', '', '1. Did anticipating this opponent change which first action you chose?', '2. Did a correct read of the opponent create a meaningful advantage?', '3. After attacking, did you still have a useful way to make progress?', '', 'No scoring selection is automatically adopted.');
  return lines.join('\n');
}

/** Run the issue-08 scoring and policy grid sequentially, retaining all raw comparisons. */
export function runStrategyEvaluationStudy(options = {}) {
  const positions = options.positions;
  if (!Array.isArray(positions) || positions.length === 0) throw new TypeError('positions must be a non-empty frozen-position collection');
  const discoverySamples = options.discoverySamples ?? options.samples ?? 2;
  const confirmationSamples = options.confirmationSamples ?? options.samples ?? 2;
  const seed = options.seed ?? 202603;
  const maxTurns = options.maxTurns ?? 12;
  if (!Number.isSafeInteger(discoverySamples) || discoverySamples < 1) throw new TypeError('discoverySamples must be a positive safe integer');
  if (!Number.isSafeInteger(confirmationSamples) || confirmationSamples < 1) throw new TypeError('confirmationSamples must be a positive safe integer');
  if (!Number.isSafeInteger(maxTurns) || maxTurns < 1) throw new TypeError('maxTurns must be a positive safe integer');
  const discoverySeeds = generateSeeds(seed, discoverySamples, 'discovery', discoverySamples);
  const confirmationSeeds = generateSeeds(seed, confirmationSamples, 'confirmation', discoverySamples);
  const selections = resolveScoringSelections(options.config ?? 'all');
  const criteria = {
    minimumEffect: options.minimumEffect ?? 0.1,
    minimumPairs: options.minimumPairs ?? 6,
    uncertaintyMethod: 'paired-normal-95',
    evidenceRule: 'interval-excludes-zero'
  };
  if (options.maxRuns !== null && options.maxRuns !== undefined
    && (!Number.isSafeInteger(options.maxRuns) || options.maxRuns < 0)) throw new TypeError('maxRuns must be a non-negative safe integer');

  const revision = options.revision ?? { commit: null, workingTree: null };
  const batchComparisons = [];
  const evaluations = [];
  let remainingBudget = options.maxRuns ?? undefined;
  let fixedAttempted = 0;
  for (const [selection, scoringConfig] of selections) {
    const batch = runBatchComparison({
      samples: discoverySamples,
      seed,
      maxTurns,
      baselineScoringConfig: {},
      experimentalScoringConfig: scoringConfig
    });
    batchComparisons.push({
      selection,
      result: batch,
      pairedDeltas: pairedDeltas(batch),
      baselineControlReuse: {
        identity: `${seed}:sample-count-${discoverySamples}:formal-baseline`,
        appearsInThisComparison: batch.results.filter(result => result.configurationRole === 'baseline').length,
        note: 'runBatchComparison reruns the formal-baseline controls for every selection; these repeated results are disclosed and are not treated as independent controls.'
      }
    });
    for (const focalStrategy of STRATEGY_IDS) {
      for (const opponentPair of STRATEGY_PAIRS) {
        const opponents = opponentPair.map(strategy => ({ id: strategy, strategy }));
        const result = evaluateCrossoverConfirmation({
          positions,
          focalStrategy,
          opponents,
          discoverySeeds,
          confirmationSeeds,
          scoringConfig,
          criteria,
          ...(remainingBudget === undefined ? {} : { maxRuns: remainingBudget })
        });
        fixedAttempted += result.summary.attemptedMatchCount;
        if (remainingBudget !== undefined) remainingBudget = Math.max(0, remainingBudget - result.summary.attemptedMatchCount);
        evaluations.push({ selection, scoringConfig: result.configuration.scoringConfig, focalStrategy, opponents, result });
      }
    }
  }

  const batchCoverage = batchComparisons.reduce((coverage, comparison) => ({
    planned: coverage.planned + comparison.result.plan.plannedMatches,
    completed: coverage.completed + comparison.result.coverage.completedMatches,
    failed: coverage.failed + comparison.result.coverage.failedMatches,
    skipped: coverage.skipped + comparison.result.coverage.skippedMatches
  }), { planned: 0, completed: 0, failed: 0, skipped: 0 });
  const fixedCoverage = evaluations.reduce((coverage, evaluation) => ({
    planned: coverage.planned + evaluation.result.summary.plannedMatchCount,
    completed: coverage.completed + evaluation.result.summary.completedMatchCount,
    failed: coverage.failed + evaluation.result.summary.failedMatchCount,
    skipped: coverage.skipped + evaluation.result.summary.budgetSkippedMatchCount
  }), { planned: 0, completed: 0, failed: 0, skipped: 0 });
  const discoveryClassifications = evaluations.flatMap(evaluation => evaluation.result.discovery.pairs)
    .reduce((counts, pair) => {
      counts[pair.classification] = (counts[pair.classification] ?? 0) + 1;
      return counts;
    }, {});
  const humanCases = findHumanReviewCases(evaluations, positions);
  const configurationSnapshots = selections.map(([name, input]) => ({
    id: name,
    selection: name,
    scoringConfig: createScoringConfig(input)
  }));
  const study = {
    schemaVersion: 1,
    status: 'complete',
    plan: {
      seed,
      discoverySeeds,
      confirmationSeeds,
      discoverySamples,
      confirmationSamples,
      maxTurns,
      maxRuns: options.maxRuns ?? null,
      randomVersion: SEEDED_RANDOM_VERSION,
      criteria,
      strategyDefinitions: STRATEGY_IDS.map(id => clone(PUBLIC_STRATEGIES[id])),
      strategyAssignments: STRATEGY_IDS.flatMap(P1 => STRATEGY_IDS.map(P2 => ({ P1, P2 }))),
      focalOpponentPairsPerConfiguration: STRATEGY_IDS.length * STRATEGY_PAIRS.length,
      scoringSelections: configurationSnapshots,
      positions: positions.map(position => ({
        id: position.id,
        classification: position.classification,
        source: position.source,
        stateSha256: identity(position.state),
        currentPlayer: position.currentPlayer,
        currentStem: clone(position.currentStem),
        turnCount: position.state.turnCount,
        maxTurns: position.state.maxTurns,
        provenance: provenanceIdentity(position.provenance)
      })),
      fixedPositionLimitations: 'Frozen checkpoints keep their recorded maxTurns; --max-turns controls paired initial-state batch comparisons only.'
    },
    revision: clone(revision),
    batchComparisons,
    evaluations: evaluations.map(evaluation => ({
      selection: evaluation.selection,
      scoringConfig: evaluation.scoringConfig,
      focalStrategy: evaluation.focalStrategy,
      opponents: evaluation.opponents,
      result: evaluation.result
    })),
    humanCases,
    summary: {
      coverage: {
        planned: batchCoverage.planned + fixedCoverage.planned,
        completed: batchCoverage.completed + fixedCoverage.completed,
        failed: batchCoverage.failed + fixedCoverage.failed,
        skipped: batchCoverage.skipped + fixedCoverage.skipped,
        continuationBudgetAttempted: fixedAttempted,
        batchMatches: batchCoverage,
        fixedContinuations: fixedCoverage
      },
      discoveryClassifications,
      confirmedPairs: evaluations.reduce((sum, evaluation) => sum + evaluation.result.summary.confirmedPairCount, 0),
      notConfirmedPairs: evaluations.reduce((sum, evaluation) => sum + evaluation.result.summary.notConfirmedPairCount, 0),
      notRunPairs: evaluations.reduce((sum, evaluation) => sum + evaluation.result.summary.notRunPairCount, 0),
      baselineControls: batchComparisons.reduce((sum, comparison) => sum + comparison.baselineControlReuse.appearsInThisComparison, 0)
    },
    limitations: [
      'All strategy-selection results are scoped to the three named public strategies and the supplied frozen checkpoints.',
      'Each runBatchComparison selection repeats the formal baseline controls; repeated matches are disclosed and are not independent new controls.',
      'A paired heavenly-stem seed does not guarantee identical personal stem opportunities after extra actions diverge.',
      'Human playability, opponent-reading behavior, and willingness to replay require human sessions; automated evidence cannot answer them.'
    ]
  };
  study.summary.status = study.summary.coverage.failed > 0 || study.summary.coverage.skipped > 0
    || study.summary.coverage.completed < study.summary.coverage.planned ? 'incomplete' : 'complete';
  study.status = study.summary.status;
  study.machineSummary = {
    schemaVersion: study.schemaVersion,
    status: study.status,
    plan: study.plan,
    revision: study.revision,
    summary: study.summary,
    batchSummaries: batchComparisons.map(comparison => ({
      selection: comparison.selection,
      plan: comparison.result.plan,
      coverage: comparison.result.coverage,
      summary: comparison.result.summary,
      baselineControlReuse: comparison.baselineControlReuse
    })),
    evaluations: evaluations.map(evaluation => ({
      selection: evaluation.selection,
      focalStrategy: evaluation.focalStrategy,
      opponents: evaluation.opponents,
      scoringConfig: evaluation.scoringConfig,
      result: summarizeEvaluation(evaluation.result)
    })),
    humanCases,
    limitations: study.limitations,
    rawArtifact: 'evaluation-full.json.gz'
  };
  study.researchMarkdown = buildResearchMarkdown(study);
  return study;
}
