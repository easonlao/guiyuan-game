/**
 * State structure and reachable position analysis.
 * Provides exact theoretical combinatorial boundaries and state feature extraction
 * without collapsing distinct node positions or losing board fidelity.
 */

function clone(value) {
  return structuredClone(value);
}

const PLAYER_IDS = ['P1', 'P2'];
const ELEMENT_COUNT = 5;

/**
 * Compute theoretical combinatorial state space and symmetry-reduced equivalence classes.
 * Single player has 5 nodes * 2 sides = 10 state bits with 4 discrete values (-1, 0, 1, 2).
 * Cyclic symmetry under 5-element rotation (Z5) is reduced via Burnside's Lemma.
 */
export function computeTheoreticalStateSpace() {
  const statesPerSide = 4; // -1: 道损, 0: 虚空, 1: 点亮, 2: 加持
  const sidesPerNode = 2; // 阳, 阴
  const totalStateBitsSingle = ELEMENT_COUNT * sidesPerNode; // 10
  const theoreticalCombinationsSingle = statesPerSide ** totalStateBitsSingle; // 1,048,576
  const totalStateBitsTwo = totalStateBitsSingle * 2; // 20
  const theoreticalCombinationsTwo = statesPerSide ** totalStateBitsTwo; // 1,099,511,627,776

  // Burnside's Lemma for Z5 cyclic element rotation:
  // - Identity permutation fixes all 4^10 states.
  // - Each of the 4 non-trivial shifts (1, 2, 3, 4) requires all 5 nodes to be identical:
  //   4 choices for yang * 4 choices for yin = 16 fixed states per shift.
  // Equivalence classes = (4^10 + 4 * 16) / 5 = 1,048,640 / 5 = 209,728.
  const reducedEquivalenceClasses = (theoreticalCombinationsSingle + 4 * (statesPerSide ** sidesPerNode)) / ELEMENT_COUNT;

  return {
    schemaVersion: 1,
    singlePlayer: {
      nodeCount: ELEMENT_COUNT,
      sidesPerNode,
      totalStateBits: totalStateBitsSingle,
      statesPerSide,
      stateValues: [-1, 0, 1, 2],
      theoreticalCombinations: theoreticalCombinationsSingle,
      symmetryGroup: 'Z5-cyclic-permutation',
      reducedEquivalenceClasses,
      notes: '单方理论棋盘组合为 4^10 = 1,048,576。依五行生克相生的循环同构性，Z5 循环群去重后等价类为 209,728。'
    },
    twoPlayers: {
      totalStateBits: totalStateBitsTwo,
      theoreticalCombinations: theoreticalCombinationsTwo,
      notes: '双方理论棋盘组合为 4^20 = 1,099,511,627,776。'
    },
    inferenceBoundary: '状态组合分析不等于对所有完整游戏状态穷举续局。保留完整节点位置、阴阳与生克关系，不按点亮数量合并局面；不可达状态不用于推断正式游戏表现。'
  };
}

/**
 * Analyze structural metrics of a game state for both players.
 */
export function analyzeStateStructure(state) {
  if (!state || typeof state !== 'object' || !state.nodeStates) {
    throw new TypeError('state must be a valid game state with nodeStates');
  }

  const result = {
    schemaVersion: 1,
    turnCount: state.turnCount,
    maxTurns: state.maxTurns,
    currentPlayer: state.currentPlayer,
    currentStem: clone(state.currentStem ?? null),
    isExtraTurn: Boolean(state.isExtraTurn),
    pendingBurstPlayer: state.pendingBurstPlayer ?? null,
    scores: {
      P1: state.players?.P1?.score ?? 0,
      P2: state.players?.P2?.score ?? 0
    },
    scoreDifference: (state.players?.P1?.score ?? 0) - (state.players?.P2?.score ?? 0),
    nodeStates: clone(state.nodeStates),
    P1: summarizePlayerNodes(state.nodeStates, 'P1'),
    P2: summarizePlayerNodes(state.nodeStates, 'P2')
  };

  return result;
}

function summarizePlayerNodes(nodeStates, playerId) {
  let litSideCount = 0;
  let damagedSideCount = 0;
  let voidSideCount = 0;
  let boostedSideCount = 0;
  let unityNodeCount = 0;
  let harmonyNodeCount = 0;

  for (let element = 0; element < ELEMENT_COUNT; element++) {
    const node = nodeStates[`${playerId}-${element}`] ?? { yang: 0, yin: 0 };
    if (node.yang === -1) damagedSideCount++;
    else if (node.yang === 0) voidSideCount++;
    else if (node.yang === 1) litSideCount++;
    else if (node.yang === 2) { litSideCount++; boostedSideCount++; }

    if (node.yin === -1) damagedSideCount++;
    else if (node.yin === 0) voidSideCount++;
    else if (node.yin === 1) litSideCount++;
    else if (node.yin === 2) { litSideCount++; boostedSideCount++; }

    if (node.yang >= 1 && node.yin >= 1) unityNodeCount++;
    if (node.yang === 2 && node.yin === 2) harmonyNodeCount++;
  }

  return {
    litSideCount,
    damagedSideCount,
    voidSideCount,
    boostedSideCount,
    unityNodeCount,
    harmonyNodeCount,
    nearUnityThreat: litSideCount >= 8
  };
}

/**
 * Classify a position into standardized situational dimensions.
 */
export function classifyPositionSituation(position) {
  const state = position.state;
  const analysis = analyzeStateStructure(state);
  const currentPlayer = position.currentPlayer;
  const opponentPlayer = currentPlayer === 'P1' ? 'P2' : 'P1';

  const myStats = analysis[currentPlayer];
  const oppStats = analysis[opponentPlayer];
  const myScore = analysis.scores[currentPlayer];
  const oppScore = analysis.scores[opponentPlayer];

  const stage = state.turnCount <= 7 ? 'early' : state.turnCount <= 14 ? 'mid' : 'near-limit';
  const scoreDiff = myScore - oppScore;
  const scoreStatus = scoreDiff > 0 ? 'leading' : scoreDiff < 0 ? 'trailing' : 'tied';
  const threatLevel = oppStats.nearUnityThreat ? 'urgent-threat' : 'normal';

  // Check if current player has any unity node that could trigger BURST/BURST_ATK if stem matches
  const hasBurstOpportunity = myStats.unityNodeCount > 0;

  const tags = [];
  tags.push(stage);
  tags.push(`score-${scoreStatus}`);
  if (oppStats.nearUnityThreat) tags.push('opp-near-unity');
  if (myStats.nearUnityThreat) tags.push('self-near-unity');
  if (hasBurstOpportunity) tags.push('has-unity-nodes');
  if (position.isExtraTurn) tags.push('extra-turn');

  return {
    positionId: position.id,
    source: position.source,
    classification: position.classification,
    stage,
    scoreStatus,
    scoreDifference: scoreDiff,
    threatLevel,
    hasBurstOpportunity,
    primaryContextTag: tags.join(';'),
    analysis
  };
}
