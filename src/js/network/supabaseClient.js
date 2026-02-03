// ============================================
// Supabase 客户端封装
// ============================================
// 职责：
// - 创建 Supabase 客户实例
// - 提供数据库访问接口
// - 封装常用操作
// ============================================

import { createClient } from '@supabase/supabase-js';

// Supabase 配置
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || 'https://solyclwajueobffjucjb.supabase.co';
const supabaseKey = import.meta.env?.VITE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvbHljbHdhanVlb2JmZmp1Y2piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MDg0NjgsImV4cCI6MjA4NDk4NDQ2OH0.-DhJrL0nttPnkRxvuHHlURFl2lxyiFQb4POCJezpZrE';

/**
 * 创建 Supabase 客户端
 * @returns {Object} Supabase 客户端实例
 */
export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 获取当前用户 ID
 * @returns {string} 用户 ID（临时或登录用户）
 */
export function getCurrentUserId() {
  // 使用 sessionStorage 代替 localStorage，确保每个标签页有独立的 ID
  let userId = sessionStorage.getItem('guiyuan_player_id');

  if (!userId) {
    // 生成新的临时玩家 ID（添加更多随机性以避免冲突）
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    userId = `player_${timestamp}_${random}`;
    sessionStorage.setItem('guiyuan_player_id', userId);
    console.log('[SupabaseClient] 生成新玩家 ID:', userId);
  } else {
    console.log('[SupabaseClient] 使用已有玩家 ID:', userId);
  }

  return userId;
}

/**
 * 重置玩家 ID（用于测试）
 */
export function resetPlayerId() {
  sessionStorage.removeItem('guiyuan_player_id');
  console.log('[SupabaseClient] 玩家 ID 已重置');
}

/**
 * 用户认证（预留）
 * @param {Object} credentials - 登录凭证
 * @returns {Promise<Object>} 登录结果
 */
export async function signIn(credentials) {
  console.log('[SupabaseClient] 登录功能尚未实现');
  // TODO: 实现 Supabase Auth.signInWithPassword
  return null;
}

/**
 * 用户登出（预留）
 * @returns {Promise<Object>} 登出结果
 */
export async function signOut() {
  console.log('[SupabaseClient] 登出功能尚未实现');
  // TODO: 实现 supabase.auth.signOut()
  return null;
}

/**
 * 执行数据库查询（安全包装）
 * @param {string} table - 表名
 * @param {Object} options - 查询选项
 * @returns {Promise<Object>} 查询结果
 */
export async function query(table, options = {}) {
  try {
    let query = supabase.from(table).select(options.columns || '*');

    // 添加匹配条件
    if (options.match) {
      query = query.match(options.match);
    }

    // 添加排序
    if (options.order) {
      const ascending = options.ascending !== undefined ? options.ascending : false;
      query = query.order(options.order, { ascending });
    }

    // 添加限制
    if (options.limit) {
      query = query.limit(options.limit);
    }

    // 添加范围
    if (options.range) {
      query = query.range(options.range.from, options.range.to);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('[SupabaseClient] 查询失败:', error);
    return null;
  }
}

/**
 * 插入数据（安全包装）
 * @param {string} table - 表名
 * @param {Object} data - 要插入的数据
 * @returns {Promise<Object>} 插入结果
 */
export async function insert(table, data) {
  try {
    const { data: insertedData, error } = await supabase
      .from(table)
      .insert(data)
      .select();

    if (error) throw error;
    return insertedData;
  } catch (error) {
    console.error('[SupabaseClient] 插入失败:', error);
    return null;
  }
}

/**
 * 更新数据（安全包装）
 * @param {string} table - 表名
 * @param {Object} data - 要更新的数据
 * @returns {Promise<Object>} 更新结果
 */
export async function update(table, data, options = {}) {
  try {
    const { data: updatedData, error } = await supabase
      .from(table)
      .update(data)
      .match(options.match || {})
      .select();

    if (error) throw error;
    return updatedData;
  } catch (error) {
    console.error('[SupabaseClient] 更新失败:', error);
    return null;
  }
}

/**
 * 订阅实时变化
 * @param {string} channel - 频道名称
 * @param {Function} callback - 回调函数
 * @returns {Promise} 取消订阅的函数
 */
export function onChannelChange(channel, callback) {
  const channelName = `realtime:${channel}`;
  const subscription = supabase
    .channel(channelName)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: channel, filter: '*' })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: channel, filter: '*' })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: channel, filter: '*' })
    .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log(`[SupabaseClient] 已订阅频道: ${channel}`);
    } else if (status === 'CLOSED') {
      console.log(`[supabaseClient] 与频道断开连接: ${channel}`);
    }
    });

  return () => subscription.unsubscribe();
}

export default {
  supabase,
  getCurrentUserId,
  signIn,
  signOut,
  query,
  insert,
  update,
  onChannelChange
};
