// ============================================
// 决策面板控制器
// ============================================
// 职责：
// - 显示决策选项面板
// - 管理当前决策动作
// - 处理决策面板显示/隐藏
// ============================================

import { ACTION_NAMES } from '../../config/game-config.js';

const DecisionPanel = {
  _currentActions: null,

  /**
   * 显示决策面板
   * @param {Object} data - {actions, stem}
   * @param {Object} animatingNodes - 动画中的节点映射
   */
  showDecision(data, animatingNodes) {
    const { actions, stem } = data;
    this._currentActions = actions;

    this._clearAnimationLocks(stem, animatingNodes);
    this._renderDecisionPanel(actions, stem);
  },

  /**
   * 清理动画锁
   * @param {Object} stem - 天干对象
   * @param {Object} animatingNodes - 动画中的节点映射
   * @private
   */
  _clearAnimationLocks(stem, animatingNodes) {
    if (stem && stem.element !== undefined) {
      ['P1', 'P2'].forEach(playerId => {
        const nodeKey = `${playerId}-${stem.element}`;
        if (animatingNodes[nodeKey]) {
          delete animatingNodes[nodeKey];
        }
      });
    }
  },

  /**
   * 渲染决策面板
   * @param {Array} actions - 动作列表
   * @param {Object} stem - 天干对象
   * @private
   */
  _renderDecisionPanel(actions, stem) {
    let overlay = document.querySelector('.decision-overlay');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'decision-overlay';
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = this._generateDecisionHTML(actions, stem);
    overlay.style.display = 'flex';
  },

  /**
   * 生成决策面板 HTML
   * @param {Array} actions - 动作列表
   * @param {Object} stem - 天干对象
   * @returns {string}
   * @private
   */
  _generateDecisionHTML(actions, stem) {
    const buttonsHTML = actions.map((action, idx) => {
      const actionName = ACTION_NAMES[action.type] || action.type;
      return `<button class="decision-option" data-index="${idx}" data-type="${action.type}" style="color:${stem.color}; min-width: 150px;">${actionName}</button>`;
    }).join('');

    return `
      <div style="text-align:center;">
        <h2 style="color:${stem.color}; font-size: 3rem; margin-bottom: 2rem; text-shadow: 0 0 20px ${stem.color}; letter-spacing: 0.5rem; font-family: 'Ma Shan Zheng', serif;">
          ${stem.name}
        </h2>
        <div style="display:flex; flex-direction:column; gap:1.5rem; align-items:center;">
          ${buttonsHTML}
        </div>
      </div>
    `;
  },

  /**
   * 隐藏决策面板
   */
  hideDecision() {
    const overlay = document.querySelector('.decision-overlay');
    if (overlay) overlay.style.display = 'none';
    this._currentActions = null;
  },

  /**
   * 获取当前决策动作
   * @returns {Array|null}
   */
  getCurrentActions() {
    return this._currentActions;
  }
};

export default DecisionPanel;
