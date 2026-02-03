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
    console.log('[InputHandler] 初始化输入处理器...');
    
    // 初始化动画管理器
    SceneTransition.init();
    
    // 绑定标题点击事件（显示菜单）
    const title = document.getElementById('title');
    const menuButtons = document.getElementById('menuButtons');
    if (title && menuButtons) {
        title.addEventListener('click', (e) => {
            console.log('[InputHandler] 点击标题，进入菜单');
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
        console.log('[InputHandler] 选择模式:', mode);
        
        // 视觉反馈：选中按钮高亮，其他变暗
        document.querySelectorAll('.menu-btn').forEach(b => {
            if (b === e.target) b.classList.add('active');
            else b.classList.add('dim');
        });
        
        // 1. 开始转场动画
        SceneTransition.startTransition();
        
        // 2. 监听动画结束，正式开始游戏逻辑
        const onComplete = () => {
            console.log('[InputHandler] ========== 转场结束，启动游戏引擎 ==========');
            console.log('[InputHandler] 游戏模式:', mode);
            EventBus.emit('game:start', { mode });
            EventBus.off('anim:transition-complete', onComplete);
        };
        console.log('[InputHandler] 注册 anim:transition-complete 监听器');
        EventBus.on('anim:transition-complete', onComplete);
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
  }
};

export default InputHandler;
