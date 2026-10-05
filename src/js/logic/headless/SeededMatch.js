import { createInitialHeadlessState, runHeadlessMatch } from './HeadlessMatch.js';
import { createSeededRandom, createSeededStemGenerator, SEEDED_RANDOM_VERSION } from './SeededRandom.js';
import { decidePublicStrategy, PUBLIC_STRATEGIES } from './PublicStrategies.js';

const PLAYER_IDS = ['P1', 'P2'];

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

function resolveStrategy(strategy) {
  if (typeof strategy === 'string' && Object.hasOwn(PUBLIC_STRATEGIES, strategy)) {
    return {
      identity: PUBLIC_STRATEGIES[strategy],
      decide: (context, random) => decidePublicStrategy(strategy, context, random)
    };
  }
  if (strategy && typeof strategy === 'object'
    && typeof strategy.id === 'string' && strategy.id.length > 0
    && !Object.hasOwn(PUBLIC_STRATEGIES, strategy.id)
    && Number.isSafeInteger(strategy.version) && strategy.version > 0
    && typeof strategy.decide === 'function') {
    const decide = strategy.decide;
    return {
      identity: { id: strategy.id, version: strategy.version },
      decide: (context, random) => decide(context, random)
    };
  }
  throw new TypeError('each strategy must name a public strategy or provide a versioned { id, version, decide } definition');
}

function publicHistoryRecord(record) {
  return {
    opportunity: record.opportunity,
    playerId: record.playerId,
    stem: clone(record.stem),
    candidates: clone(record.candidates),
    action: clone(record.action),
    stateChanges: clone(record.stateChanges)
  };
}

function publicStrategyContext(context, history) {
  const sourceState = context.state;
  return deepFreeze({
    playerId: context.playerId,
    stem: clone(context.stem),
    state: {
      currentPlayer: sourceState.currentPlayer,
      turnCount: sourceState.turnCount,
      maxTurns: sourceState.maxTurns,
      isExtraTurn: sourceState.isExtraTurn,
      scores: {
        P1: sourceState.players.P1.score,
        P2: sourceState.players.P2.score
      },
      nodeStates: clone(sourceState.nodeStates)
    },
    history: history.map(publicHistoryRecord),
    candidates: clone(context.candidates)
  });
}

function createRunnerStrategies({ history, randomStreams, chooseAction }) {
  return Object.fromEntries(PLAYER_IDS.map(playerId => [playerId, runnerContext => {
    const publicContext = publicStrategyContext(runnerContext, history);
    return chooseAction(playerId, publicContext, randomStreams[playerId]);
  }]));
}

function appendTrajectory(target, source) {
  for (const entry of source) {
    if (entry.event === 'match-start' && target.length > 0) continue;
    target.push(clone(entry));
  }
}

function appendActionHistory(targetRecords, history, records) {
  for (const record of records) {
    const detached = clone(record);
    targetRecords.push(detached);
    history.push(detached);
  }
}

function resumePosition(error) {
  const state = clone(error.details.state);
  // The core records the next turn-start before reporting missing sequence input.
  // Roll its count back so the next one-opportunity invocation starts that turn once.
  state.turnCount = error.details.opportunity - 1;
  return state;
}

