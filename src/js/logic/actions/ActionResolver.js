// ============================================
// 动作解析器
// ============================================
// 职责：
// - 执行加法动作（applyPlus）
// - 执行减法动作（applyMinus）
// ============================================

import StateManager from '../../state/StateManager.js';
import ScoreCalculator from './ScoreCalculator.js';

const ActionResolver = {
  /**
   * 执行加法动作（增加节点状态）
   * @param {string} playerId - 玩家ID
   * @param {number} elementIndex - 五行索引
   * @param {boolean} isYang - 是否为阳
   * @param {string} actionType - 动作类型
   * @param {boolean} isAttack - 是否为攻击行为
   * @returns {boolean} - 是否成功执行
   */
  applyPlus(playerId, elementIndex, isYang, actionType, isAttack) {
    const nodeState = StateManager.getNodeState(playerId, elementIndex);
    const currentVal = isYang ? nodeState.yang : nodeState.yin;

    if (currentVal >= 2) return false;

    const newVal = currentVal + 1;
    StateManager.updateNodeState(playerId, elementIndex, isYang, newVal);

    ScoreCalculator.calculateAndApplyScore(playerId, actionType, currentVal, newVal, isYang, isAttack);
    return true;
  },

  /**
   * 执行减法动作（减少节点状态）
   * @param {string} playerId - 玩家ID
   * @param {number} elementIndex - 五行索引
   * @param {boolean} isYang - 是否为阳
   * @param {string} actionType - 动作类型
   * @param {boolean} isAttack - 是否为攻击行为
   * @returns {boolean} - 是否成功执行
   */
  applyMinus(playerId, elementIndex, isYang, actionType, isAttack) {
    const nodeState = StateManager.getNodeState(playerId, elementIndex);
    const currentVal = isYang ? nodeState.yang : nodeState.yin;

    if (currentVal <= -1) return false;

    const newVal = currentVal - 1;
    StateManager.updateNodeState(playerId, elementIndex, isYang, newVal);

    const scorerId = StateManager.getState().currentPlayer;

    ScoreCalculator.calculateAndApplyScore(scorerId, actionType, currentVal, newVal, isYang, isAttack);
    return true;
  }
};

export default ActionResolver;
