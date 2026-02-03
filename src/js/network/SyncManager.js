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

const SyncManager = {
  channel: null,
  currentRoomId: null,
  myPlayerId: null,
  myRole: null, // 'P1' or 'P2'
  isEnabled: false,
  _initialized: false,
  _eventHandlers: null,

  init() {
    if (this._initialized) {
      console.log('[SyncManager] 已经初始化，跳过');
      return;
    }
    console.log('[SyncManager] 初始化同步管理器...');

    // 保存事件处理函数的引用，用于取消绑定
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
    EventBus.on('game:next-turn', this._eventHandlers.syncTurnChange);
    EventBus.on(GAME_EVENTS.VICTORY, this._eventHandlers.syncGameEnd);
    console.log('[SyncManager] 事件监听器已绑定');
  },

  handleGameStart(data) {
    const { mode } = data;
    this.isEnabled = (mode === 0);
    console.log('[SyncManager] 游戏开始, 同步状态:', this.isEnabled ? '启用' : '禁用');
  },

  setRoomInfo(roomId, playerId, role) {
    this.currentRoomId = roomId;
    this.myPlayerId = playerId;
    this.myRole = role;
    console.log('[SyncManager] 设置房间信息:', { roomId, playerId, role });
    this.subscribeToRoom(roomId);
  },

  /**
   * 同步玩家操作
   */
  syncAction(action) {
    if (!this.isEnabled || !this.channel) {
      console.log('[SyncManager] 跳过同步 (enabled:', this.isEnabled, ', channel:', !!this.channel, ')');
      return;
    }

    const message = {
      type: 'action',
      playerId: this.myPlayerId,
      data: action,
      timestamp: Date.now()
    };

    console.log('[SyncManager] ====== 发送操作 Broadcast ======');
    console.log('[SyncManager] 我的 playerId:', this.myPlayerId);
    console.log('[SyncManager] 发送消息:', JSON.stringify(message));
    console.log('[SyncManager] 频道状态:', this.channel.state);

    try {
      this.channel.send({
        type: 'broadcast',
        event: 'game_move',
        payload: message
      });
      console.log('[SyncManager] Broadcast 发送成功');
    } catch (error) {
      console.error('[SyncManager] Broadcast 发送失败:', error);
    }
  },

  /**
   * 同步回合切换（包含完整状态）
   */
  syncTurnChange() {
    if (!this.isEnabled || !this.channel) return;

    const state = StateManager.getState();

    // 同步完整游戏状态，确保双方状态一致
    const message = {
      type: 'turn_change',
      playerId: this.myPlayerId,
      data: {
        turnCount: state.turnCount,
        currentPlayer: state.currentPlayer,
        // 同步节点状态
        nodeStates: state.nodeStates,
        // 同步分数
        players: {
          P1: { score: state.players.P1.score },
          P2: { score: state.players.P2.score }
        },
        // 同步当前天干
        currentStem: state.currentStem
      },
      timestamp: Date.now()
    };

    console.log('[SyncManager] 发送回合切换(含完整状态):', message);
    this.channel.send({
      type: 'broadcast',
      event: 'game_move',
      payload: message
    });
  },

  /**
   * 同步天干生成
   * @param {Object} stem - 生成的天干对象
   */
  syncStem(stem) {
    if (!this.isEnabled || !this.channel) return;

    const message = {
      type: 'stem',
      playerId: this.myPlayerId,
      data: { stem },
      timestamp: Date.now()
    };

    console.log('[SyncManager] 发送天干同步:', message);
    this.channel.send({
      type: 'broadcast',
      event: 'game_move',
      payload: message
    });
  },

  /**
   * 同步先手判定（只有房主调用）
   * @param {string} firstPlayer - 'P1' | 'P2'
   */
  syncInitiative(firstPlayer) {
    console.log('[SyncManager] syncInitiative 被调用, firstPlayer:', firstPlayer);
    console.log('[SyncManager] isEnabled:', this.isEnabled, 'channel:', !!this.channel);

    if (!this.isEnabled || !this.channel) {
      console.log('[SyncManager] 同步被跳过，isEnabled:', this.isEnabled, 'channel:', !!this.channel);
      return;
    }

    const message = {
      type: 'initiative',
      playerId: this.myPlayerId,
      data: { firstPlayer },
      timestamp: Date.now()
    };

    console.log('[SyncManager] 发送先手判定:', message);
    this.channel.send({
      type: 'broadcast',
      event: 'game_move',
      payload: message
    });
    console.log('[SyncManager] 先手判定消息已发送');
  },

  /**
   * 同步游戏结束
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
   * 订阅房间 Broadcast
   */
  async subscribeToRoom(roomId) {
    if (this.channel) {
      supabase.removeChannel(this.channel);
    }

    console.log('[SyncManager] ====== 订阅房间 Broadcast ======');
    console.log('[SyncManager] roomId:', roomId);
    console.log('[SyncManager] 我的 playerId:', this.myPlayerId);

    // **关键修复**：订阅房间时立即启用同步
    // 因为 game:start 事件可能不会立即触发，但我们需要在 P2 加入后就能同步
    this.isEnabled = true;
    console.log('[SyncManager] 同步已启用（订阅房间时）');

    // 创建 Broadcast 频道
    this.channel = supabase.channel(`room:${roomId}`);

    // 监听对手的 Broadcast 消息
    this.channel
      .on('broadcast', { event: 'game_move' }, (payload) => {
        console.log('[SyncManager] ====== 收到 Broadcast 事件 ======');
        console.log('[SyncManager] payload:', payload);

        const message = payload.payload;
        console.log('[SyncManager] 发送者 playerId:', message.playerId);
        console.log('[SyncManager] 我的 playerId:', this.myPlayerId);

        // 忽略自己的消息
        if (message.playerId === this.myPlayerId) {
          console.log('[SyncManager] 忽略自己的消息');
          return;
        }

        console.log('[SyncManager] 这是对手的消息，处理它!');
        console.log('[SyncManager] 收到 Broadcast:', message);
        this.handleOpponentMessage(message);
      })
      .subscribe((status) => {
        console.log('[SyncManager] Broadcast 频道状态:', status);
        if (status === 'SUBSCRIBED') {
          console.log(`[SyncManager] ✓✓✓ 已订阅房间 ${roomId} 的 Broadcast ✓✓✓`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[SyncManager] ✗✗✗ Broadcast 频道错误 ✗✗✗');
        }
      });
  },

  /**
   * 处理对手的消息
   */
  handleOpponentMessage(message) {
    const { type, data } = message;

    switch (type) {
      case 'action':
        console.log('[SyncManager] 应用对手动作:', data);
        // 触发事件让 GameEngine 处理
        EventBus.emit('sync:opponent-action', data);
        break;

      case 'stem':
        console.log('[SyncManager] 收到天干同步:', data);
        EventBus.emit('sync:stem', data.stem);
        break;

      case 'initiative':
        console.log('[SyncManager] 收到先手判定:', data);
        // 应用对手决定的先手
        StateManager.update({ currentPlayer: data.firstPlayer }, true);
        console.log('[SyncManager] 先手已设置为:', data.firstPlayer);
        // P2 收到先手判定后，启动游戏序列
        if (!GameSequence._isStarting) {
          console.log('[SyncManager] P2 启动游戏序列');
          GameSequence._startGameSequence();
        }
        break;

      case 'turn_change':
        console.log('[SyncManager] 收到对手状态同步:', data);
        // 静默应用完整状态，不触发同步循环
        if (data.nodeStates) {
          StateManager.update({
            nodeStates: data.nodeStates
          }, true);
        }
        if (data.players) {
          StateManager.update({
            players: data.players
          }, true);
        }
        if (data.currentStem) {
          StateManager.update({
            currentStem: data.currentStem
          }, true);
        }
        StateManager.update({
          turnCount: data.turnCount,
          currentPlayer: data.currentPlayer
        }, true);
        console.log('[SyncManager] 状态已同步，节点:', data.nodeStates);
        break;

      case 'game_end':
        console.log('[SyncManager] 游戏结束:', data);
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
