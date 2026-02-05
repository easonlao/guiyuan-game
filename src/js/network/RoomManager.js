// ============================================
// 房间管理器
// ============================================
// 职责：
// - 创建房间
// - 加入房间
// - 订阅房间状态（检测对手加入）
// - 离开房间
// ============================================

import EventBus from '../bus/EventBus.js';
import { supabase, query, insert, update } from './supabaseClient.js';
import { GAME_EVENTS, PLAYER_EVENTS } from '../types/events.js';
import StateManager from '../state/StateManager.js';
import TimerManager from '../utils/TimerManager.js';

// PVP 调试日志函数
const log = (...args) => window.PVP_DEBUG && console.log('[RoomManager]', ...args);
const logError = (...args) => console.error('[RoomManager]', ...args);

const ROOM_POLL_TIMER = 'room-poll';

const RoomManager = {
  currentRoomCode: null,
  currentRoomId: null,
  currentUserId: null,
  roomChannel: null,
  hasOpponentJoined: false,

  init() {
    log('初始化房间管理器');
    EventBus.on('room:create', this.handleCreateRoom.bind(this));
    EventBus.on('room:join', this.handleJoinRoom.bind(this));
    EventBus.on('room:leave', this.handleLeaveRoom.bind(this));
    EventBus.on('game:player-joined', this.handlePlayerJoined.bind(this));
  },

  async handleCreateRoom({ playerId }) {
    try {
      log('创建房间', { playerId });
      this.currentUserId = playerId;
      this.hasOpponentJoined = false;

      const roomCode = this.generateRoomCode();

      const roomData = await insert('game_sessions', {
        room_code: roomCode,
        player1_id: playerId,
        player2_id: null,
        status: 'waiting',
        game_mode: 0,
        current_turn: 0,
        current_player: 'P1',
        current_state: { phase: 'INITIATIVE' }
      });

      if (!roomData || !roomData[0]) {
        throw new Error('创建房间失败');
      }

      const room = roomData[0];
      this.currentRoomCode = roomCode;
      this.currentRoomId = room.id;

      log('✓ 房间创建成功', { roomCode, roomId: room.id });

      this.subscribeToRoom(room.id);

      EventBus.emit('game:waiting-info', { roomCode, shareUrl: this.getShareUrl(roomCode) });

      return { success: true, room, roomCode };
    } catch (error) {
      logError('创建房间失败:', error.message);
      EventBus.emit('game:room-error', { error: error.message });
      return { success: false, error: error.message };
    }
  },

  async handleJoinRoom({ playerId, roomCode }) {
    try {
      log('加入房间', { playerId, roomCode });
      this.currentUserId = playerId;

      const rooms = await query('game_sessions', {
        match: { room_code: roomCode }
      });

      if (!rooms || rooms.length === 0) {
        throw new Error('房间不存在');
      }

      const room = rooms[0];

      if (room.status === 'playing') {
        throw new Error('游戏已开始，无法加入');
      }

      if (room.player2_id !== null) {
        throw new Error('房间已满');
      }

      await update('game_sessions', {
        player2_id: playerId,
        status: 'playing'
      }, { match: { id: room.id } });

      this.currentRoomCode = roomCode;
      this.currentRoomId = room.id;

      log('✓ 加入房间成功', { roomCode, roomId: room.id });

      this.subscribeToRoom(room.id);

      // 修复：P2加入时应该发出 playerId: 'P2'
      EventBus.emit('game:player-joined', { playerId: 'P2' });

      return { success: true, room };
    } catch (error) {
      logError('加入房间失败:', error.message);
      EventBus.emit('game:room-error', { error: error.message });
      return { success: false, error: error.message };
    }
  },

  subscribeToRoom(roomId) {
    if (this.roomChannel) {
      supabase.removeChannel(this.roomChannel);
    }

    // 停止之前的轮询
    this._stopPolling();

    log('订阅 Realtime 频道', { roomId });

    this.roomChannel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${roomId}`
        },
        (payload) => {
          log('Realtime: 房间状态更新', payload.new);
          this.handleRoomUpdate(payload.new);
        }
      )
      .subscribe((status) => {
        log(`Realtime 状态: ${status}`);
        if (status === 'SUBSCRIBED') {
          log('✓ Realtime 已连接');
        } else if (status === 'CHANNEL_ERROR') {
          logError('✗ Realtime 连接错误');
        }
      });

    this._startPolling(roomId);
  },

  _startPolling(roomId) {
    log('启动轮询检测 (2秒间隔)');
    TimerManager.setInterval(ROOM_POLL_TIMER, async () => {
      try {
        const rooms = await query('game_sessions', {
          match: { id: roomId }
        });

        if (rooms && rooms.length > 0) {
          const room = rooms[0];
          this.handleRoomUpdate(room);
        }
      } catch (error) {
        logError('轮询检测失败:', error.message);
      }
    }, 2000);
  },

  _stopPolling() {
    TimerManager.clearInterval(ROOM_POLL_TIMER);
  },

  handleRoomUpdate(room) {
    if (!room) return;

    const currentState = StateManager.getState();
    const isGameStarted = currentState.phase === 'INITIATIVE' || currentState.phase === 'PLAYING';

    // 如果游戏已经进入 INITIATIVE 或 PLAYING 阶段，忽略旧的状态更新
    // 防止 Realtime 订阅收到旧的更新覆盖正确的 current_player
    if (isGameStarted && room.current_player && currentState.currentPlayer) {
      // 检查 current_player 是否与当前状态一致
      if (room.current_player !== currentState.currentPlayer) {
        log('忽略旧的状态更新', {
          db_player: room.current_player,
          local_player: currentState.currentPlayer
        });
        return;
      }
    }

    log('处理房间更新', {
      myRole: this.currentUserId === room.player1_id ? 'P1' : 'P2',
      player2_id: room.player2_id,
      status: room.status,
      current_player: room.current_player
    });

    if (this.currentUserId === room.player1_id && room.player2_id && !this.hasOpponentJoined) {
      log('✓ 对手 (P2) 已加入!');
      this.hasOpponentJoined = true;

      this._stopPolling();
      EventBus.emit('game:player-joined', { playerId: 'P2' });
    }

    if (room.status === 'playing' && this.currentUserId === room.player2_id) {
      log('✓ 游戏状态: playing');
      this._stopPolling();
      EventBus.emit('game:player-joined', { playerId: 'P1' });
    }
  },

  unsubscribeFromRoom() {
    if (this.roomChannel) {
      supabase.removeChannel(this.roomChannel);
      this.roomChannel = null;
    }
    this._stopPolling();
  },

  handlePlayerJoined(data) {
    log('玩家加入事件触发', data);
  },

  async handleLeaveRoom() {
    try {
      log('离开房间');

      this.unsubscribeFromRoom();

      if (!this.currentRoomId) {
        log('没有加入的房间');
        return { success: true };
      }

      await update('game_sessions', {
        status: 'finished'
      }, { match: { id: this.currentRoomId } });

      this.currentRoomCode = null;
      this.currentRoomId = null;
      this.currentUserId = null;

      log('✓ 离开房间成功');

      EventBus.emit(GAME_EVENTS.STATE_CHANGED, {
        actionType: 'room:left',
        status: 'menu'
      });

      return { success: true };
    } catch (error) {
      logError('离开房间失败:', error.message);
      return { success: false, error: error.message };
    }
  },

  getShareUrl(roomCode) {
    return `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
  },

  generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
};

export default RoomManager;
