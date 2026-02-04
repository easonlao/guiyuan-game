// ============================================
// 状态同步管理器 v3 - Broadcast 方案
// ============================================
// 职责：
// - 使用 Supabase Realtime Broadcast 直接通信
// - 发送和接收游戏操作
// - 应用对手的状态更新
// ============================================

import EventBus from '../bus/EventBus.js';
import { supabase } from './supabaseClient.js';
import { GAME_EVENTS } from '../types/events.js';
import StateManager from '../state/StateManager.js';
import GameSequence from '../logic/flow/GameSequence.js';

// PVP 调试日志函数
const log = (...args) => window.PVP_DEBUG && console.log('[SyncManager]', ...args);
const logError = (...args) => console.error('[SyncManager]', ...args);

const SyncManager = {
  channel: null,
  currentRoomId: null,
  myPlayerId: null,
  myRole: null,
  isEnabled: false,
  _initialized: false,
  _eventHandlers: null,

  init() {
    if (this._initialized) {
      return;
    }
    log('初始化同步管理器');

    this._eventHandlers = {
      handleGameStart: this.handleGameStart.bind(this),
      syncAction: this.syncAction.bind(this),
      syncTurnChange: this.syncTurnChange.bind(this),
      syncGameEnd: this.syncGameEnd.bind(this)
    };

    this._bindEvents();
    this._initialized = true;
  },

  _bindEvents() {
    EventBus.on('game:start', this._eventHandlers.handleGameStart);
    EventBus.on('game:action-selected', this._eventHandlers.syncAction);
    // ⚠️ 移除回合切换监听 - 回合切换现在完全由 AuthorityExecutor 的 TURN_END 命令处理
    // EventBus.on('game:next-turn', this._eventHandlers.syncTurnChange);
    EventBus.on(GAME_EVENTS.VICTORY, this._eventHandlers.syncGameEnd);
    log('事件监听器已绑定（回合切换已禁用）');
  },

  handleGameStart(data) {
    const { mode } = data;
    this.isEnabled = (mode === 0);
    log('游戏开始, 同步状态:', this.isEnabled ? '启用' : '禁用');
  },

  setRoomInfo(roomId, playerId, role) {
    this.currentRoomId = roomId;
    this.myPlayerId = playerId;
    this.myRole = role;
    log('设置房间信息', { roomId, playerId, role });
    this.subscribeToRoom(roomId);
  },

  syncAction(action) {
    if (!this.isEnabled || !this.channel) {
      return;
    }

    const message = {
      type: 'action',
      playerId: this.myPlayerId,
      data: action,
      timestamp: Date.now()
    };

    log('发送操作', { action: message.data });
    try {
      this.channel.send({
        type: 'broadcast',
        event: 'game_move',
        payload: message
      });
      log('✓ Broadcast 发送成功');
    } catch (error) {
      logError('Broadcast 发送失败:', error.message);
    }
  },

  syncTurnChange() {
    // ⚠️ 已弃用 - 回合切换现在完全由 AuthorityExecutor 的 TURN_END 命令处理
    // 不再使用 Broadcast 同步回合切换
    if (!this.isEnabled) return;

    console.warn('[SyncManager] syncTurnChange 已弃用，回合切换由 TURN_END 命令处理');
    return; // 不发送任何消息
  },

  syncStem(stem) {
    if (!this.isEnabled || !this.channel) return;

    const message = {
      type: 'stem',
      playerId: this.myPlayerId,
      data: { stem },
      timestamp: Date.now()
    };

    log('发送天干同步', stem);
    this.channel.send({
      type: 'broadcast',
      event: 'game_move',
      payload: message
    });
  },

  syncInitiative(firstPlayer) {
    log('发送先手判定:', firstPlayer);

    if (!this.isEnabled || !this.channel) {
      logError('同步被跳过, enabled:', this.isEnabled, ', channel:', !!this.channel);
      return;
    }

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
    log('✓ 先手判定已发送');
  },

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

  async subscribeToRoom(roomId) {
    if (this.channel) {
      supabase.removeChannel(this.channel);
    }

    log('订阅 Broadcast 频道', { roomId, playerId: this.myPlayerId });

    this.isEnabled = true;
    log('同步已启用');

    this.channel = supabase.channel(`room:${roomId}`);

    this.channel
      .on('broadcast', { event: 'game_move' }, (payload) => {
        const message = payload.payload;

        if (message.playerId === this.myPlayerId) {
          return;
        }

        log('收到 Broadcast', { type: message.type, from: message.playerId });
        this.handleOpponentMessage(message);
      })
      .subscribe((status) => {
        log('Broadcast 频道状态:', status);
        if (status === 'SUBSCRIBED') {
          log('✓ Broadcast 已连接');
        } else if (status === 'CHANNEL_ERROR') {
          logError('✗ Broadcast 频道错误');
        }
      });
  },

  handleOpponentMessage(message) {
    const { type, data } = message;

    switch (type) {
      case 'action':
        log('应用对手动作');
        EventBus.emit('sync:opponent-action', data);
        break;

      case 'stem':
        log('收到天干同步');
        EventBus.emit('sync:stem', data.stem);
        break;

      case 'initiative':
        log('收到先手判定:', data.firstPlayer);
        StateManager.update({ currentPlayer: data.firstPlayer }, true);
        if (!GameSequence._isStarting) {
          log('P2 启动游戏序列');
          GameSequence._startGameSequence();
        }
        break;

      case 'turn_change':
        log('收到状态同步');
        if (data.nodeStates) {
          StateManager.update({ nodeStates: data.nodeStates }, true);
        }
        if (data.players) {
          StateManager.update({ players: data.players }, true);
        }
        if (data.currentStem) {
          StateManager.update({ currentStem: data.currentStem }, true);
        }
        StateManager.update({
          turnCount: data.turnCount,
          currentPlayer: data.currentPlayer
        }, true);
        break;

      case 'game_end':
        log('游戏结束');
        EventBus.emit(GAME_EVENTS.VICTORY, data);
        break;
    }
  },

  async unsubscribe() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.isEnabled = false;
    this.currentRoomId = null;
    this.myPlayerId = null;
  }
};

export default SyncManager;
