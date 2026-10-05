// Pure turn and settlement decisions shared by formal flow and headless callers.

/**
 * Calculate passive settlements for the current player without applying them.
 * Dividend records intentionally precede damage-penalty records.
 *
 * @param {Object} state - A complete game-state value.
 * @param {Object} config - Explicit game scoring configuration.
 * @returns {{ playerId: string, unityCount: number, damageCount: number, scoreChanges: Array }}
 */
export function calculatePassiveEffects(state, config) {
  const playerId = state.currentPlayer;
  let unityCount = 0;
  let damageCount = 0;

  for (let element = 0; element < 5; element++) {
    const nodeState = state.nodeStates[`${playerId}-${element}`] ?? { yang: 0, yin: 0 };
    if (nodeState.yang === 2 && nodeState.yin === 2) unityCount++;
    if (nodeState.yang === -1 && nodeState.yin === -1) damageCount++;
  }

  const scoreChanges = [];
  if (unityCount > 0) {
    scoreChanges.push({
      playerId,
      amount: unityCount * config.PASSIVE.UNITY_DIVIDEND,
      reason: `天道分红(${unityCount})`,
      actionType: 'DIVIDEND'
    });
  }
  if (damageCount > 0) {
    scoreChanges.push({
      playerId,
      amount: damageCount * config.PASSIVE.DAMAGE_PENALTY,
      reason: `道损亏损(${damageCount})`,
      actionType: 'DAMAGE_PENALTY'
    });
  }

  return { playerId, unityCount, damageCount, scoreChanges };
}

/**
 * Decide the next player and the remaining burst marker.
 * An already-extra opportunity does not consume a stale burst marker, matching
 * the existing authority adapter's branch order.
 *
 * @param {string} currentPlayer
 * @param {boolean} isExtraTurn
 * @param {string|null} pendingBurstPlayer
 * @returns {{ nextPlayer: string, nextIsExtraTurn: boolean, pendingBurstPlayer: string|null }}
 */
export function calculateNextPlayer(currentPlayer, isExtraTurn, pendingBurstPlayer) {
  const otherPlayer = currentPlayer === 'P1' ? 'P2' : 'P1';

  if (isExtraTurn) {
    return {
      nextPlayer: otherPlayer,
      nextIsExtraTurn: false,
      pendingBurstPlayer
    };
  }

  if (pendingBurstPlayer === currentPlayer) {
    return {
      nextPlayer: currentPlayer,
      nextIsExtraTurn: true,
      pendingBurstPlayer: null
    };
  }

  return {
    nextPlayer: otherPlayer,
    nextIsExtraTurn: false,
    pendingBurstPlayer
  };
}

/**
 * Decide whether the current state is terminal. P1's full-light victory takes
 * precedence over P2's, and both take precedence over the turn limit.
 *
 * @param {Object} state
 * @returns {{ winner: string, reason: string }|null}
 */
export function decideTerminal(state) {
  for (const playerId of ['P1', 'P2']) {
    let allLit = true;
    for (let element = 0; element < 5; element++) {
      const nodeState = state.nodeStates[`${playerId}-${element}`] ?? { yang: 0, yin: 0 };
      if (nodeState.yang < 1 || nodeState.yin < 1) {
        allLit = false;
        break;
      }
    }
    if (allLit) return { winner: playerId, reason: '所有天干点亮' };
  }

  if (state.turnCount >= state.maxTurns) {
    let winner = 'DRAW';
    if (state.players.P1.score > state.players.P2.score) winner = 'P1';
    if (state.players.P2.score > state.players.P1.score) winner = 'P2';
    return { winner, reason: '回合上限' };
  }

  return null;
}

/**
 * Calculate the turn-start state change. The terminal decision uses the
 * incremented count, and the opponent burst reset only happens for a live turn.
 *
 * @param {Object} state
 * @returns {{ turnCount: number, terminal: Object|null, opponentId: string, resetOpponentBurstBonus: boolean }}
 */
export function decideTurnStart(state) {
  const turnCount = state.turnCount + 1;
  const terminal = decideTerminal({ ...state, turnCount });
  const opponentId = state.currentPlayer === 'P1' ? 'P2' : 'P1';

  return {
    turnCount,
    terminal,
    opponentId,
    resetOpponentBurstBonus: terminal === null && !state.players[opponentId].burstBonus
  };
}
