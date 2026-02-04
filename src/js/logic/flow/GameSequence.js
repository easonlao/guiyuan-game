// ============================================
// 游戏序列管理器（主机-客户端PVP架构）
// ============================================
// 职责：
// - 管理游戏开始流程
// - 控制先手判定阶段（主机权威）
// - 管理房间创建/加入流程
// - 设置PVP会话
// ============================================

import EventBus from '../../bus/EventBus.js';
import StateManager from '../../state/StateManager.js';
import RoomManager from '../../network/RoomManager.js';
import SimplifiedPVPManager from '../../network/SimplifiedPVPManager.js';
import TurnManager from './TurnManager.js';
import AuthorityExecutor from '../AuthorityExecutor.js';
import { getCurrentUserId } from '../../network/supabaseClient.js';

// 获取 PVP 管理器（在线模式）
function getPVPManager() {
  return SimplifiedPVPManager;
}

const GameSequence = {
  // 存储房间信息用于同步
  currentRoomId: null,
  myPlayerId: null,
  myRole: null, // 'P1' (房主) 或 'P2' (加入者)
  _isStarting: false,

  init() {
    EventBus.on('game:player-joined', this.handlePlayerJoined.bind(this));
    EventBus.on('anim:initiative-finished', this._onInitiativeAnimationFinished.bind(this));
  },

  /**
   * 先手动画完成后的处理
   * @private
   */
  _onInitiativeAnimationFinished() {
    // 如果有待设置的初始天干，现在才设置
    if (this._pendingFirstStem) {
      console.log('[GameSequence] 先手动画完成，设置初始天干:', this._pendingFirstStem.name);
      StateManager.update({ currentStem: this._pendingFirstStem });
      this._pendingFirstStem = null;
    }
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

    // 设置 myRole
    if (data.mode === 0) {
      // PVP 模式：恢复已有角色
      if (this.myRole) {
        StateManager.setMyRole(this.myRole);
        console.log('[GameSequence] 恢复 myRole:', this.myRole);
      }
    } else {
      // 单机模式（玩家 VS 天道）：玩家控制 P1
      StateManager.setMyRole('P1');
      console.log('[GameSequence] 单机模式，设置 myRole: P1');
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
      const pvpManager = getPVPManager();
      if (pvpManager.initPVPSession) {
        pvpManager.initPVPSession(room.id, room.id, 'P1');
      } else if (pvpManager.createLocalRoom) {
        pvpManager.createLocalRoom();
      }

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
      const pvpManager = getPVPManager();
      if (pvpManager.initPVPSession) {
        pvpManager.initPVPSession(result.room.id, result.room.id, 'P2');
      } else if (pvpManager.joinLocalRoom) {
        pvpManager.joinLocalRoom();
      }

      // 触发会话开始事件（用于重连）
      EventBus.emit('game:session-start', {
        sessionId: result.room.id,
        roomCode: roomCode
      });

      // P2 加入后也启动游戏序列（触发先手动画）
      console.log('[GameSequence] ✓ P2 加入房间，启动游戏序列');
      this._startGameSequence();
    } else {
      EventBus.emit('game:room-error', { error: result.error });
      this._isStarting = false; // 失败时也要重置
    }
  },

  /**
   * 启动游戏序列（主机-客户端PVP架构）
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
      // 双方都触发先手动画开始
      EventBus.emit('game:initiative-start');

      setTimeout(async () => {
        // PvP 模式：只有主机决定先手，然后同步给客户端
        let currentPlayer = 'P1';
        let isFirstPlayer = false;

        if (this.currentRoomId && this.myPlayerId) {
          if (AuthorityExecutor.isHost()) {
            // 主机：使用 AuthorityExecutor 决定先手
            const result = AuthorityExecutor.determineInitiative();
            if (!result) {
              console.error('[GameSequence] 权威执行器未能判定先手');
              this._isStarting = false;
              return;
            }

            currentPlayer = result.firstPlayer;
            const firstStem = result.firstStem;
            isFirstPlayer = true;

            console.log('[GameSequence] 主机判定先手:', currentPlayer, '初始天干:', firstStem.name);

            // 只设置 currentPlayer，不设置 currentStem
            // currentStem 会在动画完成后（anim:initiative-finished）才设置
            StateManager.update({ currentPlayer });

            // 保存初始天干，等待动画完成后再设置
            this._pendingFirstStem = firstStem;

            // 同步给客户端（异步）
            const pvpManager = getPVPManager();
            if (pvpManager.syncInitiative) {
              pvpManager.syncInitiative(currentPlayer, firstStem);
            }
            console.log('[GameSequence] ✓ 先手判定已发送');

            // 触发先手判定完成事件（停止动画）
            EventBus.emit('game:initiative-completed', {
              winner: currentPlayer,
              isHost: true
            });

            // 重置启动标志
            this._isStarting = false;
            return;
          }
          // 客户端：等待主机的先手判定消息
          // 不要继续执行后面的代码，直接返回
          // 主机将通过 'initiative' 消息同步先手结果
          this._isStarting = false;
          return;
        } else {
          // 非 PvP 模式随机决定
          currentPlayer = Math.random() > 0.5 ? 'P1' : 'P2';
          StateManager.update({ currentPlayer });

          EventBus.emit('game:initiative-completed', {
            winner: currentPlayer,
            isHost: isFirstPlayer
          });
        }

        // 重置启动标志
        this._isStarting = false;
      }, 2500);
    }, 1500);
  }
};

export default GameSequence;
