// ============================================
// 得分特效系统
// ============================================

import EventBus from '../bus/EventBus.js';
import { GAME_EVENTS } from '../types/events.js';
import StateManager from '../state/StateManager.js';

const ScoreEffects = {
  // 弹窗堆叠计数器（用于自动错开位置）
  _stackCount: { P1: 0, P2: 0 },
  _stackResetDelay: 1500, // 1.5秒后重置计数器

  // 不同行为类型的特效配置（按结果分类）
  effectConfig: {
    '点亮': {
      color: '#2dcc70',
      size: 'medium'
    },
    '加持': {
      color: '#ffd700',
      size: 'large'
    },
    '修复道损': {
      color: '#4a90e2',
      size: 'large'
    },
    '致阳道损': {
      color: '#ff6b6b',
      size: 'medium'
    },
    '致阴道损': {
      color: '#ff6b6b',
      size: 'medium'
    },
    '致道损': {
      color: '#ff6b6b',
      size: 'medium'
    },
    '破阳点亮': {
      color: '#ff9500',
      size: 'medium'
    },
    '破阴点亮': {
      color: '#ff9500',
      size: 'medium'
    },
    '破点亮': {
      color: '#ff9500',
      size: 'medium'
    },
    '削弱加持': {
      color: '#ff9500',
      size: 'medium'
    },
    '调息': {
      color: '#9b59b6',
      size: 'small'
    },
    '化': {
      color: '#9b59b6',
      size: 'small'
    },
    '破': {
      color: '#ff6b6b',
      size: 'small'
    },
    '强化': {
      color: '#ff1493',
      size: 'xlarge'
    },
    '强破': {
      color: '#ff1493',
      size: 'xlarge'
    },
    '天道分红': {
      color: '#87ceeb',
      size: 'small'
    },
    '道损亏损': {
      color: '#dc143c',
      size: 'small'
    },
    '最终道损惩罚': {
      color: '#dc143c',
      size: 'medium'
    },
    '道损惩罚': {
      color: '#dc143c',
      size: 'medium'
    }
  },

  init() {
    console.log('[ScoreEffects] 初始化得分特效系统');
    EventBus.on(GAME_EVENTS.SCORE_CHANGE, this.showScoreChange.bind(this));
  },

  showScoreChange(data) {
    const { playerId, amount, reason } = data;

    // 解析组合格式的 reason（如 "调息·点亮"）
    const cleanReason = this._extractReason(reason);

    // 获取特效配置
    const config = this.effectConfig[cleanReason] || {
      color: '#ffffff',
      size: 'medium'
    };

    // 确定显示位置
    const playerStar = document.getElementById(`${playerId.toLowerCase()}-star`);
    if (!playerStar) return;

    const rect = playerStar.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    // 使用完整的 reason 显示，但用 cleanReason 匹配配置
    // 传入堆叠索引，让弹窗自动错开
    const stackIndex = this._stackCount[playerId];
    this._stackCount[playerId]++;

    this.createFloatingScore(x, y, amount, reason, config, stackIndex);

    // 重置堆叠计数器（1.5秒后）
    if (this._stackCount[playerId] === 1) {
      setTimeout(() => {
        this._stackCount[playerId] = 0;
      }, this._stackResetDelay);
    }
  },

  /**
   * 提取纯净的原因名称（处理组合格式）
   * @private
   */
  _extractReason(reason) {
    // 如果是组合格式 "动作·状态"，优先匹配状态
    if (reason.includes('·')) {
      const parts = reason.split('·');
      // 返回状态部分（如"点亮"、"加持"等）
      if (parts.length > 1) {
        return parts[1];
      }
    }
    // 如果有括号，提取括号前的内容（如 "天道分红(3)" → "天道分红"）
    const match = reason.match(/^([^(]+)/);
    return match ? match[1].trim() : reason;
  },

  createFloatingScore(x, y, amount, reason, config, stackIndex = 0) {
    const container = document.body;
    const scoreEl = document.createElement('div');
    scoreEl.className = 'score-float';
    scoreEl.innerHTML = `
      <div class="score-amount" style="color: ${config.color}">${amount > 0 ? '+' : ''}${amount}</div>
      <div class="score-reason">${reason}</div>
    `;

    // 设置初始位置（根据堆叠索引向上偏移）
    const offsetY = -stackIndex * 50; // 每个弹窗向上偏移50px
    scoreEl.style.left = `${x}px`;
    scoreEl.style.top = `${y + offsetY}px`;

    // 根据大小设置缩放
    const sizeMap = {
      'small': 0.9,
      'medium': 1,
      'large': 1.15,
      'xlarge': 1.3
    };
    const scale = sizeMap[config.size] || 1;
    scoreEl.style.setProperty('--score-scale', scale);
    scoreEl.style.setProperty('--score-color', config.color);

    container.appendChild(scoreEl);

    setTimeout(() => {
      scoreEl.remove();
    }, 1500);
  }
};

export default ScoreEffects;
