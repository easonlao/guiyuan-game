// ============================================
// 断线重连管理器
// ============================================
// 职责：
// - 检测网络断开
// - 重连后恢复游戏状态
// - 同步丢失的命令
// - 订阅最新回合状态
// ============================================

import EventBus from '../bus/EventBus.js';
import { supabase, query } from './supabaseClient.js';
import StateSnapshotManager from './StateSnapshotManager.js';
import StateManager from '../state/StateManager.js';

const ReconnectionManager = {
  // 重连状态
  isReconnecting: false,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  reconnectDelay: 2000, // 2秒

  // 会话信息（用于重连）
  lastSessionId: null,
  lastRoomCode: null,

  // 订阅频道
  sessionChannel: null,

  // 回调
  onStateRestored: null,
  onReconnectFailed: null,

  /**
   * 初始化
   */
  init() {
    console.log('[ReconnectionManager] 初始化断线重连管理器...');
    this._bindEvents();
    this._startConnectionMonitor();
  },

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    // 监听会话开始，记录会话信息
    EventBus.on('game:session-start', (data) => {
      this.lastSessionId = data.sessionId;
      this.lastRoomCode = data.roomCode;
      console.log('[ReconnectionManager] 记录会话信息:', data);
    });

    // 监听会话结束，清理
    EventBus.on('game:return-to-menu', () => {
      this.cleanup();
    });
  },

  /**
   * 启动连接监控
   * @private
   */
  _startConnectionMonitor() {
    // 监听在线/离线事件
    window.addEventListener('online', () => {
      console.log('[ReconnectionManager] 网络已连接');
      this.attemptReconnect();
    });

    window.addEventListener('offline', () => {
      console.log('[ReconnectionManager] 网络已断开');
      this.handleDisconnect();
    });

    // 定期检查连接状态（每10秒）
    setInterval(() => {
      this._checkConnection();
    }, 10000);
  },

  /**
   * 检查连接状态
   * @private
   */
  async _checkConnection() {
    if (this.isReconnecting) return;

    try {
      // 尝试查询数据库
      const result = await supabase.from('game_sessions').select('id').limit(1);

      if (result.error) {
        throw result.error;
      }

      // 连接正常
      if (this.reconnectAttempts > 0) {
        console.log('[ReconnectionManager] 连接已恢复');
        this.reconnectAttempts = 0;
      }
    } catch (error) {
      console.warn('[ReconnectionManager] 连接检查失败:', error);
      this.handleDisconnect();
    }
  },

  /**
   * 处理断线
   */
  handleDisconnect() {
    if (this.isReconnecting) return;

    console.log('[ReconnectionManager] ====== 检测到断线 ======');

    // 触发断线事件
    EventBus.emit('RECONNECT:disconnected');

    // 如果有活动会话，尝试重连
    if (this.lastSessionId) {
      setTimeout(() => {
        this.attemptReconnect();
      }, this.reconnectDelay);
    }
  },

  /**
   * 尝试重连
   * @returns {Promise<Object>} { success, error }
   */
  async attemptReconnect() {
    if (this.isReconnecting) {
      console.log('[ReconnectionManager] 重连中，跳过');
      return { success: false, error: 'Already reconnecting' };
    }

    if (!this.lastSessionId) {
      console.log('[ReconnectionManager] 无会话信息，跳过重连');
      return { success: false, error: 'No session info' };
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    console.log('[ReconnectionManager] ====== 尝试重连 ======');
    console.log('[ReconnectionManager] 尝试次数:', this.reconnectAttempts);

    try {
      // 1. 检查会话是否仍然有效
      const session = await this._getSessionStatus(this.lastSessionId);

      if (!session) {
        throw new Error('会话不存在');
      }

      if (session.status === 'finished' || session.status === 'abandoned') {
        throw new Error('会话已结束');
      }

      console.log('[ReconnectionManager] 会话有效:', session);

      // 2. 获取最新状态快照
      const latestSnapshot = await StateSnapshotManager.getLatestSnapshot(this.lastSessionId);

      if (!latestSnapshot) {
        throw new Error('无状态快照');
      }

      console.log('[ReconnectionManager] 找到快照，回合:', latestSnapshot.turnCount);

      // 3. 应用快照
      StateSnapshotManager.applySnapshot(latestSnapshot);

      // 4. 订阅会话更新
      this._subscribeToSession(this.lastSessionId);

      // 5. 同步丢失的命令
      await this._syncMissedCommands(this.lastSessionId, latestSnapshot.turnCount);

      // 重连成功
      this.isReconnecting = false;
      this.reconnectAttempts = 0;

      console.log('[ReconnectionManager] ✓ 重连成功');

      // 触发重连成功事件
      EventBus.emit('RECONNECT:success', {
        sessionId: this.lastSessionId,
        snapshot: latestSnapshot
      });

      // 调用回调
      if (this.onStateRestored) {
        this.onStateRestored(latestSnapshot);
      }

      return { success: true };
    } catch (error) {
      console.error('[ReconnectionManager] 重连失败:', error);

      this.isReconnecting = false;

      // 检查是否超过最大尝试次数
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[ReconnectionManager] 达到最大重连次数');

        // 触发重连失败事件
        EventBus.emit('RECONNECT:failed', {
          attempts: this.reconnectAttempts,
          error: error.message
        });

        // 调用回调
        if (this.onReconnectFailed) {
          this.onReconnectFailed(error);
        }

        // 清理
        this.cleanup();

        return { success: false, error: 'Max reconnect attempts reached' };
      }

      // 延迟后重试
      setTimeout(() => {
        this.attemptReconnect();
      }, this.reconnectDelay * this.reconnectAttempts);

      return { success: false, error: error.message };
    }
  },

  /**
   * 获取会话状态
   * @private
   */
  async _getSessionStatus(sessionId) {
    try {
      const sessions = await query('game_sessions', {
        match: { id: sessionId }
      });

      if (!sessions || sessions.length === 0) {
        return null;
      }

      return sessions[0];
    } catch (error) {
      console.error('[ReconnectionManager] 获取会话状态失败:', error);
      return null;
    }
  },

  /**
   * 订阅会话更新
   * @private
   */
  _subscribeToSession(sessionId) {
    // 移除旧订阅
    if (this.sessionChannel) {
      supabase.removeChannel(this.sessionChannel);
    }

    // 订阅会话状态变化
    this.sessionChannel = supabase
      .channel(`reconnect_session:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${sessionId}`
        },
        (payload) => {
          console.log('[ReconnectionManager] 会话状态更新:', payload.new.status);

          // 如果会话结束，返回主菜单
          if (payload.new.status === 'finished' || payload.new.status === 'abandoned') {
            EventBus.emit('game:return-to-menu');
          }
        }
      )
      .subscribe((status) => {
        console.log('[ReconnectionManager] 会话订阅状态:', status);
      });
  },

  /**
   * 同步丢失的命令
   * @private
   */
  async _syncMissedCommands(sessionId, lastTurnNumber) {
    console.log('[ReconnectionManager] 同步丢失的命令，回合 >', lastTurnNumber);

    try {
      // 获取该回合之后的所有已执行命令
      const { data: moves } = await supabase
        .from('game_moves')
        .select('*')
        .eq('session_id', sessionId)
        .gt('turn_number', lastTurnNumber)
        .eq('status', 'executed')
        .order('turn_number', { ascending: true });

      if (!moves || moves.length === 0) {
        console.log('[ReconnectionManager] 无丢失命令');
        return;
      }

      console.log('[ReconnectionManager] 发现', moves.length, '个丢失命令');

      // 触发命令执行事件（让 AuthorityExecutor 处理）
      const { default: AuthorityExecutor } = await import('./AuthorityExecutor.js');

      for (const move of moves) {
        EventBus.emit('COMMAND:execute', {
          commandId: move.command_id,
          command: {
            playerId: move.player_id,
            commandType: move.command_type,
            turnNumber: move.turn_number
          },
          payload: move.payload
        });
      }

      console.log('[ReconnectionManager] ✓ 命令已同步');
    } catch (error) {
      console.error('[ReconnectionManager] 同步命令失败:', error);
    }
  },

  /**
   * 设置状态恢复回调
   * @param {Function} callback - 回调函数
   */
  onReconnected(callback) {
    this.onStateRestored = callback;
  },

  /**
   * 设置重连失败回调
   * @param {Function} callback - 回调函数
   */
  onReconnectFailure(callback) {
    this.onReconnectFailed = callback;
  },

  /**
   * 清理资源
   */
  cleanup() {
    console.log('[ReconnectionManager] 清理资源...');

    // 移除订阅
    if (this.sessionChannel) {
      supabase.removeChannel(this.sessionChannel);
      this.sessionChannel = null;
    }

    // 重置状态
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.lastSessionId = null;
    this.lastRoomCode = null;
    this.onStateRestored = null;
    this.onReconnectFailed = null;
  }
};

export default ReconnectionManager;
