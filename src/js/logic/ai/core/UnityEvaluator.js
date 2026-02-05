// ============================================
// 归一状态评估器
// ============================================
// 职责：
// - 评估双方归一进度
// - 评估双方合一状态
// - 计算道损分布
// - 提供核心决策指标
// ============================================

import StateManager from '../../../state/StateManager.js';

const UnityEvaluator = {
  /**
   * 评估玩家归一状态
   * @param {string} playerId - 玩家ID
   * @returns {Object} 归一状态评估
   */
  evaluatePlayerUnity(playerId) {
    let unityCount = 0;      // 归一数量 (yang>=1 && yin>=1)
    let harmonyCount = 0;    // 合一数量 (yang=2 && yin=2)
    let damageCount = 0;     // 道损数量 (yang=-1 && yin=-1)
    let nearUnityCount = 0;  // 接近归一 (一个1, 另一个>=0)

    const elements = [];

    for (let i = 0; i < 5; i++) {
      const nodeState = StateManager.getNodeState(playerId, i);
      const { yang, yin } = nodeState;

      // 归一：yang>=1 && yin>=1
      const isUnity = yang >= 1 && yin >= 1;

      // 合一：yang=2 && yin=2
      const isHarmony = yang === 2 && yin === 2;

      // 道损：yang=-1 && yin=-1
      const isDamage = yang === -1 && yin === -1;

      // 接近归一：有一个是1，另一个是0或1
      const isNearUnity = (yang === 1 && yin >= 0) || (yin === 1 && yang >= 0);

      if (isUnity) unityCount++;
      if (isHarmony) harmonyCount++;
      if (isDamage) damageCount++;
      if (isNearUnity && !isUnity) nearUnityCount++;

      elements.push({
        element: i,
        yang,
        yin,
        isUnity,
        isHarmony,
        isDamage,
        isNearUnity
      });
    }

    return {
      playerId,
      unityCount,       // 0-5: 归一进度
      harmonyCount,     // 0-5: 合一数量
      damageCount,      // 0-5: 道损数量
      nearUnityCount,   // 0-5: 接近归一
      unityProgress: unityCount / 5,  // 0-1: 归一进度百分比
      elements
    };
  },

  /**
   * 评估双方归一状态
   * @returns {Object} 双方状态对比
   */
  evaluateBoth() {
    const p1 = this.evaluatePlayerUnity('P1');
    const p2 = this.evaluatePlayerUnity('P2');

    // 归一优势：正数表示P1领先
    const unityAdvantage = p1.unityCount - p2.unityCount;

    // 合一优势：正数表示P1领先
    const harmonyAdvantage = p1.harmonyCount - p2.harmonyCount;

    // 道损对比
    const damageAdvantage = p2.damageCount - p1.damageCount;  // 正数表示P1优势（对方道损更多）

    return {
      P1: p1,
      P2: p2,
      advantages: {
        unity: unityAdvantage,
        harmony: harmonyAdvantage,
        damage: damageAdvantage
      }
    };
  },

  /**
   * 获取游戏阶段
   * @param {Object} bothEval - evaluateBoth() 的返回值
   * @returns {string} 'early' | 'mid' | 'late' | 'urgent'
   */
  getGamePhase(bothEval) {
    const myUnity = bothEval.P1.unityCount;
    const opponentUnity = bothEval.P2.unityCount;
    const maxUnity = Math.max(myUnity, opponentUnity);

    // 紧急情况：对方有4个归一
    if (opponentUnity >= 4) {
      return 'urgent';
    }

    // 前期：双方归一都少于3
    if (maxUnity < 3) {
      return 'early';
    }

    // 中期：有3-4个归一
    if (maxUnity < 5) {
      return 'mid';
    }

    // 后期：接近胜利
    return 'late';
  },

  /**
   * 检查元素是否归一
   * @param {string} playerId - 玩家ID
   * @param {number} elementIndex - 元素索引
   * @returns {boolean}
   */
  isElementUnity(playerId, elementIndex) {
    const nodeState = StateManager.getNodeState(playerId, elementIndex);
    return nodeState.yang >= 1 && nodeState.yin >= 1;
  },

  /**
   * 检查元素是否合一
   * @param {string} playerId - 玩家ID
   * @param {number} elementIndex - 元素索引
   * @returns {boolean}
   */
  isElementHarmony(playerId, elementIndex) {
    const nodeState = StateManager.getNodeState(playerId, elementIndex);
    return nodeState.yang === 2 && nodeState.yin === 2;
  },

  /**
   * 检查元素是否道损
   * @param {string} playerId - 玩家ID
   * @param {number} elementIndex - 元素索引
   * @returns {boolean}
   */
  isElementDamage(playerId, elementIndex) {
    const nodeState = StateManager.getNodeState(playerId, elementIndex);
    return nodeState.yang === -1 && nodeState.yin === -1;
  },

  /**
   * 获取未归一的元素列表
   * @param {string} playerId - 玩家ID
   * @returns {Array} 未归一的元素索引
   */
  getUnunitedElements(playerId) {
    const ununited = [];
    for (let i = 0; i < 5; i++) {
      if (!this.isElementUnity(playerId, i)) {
        ununited.push(i);
      }
    }
    return ununited;
  },

  /**
   * 获取已归一的元素列表
   * @param {string} playerId - 玩家ID
   * @returns {Array} 已归一的元素索引
   */
  getUnitedElements(playerId) {
    const united = [];
    for (let i = 0; i < 5; i++) {
      if (this.isElementUnity(playerId, i)) {
        united.push(i);
      }
    }
    return united;
  },

  /**
   * 获取合一的元素列表
   * @param {string} playerId - 玩家ID
   * @returns {Array} 合一的元素索引
   */
  getHarmoniedElements(playerId) {
    const harmonied = [];
    for (let i = 0; i < 5; i++) {
      if (this.isElementHarmony(playerId, i)) {
        harmonied.push(i);
      }
    }
    return harmonied;
  },

  /**
   * 获取道损的元素列表
   * @param {string} playerId - 玩家ID
   * @returns {Array} 道损的元素索引
   */
  getDamagedElements(playerId) {
    const damaged = [];
    for (let i = 0; i < 5; i++) {
      if (this.isElementDamage(playerId, i)) {
        damaged.push(i);
      }
    }
    return damaged;
  }
};

export default UnityEvaluator;
