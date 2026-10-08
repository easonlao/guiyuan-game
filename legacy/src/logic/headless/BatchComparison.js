import { createScoringConfig } from '../actions/ScoringConfig.js';
import { createInitialHeadlessState } from './HeadlessMatch.js';
import { runSeededMatch } from './SeededMatch.js';
import { SEEDED_RANDOM_VERSION, createSeededRandom } from './SeededRandom.js';
import { PUBLIC_STRATEGIES } from './PublicStrategies.js';
import { createPositionTrajectory, findRepeatedBoardKeys, summarizeBatchResults } from './EvaluationStatistics.js';

export const DEFAULT_EXPERIMENTAL_SCORING_CONFIG = Object.freeze({
  version: 1,
  noSelfCostReward: true,
  burstActionScoreOnce: true,
  disableRarityBonus: true
});

const PLAYER_IDS = ['P1', 'P2'];
const STRATEGY_IDS = Object.keys(PUBLIC_STRATEGIES);

function clone(value) {
  return structuredClone(value);
}

function validatePositiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${field} must be a positive safe integer`);
  }
}

function configurationId(role, snapshot) {
  const switches = [snapshot.noSelfCostReward, snapshot.burstActionScoreOnce, snapshot.disableRarityBonus]
    .map(value => Number(value)).join('');
  return `${role}:scoring-v${snapshot.version}-${switches}`;
}

function sampleSeed(baseSeed, sampleIndex) {
  if (sampleIndex === 0) return baseSeed;
  if (typeof baseSeed === 'number') {
    const seed = baseSeed + sampleIndex;
    if (!Number.isSafeInteger(seed)) throw new TypeError('seed range exceeds safe integer values');
    return seed;
  }
  return `${baseSeed}#sample-${sampleIndex + 1}`;
}

function makeInitialState(template, startingPlayer, maxTurns) {
  if (template === undefined) return createInitialHeadlessState({ currentPlayer: startingPlayer, maxTurns });
  const initialState = clone(template);
  if (initialState && typeof initialState === 'object' && !Array.isArray(initialState)) {
    initialState.currentPlayer = startingPlayer;
    initialState.maxTurns = maxTurns;
  }
  return initialState;
}

function serializeFailure(error) {
  return {
    name: error?.name ?? 'Error',
    code: error?.code ?? null,
    message: error?.message ?? String(error),
    ...(error?.details ? { details: error.details } : {})
  };
}

function executeMatch(plan, input, configuration) {
  let initialState;
  try {
    initialState = makeInitialState(input.initialState, plan.startingPlayer, input.maxTurns);
    const result = runSeededMatch({
      initialState,
      seed: plan.seed,
      strategies: plan.strategies,
      scoringConfig: configuration.input
    });
    if (!result.terminalResult) throw new Error('seeded match returned without a terminal result');
    const positionTrajectory = createPositionTrajectory(result);
    return {
      ...plan.metadata,
      configurationId: configuration.id,
      configurationRole: configuration.role,
      status: 'completed',
      initialState,
      seed: plan.seed,
      randomVersion: result.randomVersion,
      strategyIdentities: result.strategyIdentities,
      scoringConfig: result.scoringConfig,
      stems: result.stems,
      consumedStemCount: result.consumedStemCount,
      actionRecords: result.actionRecords,
      trajectory: result.trajectory,
      positionTrajectory,
      repeatedBoardKeys: findRepeatedBoardKeys(positionTrajectory),
      finalState: result.finalState,
      terminalResult: result.terminalResult
    };
  } catch (error) {
    const details = error?.details ?? {};
    return {
      ...plan.metadata,
      configurationId: configuration.id,
      configurationRole: configuration.role,
      status: 'failed',
      initialState: initialState ?? details.initialState ?? null,
      seed: plan.seed,
      randomVersion: details.randomVersion ?? SEEDED_RANDOM_VERSION,
      strategyIdentities: details.strategyIdentities ?? plan.metadata.strategyIdentities,
      scoringConfig: details.scoringConfig ?? configuration.scoringConfig,
      stems: details.stems ?? [],
      consumedStemCount: details.consumedStemCount ?? 0,
      actionRecords: details.priorActionRecords ?? [],
      trajectory: details.trajectory ?? [],
      error: serializeFailure(error)
    };
  }
}

/**
 * Run a paired, seeded comparison of the formal scoring baseline and one
 * candidate scoring configuration across every ordered public strategy pair
 * and both starting players. Failed runs remain in the report and are never
 * converted to draws.
 */
