// ============================================
// 状态快照管理器
// ============================================
// 职责：
// - 保存游戏状态快照
// - 支持断线重连时恢复状态
// - 提供状态历史查询
// ============================================

import { supabase, query, insert } from './supabaseClient.js';
import StateManager from '../state/StateManager.js';
import EventBus from '../bus/EventBus.js';

const StateSnapshotManager = {
  /**
   * 初始化
   */
  init() {
    console.log('[StateSnapshotManager] 初始化状态快照管理器...');
    // 绑定事件监听器
    EventBus.on('game:next-turn', this._handleTurnEnd.bind(this));
  },

  /**
   * 处理回合结束（自动保存快照）
   * @private
   */
  async _handleTurnEnd(data) {
    // 只在 PvP 模式下保存快照
    const state = StateManager.getState();
    if (state.gameMode !== 0) return;

    // 获取会话信息（从 CommandSender）
    const { default: CommandSender } = await import('./CommandSender.js');
    if (!CommandSender.currentSessionId) return;

    // 保存快照
    await this.saveSnapshot(
      CommandSender.currentSessionId,
      state.turnCount,
      state
    );
  },

  /**
   * 保存回合快照
   * @param {string} sessionId - 会话ID
   * @param {number} turnNumber - 回合数
   * @param {Object} state - 游戏状态
   * @returns {Promise<Object>} { success, error }
   */
  async saveSnapshot(sessionId, turnNumber, state) {
    console.log('[StateSnapshotManager] 保存快照:', { sessionId, turnNumber });

    try {
      // 序列化状态
      const snapshot = JSON.parse(JSON.stringify(state));

      // 插入快照
      const result = await insert('turn_snapshots', {
        session_id: sessionId,
        turn_number: turnNumber,
        state_snapshot: snapshot,
        confirmed_by: []
      });

      if (!result || result.length === 0) {
        throw new Error('插入快照失败');
      }

      console.log('[StateSnapshotManager] ✓ 快照已保存');
      return { success: true };
    } catch (error) {
      console.error('[StateSnapshotManager] 保存快照失败:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * 加载回合快照
   * @param {string} sessionId - 会话ID
   * @param {number} turnNumber - 回合数
   * @returns {Promise<Object|null>} 快照状态，如果不存在返回 null
   */
  async loadSnapshot(sessionId, turnNumber) {
    console.log('[StateSnapshotManager] 加载快照:', { sessionId, turnNumber });

    try {
      const snapshots = await query('turn_snapshots', {
        match: {
          session_id: sessionId,
          turn_number: turnNumber
        }
      });

      if (!snapshots || snapshots.length === 0) {
        console.log('[StateSnapshotManager] 快照不存在');
        return null;
      }

      const snapshot = snapshots[0];
      console.log('[StateSnapshotManager] ✓ 快照已加载');
      return snapshot.state_snapshot;
    } catch (error) {
      console.error('[StateSnapshotManager] 加载快照失败:', error);
      return null;
    }
  },

  /**
   * 获取最新快照
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Object|null>} 最新快照，如果不存在返回 null
   */
  async getLatestSnapshot(sessionId) {
    console.log('[StateSnapshotManager] 获取最新快照:', sessionId);

    try {
      const snapshots = await query('turn_snapshots', {
        match: { session_id: sessionId },
        order: 'turn_number',
        ascending: false,
        limit: 1
      });

      if (!snapshots || snapshots.length === 0) {
        console.log('[StateSnapshotManager] 无快照');
        return null;
      }

      const snapshot = snapshots[0];
      console.log('[StateSnapshotManager] ✓ 最新快照:', snapshot.turn_number);
      return snapshot.state_snapshot;
    } catch (error) {
      console.error('[StateSnapshotManager] 获取最新快照失败:', error);
      return null;
    }
  },

  /**
   * 确认快照（标记为已确认）
   * @param {string} sessionId - 会话ID
   * @param {number} turnNumber - 回合数
   * @param {string} playerId - 确认玩家ID
   * @returns {Promise<Object>} { success, error }
   */
  async confirmSnapshot(sessionId, turnNumber, playerId) {
    console.log('[StateSnapshotManager] 确认快照:', { sessionId, turnNumber, playerId });

    try {
      // 获取当前快照
      const snapshots = await query('turn_snapshots', {
        match: {
          session_id: sessionId,
          turn_number: turnNumber
        }
      });

      if (!snapshots || snapshots.length === 0) {
        throw new Error('快照不存在');
      }

      const snapshot = snapshots[0];
      const confirmedBy = snapshot.confirmed_by || [];

      // 检查是否已确认
      if (confirmedBy.includes(playerId)) {
        console.log('[StateSnapshotManager] 已确认，跳过');
        return { success: true };
      }

      // 添加确认
      const newConfirmedBy = [...confirmedBy, playerId];

      // 更新数据库
      const { update } = await import('./supabaseClient.js');
      await update('turn_snapshots', {
        confirmed_by: newConfirmedBy
      }, {
        match: { id: snapshot.id }
      });

      console.log('[StateSnapshotManager] ✓ 快照已确认');
      return { success: true };
    } catch (error) {
      console.error('[StateSnapshotManager] 确认快照失败:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * 检查快照是否已被双方确认
   * @param {string} sessionId - 会话ID
   * @param {number} turnNumber - 回合数
   * @returns {Promise<boolean>} 是否已确认
   */
  async isSnapshotConfirmed(sessionId, turnNumber) {
    try {
      const snapshots = await query('turn_snapshots', {
        match: {
          session_id: sessionId,
          turn_number: turnNumber
        }
      });

      if (!snapshots || snapshots.length === 0) {
        return false;
      }

      const confirmedBy = snapshots[0].confirmed_by || [];
      return confirmedBy.length >= 2;
    } catch (error) {
      console.error('[StateSnapshotManager] 检查确认失败:', error);
      return false;
    }
  },

  /**
   * 应用快照到 StateManager
   * @param {Object} snapshot - 快照状态
   */
  applySnapshot(snapshot) {
    console.log('[StateSnapshotManager] 应用快照到状态管理器');

    // 静默应用状态（不触发事件）
    StateManager.update(snapshot, true);

    // 手动触发一次状态变化事件
    EventBus.emit('STATE:snapshot-applied', snapshot);

    console.log('[StateSnapshotManager] ✓ 快照已应用');
  },

  /**
   * 清理旧快照（保留最近 N 个）
   * @param {string} sessionId - 会话ID
   * @param {number} keepCount - 保留数量
   * @returns {Promise<Object>} { success, deletedCount }
   */
  async cleanupOldSnapshots(sessionId, keepCount = 10) {
    console.log('[StateSnapshotManager] 清理旧快照:', { sessionId, keepCount });

    try {
      // 获取所有快照
      const snapshots = await query('turn_snapshots', {
        match: { session_id: sessionId },
        order: 'turn_number',
        ascending: false
      });

      if (!snapshots || snapshots.length <= keepCount) {
        console.log('[StateSnapshotManager] 无需清理');
        return { success: true, deletedCount: 0 };
      }

      // 找出要删除的快照
      const toDelete = snapshots.slice(keepCount);
      const deleteIds = toDelete.map(s => s.id);

      // 删除（使用 supabase 直接调用）
      const { error } = await supabase
        .from('turn_snapshots')
        .delete()
        .in('id', deleteIds);

      if (error) {
        throw error;
      }

      console.log('[StateSnapshotManager] ✓ 已清理', deleteIds.length, '个快照');
      return { success: true, deletedCount: deleteIds.length };
    } catch (error) {
      console.error('[StateSnapshotManager] 清理快照失败:', error);
      return { success: false, error: error.message, deletedCount: 0 };
    }
  }
};

export default StateSnapshotManager;
