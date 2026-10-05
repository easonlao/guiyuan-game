import { createScoringConfig } from '../actions/ScoringConfig.js';
import { compareFixedPositionContinuations, enumerateLegalFirstActions } from './FixedPositionContinuations.js';
import { PUBLIC_STRATEGIES } from './PublicStrategies.js';

const PLAYER_IDS = ['P1', 'P2'];
const VALUE_OPTIONS = new Set([0, 0.5, 1]);
const NORMAL_95_Z = 1.959963984540054;
const UNCERTAINTY_METHOD = 'paired-normal-95';
const EVIDENCE_RULE = 'interval-excludes-zero';

function clone(value) {
  return structuredClone(value);
}

function seedKey(seed) {
  return `${typeof seed}:${seed}`;
}

function validateSeed(seed, field) {
  if (!(typeof seed === 'string' && seed.length > 0) && !Number.isSafeInteger(seed)) {
    throw new TypeError(`${field} must be a non-empty string or safe integer`);
  }
}

function validateCriteria(criteria) {
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) {
    throw new TypeError('criteria must be an object');
  }
  if (!Number.isFinite(criteria.minimumEffect) || criteria.minimumEffect < 0 || criteria.minimumEffect > 1) {
    throw new TypeError('criteria.minimumEffect must be a finite number from 0 to 1');
  }
  if (!Number.isSafeInteger(criteria.minimumPairs) || criteria.minimumPairs < 1) {
    throw new TypeError('criteria.minimumPairs must be a positive safe integer');
  }
  if (criteria.uncertaintyMethod !== UNCERTAINTY_METHOD) {
    throw new TypeError(`criteria.uncertaintyMethod must be ${UNCERTAINTY_METHOD}`);
  }
  if (criteria.evidenceRule !== EVIDENCE_RULE) {
    throw new TypeError(`criteria.evidenceRule must be ${EVIDENCE_RULE}`);
  }
  return {
    minimumEffect: criteria.minimumEffect,
    minimumPairs: criteria.minimumPairs,
    uncertaintyMethod: criteria.uncertaintyMethod,
    evidenceRule: criteria.evidenceRule
  };
}

function summarizeDifferences(samples, expectedSeeds) {
  const samplesBySeed = new Map(samples.map(sample => [seedKey(sample.seed), sample]));
  const differences = [];
  const missingSeeds = [];
  for (const seed of expectedSeeds) {
    const sample = samplesBySeed.get(seedKey(seed));
    if (!sample || sample.actionAValue === null || sample.actionBValue === null) {
      missingSeeds.push(seed);
    } else {
      differences.push(sample.actionAValue - sample.actionBValue);
    }
  }

  const pairedCount = differences.length;
  const meanDifference = pairedCount
    ? differences.reduce((sum, difference) => sum + difference, 0) / pairedCount
    : null;
  const sampleStandardDeviation = pairedCount > 1
    ? Math.sqrt(differences.reduce((sum, difference) => sum + (difference - meanDifference) ** 2, 0) / (pairedCount - 1))
    : null;
  const standardError = sampleStandardDeviation === null ? null : sampleStandardDeviation / Math.sqrt(pairedCount);
  const normalApprox95 = standardError === null ? null : {
    low: meanDifference - NORMAL_95_Z * standardError,
    high: meanDifference + NORMAL_95_Z * standardError,
    confidenceLevel: 0.95,
    method: 'normal approximation to the paired mean difference'
  };
  return {
    requestedPairCount: expectedSeeds.length,
    providedPairCount: samples.length,
    pairedCount,
    missingSeeds,
    meanDifference,
    sampleStandardDeviation,
    standardError,
    normalApprox95
  };
}

function intervalExcludesZero(summary) {
  return summary.normalApprox95 !== null
    && (summary.normalApprox95.low > 0 || summary.normalApprox95.high < 0);
}

