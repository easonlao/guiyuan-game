// ============================================
// 命令发送器
// ============================================
// 职责：
// - 发送游戏命令到服务器
// - 等待服务器确认
// - 处理发送失败和重试
// - 管理待确认命令队列
// ============================================

import EventBus from '../bus/EventBus.js';
import { supabase, insert, query } from './supabaseClient.js';
import GameCommand, { CommandType } from './GameCommand.js';
import StateManager from '../state/StateManager.js';

const CommandSender = {
  // 当前会话信息
  currentSessionId: null,
  myPlayerId: null,

  // 待确认命令队列 { commandId: { command, resolve, reject, timestamp } }
  pendingCommands: new Map(),

  // 订阅频道
  movesChannel: null,

  // 配置
  COMMAND_TIMEOUT: 30000,  // 命令超时时间（毫秒）
  MAX_RETRY: 3,            // 最大重试次数

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
    // 监听会话结束，清理订阅
    EventBus.on('game:return-to-menu', this.cleanup.bind(this));
  },

  /**
   * 设置会话信息
   * @param {string} sessionId - 会话ID
   * @param {string} playerId - 玩家ID
   */
  setSession(sessionId, playerId) {
    // 清理旧订阅
    this.cleanup();

    this.currentSessionId = sessionId;
    this.myPlayerId = playerId;

    // 订阅命令确认
    this._subscribeToCommands();
  },

  /**
   * 订阅命令表变化
   * @private
   */
  _subscribeToCommands() {
    if (!this.currentSessionId) {
      console.warn('[CommandSender] 无法订阅：未设置会话ID');
      return;
    }

    // 移除旧订阅
    if (this.movesChannel) {
      supabase.removeChannel(this.movesChannel);
    }

    // 订阅 game_moves 表的 INSERT 和 UPDATE 事件
    this.movesChannel = supabase
      .channel(`game_moves:${this.currentSessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',  // 监听 INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'game_moves',
          filter: `session_id=eq.${this.currentSessionId}`
        },
        (payload) => {
          this._handleMoveChange(payload);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[CommandSender] ✓ 已订阅命令确认');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[CommandSender] ✗ 命令订阅失败');
        }
      });
  },

  /**
   * 处理命令状态变化
   * @private
   */
  _handleMoveChange(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    const commandId = newRecord.command_id;

    // 只处理自己的命令
    if (newRecord.player_id !== this.myPlayerId) {
      return;
    }

    // 处理确认
    if (newRecord.status === 'confirmed') {
      this._handleCommandConfirmed(commandId);
    }
    // 处理拒绝
    else if (newRecord.status === 'rejected') {
      this._handleCommandRejected(commandId, newRecord.rejection_reason);
    }
    // 处理执行
    else if (newRecord.status === 'executed') {
      this._handleCommandExecuted(commandId, newRecord);
    }
  },

  /**
   * 发送命令
   * @param {Object} command - 命令对象
   * @returns {Promise<Object>} { success, error }
   */
  async sendCommand(command) {
    if (!this.currentSessionId) {
      return { success: false, error: '未设置会话' };
    }

    // 客户端验证
    const validation = GameCommand.validate(command);
    if (!validation.valid) {
      console.error('[CommandSender] 命令验证失败:', validation.error);
      return { success: false, error: validation.error };
    }

    // 检查是否已经发送过（幂等性）
    if (this.pendingCommands.has(command.commandId)) {
      return { success: true, message: 'Already pending' };
    }

    console.log('[CommandSender] 发送命令:', GameCommand.getSummary(command));

    // 创建 Promise 用于等待确认
    let commandResolve, commandReject;
    const confirmationPromise = new Promise((resolve, reject) => {
      commandResolve = resolve;
      commandReject = reject;
    });

    // 添加到待确认队列
    this.pendingCommands.set(command.commandId, {
      command,
      resolve: commandResolve,
      reject: commandReject,
      timestamp: Date.now(),
      retryCount: 0
    });

    // 写入数据库
    try {
      // INITIATIVE 命令初始状态设为 pending，如果没有数据库触发器会自动更新为 confirmed
      // 其他命令也设为 pending，等待数据库触发器更新
      const result = await insert('game_moves', {
        id: this._generateUUID(), // 使用命令ID作为数据库ID
        command_id: command.commandId,
        session_id: this.currentSessionId,
        command_type: command.commandType,
        player_id: command.playerId,
        turn_number: command.turnNumber,
        payload: command.payload,
        status: 'pending'  // 明确设置初始状态
      });

      if (!result || result.length === 0) {
        throw new Error('数据库插入失败');
      }

      const dbRecord = result[0];

      // 如果服务器立即拒绝，直接返回
      if (dbRecord.status === 'rejected') {
        this.pendingCommands.delete(command.commandId);
        return {
          success: false,
          error: dbRecord.rejection_reason || 'Command rejected by server'
        };
      }

      // 等待确认
      const timeoutId = setTimeout(() => {
        if (this.pendingCommands.has(command.commandId)) {
          console.warn('[CommandSender] 命令超时:', command.commandId);
          this._handleCommandTimeout(command.commandId);
        }
      }, this.COMMAND_TIMEOUT);

      // 等待确认（不阻塞返回）
      confirmationPromise
        .finally(() => clearTimeout(timeoutId));

      // 立即返回成功（实际执行通过事件通知）
      return { success: true, message: 'Command sent' };

    } catch (error) {
      console.error('[CommandSender] 发送命令失败:', error);
      this.pendingCommands.delete(command.commandId);
      commandReject(error);

      return { success: false, error: error.message };
    }
  },

  /**
   * 处理命令确认
   * @private
   */
  _handleCommandConfirmed(commandId) {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    // 发送确认事件
    EventBus.emit('COMMAND:confirmed', {
      commandId,
      command: pending.command
    });

    // 不在这里 resolve，等待 executed 状态
  },

  /**
   * 处理命令拒绝
   * @private
   */
  _handleCommandRejected(commandId, reason) {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    console.warn('[CommandSender] ✗ 命令被拒绝:', GameCommand.getSummary(pending.command));
    console.warn('[CommandSender] 拒绝原因:', reason);

    // 移除待确认
    this.pendingCommands.delete(commandId);

    // 拒绝 Promise
    pending.reject(new Error(reason));

    // 发送拒绝事件
    EventBus.emit('COMMAND:rejected', {
      commandId,
      command: pending.command,
      reason
    });
  },

  /**
   * 处理命令执行
   * @private
   */
  _handleCommandExecuted(commandId, dbRecord) {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    // 移除待确认
    this.pendingCommands.delete(commandId);

    // 解决 Promise
    pending.resolve({
      success: true,
      command: pending.command,
      executedAt: dbRecord.executed_at
    });

    // 发送执行事件（让 GameEngine 执行逻辑）
    EventBus.emit('COMMAND:execute', {
      commandId,
      command: pending.command,
      payload: pending.command.payload
    });
  },

  /**
   * 处理命令超时
   * @private
   */
  _handleCommandTimeout(commandId) {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    const { command, retryCount } = pending;

    console.warn('[CommandSender] 命令超时:', GameCommand.getSummary(command));

    // ⚠️ 特殊处理：INITIATIVE 和 TURN_END 命令超时后，直接触发执行事件（因为可能数据库没有触发器）
    if (command.commandType === 'INITIATIVE' || command.commandType === 'TURN_END') {
      console.log(`[CommandSender] ${command.commandType} 命令超时，直接触发执行（可能数据库无触发器）`);
      this.pendingCommands.delete(commandId);
      pending.resolve({
        success: true,
        command: pending.command,
        executedAt: new Date()
      });

      // 直接触发执行事件（确保payload是完整的）
      // ⚠️ 重要：使用command对象的payload，确保数据完整
      EventBus.emit('COMMAND:execute', {
        commandId,
        command: pending.command,
        payload: { ...pending.command.payload }  // 创建副本确保数据完整
      });
      return;
    }

    if (retryCount < this.MAX_RETRY) {
      // 重试
      console.log('[CommandSender] 重试命令:', retryCount + 1);
      pending.retryCount++;

      // 重新发送
      this.sendCommand(command);
    } else {
      // 达到最大重试次数
      console.error('[CommandSender] 命令失败，已达最大重试次数');
      this.pendingCommands.delete(commandId);
      pending.reject(new Error('Command timeout after max retries'));

      // 发送超时事件
      EventBus.emit('COMMAND:timeout', {
        commandId,
        command
      });
    }
  },

  /**
   * 生成 UUID（用于数据库 ID）
   * @private
   */
  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  /**
   * 获取待确认命令数量
   */
  getPendingCount() {
    return this.pendingCommands.size;
  },

  /**
   * 清理资源
   */
  cleanup() {
    // 移除订阅
    if (this.movesChannel) {
      supabase.removeChannel(this.movesChannel);
      this.movesChannel = null;
    }

    // 拒绝所有待确认命令
    for (const [commandId, pending] of this.pendingCommands) {
      pending.reject(new Error('Cleanup'));
    }
    this.pendingCommands.clear();

    // 清空会话信息
    this.currentSessionId = null;
    this.myPlayerId = null;
  }
};

export default CommandSender;
