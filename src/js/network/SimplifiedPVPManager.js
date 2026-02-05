// ============================================
// 简化的PVP管理器
// ============================================
// 职责：
// - 管理PVP会话状态
// - 异步发送操作到数据库（不阻塞）
// - 通过 Broadcast 同步对手操作
// - 处理回合切换同步
// - 简化的重连逻辑
// ============================================

import EventBus from '../bus/EventBus.js';
import { supabase } from './supabaseClient.js';
import StateManager from '../state/StateManager.js';
import { getCurrentUserId } from './supabaseClient.js';
import AuthorityExecutor from '../logic/AuthorityExecutor.js';
import ReconnectionManager from './ReconnectionManager.js';
import { GAME_EVENTS } from '../types/events.js';
import ErrorHandler, { NetworkError } from '../utils/ErrorHandler.js';

const SimplifiedPVPManager = {
  // 会话信息
  currentSessionId: null,
  currentRoomId: null,
  myPlayerId: null,
  myRole: null, // 'P1' or 'P2'
  isHost: false, // 是否为主机
  isEnabled: false,

  // Broadcast 频道
  channel: null,

  /**
   * 初始化
   */
  init() {
    this._bindEvents();
  },

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    EventBus.on('game:return-to-menu', this.cleanup.bind(this));
    EventBus.on('anim:initiative-finished', this._onInitiativeAnimationFinished.bind(this));
  },

  /**
   * 先手动画完成后的处理
   * @private
   */
  _onInitiativeAnimationFinished() {
    // 如果有待设置的初始天干，现在才设置
    if (this._pendingFirstStem) {
      StateManager.update({ currentStem: this._pendingFirstStem }, true);
      this._pendingFirstStem = null;
    }
  },

  /**
   * 初始化PVP会话
   * @param {string} roomId - 房间ID
   * @param {string} sessionId - 会话ID
   * @param {string} role - 角色 'P1' or 'P2'
   */
  initPVPSession(roomId, sessionId, role) {
    this.cleanup();

    this.currentRoomId = roomId;
    this.currentSessionId = sessionId;
    this.myRole = role;
    this.myPlayerId = getCurrentUserId();
    this.isEnabled = true;

    // 设置主机状态：P1 是主机，P2 是客户端
    this.isHost = (role === 'P1');
    if (this.isHost) {
      AuthorityExecutor.setAsHost();
    } else {
      AuthorityExecutor.reset();
    }

    // 同步 myRole 到 StateManager
    StateManager.setMyRole(role);

    // 订阅 Broadcast 频道
    this._subscribeToBroadcast(roomId);
  },

  /**
   * 订阅 Broadcast 频道
   * @private
   */
  _subscribeToBroadcast(roomId) {
    if (this.channel) {
      supabase.removeChannel(this.channel);
    }


    this.channel = supabase.channel(`room:${roomId}`);

    this.channel
      .on('broadcast', { event: 'game_move' }, (payload) => {
        const message = payload.payload;

        // 忽略自己的消息
        if (message.playerId === this.myPlayerId) {
          return;
        }

        this._handleOpponentMessage(message);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Broadcast 已连接
          // 如果是重连后订阅成功，触发重连成功事件
          if (ReconnectionManager.isReconnecting) {
            EventBus.emit('RECONNECT:channel-restored');
          }
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[SimplifiedPVPManager] ✗ Broadcast 频道错误');
          EventBus.emit('RECONNECT:channel-error', { error: 'Channel error' });
        } else if (status === 'TIMED_OUT') {
          console.error('[SimplifiedPVPManager] ✗ Broadcast 频道超时');
          EventBus.emit('RECONNECT:channel-error', { error: 'Channel timeout' });
        } else if (status === 'CLOSED') {
          console.warn('[SimplifiedPVPManager] ✗ Broadcast 频道已关闭');
          EventBus.emit('RECONNECT:channel-error', { error: 'Channel closed' });
        }
      });
  },

  /**
   * 处理对手消息
   * @private
   */
  _handleOpponentMessage(message) {
    const { type, data } = message;

    switch (type) {
      case 'action':
        // 对手操作（已确认的）
        EventBus.emit('sync:opponent-action', data);
        break;

      case 'action_request':
        // 操作请求（客户端发送给主机）
        if (this.isHost) {
          EventBus.emit('authority:action-request', data);
        }
        break;

      case 'action_confirmed':
        // 操作确认（主机发送给双方）
        EventBus.emit('sync:opponent-action', data);
        break;

      case 'skip_turn_request':
        // 跳过回合请求（客户端发送给主机）
        if (this.isHost) {
          EventBus.emit('authority:skip-turn-request');
        }
        break;

      case 'turn_end':
        // 对手回合结束 - 使用消息中的 nextPlayer 更新本地状态
        const currentState = StateManager.getState();

        // 一次性更新 currentPlayer 和 currentStem，避免多次更新导致状态不一致
        const turnUpdates = {};
        if (data.nextPlayer && data.nextPlayer !== currentState.currentPlayer) {
          turnUpdates.currentPlayer = data.nextPlayer;
        }
        turnUpdates.currentStem = null;  // 清除旧天干

        if (Object.keys(turnUpdates).length > 0) {
          StateManager.update(turnUpdates, true);
        }

        EventBus.emit('game:next-turn');
        break;

      case 'turn_sync':
        // 回合切换同步（主机权威计算）
        // 始终更新 currentPlayer（即使玩家相同，也要更新以确保状态同步）
        // 同时清除旧天干
        const beforeState = StateManager.getState();
        console.log(`[PVP turn_sync] 收到回合同步: nextPlayer=${data.nextPlayer}, isExtraTurn=${data.isExtraTurn}, 当前currentPlayer=${beforeState.currentPlayer}`);

        const syncUpdates = {
          currentPlayer: data.nextPlayer,
          isExtraTurn: data.isExtraTurn || false,
          currentStem: null
        };

        StateManager.update(syncUpdates, true);

        // 应用分数变化（天道分红、道损亏损等回合结算效果）
        if (data.scoreChanges && Array.isArray(data.scoreChanges)) {
          data.scoreChanges.forEach(change => {
            StateManager.addScore(
              change.playerId,
              change.amount,
              change.reason,
              change.actionType
            );
          });
        }

        const afterState = StateManager.getState();
        console.log(`[PVP turn_sync] 更新后currentPlayer=${afterState.currentPlayer}`);
        EventBus.emit('game:next-turn');
        break;

      case 'stem':
        // 天干同步
        console.log('[PVP] 收到stem同步:', data.stem);
        EventBus.emit('sync:stem', data.stem);
        break;

      case 'stem_generated':
        // 天干生成（主机权威）
        console.log('[PVP] 收到stem_generated:', data.stem, 'from:', data.playerId);
        StateManager.update({ currentStem: data.stem });
        EventBus.emit('game:stem-generated', { stem: data.stem });
        break;

      case 'initiative':
        // 先手判定

        // 只设置 currentPlayer，不设置 currentStem
        // currentStem 会在动画完成后（anim:initiative-finished）才设置
        StateManager.update({ currentPlayer: data.firstPlayer }, true);

        // 保存初始天干，等待动画完成后再设置
        if (data.firstStem) {
          this._pendingFirstStem = data.firstStem;
        }

        // 触发先手判定完成事件
        // BoardAnimation 会在收到此事件后 1200ms 触发 anim:initiative-finished
        const isHost = (this.myRole === 'P1');
        EventBus.emit('game:initiative-completed', {
          winner: data.firstPlayer,
          isHost: isHost
        });
        break;

      case 'game_end':
        // 游戏结束 - 先播放过场动画，然后显示胜利界面
        console.log('[PVP] 收到game_end:', data);
        this._handleGameEnd(data.winner, data.reason);
        break;

      case 'state_sync_request':
        // 对手请求状态同步（重连时）
        this._sendStateSyncResponse();
        break;

      case 'state_sync_response':
        // 收到状态同步响应
        this._applyStateSync(data.state);
        break;

      default:
        console.warn('[SimplifiedPVPManager] 未知消息类型:', type);
    }
  },

  /**
   * 发送操作到数据库（异步，不等待确认）
   * @param {Object} action - 操作对象
   */
  async sendActionToDatabase(action) {
    if (!this.isEnabled || !this.currentSessionId) {
      console.warn('[SimplifiedPVPManager] PVP未启用或会话未设置');
      return;
    }

    // 数据库表架构不匹配，完全禁用数据库写入
    // 只使用 Broadcast 进行实时同步
    this._broadcastAction(action);
  },

  /**
   * 通过 Broadcast 发送操作
   * @private
   */
  _broadcastAction(action) {
    if (!this.channel) return;

    const message = {
      type: 'action',
      playerId: this.myPlayerId,
      data: action,
      timestamp: Date.now()
    };

    this._sendToChannel(message);
  },

  /**
   * 统一的发送方法，带错误处理
   * @private
   */
  _sendToChannel(message) {
    if (!this.channel) {
      console.warn('[SimplifiedPVPManager] 频道未初始化，无法发送消息');
      return;
    }

    try {
      this.channel.send({
        type: 'broadcast',
        event: 'game_move',
        payload: message
      });
    } catch (error) {
      ErrorHandler.handleError(
        new NetworkError('发送数据到对手失败', {
          originalError: error,
          recipient: this.peerId,
          messageType: message.type
        }),
        { source: 'SimplifiedPVPManager._sendToChannel' }
      );
    }
  },

  /**
   * 发送回合切换通知
   * @param {string} nextPlayer - 下个玩家（由调用方在切换前计算）
   */
  async sendTurnEndNotification(nextPlayer) {
    if (!this.isEnabled || !this.channel) return;

    const state = StateManager.getState();

    // 通过 Broadcast 通知对手
    const message = {
      type: 'turn_end',
      playerId: this.myPlayerId,
      data: {
        turnNumber: state.turnCount,
        nextPlayer: nextPlayer  // 使用调用方传入的值（在切换前计算）
      },
      timestamp: Date.now()
    };

    this._sendToChannel(message);
  },

  /**
   * 发送天干同步
   * @param {string} stem - 天干
   */
  syncStem(stem) {
    if (!this.isEnabled || !this.channel) return;

    const message = {
      type: 'stem',
      playerId: this.myPlayerId,
      data: { stem },
      timestamp: Date.now()
    };

    this._sendToChannel(message);
  },

  /**
   * 发送先手判定
   * @param {string} firstPlayer - 先手玩家 'P1' or 'P2'
   * @param {Object} firstStem - 初始天干（可选）
   */
  syncInitiative(firstPlayer, firstStem) {
    if (!this.isEnabled || !this.channel) return;


    const message = {
      type: 'initiative',
      playerId: this.myPlayerId,
      data: { firstPlayer, firstStem },
      timestamp: Date.now()
    };

    this._sendToChannel(message);
  },

  /**
   * 请求状态同步（重连时）
   */
  requestStateSync() {
    if (!this.isEnabled || !this.channel) return;


    const message = {
      type: 'state_sync_request',
      playerId: this.myPlayerId,
      timestamp: Date.now()
    };

    this._sendToChannel(message);
  },

  /**
   * 发送状态同步响应
   * @private
   */
  _sendStateSyncResponse() {
    if (!this.channel) return;

    const state = StateManager.getState();

    const message = {
      type: 'state_sync_response',
      playerId: this.myPlayerId,
      data: {
        state: {
          turnCount: state.turnCount,
          currentPlayer: state.currentPlayer,
          currentStem: state.currentStem,
          nodeStates: state.nodeStates,
          players: state.players
        }
      },
      timestamp: Date.now()
    };

    this._sendToChannel(message);

  },

  /**
   * 应用状态同步
   * @private
   */
  _applyStateSync(state) {
    StateManager.update(state, true);
    EventBus.emit('pvp:state-synced', state);
  },

  /**
   * 发送游戏结束
   * @param {Object} data - 游戏结束数据
   */
  syncGameEnd(data) {
    if (!this.isEnabled || !this.channel) return;

    const message = {
      type: 'game_end',
      playerId: this.myPlayerId,
      data: data,
      timestamp: Date.now()
    };

    this._sendToChannel(message);
  },

  /**
   * 发送天干生成（主机权威）
   * @param {Object} stem - 天干
   * @param {number} seed - 随机种子
   */
  sendStemGenerated(stem, seed) {
    if (!this.isEnabled || !this.channel) return;

    const message = {
      type: 'stem_generated',
      playerId: this.myPlayerId,
      data: { stem, seed },
      timestamp: Date.now()
    };

    this._sendToChannel(message);
  },

  /**
   * 发送回合切换同步（主机权威）
   * @param {string} nextPlayer - 下个玩家
   * @param {boolean} isExtraTurn - 是否是额外机会回合
   * @param {Array} scoreChanges - 分数变化列表 [{ playerId, amount, reason, actionType }]
   */
  sendTurnSync(nextPlayer, isExtraTurn = false, scoreChanges = []) {
    if (!this.isEnabled || !this.channel) return;

    const state = StateManager.getState();

    const message = {
      type: 'turn_sync',
      playerId: this.myPlayerId,
      data: {
        turnNumber: state.turnCount,
        nextPlayer: nextPlayer,
        isExtraTurn: isExtraTurn,
        scoreChanges: scoreChanges
      },
      timestamp: Date.now()
    };

    this._sendToChannel(message);
  },

  /**
   * 请求跳过回合（客户端发送）
   */
  requestSkipTurn() {
    if (!this.isEnabled || !this.channel) return;

    const message = {
      type: 'skip_turn_request',
      playerId: this.myPlayerId,
      timestamp: Date.now()
    };

    this._sendToChannel(message);
  },

  /**
   * 请求操作确认（客户端发送）
   * @param {Object} action - 操作对象
   * @returns {Promise<void>}
   */
  requestActionConfirmation(action) {
    return new Promise((resolve) => {
      if (!this.isEnabled || !this.channel) {
        resolve();
        return;
      }

      const message = {
        type: 'action_request',
        playerId: this.myPlayerId,
        data: action,
        timestamp: Date.now()
      };

      this.channel.send({
        type: 'broadcast',
        event: 'game_move',
        payload: message
      });

      resolve();
    });
  },

  /**
   * 发送操作确认（主机权威）
   * @param {Object} action - 操作对象
   * @returns {Promise<void>}
   */
  sendActionConfirmed(action) {
    return new Promise((resolve) => {
      if (!this.isEnabled || !this.channel) {
        resolve();
        return;
      }

      const message = {
        type: 'action_confirmed',
        playerId: this.myPlayerId,
        data: action,
        timestamp: Date.now()
      };

      this.channel.send({
        type: 'broadcast',
        event: 'game_move',
        payload: message
      });

      resolve();
    });
  },

  /**
   * 清理资源
   */
  /**
   * 处理游戏结束（客户端）
   * @param {string} winner - 胜利者
   * @param {string} reason - 结束原因
   * @private
   */
  async _handleGameEnd(winner, reason) {
    console.log('[PVP] _handleGameEnd: winner=', winner, 'reason=', reason);

    // 如果是全点亮胜利，显示五行归元过场
    if (reason === '所有天干点亮') {
      EventBus.emit('achievement:show-full-unity', winner);
      // 等待过场动画完成
      await this._waitForOverlayHidden();
    } else if (reason === '回合上限') {
      // 显示局终过场
      EventBus.emit('achievement:show-turn-limit', winner);
      // 等待过场动画完成
      await this._waitForOverlayHidden();
    }

    // 动画完成后，显示胜利界面
    EventBus.emit(GAME_EVENTS.VICTORY, { winner, reason });
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

  cleanup() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.currentSessionId = null;
    this.currentRoomId = null;
    this.myPlayerId = null;
    this.myRole = null;
    this.isHost = false;
    this.isEnabled = false;

    // 重置权威执行器
    AuthorityExecutor.reset();
  }
};

export default SimplifiedPVPManager;