/** Classify a signed action-value reversal across exactly two opponents. */
export function classifyPayoffCrossover({ criteria, opponents } = {}) {
  const selectedCriteria = validateCriteria(criteria);
  if (!Array.isArray(opponents) || opponents.length !== 2) {
    throw new TypeError('opponents must contain exactly two opponents');
  }
  const seenIds = new Set();
  opponents.forEach((opponent, opponentIndex) => {
    if (!opponent || typeof opponent !== 'object' || Array.isArray(opponent)
      || typeof opponent.id !== 'string' || opponent.id.length === 0) {
      throw new TypeError(`opponents[${opponentIndex}] must have a non-empty id`);
    }
    if (seenIds.has(opponent.id)) throw new TypeError('opponent ids must be distinct');
    seenIds.add(opponent.id);
    if (!Array.isArray(opponent.samples)) throw new TypeError(`opponents[${opponentIndex}].samples must be an array`);
  });
  const validatedOpponents = opponents.map((opponent, opponentIndex) => {
    const seenSeeds = new Set();
    const samples = opponent.samples.map((sample, sampleIndex) => {
      if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
        throw new TypeError(`opponents[${opponentIndex}].samples[${sampleIndex}] must be an object`);
      }
      validateSeed(sample.seed, `opponents[${opponentIndex}].samples[${sampleIndex}].seed`);
      const key = seedKey(sample.seed);
      if (seenSeeds.has(key)) throw new TypeError(`opponents[${opponentIndex}].samples seeds must be unique`);
      seenSeeds.add(key);
      for (const field of ['actionAValue', 'actionBValue']) {
        if (sample[field] !== null && !VALUE_OPTIONS.has(sample[field])) {
          throw new TypeError(`opponents[${opponentIndex}].samples[${sampleIndex}].${field} must be 0, 0.5, 1, or null`);
        }
      }
      return { seed: sample.seed, actionAValue: sample.actionAValue, actionBValue: sample.actionBValue };
    });
    return { id: opponent.id, samples };
  });
  const expectedSeeds = [...new Map(validatedOpponents.flatMap(opponent => opponent.samples)
    .map(sample => [seedKey(sample.seed), sample.seed])).values()];
  const summaries = validatedOpponents.map(opponent => ({
    id: opponent.id,
    ...summarizeDifferences(opponent.samples, expectedSeeds)
  }));

  const orientation = summaries.map(summary => ({
    opponentId: summary.id,
    sign: summary.meanDifference === null ? 0 : Math.sign(summary.meanDifference)
  }));
  const enoughEvidence = summaries.every(summary => summary.pairedCount >= selectedCriteria.minimumPairs
    && intervalExcludesZero(summary));
  let classification = 'uncertainty-insufficient';
  if (enoughEvidence) {
    const [firstSign, secondSign] = orientation.map(item => item.sign);
    if (firstSign === 0 || secondSign === 0 || firstSign === secondSign) {
      classification = 'no-reversal';
    } else if (summaries.some(summary => Math.abs(summary.meanDifference) < selectedCriteria.minimumEffect)) {
      classification = 'effect-insufficient';
    } else {
      classification = 'crossover';
    }
  }

  return { classification, orientation, criteria: selectedCriteria, opponents: summaries };
}

function resolveStrategyIdentity(strategy, field) {
  if (typeof strategy === 'string' && Object.hasOwn(PUBLIC_STRATEGIES, strategy)) {
    return clone(PUBLIC_STRATEGIES[strategy]);
  }
  if (strategy && typeof strategy === 'object'
    && typeof strategy.id === 'string' && strategy.id.length > 0
    && !Object.hasOwn(PUBLIC_STRATEGIES, strategy.id)
    && Number.isSafeInteger(strategy.version) && strategy.version > 0
    && typeof strategy.decide === 'function') {
    return { id: strategy.id, version: strategy.version };
  }
  throw new TypeError(`${field} must name a public strategy or provide a versioned { id, version, decide } definition`);
}

