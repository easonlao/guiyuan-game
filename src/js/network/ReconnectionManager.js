// ============================================
// 断线重连管理器（简化PVP架构）
// ============================================
// 职责：
// - 检测网络断开
// - 重连后恢复游戏状态
// - 请求对手发送当前状态
// ============================================

import EventBus from '../bus/EventBus.js';
import { supabase, query } from './supabaseClient.js';
import SimplifiedPVPManager from './SimplifiedPVPManager.js';
import StateManager from '../state/StateManager.js';
import TimerManager from '../utils/TimerManager.js';

const RECONNECT_MONITOR_TIMER = 'reconnect-monitor';
const RECONNECT_DELAY_TIMER = 'reconnect-delay';
const CHANNEL_WAIT_TIMER = 'channel-wait';

const ReconnectionManager = {
  // 重连状态
  isReconnecting: false,
  reconnectAttempts: 0,
  maxReconnectAttempts: 10,  // 增加到10次

  // 指数退避配置
  baseReconnectDelay: 1000, // 1秒基准延迟
  maxReconnectDelay: 30000, // 30秒最大延迟

  // 会话信息（用于重连）
  lastSessionId: null,
  lastRoomCode: null,

  // 订阅频道
  sessionChannel: null,

  // 回调
  onStateRestored: null,
  onReconnectFailed: null,

  // Channel 恢复等待标志
  _waitingForChannelRestore: false,

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

    // 监听 Broadcast Channel 错误（来自 SimplifiedPVPManager）
    EventBus.on('RECONNECT:channel-error', (data) => {
      console.log('[ReconnectionManager] 收到 Channel 错误:', data.error);
      this.handleDisconnect();
    });

    // 监听 Broadcast Channel 恢复
    EventBus.on('RECONNECT:channel-restored', () => {
      console.log('[ReconnectionManager] Broadcast Channel 已恢复');
      this._onChannelRestored();
    });

    // 监听状态同步完成
    EventBus.on('pvp:state-synced', () => {
      if (this.isReconnecting) {
        console.log('[ReconnectionManager] 状态同步完成，重连成功');
        this._onReconnectSuccess();
      }
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
    TimerManager.setInterval(RECONNECT_MONITOR_TIMER, () => {
      this._checkConnection();
    }, 10000);
  },

  /**
   * 停止连接监控
   * @private
   */
  _stopConnectionMonitor() {
    TimerManager.clearInterval(RECONNECT_MONITOR_TIMER);
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
      const delay = this._calculateBackoffDelay();
      TimerManager.setTimeout(RECONNECT_DELAY_TIMER, () => {
        this.attemptReconnect();
      }, delay);
    }
  },

  /**
   * 计算退避延迟（指数退避）
   * @private
   */
  _calculateBackoffDelay() {
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    // 添加随机抖动（±25%）
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.round(delay + jitter);
  },

  /**
   * 尝试重连（简化PVP版本）
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
    this._waitingForChannelRestore = true;

    // 更新重连进度
    EventBus.emit('RECONNECT:progress', {
      attempt: this.reconnectAttempts + 1,
      maxAttempts: this.maxReconnectAttempts,
      message: '正在重连...'
    });

    this.reconnectAttempts++;

    console.log('[ReconnectionManager] ====== 尝试重连 ======');
    console.log('[ReconnectionManager] 尝试次数:', this.reconnectAttempts, '/', this.maxReconnectAttempts);

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

      // 2. 重新订阅 Realtime Broadcast（这里会触发 RECONNECT:channel-restored 事件）
      SimplifiedPVPManager.initPVPSession(
        this.lastSessionId,
        this.lastSessionId,
        StateManager.getMyRole()
      );

      // 3. 订阅会话更新
      this._subscribeToSession(this.lastSessionId);

      // 等待 Channel 恢复（最多等待5秒）
      TimerManager.setTimeout(CHANNEL_WAIT_TIMER, () => {
        if (this._waitingForChannelRestore) {
          console.warn('[ReconnectionManager] Channel 恢复超时，继续重连流程');
          this._onChannelRestored();
        }
      }, 5000);

      return { success: true };
    } catch (error) {
      console.error('[ReconnectionManager] 重连失败:', error);

      this.isReconnecting = false;
      this._waitingForChannelRestore = false;

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
      const delay = this._calculateBackoffDelay();
      console.log('[ReconnectionManager] 将在', delay, 'ms 后重试');
      TimerManager.setTimeout(RECONNECT_DELAY_TIMER, () => {
        this.attemptReconnect();
      }, delay);

      return { success: false, error: error.message };
    }
  },

  /**
   * Channel 恢复后的处理
   * @private
   */
  _onChannelRestored() {
    this._waitingForChannelRestore = false;

    // 请求对手发送当前状态
    SimplifiedPVPManager.requestStateSync();

    console.log('[ReconnectionManager] ✓ Broadcast 已恢复，等待状态同步...');

    // 更新进度
    EventBus.emit('RECONNECT:progress', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      message: '正在同步游戏状态...'
    });
  },

  /**
   * 重连成功
   * @private
   */
  _onReconnectSuccess() {
    this.isReconnecting = false;
    this.reconnectAttempts = 0;

    console.log('[ReconnectionManager] ✓ 重连成功！');

    // 触发重连成功事件
    EventBus.emit('RECONNECT:success', {
      sessionId: this.lastSessionId
    });
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

    // 清理所有定时器
    this._stopConnectionMonitor();
    TimerManager.clearTimeout(RECONNECT_DELAY_TIMER);
    TimerManager.clearTimeout(CHANNEL_WAIT_TIMER);

    // 重置状态
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this._waitingForChannelRestore = false;
    this.lastSessionId = null;
    this.lastRoomCode = null;
    this.onStateRestored = null;
    this.onReconnectFailed = null;
  }
};

export default ReconnectionManager;
