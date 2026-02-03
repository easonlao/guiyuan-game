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
        target: { playerId, elementIndex, isYang: false }
      });
    }

    const minusCands = this.getMinusCandidates(opponentId, keEl);
    if (minusCands.length > 0) {
      actions.push({ type: 'ATK', target: minusCands[0] });
    }

    if (hasUnity) {
      const oppKeNode = StateManager.getNodeState(opponentId, keEl);
      if (!(oppKeNode.yang === -1 && oppKeNode.yin === -1)) {
        actions.push({ type: 'BURST_ATK', targetEl: keEl });
      }
    }

    if (hasUnity) {
      const myShengNode = StateManager.getNodeState(playerId, shengEl);
      if (!(myShengNode.yang === 2 && myShengNode.yin === 2)) {
        actions.push({ type: 'BURST', targetEl: shengEl });
      }
    }
  },

  _addYinActions(actions, playerId, elementIndex, yangState, hasUnity, shengEl, keEl, opponentId) {
    if (yangState < 1) {
      actions.push({
        type: 'CONVERT',
        target: { playerId, elementIndex, isYang: true }
      });
    }

    const plusCands = this.getPlusCandidates(playerId, shengEl);
    if (plusCands.length > 0) {
      actions.push({ type: 'TRANS', target: plusCands[0] });
    }

    if (hasUnity) {
      const myShengNode = StateManager.getNodeState(playerId, shengEl);
      if (!(myShengNode.yang === 2 && myShengNode.yin === 2)) {
        actions.push({ type: 'BURST', targetEl: shengEl });
      }
    }

    if (hasUnity) {
      const oppKeNode = StateManager.getNodeState(opponentId, keEl);
      if (!(oppKeNode.yang === -1 && oppKeNode.yin === -1)) {
        actions.push({ type: 'BURST_ATK', targetEl: keEl });
      }
    }
  },

  /**
   * 获取加法候选目标（优先级：道损 > 虚空 > 点亮 > 加持）
   */
  getPlusCandidates(playerId, elementIndex) {
    const nodeState = StateManager.getNodeState(playerId, elementIndex);
    const candidates = [];

    if (nodeState.yang === -1) {
      candidates.push({ playerId, elementIndex, isYang: true, priority: 1 });
    }
    if (nodeState.yin === -1) {
      candidates.push({ playerId, elementIndex, isYang: false, priority: 1 });
    }
    if (nodeState.yin > -1 && nodeState.yin < 2) {
      const priority = nodeState.yin === 0 ? 2 : 3;
      candidates.push({ playerId, elementIndex, isYang: false, priority });
    }
    if (nodeState.yin === 2 && nodeState.yang > -1 && nodeState.yang < 2) {
      const priority = nodeState.yang === 0 ? 2 : 3;
      candidates.push({ playerId, elementIndex, isYang: true, priority });
    }

    return candidates.sort((a, b) => a.priority - b.priority);
  },

  /**
   * 获取减法候选目标（优先级：点亮 > 加持 > 虚空）
   */
  getMinusCandidates(playerId, elementIndex) {
    const nodeState = StateManager.getNodeState(playerId, elementIndex);
    const candidates = [];

    if (nodeState.yin > -1) {
      const priority = nodeState.yin === 1 ? 1 : (nodeState.yin === 2 ? 2 : 3);
      candidates.push({ playerId, elementIndex, isYang: false, priority });
    }
    if (nodeState.yin === -1 && nodeState.yang > -1) {
      const priority = nodeState.yang === 1 ? 1 : (nodeState.yang === 2 ? 2 : 3);
      candidates.push({ playerId, elementIndex, isYang: true, priority });
    }

    return candidates.sort((a, b) => a.priority - b.priority);
  }
};

export default ActionCandidates;
