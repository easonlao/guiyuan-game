// ============================================
// UI 状态管理
// ============================================
// 职责：
// - 管理 UI 相关状态（过渡状态、弹窗显示等）
// - 与游戏状态分离，保持 UI 层独立性
// ============================================

import EventBus from '../bus/EventBus.js';

const initialUIState = {
  // 菜单状态
  menuVisible: true,
  menuTransitionProgress: 0,

  // 动画状态
  battleLayerVisible: false,
  particleActive: false,

  // 弹窗状态
  decisionOverlayVisible: false,
  victoryPopupVisible: false,

  // 加载状态
  isLoading: false,
  loadingMessage: ''
};

let uiState = { ...initialUIState };

const UIStateManager = {
  /**
   * 获取 UI 状态（返回副本）
   * @returns {Object} UI 状态对象
   */
  getUIState() {
    return { ...uiState };
  },

  /**
   * 更新 UI 状态
   * @param {Object} updates - 要更新的 UI 字段
   * @returns {Object} 新 UI 状态
   */
  updateUI(updates) {
    const oldState = { ...uiState };
    uiState = { ...uiState, ...updates };

    // 触发 UI 更新事件
    EventBus.emit('ui:state-changed', {
      old: oldState,
      new: uiState,
      updates
    });

    return uiState;
  },

  /**
   * 重置 UI 状态
   */
  resetUI() {
    uiState = { ...initialUIState };
    EventBus.emit('ui:state-reset', uiState);
  }
};

export default UIStateManager;
