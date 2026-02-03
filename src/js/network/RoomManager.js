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

const RoomManager = {
  currentRoomCode: null,
  currentRoomId: null,
  currentUserId: null,
  roomChannel: null,
  pollInterval: null,
  hasOpponentJoined: false,

  init() {
    console.log('[RoomManager] 初始化房间管理器...');
    EventBus.on('room:create', this.handleCreateRoom.bind(this));
    EventBus.on('room:join', this.handleJoinRoom.bind(this));
    EventBus.on('room:leave', this.handleLeaveRoom.bind(this));
    EventBus.on('game:player-joined', this.handlePlayerJoined.bind(this));
  },

  async handleCreateRoom({ playerId }) {
    try {
      console.log('[RoomManager] 创建房间:', { playerId });
      this.currentUserId = playerId;
      this.hasOpponentJoined = false;

      const roomCode = this.generateRoomCode();

      const roomData = await insert('game_sessions', {
        room_code: roomCode,
        player1_id: playerId,
        player2_id: null,
        status: 'waiting',
        game_mode: 0,  // PvP
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

      console.log('[RoomManager] 房间创建成功:', room);

      // 订阅房间状态变化
      this.subscribeToRoom(room.id);

      EventBus.emit('game:waiting-info', { roomCode, shareUrl: this.getShareUrl(roomCode) });

      return { success: true, room, roomCode };
    } catch (error) {
      console.error('[RoomManager] 创建房间失败:', error);
      EventBus.emit('game:room-error', { error: error.message });
      return { success: false, error: error.message };
    }
  },

  async handleJoinRoom({ playerId, roomCode }) {
    try {
      console.log('[RoomManager] 加入房间:', { playerId, roomCode });
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

      console.log('[RoomManager] 加入房间成功:', room);

      // 订阅房间状态变化
      this.subscribeToRoom(room.id);

      // P2 加入成功后，通知双方开始游戏
      EventBus.emit('game:player-joined', { playerId: 'P1' });

      return { success: true, room };
    } catch (error) {
      console.error('[RoomManager] 加入房间失败:', error);
      EventBus.emit('game:room-error', { error: error.message });
      return { success: false, error: error.message };
    }
  },

  subscribeToRoom(roomId) {
    // 取消旧订阅
    if (this.roomChannel) {
      supabase.removeChannel(this.roomChannel);
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // 方法1: Realtime 订阅
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
          console.log('[RoomManager] Realtime: 房间状态更新:', payload);
          this.handleRoomUpdate(payload.new);
        }
      )
      .subscribe((status) => {
        console.log(`[RoomManager] Realtime 状态: ${status}`);
      });

    // 方法2: 轮询检测（备用方案，每2秒检查一次）
    this.pollInterval = setInterval(async () => {
      try {
        console.log('[RoomManager] 轮询检查房间状态...');
        const rooms = await query('game_sessions', {
          match: { id: roomId }
        });

        if (rooms && rooms.length > 0) {
          const room = rooms[0];
          console.log('[RoomManager] 轮询获取到房间:', room);
          this.handleRoomUpdate(room);
        }
      } catch (error) {
        console.error('[RoomManager] 轮询检测失败:', error);
      }
    }, 2000);
  },

  handleRoomUpdate(room) {
    if (!room) return;

    console.log('[RoomManager] handleRoomUpdate:', {
      currentUserId: this.currentUserId,
      player1_id: room.player1_id,
      player2_id: room.player2_id,
      status: room.status
    });

    // 检测对手加入（我是 P1，检测 P2 加入）
    if (this.currentUserId === room.player1_id && room.player2_id && !this.hasOpponentJoined) {
      console.log('[RoomManager] 对手已加入!');
      this.hasOpponentJoined = true;
      
      // 停止轮询
      if (this.pollInterval) {
        clearInterval(this.pollInterval);
        this.pollInterval = null;
      }
      EventBus.emit('game:player-joined', { playerId: 'P2' });
    }
    // 检测房间状态变为 playing（P2 端）
    if (room.status === 'playing' && this.currentUserId === room.player2_id) {
      console.log('[RoomManager] 游戏状态已更新为 playing');
      // 停止轮询
      if (this.pollInterval) {
        clearInterval(this.pollInterval);
        this.pollInterval = null;
      }
      EventBus.emit('game:player-joined', { playerId: 'P1' });
    }
  },

  unsubscribeFromRoom() {
    if (this.roomChannel) {
      supabase.removeChannel(this.roomChannel);
      this.roomChannel = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  },

  handlePlayerJoined(data) {
    console.log('[RoomManager] 玩家加入事件:', data);
    // 这个事件由 Renderer 处理，触发游戏开始
  },

  async handleLeaveRoom() {
    try {
      console.log('[RoomManager] 离开房间');

      // 取消订阅
      this.unsubscribeFromRoom();

      if (!this.currentRoomId) {
        console.warn('[RoomManager] 没有加入的房间');
        return { success: true };
      }

      await update('game_sessions', {
        status: 'finished'
      }, { match: { id: this.currentRoomId } });

      this.currentRoomCode = null;
      this.currentRoomId = null;
      this.currentUserId = null;

      console.log('[RoomManager] 离开房间成功');

      EventBus.emit(GAME_EVENTS.STATE_CHANGED, {
        actionType: 'room:left',
        status: 'menu'
      });

      return { success: true };
    } catch (error) {
      console.error('[RoomManager] 离开房间失败:', error);
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
