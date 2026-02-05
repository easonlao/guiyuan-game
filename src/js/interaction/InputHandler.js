// ============================================
// 输入处理器
// ============================================
// 职责：
// - 纯交互处理，无业务逻辑
// - 监听用户操作（点击、触摸）
// - 通过事件总线触发游戏逻辑
// ============================================

import EventBus from '../bus/EventBus.js';
import SceneTransition from '../ui/animation/SceneTransition.js';
import Renderer from '../ui/Renderer.js';

const InputHandler = {
  /**
   * 初始化
   */
  init() {
    // 初始化动画管理器
    SceneTransition.init();

    // 初始化昵称输入框
    this._initNicknameInput();

    // 绑定标题点击事件（显示菜单）
    const title = document.getElementById('title');
    const menuButtons = document.getElementById('menuButtons');
    if (title && menuButtons) {
        title.addEventListener('click', (e) => {
            e.stopPropagation();
            title.classList.add('hidden');
            // 延迟一点显示按钮
            setTimeout(() => {
                menuButtons.classList.add('visible');
            }, 300);
        });
    }

    // 绑定菜单模式选择按钮
    document.querySelectorAll('.menu-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // 防止重复点击
        if (btn.classList.contains('active')) return;

        const mode = parseInt(e.target.dataset.mode);
        this._startGame(mode, btn);
      });
    });

    // 绑定决策按钮
    document.body.addEventListener('click', (e) => {
        if (e.target.classList.contains('decision-option')) {
            const actionIndex = parseInt(e.target.dataset.index);
            const currentActions = Renderer.getCurrentDecisionActions();
            if (currentActions && currentActions[actionIndex]) {
                const action = currentActions[actionIndex];
                EventBus.emit('game:action-selected', action);
                EventBus.emit('ui:hide-decision');
            }
        }
    });
  },

  /**
   * 启动游戏
   * @param {number} mode - 游戏模式
   * @param {HTMLElement} btn - 点击的按钮
   */
  _startGame(mode, btn) {
    // 视觉反馈：选中按钮高亮，其他变暗
    document.querySelectorAll('.menu-btn').forEach(b => {
      if (b === btn) b.classList.add('active');
      else b.classList.add('dim');
    });

    // 1. 开始转场动画
    SceneTransition.startTransition();

    // 2. 监听动画结束，正式开始游戏逻辑
    const onComplete = () => {
      EventBus.emit('game:start', { mode });
      EventBus.off('anim:transition-complete', onComplete);
    };
    EventBus.on('anim:transition-complete', onComplete);
  },

  /**
   * 初始化昵称输入框
   * @private
   */
  _initNicknameInput() {
    const nicknameInput = document.getElementById('nickname-input');
    if (!nicknameInput) return;

    // 从 localStorage 加载昵称
    const savedNickname = localStorage.getItem('playerNickname') || '';
    nicknameInput.value = savedNickname;

    // 监听输入变化，自动保存
    nicknameInput.addEventListener('input', (e) => {
      const nickname = e.target.value.trim().substring(0, 10);
      localStorage.setItem('playerNickname', nickname);
    });
  }
};

export default InputHandler;
