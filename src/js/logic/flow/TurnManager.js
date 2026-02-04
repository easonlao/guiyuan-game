// ============================================
// 回合管理器（简化PVP架构）
// ============================================
// 职责：
// - 管理回合开始和结束
// - 控制回合切换（乐观更新）
// - 检测游戏结束条件
// - 处理胜利/平局判定
// ============================================

import EventBus from '../../bus/EventBus.js';
import StateManager from '../../state/StateManager.js';
import { GAME_EVENTS } from '../../types/events.js';
import { POINTS_CONFIG } from '../../config/game-config.js';
import SimplifiedPVPManager from '../../network/SimplifiedPVPManager.js';
import PassiveEffects from '../../ui/effects/PassiveEffects.js';

const TurnManager = {
  /**
   * 开始新回合
   */
  async startTurn() {
    console.log('[TurnManager] startTurn called');

    // 先增加回合计数
    const state = StateManager.getState();
    const newTurnCount = state.turnCount + 1;
    StateManager.update({ turnCount: newTurnCount });
    console.log('[TurnManager] 回合计数:', state.turnCount, '→', newTurnCount);

    if (await this.checkGameEnd()) return;

    const currentPlayer = state.currentPlayer;
    const opponentId = currentPlayer === 'P1' ? 'P2' : 'P1';

    console.log('[TurnManager] currentPlayer:', currentPlayer, 'opponentId:', opponentId);
    this._resetBurstBonus(opponentId);

    // 检查是否有待显示的结算效果
    const hasPendingSettlement = state.pendingSettlement;

    // 清除标志，以便下一回合能正确判断
    StateManager.update({ pendingSettlement: false }, true);

    // 根据是否有结算效果决定延迟时间
    const delay = hasPendingSettlement ? 2400 : 0;

    if (delay > 0) {
      console.log('[TurnManager] 有结算效果，延迟', delay, 'ms');
    } else {
      console.log('[TurnManager] 无结算效果，立即生成天干');
    }

    setTimeout(() => {
      // 如果已经有同步过来的天干，则直接触发生成事件，不再重新生成
      if (state.currentStem) {
        console.log('[TurnManager] 使用已同步的天干:', state.currentStem.name);
        EventBus.emit('game:stem-generated', { stem: state.currentStem });
        return;
      }

      console.log('[TurnManager] emitting game:generate-stem');
      EventBus.emit('game:generate-stem');
    }, delay);
  },

  /**
   * 重置对手的 burstBonus
   * @param {string} opponentId - 对手ID
   * @private
   */
  _resetBurstBonus(opponentId) {
    const state = StateManager.getState();

    if (!state.players[opponentId].burstBonus) {
      StateManager.update({
        players: {
          ...state.players,
          [opponentId]: {
            ...state.players[opponentId],
            burstBonus: true
          }
        }
      });
    }
  },

  /**
   * 增加回合计数
   * @private
   */
  _incrementTurnCount() {
    const state = StateManager.getState();
    StateManager.update({ turnCount: state.turnCount + 1 });
  },

  /**
   * 结束回合（简化PVP - 乐观更新）
   * @returns {Promise<Object>} { success, error }
   */
  async endTurn() {
    console.log('[TurnManager] ====== 结束回合 ======');

    const state = StateManager.getState();

    // 1. 计算回合结算效果（等待动画完成）
    await this._calculatePassiveEffects();

    // 2. 立即切换回合（不等待服务器）
    StateManager.switchPlayer();
    console.log('[TurnManager] 回合已切换到:', state.currentPlayer);

    // 3. 异步通知对手（仅PVP模式）
    if (state.gameMode === 0) {
      SimplifiedPVPManager.sendTurnEndNotification().catch(err => {
        console.warn('[TurnManager] 回合切换通知失败:', err);
      });
    }

    // 4. 触发下一回合开始
    EventBus.emit('game:next-turn');
    return { success: true };
  },

  /**
   * 计算回合结算的持续效果（加分和扣分）
   * - 天道分红：加持状态每回合加分
   * - 道损亏损：道损状态每回合扣分
   * @private
   */
  async _calculatePassiveEffects() {
    const state = StateManager.getState();
    const currentPlayer = state.currentPlayer; // 当前回合玩家

    let unityCount = 0;    // 归一状态数量
    let damageCount = 0;   // 道损状态数量

    // 只统计当前回合玩家的状态
    for (let i = 0; i < 5; i++) {
      const nodeState = StateManager.getNodeState(currentPlayer, i);
      // 统计归一状态 (yang=2 且 yin=2)
      if (nodeState.yang === 2 && nodeState.yin === 2) {
        unityCount++;
      }
      // 统计道损状态 (yang=-1 且 yin=-1，两个都是-1才算道损)
      if (nodeState.yang === -1 && nodeState.yin === -1) {
        damageCount++;
      }
    }

    // 检查是否有结算效果
    const hasEffects = (unityCount > 0 || damageCount > 0);

    // 设置标志，告诉 startTurn 是否需要延迟
    StateManager.update({ pendingSettlement: hasEffects }, true);

    // 如果没有结算效果，直接返回
    if (!hasEffects) {
      console.log('[TurnManager] 没有结算效果，跳过动画');
      return;
    }

    // 播放当前回合玩家的动画
    console.log(`[TurnManager] 播放回合结算动画 (${currentPlayer})`);
    await PassiveEffects.playTurnSettlement({
      [currentPlayer]: { unityCount, damageCount }
    });

    // 动画完成后，再触发分数变化
    console.log('[TurnManager] 动画完成，开始计分...');
    // 天道分红（正向）
    if (unityCount > 0) {
      const points = unityCount * POINTS_CONFIG.PASSIVE.UNITY_DIVIDEND;
      StateManager.addScore(currentPlayer, points, `天道分红(${unityCount})`, 'DIVIDEND');
    }

    // 道损亏损（负向，每回合持续扣分）
    if (damageCount > 0) {
      const penalty = damageCount * POINTS_CONFIG.PASSIVE.DAMAGE_PENALTY;
      StateManager.addScore(currentPlayer, penalty, `道损亏损(${damageCount})`, 'DAMAGE_PENALTY');
      console.log(`[TurnManager] ${currentPlayer} 道损亏损: ${damageCount}个, ${penalty}分`);
    }
  },

  /**
   * 检查游戏是否结束
   * @returns {Promise<boolean>} - 是否结束
   */
  async checkGameEnd() {
    const state = StateManager.getState();

    for (const playerId of ['P1', 'P2']) {
      if (this._checkAllLit(playerId)) {
        await this.handleVictory(playerId, '所有天干点亮');
        return true;
      }
    }

    if (state.turnCount >= state.maxTurns) {
      await this.handleDrawOrPointsDecision();
      return true;
    }

    return false;
  },

  /**
   * 检查玩家是否所有节点都已点亮
   * @param {string} playerId - 玩家ID
   * @returns {boolean}
   * @private
   */
  _checkAllLit(playerId) {
    for (let i = 0; i < 5; i++) {
      const nodeState = StateManager.getNodeState(playerId, i);
      if (nodeState.yang < 1 || nodeState.yin < 1) {
        return false;
      }
    }
    return true;
  },

  /**
   * 处理胜利
   * @param {string} winnerId - 胜利者ID
   * @param {string} reason - 胜利原因
   */
  async handleVictory(winnerId, reason) {
    console.log(`[TurnManager] 游戏结束: ${winnerId} 获胜 (${reason})`);

    // 如果是全点亮胜利，显示五行归元过场
    if (reason === '所有天干点亮') {
      console.log('[TurnManager] 触发五行归元过场');
      EventBus.emit('achievement:show-full-unity', winnerId);
      // 等待过场动画完成
      await this._waitForOverlayHidden();
    }

    EventBus.emit(GAME_EVENTS.VICTORY, { winner: winnerId, reason });
    StateManager.update({ phase: 'GAME_END' });
  },

  /**
   * 处理平局或按分数判定胜负
   */
  async handleDrawOrPointsDecision() {
    const state = StateManager.getState();
    let winner = state.players.P1.score > state.players.P2.score ? 'P1' : 'P2';

    if (state.players.P1.score === state.players.P2.score) {
      winner = 'DRAW';
    }

    console.log(`[TurnManager] 游戏结束: 回合上限, 胜者 ${winner}`);

    // 显示局终过场
    console.log('[TurnManager] 触发局终过场');
    EventBus.emit('achievement:show-turn-limit', winner);
    // 等待过场动画完成
    await this._waitForOverlayHidden();

    EventBus.emit(GAME_EVENTS.VICTORY, { winner, reason: '回合上限' });
    StateManager.update({ phase: 'GAME_END' });
  },

  /**
   * 等待过场动画完成
   * @returns {Promise<void>}
   * @private
   */
  _waitForOverlayHidden() {
    return new Promise((resolve) => {
      const handler = () => {
        EventBus.off('achievement:overlay-hidden', handler);
        console.log('[TurnManager] 过场动画完成，继续执行');
        resolve();
      };
      EventBus.on('achievement:overlay-hidden', handler);
    });
  },

  /**
   * 应用最终道损惩罚（游戏结束时额外扣分）
   * @private
   */
  async _applyFinalDamagePenalty() {
    const FINAL_PENALTY_PER_DAMAGE = POINTS_CONFIG.PENALTY.UNREPAIRED_DMG;
    const result = { P1: { damageCount: 0 }, P2: { damageCount: 0 } };

    ['P1', 'P2'].forEach(playerId => {
      let damageCount = 0;

      // 计算道损数量（yang=-1 且 yin=-1，两个都是-1才算道损）
      for (let i = 0; i < 5; i++) {
        const nodeState = StateManager.getNodeState(playerId, i);
        if (nodeState.yang === -1 && nodeState.yin === -1) {
          damageCount++;
        }
      }

      result[playerId] = { damageCount };
    });

    // 先播放动画，等待动画完成
    console.log('[TurnManager] 播放最终惩罚动画...');
    await PassiveEffects.playFinalPenalty(result);

    // 动画完成后，再触发分数变化
    console.log('[TurnManager] 动画完成，开始计分...');
    ['P1', 'P2'].forEach(playerId => {
      const { damageCount } = result[playerId];

      if (damageCount > 0) {
        const penalty = damageCount * FINAL_PENALTY_PER_DAMAGE;
        StateManager.addScore(playerId, penalty, `最终道损惩罚(${damageCount})`, 'FINAL_PENALTY');
        console.log(`[TurnManager] ${playerId} 最终道损惩罚: ${damageCount}个, ${penalty}分`);
      }
    });
  }
};

export default TurnManager;