function runInRecordedOpportunities({ initialState, stems, stemLimit = stems.length, nextStem, chooseAction, randomStreams = { P1: () => 0, P2: () => 0 }, scoringConfig }) {
  let state = clone(initialState);
  const history = [];
  const actionRecords = [];
  const trajectory = [];
  let consumedStemCount = 0;
  let terminalResult;
  let finalState;
  let lastResult;

  while (true) {
    const hasCheckpointStem = state.currentStem !== null;
    let stem = stems[consumedStemCount];
    if (!hasCheckpointStem && !stem && nextStem && consumedStemCount < stemLimit) {
      stem = nextStem();
      stems.push(stem);
    }
    const chunkStems = hasCheckpointStem ? [] : (stem ? [stem] : []);
    const runnerInput = {
      initialState: state,
      stems: chunkStems,
      strategies: createRunnerStrategies({ history, randomStreams, chooseAction })
    };
    if (scoringConfig !== undefined) runnerInput.scoringConfig = scoringConfig;

    try {
      lastResult = runHeadlessMatch(runnerInput);
      appendTrajectory(trajectory, lastResult.trajectory);
      appendActionHistory(actionRecords, history, lastResult.actionRecords);
      consumedStemCount += lastResult.consumedStemCount;
      terminalResult = lastResult.terminalResult;
      finalState = lastResult.finalState;
      break;
    } catch (error) {
      if (error?.code !== 'STEMS_EXHAUSTED') throw error;
      appendTrajectory(trajectory, error.details.trajectory ?? []);
      appendActionHistory(actionRecords, history, error.details.priorActionRecords ?? []);
      consumedStemCount += error.details.consumedStemCount ?? 0;
      if (consumedStemCount >= stemLimit) throw error;
      state = resumePosition(error);
    }
  }

  return {
    ...lastResult,
    trajectory,
    actionRecords,
    finalState,
    terminalResult,
    consumedStemCount,
    stems: stems.slice(0, consumedStemCount).map(clone)
  };
}

/**
 * Run a deterministic seeded match with versioned public strategies.
 * Strategy callbacks receive only an immutable public context and a per-player
 * random tie-break stream; generated future stems and match configuration stay private.
 */
export function runSeededMatch({ initialState, seed, strategies, scoringConfig } = {}) {
  if (!strategies || PLAYER_IDS.some(playerId => !Object.hasOwn(strategies, playerId))) {
    throw new TypeError('strategies must provide P1 and P2 strategy definitions');
  }
  const resolvedStrategies = Object.fromEntries(PLAYER_IDS.map(playerId => [playerId, resolveStrategy(strategies[playerId])]));
  const upperBound = Number.isSafeInteger(initialState?.maxTurns) && Number.isSafeInteger(initialState?.turnCount)
    ? Math.max(0, initialState.maxTurns - initialState.turnCount)
    : 0;
  const generatedStems = [];
  const randomStreams = {
    P1: createSeededRandom(seed, 'strategy-ties:P1'),
    P2: createSeededRandom(seed, 'strategy-ties:P2')
  };
  const result = runInRecordedOpportunities({
    initialState,
    stems: generatedStems,
    stemLimit: upperBound,
    nextStem: createSeededStemGenerator(seed),
    randomStreams,
    scoringConfig,
    chooseAction: (playerId, context, random) => resolvedStrategies[playerId].decide(context, random)
  });

  return {
    ...result,
    seed,
    randomVersion: SEEDED_RANDOM_VERSION,
    strategyIdentities: Object.fromEntries(PLAYER_IDS.map(playerId => [playerId, resolvedStrategies[playerId].identity]))
  };
}

/** Replay a seeded match from consumed stems and previously recorded choices. */
export function replaySeededMatch({ initialState, stems, selectedActions, scoringConfig } = {}) {
  if (!Array.isArray(stems)) throw new TypeError('stems must be an array of recorded heavenly stems');
  if (!Array.isArray(selectedActions)) throw new TypeError('selectedActions must be an actionRecords array');
  const choices = new Map();
  for (const record of selectedActions) {
    if (!record || !PLAYER_IDS.includes(record.playerId) || !Number.isSafeInteger(record.opportunity) || !record.action) {
      throw new TypeError('selectedActions entries must contain opportunity, playerId, and action');
    }
    const key = `${record.opportunity}:${record.playerId}`;
    if (choices.has(key)) throw new TypeError(`selectedActions contains a duplicate choice for ${key}`);
    choices.set(key, clone(record.action));
  }

  const result = runInRecordedOpportunities({
    initialState,
    stems,
    scoringConfig,
    chooseAction: (playerId, context) => {
      const key = `${context.state.turnCount}:${playerId}`;
      if (!choices.has(key)) throw new Error(`no recorded action for ${key}`);
      return choices.get(key);
    }
  });
  return { ...result, replayed: true };
}

export { createInitialHeadlessState };
