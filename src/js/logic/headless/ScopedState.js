import { applyScoreChangeToState } from '../../state/StateScoreRecorder.js';

export function createScopedState(initialState) {
  let state = initialState;
  const stateChanges = [];
  const scoreChanges = [];

  return {
    getState() {
      return state;
    },

    getMyRole() {
      return null;
    },

    update(updates) {
      state = { ...state, ...updates };
      return state;
    },

    getNodeState(playerId, elementIndex) {
      return state.nodeStates[`${playerId}-${elementIndex}`];
    },

    updateNodeState(playerId, elementIndex, isYang, newValue) {
      const key = `${playerId}-${elementIndex}`;
      const side = isYang ? 'yang' : 'yin';
      const current = state.nodeStates[key];
      const before = current[side];
      const updatedNode = { ...current, [side]: newValue };
      state = {
        ...state,
        nodeStates: { ...state.nodeStates, [key]: updatedNode }
      };
      stateChanges.push({ playerId, elementIndex, side, before, after: newValue });
    },

    addScore(playerId, amount, reason = '', actionType = null) {
      if (amount === 0) return;
      state = applyScoreChangeToState(state, playerId, amount, reason, actionType);
      scoreChanges.push({ playerId, amount, reason, actionType });
    },

    takeStateChanges() {
      return stateChanges.splice(0);
    },

    takeScoreChanges() {
      return scoreChanges.splice(0);
    }
  };
}