function validateSeedList(seeds, field) {
  if (!Array.isArray(seeds) || seeds.length === 0) throw new TypeError(`${field} must be a non-empty array`);
  const seen = new Set();
  for (const seed of seeds) {
    validateSeed(seed, `${field} entries`);
    const key = seedKey(seed);
    if (seen.has(key)) throw new TypeError(`${field} must contain unique seeds`);
    seen.add(key);
  }
}

function validatePosition(position, index) {
  if (!position || typeof position !== 'object' || Array.isArray(position) || !position.state) {
    throw new TypeError(`positions[${index}] must contain a fixed position state`);
  }
  if (typeof position.id !== 'string' || position.id.length === 0) {
    throw new TypeError(`positions[${index}].id must be a non-empty string`);
  }
  if (!PLAYER_IDS.includes(position.currentPlayer) || position.currentPlayer !== position.state.currentPlayer) {
    throw new TypeError(`positions[${index}].currentPlayer must match its state`);
  }
  // Use the public enumerator to preflight every position before any seeded continuation runs.
  return enumerateLegalFirstActions(position, { scoringConfig: {} });
}

function comparisonStrategies(position, focalStrategy, opponentStrategy) {
  const otherPlayer = position.currentPlayer === 'P1' ? 'P2' : 'P1';
  return {
    [position.currentPlayer]: focalStrategy,
    [otherPlayer]: opponentStrategy
  };
}

function runCounts(comparisons) {
  return comparisons.reduce((counts, comparison) => {
    counts.attemptedMatchCount += comparison.summary.attemptedMatchCount;
    counts.completedMatchCount += comparison.summary.completedMatchCount;
    counts.failedMatchCount += comparison.summary.failedMatchCount;
    counts.budgetSkippedMatchCount += comparison.summary.budgetSkippedMatchCount;
    return counts;
  }, { attemptedMatchCount: 0, completedMatchCount: 0, failedMatchCount: 0, budgetSkippedMatchCount: 0 });
}

function phaseComparisons(positions, opponents, strategy, seeds, scoringConfig, maxRuns, alreadyAttempted) {
  const comparisons = [];
  const comparisonIndexByKey = new Map();
  let attempted = alreadyAttempted;
  for (const position of positions) {
    for (const opponent of opponents) {
      const remaining = maxRuns === undefined ? undefined : Math.max(0, maxRuns - attempted);
      const comparison = compareFixedPositionContinuations({
        position,
        strategies: comparisonStrategies(position, strategy, opponent.strategy),
        seeds,
        scoringConfig,
        ...(remaining === undefined ? {} : { maxRuns: remaining })
      });
      const index = comparisons.length;
      comparisons.push(comparison);
      comparisonIndexByKey.set(`${position.id}\u0000${opponent.id}`, index);
      attempted += comparison.summary.attemptedMatchCount;
    }
  }
  return { comparisons, comparisonIndexByKey };
}

function comparisonFor(comparisons, indexes, positionId, opponentId) {
  const index = indexes.get(`${positionId}\u0000${opponentId}`);
  return index === undefined ? null : comparisons[index];
}

function pairClassifierInput({ positionId, candidateIndices, comparisons, indexes, opponents, seeds }) {
  const [actionAIndex, actionBIndex] = candidateIndices;
  return {
    opponents: opponents.map(opponent => {
      const comparison = comparisonFor(comparisons, indexes, positionId, opponent.id);
      const branchByIndex = new Map((comparison?.firstActions ?? []).map(branch => [branch.candidateIndex, branch]));
      const actionASamples = new Map((branchByIndex.get(actionAIndex)?.samples ?? []).map(sample => [seedKey(sample.seed), sample]));
      const actionBSamples = new Map((branchByIndex.get(actionBIndex)?.samples ?? []).map(sample => [seedKey(sample.seed), sample]));
      return {
        id: opponent.id,
        samples: seeds.map(seed => {
          const actionA = actionASamples.get(seedKey(seed));
          const actionB = actionBSamples.get(seedKey(seed));
          return {
            seed,
            actionAValue: actionA?.status === 'completed' ? actionA.value : null,
            actionBValue: actionB?.status === 'completed' ? actionB.value : null
          };
        })
      };
    })
  };
}

