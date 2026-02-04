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
import { supabase, insert } from './supabaseClient.js';
import StateManager from '../state/StateManager.js';
import { getCurrentUserId } from './supabaseClient.js';

const SimplifiedPVPManager = {
  // 会话信息
  currentSessionId: null,
  currentRoomId: null,
  myPlayerId: null,
  myRole: null, // 'P1' or 'P2'
  isEnabled: false,

  // Broadcast 频道
  channel: null,

  /**
   * 初始化
   */
  init() {
    console.log('[SimplifiedPVPManager] 初始化');
    this._bindEvents();
  },

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    EventBus.on('game:return-to-menu', this.cleanup.bind(this));
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

    // 同步 myRole 到 StateManager
    StateManager.setMyRole(role);

    console.log('[SimplifiedPVPManager] PVP会话已初始化:', {
      roomId,
      sessionId,
      role,
      myPlayerId: this.myPlayerId
    });

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

    console.log('[SimplifiedPVPManager] 订阅 Broadcast 频道:', roomId);

    this.channel = supabase.channel(`room:${roomId}`);

    this.channel
      .on('broadcast', { event: 'game_move' }, (payload) => {
        const message = payload.payload;

        // 忽略自己的消息
        if (message.playerId === this.myPlayerId) {
          return;
        }

        console.log('[SimplifiedPVPManager] 收到对手消息:', message.type);
        this._handleOpponentMessage(message);
      })
      .subscribe((status) => {
        console.log('[SimplifiedPVPManager] Broadcast 频道状态:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[SimplifiedPVPManager] ✓ Broadcast 已连接');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[SimplifiedPVPManager] ✗ Broadcast 频道错误');
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
        // 对手操作 - 通过 EventBus 通知 GameEngine
        EventBus.emit('sync:opponent-action', data);
        break;

      case 'turn_end':
        // 对手回合结束 - 切换到我的回合
        console.log('[SimplifiedPVPManager] 对手回合结束，切换到我的回合');
        StateManager.switchPlayer();
        EventBus.emit('game:next-turn');
        break;

      case 'stem':
        // 天干同步
        EventBus.emit('sync:stem', data.stem);
        break;

      case 'initiative':
        // 先手判定
        console.log('[SimplifiedPVPManager] 收到先手判定:', data.firstPlayer);
        StateManager.update({ currentPlayer: data.firstPlayer }, true);
        // 如果是P2，启动游戏序列
        if (data.firstPlayer === 'P2') {
          EventBus.emit('game:start-sequence');
        }
        break;

      case 'state_sync_request':
        // 对手请求状态同步（重连时）
        console.log('[SimplifiedPVPManager] 对手请求状态同步');
        this._sendStateSyncResponse();
        break;

      case 'state_sync_response':
        // 收到状态同步响应
        console.log('[SimplifiedPVPManager] 收到状态同步响应');
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

    const state = StateManager.getState();

    try {
      // 异步写入数据库（不阻塞）
      insert('game_moves', {
        session_id: this.currentSessionId,
        player_id: this.myPlayerId,
        turn_number: state.turnCount,
        move_type: action.type,
        move_data: action,
        created_at: new Date().toISOString()
      }).then(() => {
        console.log('[SimplifiedPVPManager] 操作已记录到数据库');
      }).catch(err => {
        console.error('[SimplifiedPVPManager] 数据库写入失败:', err);
        // 不抛出错误，因为操作已经执行了
      });

      // 同时通过 Broadcast 通知对手
      this._broadcastAction(action);

    } catch (error) {
      console.error('[SimplifiedPVPManager] sendActionToDatabase 错误:', error);
    }
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

    this.channel.send({
      type: 'broadcast',
      event: 'game_move',
      payload: message
    });
  },

  /**
   * 发送回合切换通知
   */
  async sendTurnEndNotification() {
    if (!this.isEnabled || !this.channel) return;

    const state = StateManager.getState();

    // 记录到数据库
    try {
      insert('game_moves', {
        session_id: this.currentSessionId,
        player_id: this.myPlayerId,
        turn_number: state.turnCount,
        move_type: 'TURN_END',
        move_data: { turnNumber: state.turnCount },
        created_at: new Date().toISOString()
      }).catch(err => {
        console.error('[SimplifiedPVPManager] 回合结束记录失败:', err);
      });
    } catch (error) {
      console.error('[SimplifiedPVPManager] sendTurnEndNotification 错误:', error);
    }

    // 通过 Broadcast 通知对手
    const message = {
      type: 'turn_end',
      playerId: this.myPlayerId,
      data: {
        turnNumber: state.turnCount,
        nextPlayer: state.currentPlayer === 'P1' ? 'P2' : 'P1'
      },
      timestamp: Date.now()
    };

    this.channel.send({
      type: 'broadcast',
      event: 'game_move',
      payload: message
    });

    console.log('[SimplifiedPVPManager] 回合切换通知已发送');
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

    this.channel.send({
      type: 'broadcast',
      event: 'game_move',
      payload: message
    });
  },

  /**
   * 发送先手判定
   * @param {string} firstPlayer - 先手玩家 'P1' or 'P2'
   */
  syncInitiative(firstPlayer) {
    if (!this.isEnabled || !this.channel) return;

    console.log('[SimplifiedPVPManager] 发送先手判定:', firstPlayer);

    const message = {
      type: 'initiative',
      playerId: this.myPlayerId,
      data: { firstPlayer },
      timestamp: Date.now()
    };

    this.channel.send({
      type: 'broadcast',
      event: 'game_move',
      payload: message
    });
  },

  /**
   * 请求状态同步（重连时）
   */
  requestStateSync() {
    if (!this.isEnabled || !this.channel) return;

    console.log('[SimplifiedPVPManager] 请求状态同步');

    const message = {
      type: 'state_sync_request',
      playerId: this.myPlayerId,
      timestamp: Date.now()
    };

    this.channel.send({
      type: 'broadcast',
      event: 'game_move',
      payload: message
    });
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

    this.channel.send({
      type: 'broadcast',
      event: 'game_move',
      payload: message
    });

    console.log('[SimplifiedPVPManager] 状态同步响应已发送');
  },

  /**
   * 应用状态同步
   * @private
   */
  _applyStateSync(state) {
    console.log('[SimplifiedPVPManager] 应用状态同步:', state);
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

    this.channel.send({
      type: 'broadcast',
      event: 'game_move',
      payload: message
    });
  },

  /**
   * 清理资源
   */
  cleanup() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.currentSessionId = null;
    this.currentRoomId = null;
    this.myPlayerId = null;
    this.myRole = null;
    this.isEnabled = false;

    console.log('[SimplifiedPVPManager] 资源已清理');
  }
};

export default SimplifiedPVPManager;
