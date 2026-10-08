// ============================================
// 本地PVP管理器
// ============================================
// 职责：
// - 使用 BroadcastChannel API 在同一设备的两个标签页之间通信
// - 管理本地 PVP 会话状态
// - 处理回合切换同步
// - 同步对手操作
// ============================================

import EventBus from '../bus/EventBus.js';
import StateManager from '../state/StateManager.js';
import AuthorityExecutor from '../logic/AuthorityExecutor.js';

const LocalPVPManager = {
  // 会话信息
  isEnabled: false,
  myRole: null, // 'P1' or 'P2'
  isHost: false,

  // Broadcast Channel
  channel: null,
  CHANNEL_NAME: 'local-pvp-game',

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
   * 创建本地 PVP 房间（作为 P1 主机）
   */
  createLocalRoom() {
    this.cleanup();

    this.isEnabled = true;
    this.myRole = 'P1';
    this.isHost = true;

    // 设置为主机
    AuthorityExecutor.setAsHost();

    // 同步 myRole 到 StateManager
    StateManager.setMyRole('P1');

    // 设置游戏模式为 PVP
    StateManager.update({ gameMode: 0 });

    // 订阅 Broadcast Channel
    this._subscribeToChannel();

    // 广播房间创建消息
    this._broadcast({
      type: 'room_created',
      role: 'P1',
      timestamp: Date.now()
    });

  },

  /**
   * 加入本地 PVP 房间（作为 P2）
   */
  joinLocalRoom() {
    this.cleanup();

    this.isEnabled = true;
    this.myRole = 'P2';
    this.isHost = false;

    // 重置为主机（客户端）
    AuthorityExecutor.reset();

    // 同步 myRole 到 StateManager
    StateManager.setMyRole('P2');

    // 设置游戏模式为 PVP
    StateManager.update({ gameMode: 0 });

    // 订阅 Broadcast Channel
    this._subscribeToChannel();

    // 广播加入消息
    this._broadcast({
      type: 'player_joined',
      role: 'P2',
      timestamp: Date.now()
    });


    // 通知主机可以开始游戏
    return true;
  },

  /**
   * 订阅 Broadcast Channel
   * @private
   */
  _subscribeToChannel() {
    if (this.channel) {
      this.channel.close();
    }


    this.channel = new BroadcastChannel(this.CHANNEL_NAME);

    this.channel.onmessage = (event) => {
      const message = event.data;

      // 忽略自己的消息
      if (message.role === this.myRole) {
        return;
      }

      this._handleMessage(message);
    };
  },

  /**
   * 处理接收到的消息
   * @private
   */
  _handleMessage(message) {
    const { type, data } = message;

    switch (type) {
      case 'room_created':
        break;

      case 'player_joined':
        EventBus.emit('game:opponent-connected');
        break;

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

      case 'turn_end':
        // 对手回合结束

        const currentState = StateManager.getState();
        const turnUpdates = {};
        if (data.nextPlayer && data.nextPlayer !== currentState.currentPlayer) {
          turnUpdates.currentPlayer = data.nextPlayer;
        }
        turnUpdates.currentStem = null;

        if (Object.keys(turnUpdates).length > 0) {
          StateManager.update(turnUpdates, true);
        }

        EventBus.emit('game:next-turn');
        break;

      case 'turn_sync':
        // 回合切换同步（主机权威计算）

        const syncState = StateManager.getState();
        const syncUpdates = {};
        if (data.nextPlayer && data.nextPlayer !== syncState.currentPlayer) {
          syncUpdates.currentPlayer = data.nextPlayer;
        }
        syncUpdates.isExtraTurn = data.isExtraTurn || false;
        syncUpdates.currentStem = null;

        if (Object.keys(syncUpdates).length > 0) {
          StateManager.update(syncUpdates, true);
        }

        EventBus.emit('game:next-turn');
        break;

      case 'stem':
        // 天干同步
        StateManager.update({ currentStem: data.stem });
        break;

      case 'stem_generated':
        // 天干生成（主机权威）
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
        EventBus.emit('game:initiative-completed', {
          winner: data.firstPlayer,
          isHost: this.isHost
        });
        break;

      default:
        console.warn('[LocalPVPManager] 未知消息类型:', type);
    }
  },

  /**
   * 发送操作到对手
   * @param {Object} action - 操作对象
   * @returns {Promise<void>}
   */
  sendAction(action) {
    return new Promise((resolve) => {
      if (!this.isEnabled || !this.channel) {
        resolve();
        return;
      }

      this._broadcast({
        type: 'action',
        role: this.myRole,
        data: action,
        timestamp: Date.now()
      });
      resolve();
    });
  },

  /**
   * 发送回合切换通知
   * @param {string} nextPlayer - 下个玩家
   * @returns {Promise<void>}
   */
  sendTurnEndNotification(nextPlayer) {
    return new Promise((resolve) => {
      if (!this.isEnabled || !this.channel) {
        resolve();
        return;
      }

    const state = StateManager.getState();

    this._broadcast({
      type: 'turn_end',
      role: this.myRole,
      data: {
        turnNumber: state.turnCount,
        nextPlayer: nextPlayer
      },
      timestamp: Date.now()
    });

      当前回合: state.turnCount,
      下个玩家: nextPlayer
    });

    resolve();
  });
  },

  /**
   * 发送天干同步
   * @param {Object} stem - 天干
   */
  syncStem(stem) {
    if (!this.isEnabled || !this.channel) return;

    this._broadcast({
      type: 'stem',
      role: this.myRole,
      data: { stem },
      timestamp: Date.now()
    });
  },

  /**
   * 发送先手判定
   * @param {string} firstPlayer - 先手玩家
   * @param {Object} firstStem - 初始天干
   */
  syncInitiative(firstPlayer, firstStem) {
    if (!this.isEnabled || !this.channel) return;


    this._broadcast({
      type: 'initiative',
      role: this.myRole,
      data: { firstPlayer, firstStem },
      timestamp: Date.now()
    });
  },

  /**
   * 发送游戏结束
   * @param {Object} data - 游戏结束数据
   */
  syncGameEnd(data) {
    if (!this.isEnabled || !this.channel) return;

    this._broadcast({
      type: 'game_end',
      role: this.myRole,
      data: data,
      timestamp: Date.now()
    });
  },

  /**
   * 发送天干生成（主机权威）
   * @param {Object} stem - 天干
   * @param {number} seed - 随机种子
   */
  sendStemGenerated(stem, seed) {
    if (!this.isEnabled || !this.channel) return;

    this._broadcast({
      type: 'stem_generated',
      role: this.myRole,
      data: { stem, seed },
      timestamp: Date.now()
    });

  },

  /**
   * 发送回合切换同步（主机权威）
   * @param {string} nextPlayer - 下个玩家
   * @param {boolean} isExtraTurn - 是否是额外机会回合
   */
  sendTurnSync(nextPlayer, isExtraTurn = false) {
    if (!this.isEnabled || !this.channel) return;

    const state = StateManager.getState();

    this._broadcast({
      type: 'turn_sync',
      role: this.myRole,
      data: {
        turnNumber: state.turnCount,
        nextPlayer: nextPlayer,
        isExtraTurn: isExtraTurn
      },
      timestamp: Date.now()
    });

      当前回合: state.turnCount,
      下个玩家: nextPlayer,
      额外机会: isExtraTurn
    });
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

      this._broadcast({
        type: 'action_request',
        role: this.myRole,
        data: action,
        timestamp: Date.now()
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

      this._broadcast({
        type: 'action_confirmed',
        role: this.myRole,
        data: action,
        timestamp: Date.now()
      });

      resolve();
    });
  },

  /**
   * 广播消息
   * @private
   */
  _broadcast(message) {
    if (this.channel) {
      this.channel.postMessage(message);
    }
  },

  /**
   * 检查是否启用
   * @returns {boolean}
   */
  isActive() {
    return this.isEnabled;
  },

  /**
   * 获取我的角色
   * @returns {string|null}
   */
  getMyRole() {
    return this.myRole;
  },

  /**
   * 清理资源
   */
  cleanup() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    this.isEnabled = false;
    this.myRole = null;
    this.isHost = false;

    // 重置权威执行器
    AuthorityExecutor.reset();

  }
};

export default LocalPVPManager;