function actionPairs(position, comparison) {
  const actions = comparison?.firstActions ?? [];
  const pairs = [];
  for (let actionAIndex = 0; actionAIndex < actions.length; actionAIndex++) {
    for (let actionBIndex = actionAIndex + 1; actionBIndex < actions.length; actionBIndex++) {
      pairs.push({
        positionId: position.id,
        candidateIndices: [actionAIndex, actionBIndex],
        actions: [clone(actions[actionAIndex].action), clone(actions[actionBIndex].action)]
      });
    }
  }
  return pairs;
}

function createPairRecord(pair, classifier, indexes, opponents) {
  return {
    ...pair,
    comparisonIndexes: Object.fromEntries(opponents.map(opponent => [
      opponent.id,
      indexes.get(`${pair.positionId}\u0000${opponent.id}`) ?? null
    ])),
    ...classifier
  };
}

function sameOrientation(left, right) {
  return left.length === right.length && left.every((entry, index) =>
    entry.opponentId === right[index].opponentId && entry.sign === right[index].sign);
}

function countPlanned(positions, enumerations, seedCount, opponentCount) {
  return positions.reduce((total, position) => total
    + (enumerations.get(position.id)?.actions.length ?? 0) * seedCount * opponentCount, 0);
}

function countOverheadSamples(comparisons, indexesByPosition, status) {
  let count = 0;
  for (const comparison of comparisons) {
    for (const branch of comparison.firstActions) {
      if (indexesByPosition.get(comparison.position.id)?.has(branch.candidateIndex)) continue;
      count += branch.samples.filter(sample => sample.status === status).length;
    }
  }
  return count;
}

const LIMITATIONS = [
  'Results are conditional terminal-value estimates under the named continuation strategies and tested positions; they are not globally optimal action values.',
  'The paired normal 95% interval is nominal and not adjusted for multiple comparisons; small samples and degenerate variance limit its reliability.',
  'Distinct discovery and confirmation seed labels establish disjoint requested inputs, not guaranteed collision-free underlying random streams.',
  'Searching multiple positions and candidate pairs creates selection bias; confirmation is an independent check only within the declared inputs.',
  'When a selected position is confirmed, all its candidate actions are run for reuse; planned and completed unselected-action overhead is reported separately.'
];

