// ============================================
// 游戏序列管理器（简化PVP架构）
// ============================================
// 职责：
// - 管理游戏开始流程
// - 控制先手判定阶段
// - 管理房间创建/加入流程
// - 设置PVP会话
// ============================================

import EventBus from '../../bus/EventBus.js';
import StateManager from '../../state/StateManager.js';
import RoomManager from '../../network/RoomManager.js';
import SimplifiedPVPManager from '../../network/SimplifiedPVPManager.js';
import TurnManager from './TurnManager.js';
import { getCurrentUserId } from '../../network/supabaseClient.js';

const GameSequence = {
  // 存储房间信息用于同步
  currentRoomId: null,
  myPlayerId: null,
  myRole: null, // 'P1' (房主) 或 'P2' (加入者)
  _isStarting: false,

  init() {
    EventBus.on('game:player-joined', this.handlePlayerJoined.bind(this));
  },

  handlePlayerJoined(data) {
    // 检查当前游戏阶段，如果已经开始游戏，则忽略重复的加入事件
    const currentPhase = StateManager.getState().phase;
    if (currentPhase === 'PLAYING' || currentPhase === 'INITIATIVE') {
      return;
    }

    // 只有房主（P1）在检测到 P2 加入时，才启动游戏序列
    // 必须同时满足：我是 P1，且有房间 ID，事件是关于 P2 加入的
    if (this.myRole === 'P1' && this.currentRoomId && this.myPlayerId && data.playerId === 'P2') {
      console.log('[GameSequence] ✓ P2 已加入，房主启动游戏序列');
      if (!this._isStarting) {
         this._startGameSequence();
      }
    }
  },

  /**
   * 开始新游戏
   * @param {Object} data - 游戏配置 {mode, roomCode, skipRoom, joinAs, roomCodeToJoin, fromWaiting}
   */
  startNewGame(data) {
    // 防止重复调用
    if (this._isStarting) {
      return;
    }

    this._isStarting = true;

    StateManager.reset();
    StateManager.setGameMode(data.mode);

    // 恢复 myRole（如果是 PVP 模式且已有角色）
    if (this.myRole && data.mode === 0) {
      StateManager.setMyRole(this.myRole);
      console.log('[GameSequence] 恢复 myRole:', this.myRole);
    }

    // 如果是从等待界面返回的，说明已经在房间中，直接开始游戏序列
    if (data.fromWaiting && this.currentRoomId) {
      this._startGameSequence();
      return;
    }

    if (data.mode === 0 && !data.skipRoom) {
      console.log('[GameSequence] PvP 模式，开始房间设置');
      this._handlePvPRoomSetup(data);
      return; // 等待房间设置完成后，在各自的函数中处理后续流程
    }

    this._startGameSequence();
  },

  /**
   * 处理 PvP 房间设置
   * @param {Object} data - 游戏配置
   * @private
   */
  async _handlePvPRoomSetup(data) {
    if (data.roomCode) {
      await this._joinExistingRoom(data.roomCode);
    } else if (data.joinAs === 'P2') {
      await this._joinExistingRoom(data.roomCodeToJoin);
    } else {
      await this._createNewRoom();
    }
  },

  /**
   * 创建新房间
   * @private
   */
  async _createNewRoom() {
    const playerId = getCurrentUserId();
    this.myPlayerId = playerId;
    this.myRole = 'P1'; // 我是房主
    StateManager.setMyRole('P1'); // 设置角色用于镜像显示
    EventBus.emit('game:show-waiting', { isHost: true });

    const result = await RoomManager.handleCreateRoom({ playerId });

    if (result.success) {
      const { room, roomCode } = result;
      this.currentRoomId = room.id;

      const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      EventBus.emit('game:waiting-info', { roomCode, shareUrl });

      // 设置PVP会话（我是P1）
      SimplifiedPVPManager.initPVPSession(room.id, room.id, 'P1');

      // 触发会话开始事件（用于重连）
      EventBus.emit('game:session-start', {
        sessionId: room.id,
        roomCode: roomCode
      });

      // P1（房主）创建房间后，等待对手加入
      console.log('[GameSequence] ✓ P1 房间创建成功，等待对手加入');
      this._isStarting = false;
    } else {
      EventBus.emit('game:room-error', { error: result.error });
      this._isStarting = false;
    }
  },

  /**
   * 加入已有房间
   * @param {string} roomCode - 房间代码
   * @private
   */
  async _joinExistingRoom(roomCode) {
    const playerId = getCurrentUserId();
    this.myPlayerId = playerId;
    this.myRole = 'P2'; // 我是加入者
    StateManager.setMyRole('P2'); // 设置角色用于镜像显示
    EventBus.emit('game:show-waiting', { isHost: false });

    const result = await RoomManager.handleJoinRoom({ playerId, roomCode });

    if (result.success) {
      this.currentRoomId = result.room.id;

      // 设置PVP会话（我是P2）
      SimplifiedPVPManager.initPVPSession(result.room.id, result.room.id, 'P2');

      // 触发会话开始事件（用于重连）
      EventBus.emit('game:session-start', {
        sessionId: result.room.id,
        roomCode: roomCode
      });

      // P2 加入后重置 _isStarting
      this._isStarting = false;
      console.log('[GameSequence] ✓ P2 加入房间，等待 P1 的先手判定');
    } else {
      EventBus.emit('game:room-error', { error: result.error });
      this._isStarting = false; // 失败时也要重置
    }
  },

  /**
   * 启动游戏序列
   * @private
   */
  async _startGameSequence() {
    // 双重检查：防止在游戏进行中意外触发
    const currentPhase = StateManager.getState().phase;
    if (currentPhase === 'PLAYING') {
      this._isStarting = false;
      return;
    }

    StateManager.update({ phase: 'INITIATIVE' });
    console.log('[GameSequence] 启动先手判定阶段');

    setTimeout(async () => {
      EventBus.emit('game:initiative-start');

      setTimeout(async () => {
        // PvP 模式：只有房主决定先手，然后同步给对手
        let currentPlayer = 'P1';
        let isFirstPlayer = false; // 是否是先手决定者

        if (this.currentRoomId && this.myPlayerId) {
          if (this.myRole === 'P1') {
            // 我是房主（P1），需要决定先手
            currentPlayer = Math.random() > 0.5 ? 'P1' : 'P2';
            isFirstPlayer = true;

            // 生成第一个天干，确保同步
            const { STEMS_LIST } = await import('../../config/game-config.js');
            const firstStem = STEMS_LIST[Math.floor(Math.random() * 10)];
            console.log('[GameSequence] P1 决定先手:', currentPlayer, '初始天干:', firstStem.name);

            // 立即应用先手判定和天干
            StateManager.update({ currentPlayer, currentStem: firstStem });

            // 同步给对手（异步）
            SimplifiedPVPManager.syncInitiative(currentPlayer);
            console.log('[GameSequence] ✓ 先手判定已发送');

            // 重置启动标志
            this._isStarting = false;
            return; // 等待对手接收后再继续
          } else {
            // 我是 P2，等待房主的先手判定
            console.log('[GameSequence] P2 等待房主的先手判定');
            this._isStarting = false;
            return;
          }
        } else {
          // 非 PvP 模式随机决定
          currentPlayer = Math.random() > 0.5 ? 'P1' : 'P2';
          StateManager.update({ currentPlayer });
        }

        EventBus.emit('game:initiative-completed', {
          winner: currentPlayer,
          isHost: isFirstPlayer
        });

        // 重置启动标志
        this._isStarting = false;
      }, 2500);
    }, 1500);
  }
};

export default GameSequence;
