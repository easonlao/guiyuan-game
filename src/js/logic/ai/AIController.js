// ============================================
// AI 决策控制器
// ============================================
// 职责：
// - 评估可用动作
// - 根据权重选择最优动作
// - 模拟延时执行
// ============================================

const AIController = {
  /**
   * AI 动作权重配置
   * 数值越大，优先级越高
   */
  ACTION_WEIGHTS: {
    'BURST': 10,
    'BURST_ATK': 9,
    'TRANS': 5,
    'ATK': 4,
    'CONVERT': 1
  },

  /**
   * AI 执行决策
   * @param {Array} actions - 可用动作列表
   * @param {Object} stem - 当前天干
   * @param {string} playerId - 玩家ID
   * @param {Function} executor - 执行回调函数
   */
  execute(actions, stem, playerId, executor) {
    if (actions.length === 0) {
      console.warn('[AIController] 没有可用动作');
      return;
    }

    const selected = this._selectBestAction(actions);

    console.log(`[AIController] ${playerId} 选择动作: ${selected.type}`);

    setTimeout(() => {
      executor(selected);
    }, 800);
  },

  /**
   * 根据权重选择最优动作
   * @param {Array} actions - 可用动作列表
   * @returns {Object} - 选中的动作
   * @private
   */
  _selectBestAction(actions) {
    const sorted = actions.sort((a, b) => {
      const weightA = this.ACTION_WEIGHTS[a.type] || 0;
      const weightB = this.ACTION_WEIGHTS[b.type] || 0;
      return weightB - weightA;
    });

    return sorted[0];
  }
};

export default AIController;