/** Detect candidate-pair payoff reversals and re-evaluate discovery-qualified positions on disjoint seeds. */
export function evaluateCrossoverConfirmation(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('input must be an object');
  const criteria = validateCriteria(input.criteria);
  const { positions, focalStrategy, opponents, discoverySeeds, confirmationSeeds, scoringConfig, maxRuns } = input;
  if (!Array.isArray(positions) || positions.length === 0) throw new TypeError('positions must be a non-empty array');
  if (!Array.isArray(opponents) || opponents.length !== 2) throw new TypeError('opponents must contain exactly two strategies');
  if (!Object.hasOwn(input, 'scoringConfig')) {
    throw new TypeError('scoringConfig is required; pass {} to select the formal baseline explicitly');
  }
  validateSeedList(discoverySeeds, 'discoverySeeds');
  validateSeedList(confirmationSeeds, 'confirmationSeeds');
  const discoverySeedKeys = new Set(discoverySeeds.map(seedKey));
  if (confirmationSeeds.some(seed => discoverySeedKeys.has(seedKey(seed)))) {
    throw new TypeError('discoverySeeds and confirmationSeeds must be disjoint');
  }
  if (maxRuns !== undefined && (!Number.isSafeInteger(maxRuns) || maxRuns < 0)) {
    throw new TypeError('maxRuns must be a non-negative safe integer');
  }
  const focalIdentity = resolveStrategyIdentity(focalStrategy, 'focalStrategy');
  const opponentIds = new Set();
  const strategyIdentities = new Set();
  const normalizedOpponents = opponents.map((opponent, index) => {
    if (!opponent || typeof opponent !== 'object' || Array.isArray(opponent)
      || typeof opponent.id !== 'string' || opponent.id.length === 0) {
      throw new TypeError(`opponents[${index}] must have a non-empty id and strategy`);
    }
    if (opponentIds.has(opponent.id)) throw new TypeError('opponent ids must be distinct');
    opponentIds.add(opponent.id);
    const identity = resolveStrategyIdentity(opponent.strategy, `opponents[${index}].strategy`);
    const identityKey = `${identity.id}@${identity.version}`;
    if (strategyIdentities.has(identityKey)) throw new TypeError('opponents must use distinct strategy identities');
    strategyIdentities.add(identityKey);
    return { id: opponent.id, strategy: opponent.strategy, strategyIdentity: identity };
  });
  const positionIds = new Set();
  const enumerations = new Map();
  for (let index = 0; index < positions.length; index++) {
    const position = positions[index];
    if (positionIds.has(position?.id)) throw new TypeError('position ids must be unique');
    positionIds.add(position?.id);
    enumerations.set(position.id, validatePosition(position, index));
  }
  // Validate and snapshot scoring configuration before any seeded run starts.
  const scoringSnapshot = createScoringConfig(scoringConfig);
  const scoringConfigInput = {
    version: scoringSnapshot.version,
    noSelfCostReward: scoringSnapshot.noSelfCostReward,
    burstActionScoreOnce: scoringSnapshot.burstActionScoreOnce,
    disableRarityBonus: scoringSnapshot.disableRarityBonus
  };

  const discoveryRun = phaseComparisons(positions, normalizedOpponents, focalStrategy,
    discoverySeeds, scoringConfigInput, maxRuns, 0);
  const discoveryPairs = [];
  for (const position of positions) {
    const referenceComparison = comparisonFor(discoveryRun.comparisons,
      discoveryRun.comparisonIndexByKey, position.id, normalizedOpponents[0].id);
    for (const pair of actionPairs(position, referenceComparison)) {
      const classifierInput = pairClassifierInput({
        ...pair,
        comparisons: discoveryRun.comparisons,
        indexes: discoveryRun.comparisonIndexByKey,
        opponents: normalizedOpponents,
        seeds: discoverySeeds
      });
      const classifier = classifyPayoffCrossover({ criteria, ...classifierInput });
      discoveryPairs.push(createPairRecord(pair, classifier, discoveryRun.comparisonIndexByKey, normalizedOpponents));
    }
  }

  const selectedPositionIds = new Set(discoveryPairs
    .filter(pair => pair.classification === 'crossover')
    .map(pair => pair.positionId));
  const selectedPositions = positions.filter(position => selectedPositionIds.has(position.id));
  const discoveryCounts = runCounts(discoveryRun.comparisons);
  const confirmationRun = phaseComparisons(selectedPositions, normalizedOpponents, focalStrategy,
    confirmationSeeds, scoringConfigInput, maxRuns, discoveryCounts.attemptedMatchCount);

  const confirmationPairs = discoveryPairs.map(discoveryPair => {
    const pair = {
      positionId: discoveryPair.positionId,
      candidateIndices: clone(discoveryPair.candidateIndices),
      actions: clone(discoveryPair.actions)
    };
    if (discoveryPair.classification !== 'crossover') {
      const classifier = classifyPayoffCrossover({
        criteria,
        opponents: normalizedOpponents.map(opponent => ({ id: opponent.id, samples: [] }))
      });
      return {
        ...pair,
        discoveryClassification: discoveryPair.classification,
        comparisonIndexes: Object.fromEntries(normalizedOpponents.map(opponent => [opponent.id, null])),
        ...classifier,
        status: 'not-run'
      };
    }
    const classifierInput = pairClassifierInput({
      ...pair,
      comparisons: confirmationRun.comparisons,
      indexes: confirmationRun.comparisonIndexByKey,
      opponents: normalizedOpponents,
      seeds: confirmationSeeds
    });
    const classifier = classifyPayoffCrossover({ criteria, ...classifierInput });
    const status = classifier.classification === 'crossover'
      && sameOrientation(discoveryPair.orientation, classifier.orientation)
      ? 'confirmed'
      : 'not-confirmed';
    return {
      ...pair,
      discoveryClassification: discoveryPair.classification,
      comparisonIndexes: Object.fromEntries(normalizedOpponents.map(opponent => [
        opponent.id,
        confirmationRun.comparisonIndexByKey.get(`${pair.positionId}\u0000${opponent.id}`) ?? null
      ])),
      ...classifier,
      status
    };
  });

  const confirmationCounts = runCounts(confirmationRun.comparisons);
  const discoveryPlanned = countPlanned(positions, enumerations, discoverySeeds.length, normalizedOpponents.length);
  const confirmationPlanned = countPlanned(selectedPositions, enumerations, confirmationSeeds.length, normalizedOpponents.length);
  const neededCandidateIndicesByPosition = new Map();
  for (const pair of discoveryPairs.filter(item => item.classification === 'crossover')) {
    if (!neededCandidateIndicesByPosition.has(pair.positionId)) neededCandidateIndicesByPosition.set(pair.positionId, new Set());
    for (const candidateIndex of pair.candidateIndices) neededCandidateIndicesByPosition.get(pair.positionId).add(candidateIndex);
  }
  const plannedOverheadMatchCount = selectedPositions.reduce((total, position) => {
    const neededCount = neededCandidateIndicesByPosition.get(position.id)?.size ?? 0;
    const candidateCount = enumerations.get(position.id).actions.length;
    return total + Math.max(0, candidateCount - neededCount) * confirmationSeeds.length * normalizedOpponents.length;
  }, 0);
  const overheadCounts = Object.fromEntries(['completed', 'failed', 'not-run-budget'].map(status => [
    status,
    countOverheadSamples(confirmationRun.comparisons, neededCandidateIndicesByPosition, status)
  ]));
  const totalCounts = {
    attemptedMatchCount: discoveryCounts.attemptedMatchCount + confirmationCounts.attemptedMatchCount,
    completedMatchCount: discoveryCounts.completedMatchCount + confirmationCounts.completedMatchCount,
    failedMatchCount: discoveryCounts.failedMatchCount + confirmationCounts.failedMatchCount,
    budgetSkippedMatchCount: discoveryCounts.budgetSkippedMatchCount + confirmationCounts.budgetSkippedMatchCount
  };

  return {
    schemaVersion: 1,
    configuration: {
      positions: positions.map(position => ({ id: position.id, classification: position.classification, source: position.source })),
      focalStrategy: focalIdentity,
      opponents: normalizedOpponents.map(opponent => ({ id: opponent.id, strategy: opponent.strategyIdentity })),
      discoverySeeds: clone(discoverySeeds),
      confirmationSeeds: clone(confirmationSeeds),
      scoringConfig: clone(scoringSnapshot),
      scoringConfigInput,
      criteria,
      maxRuns: maxRuns ?? null,
      seedPolicy: 'paired within each candidate action and opponent; disjoint labels between discovery and confirmation'
    },
    discovery: { comparisons: discoveryRun.comparisons, pairs: discoveryPairs },
    confirmation: { comparisons: confirmationRun.comparisons, pairs: confirmationPairs },
    summary: {
      positionCount: positions.length,
      candidatePairCount: discoveryPairs.length,
      discoveryQualifiedPairCount: discoveryPairs.filter(pair => pair.classification === 'crossover').length,
      confirmedPairCount: confirmationPairs.filter(pair => pair.status === 'confirmed').length,
      notConfirmedPairCount: confirmationPairs.filter(pair => pair.status === 'not-confirmed').length,
      notRunPairCount: confirmationPairs.filter(pair => pair.status === 'not-run').length,
      plannedMatchCount: discoveryPlanned + confirmationPlanned,
      attemptedMatchCount: totalCounts.attemptedMatchCount,
      completedMatchCount: totalCounts.completedMatchCount,
      failedMatchCount: totalCounts.failedMatchCount,
      budgetSkippedMatchCount: totalCounts.budgetSkippedMatchCount,
      discovery: { plannedMatchCount: discoveryPlanned, ...discoveryCounts },
      confirmation: {
        selectedPositionCount: selectedPositions.length,
        selectedPositionIds: [...selectedPositionIds],
        plannedMatchCount: confirmationPlanned,
        ...confirmationCounts,
        plannedOverheadMatchCount,
        completedOverheadMatchCount: overheadCounts.completed,
        failedOverheadMatchCount: overheadCounts.failed,
        budgetSkippedOverheadMatchCount: overheadCounts['not-run-budget']
      }
    },
    limitations: LIMITATIONS.slice()
  };
}

