const PRIORITIES = Object.freeze({
  'build-priority': Object.freeze({ BURST: 50, CONVERT: 40, TRANS: 30, ATK: 10, BURST_ATK: 0 }),
  'attack-priority': Object.freeze({ BURST_ATK: 50, ATK: 40, BURST: 30, CONVERT: 10, TRANS: 0 })
});

export const PUBLIC_STRATEGIES = Object.freeze({
  'build-priority': Object.freeze({ id: 'build-priority', version: 1 }),
  'attack-priority': Object.freeze({ id: 'attack-priority', version: 1 }),
  'situation-responsive': Object.freeze({ id: 'situation-responsive', version: 1 })
});

function sideValue(node, isYang) {
  if (!node) return 0;
  return isYang ? node.yang : node.yin;
}

function litSideCount(nodeStates, playerId) {
  let count = 0;
  for (let elementIndex = 0; elementIndex < 5; elementIndex++) {
    const node = nodeStates?.[`${playerId}-${elementIndex}`];
    if (node?.yang >= 1) count++;
    if (node?.yin >= 1) count++;
  }
  return count;
}

function scoreSituationResponsive(context, candidate) {
  const playerId = context.playerId;
  const opponentId = playerId === 'P1' ? 'P2' : 'P1';
  const nodeStates = context.state?.nodeStates;
  const opponentLitSides = litSideCount(nodeStates, opponentId);
  const urgentThreat = opponentLitSides >= 8;

  if (!urgentThreat) {
    return ({ BURST: 40, CONVERT: 30, TRANS: 20, BURST_ATK: 15, ATK: 10 })[candidate.type] ?? 0;
  }

  if (candidate.type === 'ATK') {
    const target = candidate.target;
    const targetValue = target?.playerId === opponentId
      ? sideValue(nodeStates?.[`${opponentId}-${target.elementIndex}`], target.isYang)
      : 0;
    return 30 + (targetValue === 1 ? 10 : 0) + opponentLitSides;
  }
  if (candidate.type === 'BURST_ATK') {
    const target = nodeStates?.[`${opponentId}-${candidate.targetEl}`];
    const exposedLitSides = Number(target?.yang >= 1) + Number(target?.yin >= 1);
    return 35 + opponentLitSides + exposedLitSides;
  }
  return ({ BURST: 20, CONVERT: 10, TRANS: 10 })[candidate.type] ?? 0;
}

export function isSituationResponsiveThreatMode(context) {
  const playerId = context?.playerId;
  const opponentId = playerId === 'P1' ? 'P2' : 'P1';
  const nodeStates = context?.state?.nodeStates;
  return litSideCount(nodeStates, opponentId) >= 8;
}

export function scoreFixedBuild(candidate) {
  return ({ BURST: 40, CONVERT: 30, TRANS: 20, BURST_ATK: 15, ATK: 10 })[candidate.type] ?? 0;
}

export function scoreFixedAttack(context, candidate) {
  const playerId = context.playerId;
  const opponentId = playerId === 'P1' ? 'P2' : 'P1';
  const nodeStates = context.state?.nodeStates;
  const opponentLitSides = litSideCount(nodeStates, opponentId);
  if (candidate.type === 'ATK') {
    const target = candidate.target;
    const targetValue = target?.playerId === opponentId
      ? sideValue(nodeStates?.[`${opponentId}-${target.elementIndex}`], target.isYang)
      : 0;
    return 30 + (targetValue === 1 ? 10 : 0) + opponentLitSides;
  }
  if (candidate.type === 'BURST_ATK') {
    const target = nodeStates?.[`${opponentId}-${candidate.targetEl}`];
    const exposedLitSides = Number(target?.yang >= 1) + Number(target?.yin >= 1);
    return 35 + opponentLitSides + exposedLitSides;
  }
  return ({ BURST: 20, CONVERT: 10, TRANS: 10 })[candidate.type] ?? 0;
}

function scoreCandidate(strategyId, context, candidate) {
  if (strategyId === 'situation-responsive') return scoreSituationResponsive(context, candidate);
  return PRIORITIES[strategyId][candidate.type] ?? 0;
}

/**
 * Choose a legal candidate using a versioned public strategy definition.
 * The random callback is called only when multiple candidates share the best
 * deterministic rank; callers can provide an isolated seeded tie-break stream.
 */
export function decidePublicStrategy(strategyId, context, random = () => 0) {
  if (!Object.hasOwn(PUBLIC_STRATEGIES, strategyId)) {
    throw new RangeError(`unknown public strategy: ${strategyId}`);
  }
  if (!context || !Array.isArray(context.candidates)) {
    throw new TypeError('strategy context must contain a candidates array');
  }
  if (context.candidates.length === 0) return null;

  let bestScore = Number.NEGATIVE_INFINITY;
  let bestCandidates = [];
  for (const candidate of context.candidates) {
    const score = scoreCandidate(strategyId, context, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestCandidates = [candidate];
    } else if (score === bestScore) {
      bestCandidates.push(candidate);
    }
  }

  if (bestCandidates.length === 1) return bestCandidates[0];
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) return bestCandidates[0];
  return bestCandidates[Math.floor(draw * bestCandidates.length)];
}

export function decideFixedBuild(context, random = () => 0) {
  if (!context || !Array.isArray(context.candidates)) {
    throw new TypeError('strategy context must contain a candidates array');
  }
  if (context.candidates.length === 0) return null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestCandidates = [];
  for (const candidate of context.candidates) {
    const score = scoreFixedBuild(candidate);
    if (score > bestScore) {
      bestScore = score;
      bestCandidates = [candidate];
    } else if (score === bestScore) {
      bestCandidates.push(candidate);
    }
  }
  if (bestCandidates.length === 1) return bestCandidates[0];
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) return bestCandidates[0];
  return bestCandidates[Math.floor(draw * bestCandidates.length)];
}

export function decideFixedAttack(context, random = () => 0) {
  if (!context || !Array.isArray(context.candidates)) {
    throw new TypeError('strategy context must contain a candidates array');
  }
  if (context.candidates.length === 0) return null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestCandidates = [];
  for (const candidate of context.candidates) {
    const score = scoreFixedAttack(context, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestCandidates = [candidate];
    } else if (score === bestScore) {
      bestCandidates.push(candidate);
    }
  }
  if (bestCandidates.length === 1) return bestCandidates[0];
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) return bestCandidates[0];
  return bestCandidates[Math.floor(draw * bestCandidates.length)];
}

