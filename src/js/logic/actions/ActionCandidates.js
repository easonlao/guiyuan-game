// ============================================
// 动作候选计算器
// ============================================
// 职责：
// - 计算当前可用的动作选项
// - 根据五行规则生成候选列表
// - 判断 TRANS/ATK/CONVERT/BURST 的可用性
// ============================================

import StateManager from '../../state/StateManager.js';
import { RULES } from '../../config/game-config.js';

const ActionCandidates = {
  /**
   * 获取可用动作列表
   * @param {string} playerId - 玩家ID
   * @param {number} elementIndex - 五行索引
   * @param {boolean} isYang - 是否为阳
   * @returns {{type: string, actions: Array}}
   */
  getAvailableActions(playerId, elementIndex, isYang) {
    const actions = [];
    const currentNodeState = StateManager.getNodeState(playerId, elementIndex);
    const yangState = currentNodeState.yang;
    const yinState = currentNodeState.yin;
    const hasUnity = (yangState === 1 && yinState === 1);
    const shengEl = RULES[elementIndex].s;
    const keEl = RULES[elementIndex].k;
    const opponentId = playerId === 'P1' ? 'P2' : 'P1';

    if (isYang) {
      this._addYangActions(actions, playerId, elementIndex, yinState, hasUnity, shengEl, keEl, opponentId);
    } else {
      this._addYinActions(actions, playerId, elementIndex, yangState, hasUnity, shengEl, keEl, opponentId);
    }

    return { type: 'DECISION', actions };
  },

  _addYangActions(actions, playerId, elementIndex, yinState, hasUnity, shengEl, keEl, opponentId) {
    if (yinState < 1) {
      actions.push({
        type: 'CONVERT',
        executorId: playerId,
        target: { playerId, elementIndex, isYang: false }
      });
    }

    const minusCands = this.getMinusCandidates(opponentId, keEl);
    if (minusCands.length > 0) {
      actions.push({ type: 'ATK', executorId: playerId, target: minusCands[0] });
    }

    if (hasUnity) {
      const oppKeNode = StateManager.getNodeState(opponentId, keEl);
      if (!(oppKeNode.yang === -1 && oppKeNode.yin === -1)) {
        actions.push({ type: 'BURST_ATK', executorId: playerId, targetEl: keEl });
      }
    }

    if (hasUnity) {
      const myShengNode = StateManager.getNodeState(playerId, shengEl);
      if (!(myShengNode.yang === 2 && myShengNode.yin === 2)) {
        actions.push({ type: 'BURST', executorId: playerId, targetEl: shengEl });
      }
    }
  },

  _addYinActions(actions, playerId, elementIndex, yangState, hasUnity, shengEl, keEl, opponentId) {
    if (yangState < 1) {
      actions.push({
        type: 'CONVERT',
        executorId: playerId,
        target: { playerId, elementIndex, isYang: true }
      });
    }

    const plusCands = this.getPlusCandidates(playerId, shengEl);
    if (plusCands.length > 0) {
      actions.push({ type: 'TRANS', executorId: playerId, target: plusCands[0] });
    }

    if (hasUnity) {
      const myShengNode = StateManager.getNodeState(playerId, shengEl);
      if (!(myShengNode.yang === 2 && myShengNode.yin === 2)) {
        actions.push({ type: 'BURST', executorId: playerId, targetEl: shengEl });
      }
    }

    if (hasUnity) {
      const oppKeNode = StateManager.getNodeState(opponentId, keEl);
      if (!(oppKeNode.yang === -1 && oppKeNode.yin === -1)) {
        actions.push({ type: 'BURST_ATK', executorId: playerId, targetEl: keEl });
      }
    }
  },

  /**
   * 获取加法候选目标（优先级：阴干 > 阳干）
   * 遵循阴干优先规则：阴干=2时才转向阳干
   */
  getPlusCandidates(playerId, elementIndex) {
    const nodeState = StateManager.getNodeState(playerId, elementIndex);
    const candidates = [];

    // 优先阴干：阴干<2时返回阴干候选
    if (nodeState.yin < 2) {
      let priority;
      if (nodeState.yin === -1) priority = 1;      // 修复道损
      else if (nodeState.yin === 0) priority = 2; // 点亮虚空
      else priority = 3;                          // 增加加持
      candidates.push({ playerId, elementIndex, isYang: false, priority });
    }

    // 阴干=2时，转向阳干
    if (nodeState.yin === 2 && nodeState.yang < 2) {
      let priority;
      if (nodeState.yang === -1) priority = 1;    // 修复道损
      else if (nodeState.yang === 0) priority = 2;  // 点亮虚空
      else priority = 3;                           // 增加加持
      candidates.push({ playerId, elementIndex, isYang: true, priority });
    }

    return candidates;
  },

  /**
   * 获取减法候选目标（优先级：阴干 > 阳干）
   * 遵循阴干优先规则：阴干=-1时才转向阳干
   */
  getMinusCandidates(playerId, elementIndex) {
    const nodeState = StateManager.getNodeState(playerId, elementIndex);
    const candidates = [];

    // 优先阴干：阴干>-1时返回阴干候选
    if (nodeState.yin > -1) {
      let priority;
      if (nodeState.yin === 1) priority = 1;      // 破点亮
      else if (nodeState.yin === 2) priority = 2; // 削弱加持
      else priority = 3;                          // 破虚空
      candidates.push({ playerId, elementIndex, isYang: false, priority });
    }

    // 阴干=-1时，转向阳干
    if (nodeState.yin === -1 && nodeState.yang > -1) {
      let priority;
      if (nodeState.yang === 1) priority = 1;     // 破点亮
      else if (nodeState.yang === 2) priority = 2; // 削弱加持
      else priority = 3;                           // 破虚空
      candidates.push({ playerId, elementIndex, isYang: true, priority });
    }

    return candidates;
  }
};

export default ActionCandidates;