function formatAction(action) {
  return JSON.stringify({ type: action?.type, ...(action?.target === undefined ? {} : { target: action.target }), ...(action?.targetEl === undefined ? {} : { targetEl: action.targetEl }) });
}

/** Format a crossover report for people without changing its machine-readable records. */
export function formatCrossoverConfirmation(report) {
  if (!report || report.schemaVersion !== 1 || !report.configuration || !report.discovery?.pairs || !report.confirmation?.pairs || !report.summary) {
    throw new TypeError('report must be a crossover confirmation report');
  }
  const lines = [
    `Crossover confirmation: ${report.summary.positionCount} position(s), ${report.summary.candidatePairCount} candidate pair(s).`,
    `Criteria: minimum effect ${report.configuration.criteria.minimumEffect}, at least ${report.configuration.criteria.minimumPairs} paired samples; nominal paired normal 95% interval.`,
    `Discovery-qualified: ${report.summary.discoveryQualifiedPairCount}; confirmed: ${report.summary.confirmedPairCount}; not confirmed: ${report.summary.notConfirmedPairCount}; not run: ${report.summary.notRunPairCount}.`,
    `Runs: ${report.summary.completedMatchCount}/${report.summary.plannedMatchCount} completed; ${report.summary.failedMatchCount} failed; ${report.summary.budgetSkippedMatchCount} budget-skipped.`
  ];
  const formatEvidence = opponents => opponents.map(opponent => {
    const interval = opponent.normalApprox95
      ? `[${opponent.normalApprox95.low.toFixed(3)}, ${opponent.normalApprox95.high.toFixed(3)}]`
      : 'n/a';
    const mean = opponent.meanDifference === null ? 'n/a' : opponent.meanDifference.toFixed(3);
    return `${opponent.id}: Δ${mean} 95%${interval} (${opponent.pairedCount}/${opponent.requestedPairCount})`;
  }).join('; ');
  for (const pair of report.discovery.pairs) {
    const confirmation = report.confirmation.pairs.find(item => item.positionId === pair.positionId
      && item.candidateIndices[0] === pair.candidateIndices[0] && item.candidateIndices[1] === pair.candidateIndices[1]);
    lines.push(`${pair.positionId} ${formatAction(pair.actions[0])} vs ${formatAction(pair.actions[1])}: discovery ${pair.classification} (${formatEvidence(pair.opponents)}); confirmation ${confirmation?.status ?? 'not-run'}${confirmation ? ` (${formatEvidence(confirmation.opponents)})` : ''}.`);
  }
  lines.push(...report.limitations.map(limitation => `Limitation: ${limitation}`));
  return lines.join('\n');
}
