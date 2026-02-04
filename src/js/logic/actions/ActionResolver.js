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
   * 执行强化动作（BURST）
   * 原子性执行：消耗自身1点，强化生属性2次
   * 每次强化自动按优先级选择（阴干 > 阳干）
   * @param {string} playerId - 玩家ID
   * @param {number} stemElement - 天干元素
   * @param {number} targetElement - 目标元素（生属性）
   * @returns {Object} - 执行结果 { success, executedCount }
   */
  applyBurst(playerId, stemElement, targetElement) {
    let executedCount = 0;

    // 第1步：消耗自身本命的阴（合一状态）
    const step1 = this.applyMinus(playerId, stemElement, false, 'BURST', false);
    if (!step1) return { success: false, executedCount: 0 };
    executedCount++;

    // 第2-3步：强化自身生属性2次
    // applyPlus 会自动按优先级选择（先阴干，后阳干）
    const step2 = this.applyPlus(playerId, targetElement, undefined, 'BURST', true);
    if (step2) executedCount++;

    const step3 = this.applyPlus(playerId, targetElement, undefined, 'BURST', true);
    if (step3) executedCount++;

    return { success: executedCount > 0, executedCount };
  },

  /**
   * 执行强破动作（BURST_ATK）
   * 原子性执行：消耗自身1点，攻击对方克属性2次
   * 每次攻击自动按优先级选择（阴干 > 阳干）
   * @param {string} playerId - 玩家ID
   * @param {number} stemElement - 天干元素
   * @param {string} opponentId - 对手ID
   * @param {number} targetElement - 目标元素（克属性）
   * @returns {Object} - 执行结果 { success, executedCount }
   */
  applyBurstAtk(playerId, stemElement, opponentId, targetElement) {
    let executedCount = 0;

    // 第1步：消耗自身本命的阳（合一状态）
    const step1 = this.applyMinus(playerId, stemElement, true, 'BURST_ATK', false);
    if (!step1) return { success: false, executedCount: 0 };
    executedCount++;

    // 第2-3步：攻击对方克属性2次
    // applyMinus 会自动按优先级选择（先阴干，后阳干）
    const step2 = this.applyMinus(opponentId, targetElement, undefined, 'BURST_ATK', true);
    if (step2) executedCount++;

    const step3 = this.applyMinus(opponentId, targetElement, undefined, 'BURST_ATK', true);
    if (step3) executedCount++;

    return { success: executedCount > 0, executedCount };
  },

  /**
   * 执行加法动作（增加节点状态）
   * 优先级：阴干 > 阳干
   * - 优先增加阴干，除非阴干=2（已满）
   * - 阴干=-1 时优先修复道损
   * @param {string} playerId - 玩家ID
   * @param {number} elementIndex - 五行索引
   * @param {boolean} isYang - 是否为阳
   * @param {string} actionType - 动作类型
   * @param {boolean} isAttack - 是否为攻击行为
   * @returns {boolean} - 是否成功执行
   */
  applyPlus(playerId, elementIndex, isYang, actionType, isAttack) {
    const nodeState = StateManager.getNodeState(playerId, elementIndex);

    // 如果指定了阴阳，按指定执行
    if (isYang !== undefined) {
      const currentVal = isYang ? nodeState.yang : nodeState.yin;
      if (currentVal >= 2) return false;
      const newVal = currentVal + 1;
      StateManager.updateNodeState(playerId, elementIndex, isYang, newVal);
      ScoreCalculator.calculateAndApplyScore(playerId, actionType, currentVal, newVal, isYang, isAttack);
      return true;
    }

    // 否则按优先级：先阴干，后阳干
    // 优先阴干：如果阴干<2，增加阴干
    if (nodeState.yin < 2) {
      const newVal = nodeState.yin + 1;
      StateManager.updateNodeState(playerId, elementIndex, false, newVal);
      ScoreCalculator.calculateAndApplyScore(playerId, actionType, nodeState.yin, newVal, false, isAttack);
      return true;
    }

    // 阴干=2时，转向阳干
    if (nodeState.yang < 2) {
      const newVal = nodeState.yang + 1;
      StateManager.updateNodeState(playerId, elementIndex, true, newVal);
      ScoreCalculator.calculateAndApplyScore(playerId, actionType, nodeState.yang, newVal, true, isAttack);
      return true;
    }

    // 两者都已满，返回false
    return false;
  },

  /**
   * 执行减法动作（减少节点状态）
   * 优先级：阴干 > 阳干
   * - 优先减少阴干，除非阴干=-1（道损）
   * - 阴干=2时可以减少（2→1）
   * @param {string} playerId - 玩家ID
   * @param {number} elementIndex - 五行索引
   * @param {boolean} isYang - 是否为阳
   * @param {string} actionType - 动作类型
   * @param {boolean} isAttack - 是否为攻击行为
   * @returns {boolean} - 是否成功执行
   */
  applyMinus(playerId, elementIndex, isYang, actionType, isAttack) {
    const nodeState = StateManager.getNodeState(playerId, elementIndex);
    const scorerId = StateManager.getState().currentPlayer;

    // 如果指定了阴阳，按指定执行
    if (isYang !== undefined) {
      const currentVal = isYang ? nodeState.yang : nodeState.yin;
      if (currentVal <= -1) return false;
      const newVal = currentVal - 1;
      StateManager.updateNodeState(playerId, elementIndex, isYang, newVal);
      ScoreCalculator.calculateAndApplyScore(scorerId, actionType, currentVal, newVal, isYang, isAttack);
      return true;
    }

    // 否则按优先级：先阴干，后阳干
    // 优先阴干：如果阴干>-1，减少阴干
    if (nodeState.yin > -1) {
      const newVal = nodeState.yin - 1;
      StateManager.updateNodeState(playerId, elementIndex, false, newVal);
      ScoreCalculator.calculateAndApplyScore(scorerId, actionType, nodeState.yin, newVal, false, isAttack);
      return true;
    }

    // 阴干=-1时，转向阳干
    if (nodeState.yang > -1) {
      const newVal = nodeState.yang - 1;
      StateManager.updateNodeState(playerId, elementIndex, true, newVal);
      ScoreCalculator.calculateAndApplyScore(scorerId, actionType, nodeState.yang, newVal, true, isAttack);
      return true;
    }

    // 两者都是道损，返回false
    return false;
  }
};

export default ActionResolver;