export function runBatchComparison({
  samples = 2,
  seed = 202603,
  maxTurns = 12,
  initialState,
  baselineScoringConfig,
  experimentalScoringConfig = DEFAULT_EXPERIMENTAL_SCORING_CONFIG
} = {}) {
  validatePositiveInteger(samples, 'samples');
  validatePositiveInteger(maxTurns, 'maxTurns');
  // Validate seed before planning so malformed seed input is a configuration error.
  createSeededRandom(seed);
  if (typeof seed === 'number' && !Number.isSafeInteger(seed)) throw new TypeError('seed must be a non-empty string or safe integer');
  if (typeof seed === 'string' && seed.length === 0) throw new TypeError('seed must be a non-empty string or safe integer');

  const configurationInputs = [
    { role: 'baseline', input: baselineScoringConfig },
    { role: 'experiment', input: experimentalScoringConfig }
  ];
  const configurations = configurationInputs.map(configuration => {
    const snapshot = createScoringConfig(configuration.input);
    return {
      role: configuration.role,
      id: configurationId(configuration.role, snapshot),
      scoringConfig: snapshot,
      input: configuration.input
    };
  });

  const plannedComparisons = samples * STRATEGY_IDS.length ** 2 * PLAYER_IDS.length;
  const results = [];
  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex++) {
    const currentSeed = sampleSeed(seed, sampleIndex);
    for (const p1Strategy of STRATEGY_IDS) {
      for (const p2Strategy of STRATEGY_IDS) {
        for (const startingPlayer of PLAYER_IDS) {
          const comparisonId = `sample-${sampleIndex + 1}:${p1Strategy}-vs-${p2Strategy}:start-${startingPlayer}`;
          const strategies = { P1: p1Strategy, P2: p2Strategy };
          const metadata = {
            comparisonId,
            sampleIndex,
            strategies,
            strategyIdentities: {
              P1: clone(PUBLIC_STRATEGIES[p1Strategy]),
              P2: clone(PUBLIC_STRATEGIES[p2Strategy])
            },
            startingPlayer
          };
          const plan = { seed: currentSeed, strategies, startingPlayer, metadata };
          for (const configuration of configurations) {
            results.push(executeMatch(plan, { initialState, maxTurns }, configuration));
          }
        }
      }
    }
  }

  const plannedMatches = plannedComparisons * configurations.length;
  const coverage = {
    plannedMatches,
    completedMatches: results.filter(result => result.status === 'completed').length,
    failedMatches: results.filter(result => result.status === 'failed').length,
    skippedMatches: 0,
    plannedComparisons,
    completeComparisons: 0,
    failedComparisons: 0,
    skippedReasons: [],
    failureReasons: Object.values(results.filter(result => result.status === 'failed').reduce((reasons, result) => {
      const key = `${result.error.code ?? result.error.name}: ${result.error.message}`;
      reasons[key] ??= { code: result.error.code, message: result.error.message, count: 0 };
      reasons[key].count++;
      return reasons;
    }, {})),
    configurations: Object.fromEntries(configurations.map(configuration => [configuration.id, {
      plannedMatches: results.filter(result => result.configurationId === configuration.id).length,
      completedMatches: results.filter(result => result.configurationId === configuration.id && result.status === 'completed').length,
      failedMatches: results.filter(result => result.configurationId === configuration.id && result.status === 'failed').length
    }])),
    startingPlayers: Object.fromEntries(PLAYER_IDS.map(playerId => [playerId, {
      plannedMatches: plannedComparisons / PLAYER_IDS.length * configurations.length,
      completedMatches: results.filter(result => result.startingPlayer === playerId && result.status === 'completed').length,
      failedMatches: results.filter(result => result.startingPlayer === playerId && result.status === 'failed').length
    }])),
    strategyPairs: STRATEGY_IDS.flatMap(p1Strategy => STRATEGY_IDS.map(p2Strategy => ({
      P1: p1Strategy,
      P2: p2Strategy,
      plannedMatches: samples * PLAYER_IDS.length * configurations.length,
      completedMatches: results.filter(result => result.strategies.P1 === p1Strategy
        && result.strategies.P2 === p2Strategy && result.status === 'completed').length,
      failedMatches: results.filter(result => result.strategies.P1 === p1Strategy
        && result.strategies.P2 === p2Strategy && result.status === 'failed').length
    })))
  };

  const comparisonStatuses = new Map();
  for (const result of results) {
    if (!comparisonStatuses.has(result.comparisonId)) comparisonStatuses.set(result.comparisonId, new Set());
    if (result.status === 'completed') comparisonStatuses.get(result.comparisonId).add(result.configurationRole);
  }
  for (const roles of comparisonStatuses.values()) {
    if (configurations.every(configuration => roles.has(configuration.role))) coverage.completeComparisons++;
  }
  coverage.failedComparisons = coverage.plannedComparisons - coverage.completeComparisons;

  return {
    schemaVersion: 1,
    plan: {
      sampleCount: samples,
      baseSeed: seed,
      maxTurns,
      randomVersion: SEEDED_RANDOM_VERSION,
      plannedMatches,
      plannedComparisons,
      strategyAssignments: STRATEGY_IDS.flatMap(P1 => STRATEGY_IDS.map(P2 => ({ P1, P2 }))),
      strategyDefinitions: STRATEGY_IDS.map(id => clone(PUBLIC_STRATEGIES[id])),
      startingPlayers: PLAYER_IDS.slice(),
      pairing: {
        matchedRuns: 'baseline and experiment entries with the same comparisonId',
        sharedInputs: ['seed', 'complete initialState', 'strategy assignment', 'starting player', 'randomVersion'],
        note: 'The same heavenly-stem stream is replayed, but extra actions can change which player receives later stems.'
      },
      configurations: configurations.map(({ role, id, scoringConfig }) => ({ role, id, scoringConfig }))
    },
    coverage,
    results,
    summary: summarizeBatchResults(results, configurations, STRATEGY_IDS)
  };
}
