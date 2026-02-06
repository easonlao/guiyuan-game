// ============================================
// 回合管理器（主机-客户端PVP架构）
// ============================================
// 职责：
// - 管理回合开始和结束
// - 控制回合切换（主机权威）
// - 检测游戏结束条件
// - 处理胜利/平局判定
// ============================================

import EventBus from '../../bus/EventBus.js';
import StateManager from '../../state/StateManager.js';
import { GAME_EVENTS } from '../../types/events.js';
import { POINTS_CONFIG } from '../../config/game-config.js';
import SimplifiedPVPManager from '../../network/SimplifiedPVPManager.js';
import AuthorityExecutor from '../AuthorityExecutor.js';
import AIController from '../ai/AIController.js';

// 获取 PVP 管理器（在线模式）
function getPVPManager() {
  return SimplifiedPVPManager;
}

import PassiveEffects from '../../ui/effects/PassiveEffects.js';

const TurnManager = {
  _turnTimer: null, // 记录当前的 timer ID，用于 cleanup

  /**
   * 开始新回合
   */
  async startTurn() {
    const state = StateManager.getState();
    const myRole = StateManager.getMyRole();
    console.log(`[TurnManager startTurn ${myRole}] 开始回合: currentPlayer=${state.currentPlayer}, turnCount=${state.turnCount}→${state.turnCount + 1}`);

    // 先增加回合计数
    const newTurnCount = state.turnCount + 1;
    StateManager.update({ turnCount: newTurnCount });

    if (await this.checkGameEnd()) return;

    const currentPlayer = state.currentPlayer;
    const opponentId = currentPlayer === 'P1' ? 'P2' : 'P1';

    console.log(`[TurnManager startTurn ${myRole}] currentPlayer=${currentPlayer}, opponentId=${opponentId}`);

    this._resetBurstBonus(opponentId);

    // 检查是否有待显示的结算效果
    const hasPendingSettlement = state.pendingSettlement;

    // 清除标志，以便下一回合能正确判断
    StateManager.update({ pendingSettlement: false }, true);

    // 清除之前的定时器（防止重复设置）
    if (this._turnTimer) {
      clearTimeout(this._turnTimer);
      this._turnTimer = null;
    }

    // 【角色职责分离】PVP 客户端：即时状态检查后直接返回（不设置 setTimeout）
    if (state.gameMode === 0 && !AuthorityExecutor.isHost()) {
      if (state.currentStem) {
        // 网络包已到达，直接触发渲染
        EventBus.emit('game:stem-generated', { stem: state.currentStem });
      }
      // 客户端：等待网络消息，不设置定时器兜底
      return;
    }

    // 单机模式或PVP主机：设置定时器延迟生成
    const delay = hasPendingSettlement ? 1000 : 0;

    this._turnTimer = setTimeout(() => {
      this._turnTimer = null; // 执行后清除引用

      // 获取最新状态（可能在延迟期间已通过 sync:stem 更新）
      const latestState = StateManager.getState();

      // 如果已经有同步过来的天干，则直接触发生成事件，播放动画
      if (latestState.currentStem) {
        EventBus.emit('game:stem-generated', { stem: latestState.currentStem });
        return;
      }

      // PVP 模式下的主机-客户端逻辑
      if (latestState.gameMode === 0) {
        // 主机：生成天干（无论谁的回合）
        if (AuthorityExecutor.isHost()) {
          EventBus.emit('game:generate-stem');
        } else {
          // 客户端：等待主机的天干同步
        }
        return;
      }

      // 单机模式（玩家 VS 天道）：每回合都生成天干
      // P1 是玩家，P2 是天道 AI，但每回合都需要天干
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
   * 结束回合（主机-客户端PVP架构）
   * @returns {Promise<Object>} { success, error }
   */
  async endTurn() {

    const state = StateManager.getState();
    const beforePlayer = state.currentPlayer;
    const isExtraTurn = state.isExtraTurn || false;

    // PVP 模式下的主机权威回合切换
    if (state.gameMode === 0) {
      const pvpManager = getPVPManager();

      // 主机：计算下个回合并广播
      if (AuthorityExecutor.isHost()) {
        // 1. 主机计算回合结算效果（等待动画完成）
        // 返回分数变化列表，用于 PVP 同步
        console.log(`[TurnManager endTurn] 主机开始计算回合结算效果`);
        const scoreChanges = await this._calculatePassiveEffects();
        console.log(`[TurnManager endTurn] 主机计算完成，scoreChanges数量=${scoreChanges.length}`, scoreChanges);

        const result = AuthorityExecutor.calculateNextPlayer(beforePlayer, isExtraTurn);
        if (!result) {
          console.error('[TurnManager] 权威执行器未能计算下个回合');
          return { success: false, error: 'Failed to calculate next player' };
        }

        const { nextPlayer, nextIsExtraTurn } = result;

        // 使用计算出的 nextPlayer 和 nextIsExtraTurn 切换玩家
        StateManager.switchPlayer(nextPlayer, nextIsExtraTurn);

        // 广播回合切换同步（包含分数变化）
        if (pvpManager.sendTurnSync) {
          pvpManager.sendTurnSync(nextPlayer, nextIsExtraTurn, scoreChanges);
        }

        // 触发下一回合开始
        EventBus.emit('game:next-turn');
        return { success: true };
      }

      // 客户端：跳过被动效果计算，等待主机的 turn_sync 消息
      // 主机会在 turn_sync 中包含分数变化，客户端在收到消息后应用
      return { success: true };
    }

    // 3. 单机模式：使用 AuthorityExecutor 计算下个玩家（支持强化额外机会）
    const result = AuthorityExecutor.calculateNextPlayer(beforePlayer, isExtraTurn);
    if (!result) {
      console.error('[TurnManager] 无法计算下个回合');
      return { success: false, error: 'Failed to calculate next player' };
    }

    const { nextPlayer, nextIsExtraTurn } = result;

    // 使用计算出的 nextPlayer 和 nextIsExtraTurn 切换玩家
    StateManager.switchPlayer(nextPlayer, nextIsExtraTurn);

    // 获取切换后的状态
    const afterState = StateManager.getState();

    // 触发下一回合开始
    EventBus.emit('game:next-turn');
    return { success: true };
  },

  /**
   * 计算回合结算的持续效果（加分和扣分）
   * - 天道分红：加持状态每回合加分
   * - 道损亏损：道损状态每回合扣分
   * @returns {Promise<Array>} 分数变化列表 [{ playerId, amount, reason, actionType }]
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

    // 如果没有结算效果，直接返回空数组
    if (!hasEffects) {
      return [];
    }

    // 播放当前回合玩家的动画
    await PassiveEffects.playTurnSettlement({
      [currentPlayer]: { unityCount, damageCount }
    });

    // 动画完成后，再触发分数变化
    const scoreChanges = [];

    // 天道分红（正向）
    if (unityCount > 0) {
      const points = unityCount * POINTS_CONFIG.PASSIVE.UNITY_DIVIDEND;
      StateManager.addScore(currentPlayer, points, `天道分红(${unityCount})`, 'DIVIDEND');
      scoreChanges.push({
        playerId: currentPlayer,
        amount: points,
        reason: `天道分红(${unityCount})`,
        actionType: 'DIVIDEND'
      });
    }

    // 道损亏损（负向，每回合持续扣分）
    if (damageCount > 0) {
      const penalty = damageCount * POINTS_CONFIG.PASSIVE.DAMAGE_PENALTY;
      StateManager.addScore(currentPlayer, penalty, `道损亏损(${damageCount})`, 'DAMAGE_PENALTY');
      scoreChanges.push({
        playerId: currentPlayer,
        amount: penalty,
        reason: `道损亏损(${damageCount})`,
        actionType: 'DAMAGE_PENALTY'
      });
    }

    return scoreChanges;
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
    // 记录 AI 游戏数据
    AIController.endGame(winnerId);

    // PVP 模式下，广播游戏结束消息给对手
    const state = StateManager.getState();
    if (state.gameMode === 0) {
      const pvpManager = getPVPManager();
      if (pvpManager.syncGameEnd) {
        pvpManager.syncGameEnd({ winner: winnerId, reason });
      }
    }

    // 如果是全点亮胜利，显示五行归元过场
    if (reason === '所有天干点亮') {
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

    // 记录 AI 游戏数据
    AIController.endGame(winner);

    // 显示局终过场
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
    await PassiveEffects.playFinalPenalty(result);

    // 动画完成后，再触发分数变化
    ['P1', 'P2'].forEach(playerId => {
      const { damageCount } = result[playerId];

      if (damageCount > 0) {
        const penalty = damageCount * FINAL_PENALTY_PER_DAMAGE;
        StateManager.addScore(playerId, penalty, `最终道损惩罚(${damageCount})`, 'FINAL_PENALTY');
      }
    });
  },

  /**
   * 清理资源
   */
  cleanup() {
    // 清除待执行的定时器
    if (this._turnTimer) {
      clearTimeout(this._turnTimer);
      this._turnTimer = null;
    }
  }
};

export default TurnManager;
