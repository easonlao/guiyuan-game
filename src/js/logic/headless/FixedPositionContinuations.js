import { createScoringConfig } from '../actions/ScoringConfig.js';
import { PUBLIC_STRATEGIES, decidePublicStrategy } from './PublicStrategies.js';
import { SEEDED_RANDOM_VERSION } from './SeededRandom.js';
import { HeadlessMatchError, runHeadlessMatch } from './HeadlessMatch.js';
import { runSeededMatch } from './SeededMatch.js';

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested, seen);
  }
  return value;
}

const PLAYER_IDS = ['P1', 'P2'];

function assertFixedPosition(position) {
  if (!position || typeof position !== 'object' || !position.state || typeof position.state !== 'object') {
    throw new TypeError('position must contain a complete state');
  }
  if (position.schemaVersion !== 1) throw new TypeError('position.schemaVersion must be 1');
  requireNonEmptyString(position.id, 'position.id');
  requireNonEmptyString(position.classification, 'position.classification');
  if (!['baseline-reachable', 'manual-diagnostic'].includes(position.source)) {
    throw new TypeError('position.source must distinguish baseline-reachable and manual-diagnostic data');
  }
  if (position.source === 'manual-diagnostic' && (position.classification !== 'diagnostic' || position.provenance?.kind !== 'manual-diagnostic')) {
    throw new TypeError('caller-authored positions must use manual-diagnostic provenance and classification diagnostic');
  }
  if (position.source === 'baseline-reachable' && position.provenance?.kind !== 'seeded-match') {
    throw new TypeError('baseline-reachable positions must include seeded-match provenance');
  }
  if (!PLAYER_IDS.includes(position.currentPlayer) || position.currentPlayer !== position.state.currentPlayer) {
    throw new TypeError('position.currentPlayer must match state.currentPlayer');
  }
  if (!position.state.currentStem || !['DECISION', 'PLAYING'].includes(position.state.phase)) {
    throw new TypeError('position.state must be a live DECISION or PLAYING checkpoint with currentStem');
  }
  if (!sameValue(position.currentStem, position.state.currentStem)) {
    throw new TypeError('position.currentStem must match state.currentStem');
  }
  if (position.isExtraTurn !== position.state.isExtraTurn || position.pendingBurstPlayer !== position.state.pendingBurstPlayer) {
    throw new TypeError('position extra-action metadata must match state');
  }
  if (position.state.turnCount < 1 || position.state.turnCount >= position.state.maxTurns) {
    throw new TypeError('position.state must be a live opportunity below maxTurns');
  }
}

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${field} must be a non-empty string`);
}

/**
 * Extract an immutable fixed position from a successful, complete seeded-match
 * record. The complete baseline record is retained as reachability provenance.
 * Headless turn-start snapshots preserve the caller's UI phase; the checkpoint
 * is normalized to DECISION because a non-null currentStem is a resumed decision.
 */
export function extractReachableFixedPosition(matchResult, {
  id,
  classification,
  opportunity,
  playerId
} = {}) {
  requireNonEmptyString(id, 'id');
  requireNonEmptyString(classification, 'classification');
  if (!Number.isSafeInteger(opportunity) || opportunity < 1) {
    throw new TypeError('opportunity must be a positive safe integer');
  }
  if (!PLAYER_IDS.includes(playerId)) throw new TypeError('playerId must be P1 or P2');
  if (!matchResult || !Array.isArray(matchResult.trajectory) || !Array.isArray(matchResult.actionRecords)) {
    throw new TypeError('matchResult must contain a complete seeded-match trajectory and actionRecords');
  }
  if (matchResult.terminalResult == null || !matchResult.finalState || !Array.isArray(matchResult.stems)) {
    throw new TypeError('matchResult must be a successful complete seeded-match record');
  }

  if (!sameValue(matchResult.scoringConfig, createScoringConfig())) {
    throw new TypeError('baseline-reachable positions require formal baseline scoring');
  }

  const turnStart = matchResult.trajectory.find(entry => entry.event === 'turn-start'
    && entry.opportunity === opportunity
    && entry.state?.currentPlayer === playerId);
  const actionRecord = matchResult.actionRecords.find(record => record.opportunity === opportunity && record.playerId === playerId);
  if (!turnStart || !actionRecord || !turnStart.state?.currentStem) {
    throw new RangeError(`no reachable live decision exists for ${playerId} at opportunity ${opportunity}`);
  }

  const state = clone({ ...turnStart.state, phase: 'DECISION' });
  const baselineMatch = clone({
    initialState: matchResult.trajectory[0]?.state,
    seed: matchResult.seed,
    randomVersion: matchResult.randomVersion,
    strategyIdentities: matchResult.strategyIdentities,
    scoringConfig: matchResult.scoringConfig,
    scoringConfigInput: {
      version: matchResult.scoringConfig.version,
      noSelfCostReward: matchResult.scoringConfig.noSelfCostReward,
      burstActionScoreOnce: matchResult.scoringConfig.burstActionScoreOnce,
      disableRarityBonus: matchResult.scoringConfig.disableRarityBonus
    },
    stems: matchResult.stems,
    actionRecords: matchResult.actionRecords,
    trajectory: matchResult.trajectory,
    finalState: matchResult.finalState,
    terminalResult: matchResult.terminalResult,
    consumedStemCount: matchResult.consumedStemCount
  });
  const position = {
    schemaVersion: 1,
    id,
    classification,
    source: 'baseline-reachable',
    currentPlayer: state.currentPlayer,
    currentStem: clone(state.currentStem),
    isExtraTurn: state.isExtraTurn,
    pendingBurstPlayer: state.pendingBurstPlayer,
    state,
    provenance: {
      kind: 'seeded-match',
      seed: matchResult.seed,
      randomVersion: matchResult.randomVersion,
      strategyIdentities: clone(matchResult.strategyIdentities),
      opportunity,
      actionRecordIndex: matchResult.actionRecords.indexOf(actionRecord),
      phaseNormalization: { from: turnStart.state.phase, to: 'DECISION', reason: 'resume currentStem at a legal headless decision phase' },
      baselineMatch
    }
  };
  return deepFreeze(position);
}

/** Freeze a caller-authored state while keeping it distinct from reachable samples. */
export function freezeDiagnosticFixedPosition({ id, description, state } = {}) {
  requireNonEmptyString(id, 'id');
  requireNonEmptyString(description, 'description');
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('state must be a complete fixed-position state');
  const isolatedState = clone(state);
  const position = {
    schemaVersion: 1,
    id,
    classification: 'diagnostic',
    source: 'manual-diagnostic',
    currentPlayer: isolatedState.currentPlayer,
    currentStem: clone(isolatedState.currentStem),
    isExtraTurn: isolatedState.isExtraTurn,
    pendingBurstPlayer: isolatedState.pendingBurstPlayer,
    state: isolatedState,
    provenance: { kind: 'manual-diagnostic', description }
  };
  assertFixedPosition(position);
  return deepFreeze(position);
}

/**
 * Enumerate real first-opportunity candidates from the public headless
 * evaluator. An empty future-stem list lets that runner stop immediately after
 * recording the fixed-stem action; its structured exhaustion details retain
 * the first record when the position is not already terminal. AUTO and SKIP
 * semantics come from the same public record; no AI scorer is consulted.
 */
export function enumerateLegalFirstActions(position, { scoringConfig } = {}) {
  assertFixedPosition(position);
  let actionRecord;
  let terminalResult = null;
  try {
    const match = runHeadlessMatch({
      initialState: clone(position.state),
      stems: [],
      scoringConfig,
      strategies: {
        P1: context => context.candidates[0],
        P2: context => context.candidates[0]
      }
    });
    terminalResult = clone(match.terminalResult);
    actionRecord = match.actionRecords.find(record => record.opportunity === position.state.turnCount
      && record.playerId === position.currentPlayer);
  } catch (error) {
    if (!(error instanceof HeadlessMatchError) || error.code !== 'STEMS_EXHAUSTED') throw error;
    actionRecord = error.details?.priorActionRecords?.find(record => record.opportunity === position.state.turnCount
      && record.playerId === position.currentPlayer);
    if (!actionRecord) throw error;
  }
  if (!actionRecord) {
    return {
      positionId: position.id,
      status: 'terminal',
      candidates: [],
      actions: [],
      actionRecord: null,
      terminalResult
    };
  }
  const candidates = clone(actionRecord.candidates);
  const actions = candidates.length ? clone(candidates) : [clone(actionRecord.action)];
  return {
    positionId: position.id,
    status: 'enumerated',
    currentPlayer: position.currentPlayer,
    opportunity: position.state.turnCount,
    stem: clone(position.state.currentStem),
    candidates,
    actions,
    actionRecord: clone(actionRecord)
  };
}

function resolveStrategyDefinition(strategy, playerId) {
  if (typeof strategy === 'string' && Object.hasOwn(PUBLIC_STRATEGIES, strategy)) {
    return {
      identity: clone(PUBLIC_STRATEGIES[strategy]),
      decide: (context, random) => decidePublicStrategy(strategy, context, random)
    };
  }
  if (strategy && typeof strategy === 'object'
    && typeof strategy.id === 'string' && strategy.id.length > 0
    && !Object.hasOwn(PUBLIC_STRATEGIES, strategy.id)
    && Number.isSafeInteger(strategy.version) && strategy.version > 0
    && typeof strategy.decide === 'function') {
    return {
      identity: { id: strategy.id, version: strategy.version },
      decide: strategy.decide
    };
  }
  throw new TypeError(`strategies.${playerId} must name a public strategy or provide a versioned { id, version, decide } definition`);
}

function sameValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
  return leftKeys.every(key => sameValue(left[key], right[key]));
}

function validateSeeds(seeds) {
  if (!Array.isArray(seeds) || seeds.length === 0) throw new TypeError('seeds must be a non-empty array');
  const seen = new Set();
  for (const seed of seeds) {
    if (!(typeof seed === 'string' && seed.length > 0) && !Number.isSafeInteger(seed)) {
      throw new TypeError('each seed must be a non-empty string or safe integer');
    }
    const key = `${typeof seed}:${seed}`;
    if (seen.has(key)) throw new TypeError('seeds must be unique so paired samples have an unambiguous key');
    seen.add(key);
  }
}

function seedKey(seed) {
  return `${typeof seed}:${seed}`;
}

function wilsonInterval(successes, sampleCount) {
  if (sampleCount === 0) return null;
  const z = 1.959963984540054;
  const proportion = successes / sampleCount;
  const zSquared = z * z;
  const denominator = 1 + zSquared / sampleCount;
  const center = (proportion + zSquared / (2 * sampleCount)) / denominator;
  const margin = z * Math.sqrt((proportion * (1 - proportion) + zSquared / (4 * sampleCount)) / sampleCount) / denominator;
  return { low: center - margin, high: center + margin, confidenceLevel: 0.95, method: 'Wilson score interval' };
}

function summarizeValues(values) {
  if (values.length === 0) {
    return { sampleCount: 0, mean: null, sampleStandardDeviation: null, standardError: null, normalApprox95: null };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sampleStandardDeviation = values.length > 1
    ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1))
    : null;
  const standardError = sampleStandardDeviation === null ? null : sampleStandardDeviation / Math.sqrt(values.length);
  return {
    sampleCount: values.length,
    mean,
    sampleStandardDeviation,
    standardError,
    normalApprox95: standardError === null ? null : {
      low: mean - 1.959963984540054 * standardError,
      high: mean + 1.959963984540054 * standardError,
      confidenceLevel: 0.95,
      method: 'normal approximation to the sample mean'
    }
  };
}

function summarizeOutcomes(samples, requestedSampleCount) {
  const completed = samples.filter(sample => sample.status === 'completed');
  const counts = {
    wins: completed.filter(sample => sample.outcome === 'win').length,
    draws: completed.filter(sample => sample.outcome === 'draw').length,
    losses: completed.filter(sample => sample.outcome === 'loss').length
  };
  const sampleCount = completed.length;
  const proportions = Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, sampleCount ? count / sampleCount : null]));
  return {
    requestedSampleCount,
    sampleCount,
    failedSampleCount: samples.filter(sample => sample.status === 'failed').length,
    budgetSkippedSampleCount: samples.filter(sample => sample.status === 'not-run-budget').length,
    winDrawLoss: {
      counts,
      proportions,
      wilson95: {
        wins: wilsonInterval(counts.wins, sampleCount),
        draws: wilsonInterval(counts.draws, sampleCount),
        losses: wilsonInterval(counts.losses, sampleCount)
      }
    },
    outcomeValue: summarizeValues(completed.map(sample => sample.value))
  };
}

function summarizePairedDifference(samples, referenceSamples, seeds) {
  const referenceBySeed = new Map(referenceSamples
    .filter(sample => sample.status === 'completed')
    .map(sample => [seedKey(sample.seed), sample]));
  const differences = [];
  const pairedSeeds = [];
  for (const sample of samples) {
    const reference = referenceBySeed.get(seedKey(sample.seed));
    if (sample.status !== 'completed' || !reference) continue;
    differences.push(sample.value - reference.value);
    pairedSeeds.push(sample.seed);
  }
  const stats = summarizeValues(differences);
  const pairedSeedSet = new Set(pairedSeeds.map(seedKey));
  return {
    reference: 'first legal action in candidate order',
    requestedSampleCount: seeds.length,
    sampleCount: pairedSeeds.length,
    complete: pairedSeeds.length === seeds.length,
    pairedSeeds,
    incompleteSeeds: seeds.filter(seed => !pairedSeedSet.has(seedKey(seed))),
    meanDifference: stats.mean,
    sampleStandardDeviation: stats.sampleStandardDeviation,
    standardError: stats.standardError,
    normalApprox95: stats.normalApprox95,
    method: 'same-seed paired difference in terminal win value (win=+1, draw=0, loss=-1)'
  };
}

function makeReplayRecord(match, initialState, scoringConfigInput) {
  return {
    initialState: clone(initialState),
    scoringConfigInput: clone(scoringConfigInput),
    seed: match.seed,
    randomVersion: match.randomVersion,
    strategyIdentities: clone(match.strategyIdentities),
    scoringConfig: clone(match.scoringConfig),
    stems: clone(match.stems),
    actionRecords: clone(match.actionRecords),
    trajectory: clone(match.trajectory),
    finalState: clone(match.finalState),
    terminalResult: clone(match.terminalResult),
    consumedStemCount: match.consumedStemCount
  };
}

function actionOutcome(terminalResult, playerId) {
  if (terminalResult.winner === 'DRAW') return { outcome: 'draw', value: 0 };
  if (terminalResult.winner === playerId) return { outcome: 'win', value: 1 };
  return { outcome: 'loss', value: -1 };
}

function errorRecord(error, match) {
  return {
    name: error?.name ?? 'Error',
    code: error?.code ?? 'CONTINUATION_FAILED',
    message: error?.message ?? String(error),
    ...(error?.details ? { details: clone(error.details) } : {}),
    ...(match ? { observedScoringConfig: clone(match.scoringConfig) } : {})
  };
}

/**
 * Compare every legal first action over paired seeded continuations. Each run
 * forces exactly the checkpoint action, then resumes the explicitly identified
 * continuation strategies. The returned full records can be reproduced with
 * replaySeededMatch; these conditional estimates are not globally optimal play.
 */
export function compareFixedPositionContinuations(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('input must be an object');
  const { position, strategies, seeds, scoringConfig, maxRuns } = input;
  assertFixedPosition(position);
  if (!Object.hasOwn(input, 'scoringConfig')) {
    throw new TypeError('scoringConfig is required; pass {} to select the formal baseline explicitly');
  }
  validateSeeds(seeds);
  if (maxRuns !== undefined && (!Number.isSafeInteger(maxRuns) || maxRuns < 0)) {
    throw new TypeError('maxRuns must be a non-negative safe integer');
  }
  if (!strategies || typeof strategies !== 'object' || Array.isArray(strategies)
    || PLAYER_IDS.some(playerId => !Object.hasOwn(strategies, playerId))) {
    throw new TypeError('strategies must provide P1 and P2 definitions');
  }
  const resolvedStrategies = Object.fromEntries(PLAYER_IDS.map(playerId => [
    playerId,
    resolveStrategyDefinition(strategies[playerId], playerId)
  ]));
  const expectedScoringConfig = createScoringConfig(scoringConfig);
  const scoringConfigInput = {
    version: expectedScoringConfig.version,
    noSelfCostReward: expectedScoringConfig.noSelfCostReward,
    burstActionScoreOnce: expectedScoringConfig.burstActionScoreOnce,
    disableRarityBonus: expectedScoringConfig.disableRarityBonus
  };
  const enumeration = enumerateLegalFirstActions(position, { scoringConfig });
  const firstActions = enumeration.actions;
  const referenceAction = firstActions[0] ?? null;
  const requestedMatchCount = firstActions.length * seeds.length;
  const failures = [];
  const budgetSkipped = [];
  let attemptedMatchCount = 0;
  let completedMatchCount = 0;

  const branches = firstActions.map((action, candidateIndex) => {
    const actionToken = `${candidateIndex + 1}-${action.type ?? 'ACTION'}`;
    const forcedPlayerId = position.currentPlayer;
    const baseDefinition = resolvedStrategies[forcedPlayerId];
    const createBranchStrategies = () => {
      let firstDecisionPending = true;
      const fixedFirstStrategy = {
        id: `fixed-first-action:${baseDefinition.identity.id}@${baseDefinition.identity.version}:${actionToken}`,
        version: 1,
        decide(context, random) {
          if (firstDecisionPending && context.playerId === forcedPlayerId
            && context.state.turnCount === position.state.turnCount) {
            firstDecisionPending = false;
            if (context.stem.name !== position.currentStem.name || context.stem.element !== position.currentStem.element) {
              throw new Error('fixed first-action checkpoint stem changed before continuation');
            }
            return context.candidates.find(candidate => sameValue(candidate, action)) ?? clone(action);
          }
          return baseDefinition.decide(context, random);
        }
      };
      return { ...strategies, [forcedPlayerId]: fixedFirstStrategy };
    };
    const samples = seeds.map(seed => {
      if (attemptedMatchCount >= (maxRuns ?? Number.MAX_SAFE_INTEGER)) {
        const skipped = {
          candidateIndex,
          action: clone(action),
          seed,
          status: 'not-run-budget',
          reason: 'maxRuns budget exhausted before this candidate/seed pair'
        };
        budgetSkipped.push(skipped);
        return skipped;
      }
      attemptedMatchCount++;
      let match;
      try {
        match = runSeededMatch({
          initialState: clone(position.state),
          seed,
          strategies: createBranchStrategies(),
          scoringConfig: clone(scoringConfig)
        });
        if (!sameValue(match.scoringConfig, expectedScoringConfig)) {
          const replay = makeReplayRecord(match, position.state, scoringConfigInput);
          const failure = {
            candidateIndex,
            action: clone(action),
            seed,
            status: 'failed',
            error: {
              name: 'ScoringConfigChanged',
              code: 'SCORING_CONFIG_CHANGED',
              message: 'continuation used a scoring snapshot different from the explicitly selected configuration',
              observedScoringConfig: clone(match.scoringConfig)
            },
            replay
          };
          failures.push(failure);
          return failure;
        }
        const replay = makeReplayRecord(match, position.state, scoringConfigInput);
        const { outcome, value } = actionOutcome(match.terminalResult, position.currentPlayer);
        completedMatchCount++;
        return {
          candidateIndex,
          action: clone(action),
          seed,
          status: 'completed',
          outcome,
          value,
          terminalResult: clone(match.terminalResult),
          replay
        };
      } catch (error) {
        const failure = {
          candidateIndex,
          action: clone(action),
          seed,
          status: 'failed',
          error: errorRecord(error, match),
          ...(match ? { replay: makeReplayRecord(match, position.state, scoringConfigInput) } : {})
        };
        failures.push(failure);
        return failure;
      }
    });
    const summary = summarizeOutcomes(samples, seeds.length);
    const hasBudgetSkips = samples.some(sample => sample.status === 'not-run-budget');
    const hasFailures = samples.some(sample => sample.status === 'failed');
    return {
      candidateIndex,
      reference: candidateIndex === 0,
      action: clone(action),
      status: hasBudgetSkips
        ? (hasFailures || summary.sampleCount ? 'partial' : 'budget-limited')
        : hasFailures ? (summary.sampleCount ? 'partial' : 'failed') : 'complete',
      summary,
      pairedDifferenceToReference: null,
      samples
    };
  });

  for (const branch of branches) {
    branch.pairedDifferenceToReference = summarizePairedDifference(branch.samples, branches[0]?.samples ?? [], seeds);
  }
  const budgetSkippedMatchCount = budgetSkipped.length;
  const status = enumeration.status === 'terminal'
    ? 'no-first-action'
    : budgetSkippedMatchCount > 0
      ? (completedMatchCount > 0 || failures.length > 0 ? 'partial' : 'budget-limited')
      : failures.length > 0
        ? (completedMatchCount > 0 ? 'partial' : 'failed')
        : 'complete';
  const result = {
    schemaVersion: 1,
    evaluationType: 'paired-fixed-first-action-continuations',
    interpretation: 'conditional terminal-value estimates under the named continuation strategies; not globally optimal action values',
    status,
    position: clone(position),
    continuationStrategyIdentities: Object.fromEntries(PLAYER_IDS.map(playerId => [playerId, clone(resolvedStrategies[playerId].identity)])),
    scoringConfig: clone(expectedScoringConfig),
    scoringConfigInput: clone(scoringConfigInput),
    pairing: {
      seeds: clone(seeds),
      randomVersion: SEEDED_RANDOM_VERSION,
      commonSeedPolicy: 'same-seed-for-every-first-action',
      referenceAction
    },
    summary: {
      firstActionCount: firstActions.length,
      requestedMatchCount,
      attemptedMatchCount,
      completedMatchCount,
      failedMatchCount: failures.length,
      budgetSkippedMatchCount
    },
    firstActions: branches,
    failures,
    budgetSkipped
  };
  return result;
}

function formatAction(action) {
  if (!action || typeof action !== 'object') return String(action);
  const detail = { type: action.type };
  if (action.target !== undefined) detail.target = action.target;
  if (action.targetEl !== undefined) detail.targetEl = action.targetEl;
  return JSON.stringify(detail);
}

function formatPercent(value) {
  return value === null ? 'n/a' : `${(100 * value).toFixed(1)}%`;
}

function formatInterval(interval) {
  return interval ? `[${interval.low.toFixed(3)}, ${interval.high.toFixed(3)}]` : 'n/a';
}

/** Return a concise human-readable summary without changing the machine result. */
export function formatFixedPositionComparison(result) {
  if (!result || !Array.isArray(result.firstActions) || !result.summary) {
    throw new TypeError('result must be a fixed-position comparison result');
  }
  const lines = [
    `Fixed-position continuation estimate: ${result.position.id} (${result.position.classification}; ${result.position.source})`,
    `First player ${result.position.currentPlayer}, opportunity ${result.position.state.turnCount}, stem ${result.position.currentStem.name}; ${result.pairing.seeds.length} paired seed(s); status ${result.status}.`,
    `Policies P1=${result.continuationStrategyIdentities.P1.id}@${result.continuationStrategyIdentities.P1.version}, P2=${result.continuationStrategyIdentities.P2.id}@${result.continuationStrategyIdentities.P2.version}; scoring=${result.scoringConfig.name}@${result.scoringConfig.version}.`,
    'Conditional on these continuation policies; this is not a globally optimal action ranking.'
  ];
  for (const branch of result.firstActions) {
    const wdl = branch.summary.winDrawLoss;
    const value = branch.summary.outcomeValue;
    const delta = branch.pairedDifferenceToReference;
    lines.push(
      `${branch.reference ? 'Reference ' : ''}${formatAction(branch.action)}: `
      + `W/D/L ${formatPercent(wdl.proportions.wins)}/${formatPercent(wdl.proportions.draws)}/${formatPercent(wdl.proportions.losses)} `
      + `(${branch.summary.sampleCount}/${branch.summary.requestedSampleCount}), value ${value.mean === null ? 'n/a' : value.mean.toFixed(3)} `
      + `95% ${formatInterval(value.normalApprox95)}; paired Δ ${delta.meanDifference === null ? 'n/a' : delta.meanDifference.toFixed(3)} `
      + `95% ${formatInterval(delta.normalApprox95)} (${delta.sampleCount}/${delta.requestedSampleCount}); ${branch.status}.`
    );
  }
  if (result.failures.length) lines.push(`Failures: ${result.failures.length}; see machine-readable failures for reproduction details.`);
  if (result.budgetSkipped.length) lines.push(`Budget-skipped candidate/seed pairs: ${result.budgetSkipped.length}; no candidate was omitted.`);
  return lines.join('\n');
}
