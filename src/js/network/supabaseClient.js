// ============================================
// Supabase 客户端封装
// ============================================
// 职责：
// - 创建 Supabase 客户实例
// - 提供数据库访问接口
// - 封装常用操作
// ============================================

import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '../config/env.js';

// 从环境配置加载 Supabase 凭据
const config = loadEnvConfig();
const supabaseUrl = config.SUPABASE_URL;
const supabaseKey = config.SUPABASE_ANON_KEY;

// PVP 调试日志函数
const log = (...args) => window.PVP_DEBUG && console.log('[Supabase]', ...args);
const logError = (...args) => console.error('[Supabase]', ...args);

export const supabase = createClient(supabaseUrl, supabaseKey);

export function getCurrentUserId() {
  let userId = sessionStorage.getItem('guiyuan_player_id');

  if (!userId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    userId = `player_${timestamp}_${random}`;
    sessionStorage.setItem('guiyuan_player_id', userId);
    log('生成新玩家 ID:', userId);
  } else {
    log('使用已有玩家 ID:', userId);
  }

  return userId;
}

export function resetPlayerId() {
  sessionStorage.removeItem('guiyuan_player_id');
  log('玩家 ID 已重置');
}

export async function signIn(credentials) {
  log('登录功能尚未实现');
  return null;
}

export async function signOut() {
  log('登出功能尚未实现');
  return null;
}

export async function query(table, options = {}) {
  try {
    let query = supabase.from(table).select(options.columns || '*');

    if (options.match) {
      query = query.match(options.match);
    }

    if (options.order) {
      const ascending = options.ascending !== undefined ? options.ascending : false;
      query = query.order(options.order, { ascending });
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.range) {
      query = query.range(options.range.from, options.range.to);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
  } catch (error) {
    logError('查询失败:', error.message);
    return null;
  }
}

export async function insert(table, data) {
  try {
    const { data: insertedData, error } = await supabase
      .from(table)
      .insert(data)
      .select();

    if (error) throw error;
    return insertedData;
  } catch (error) {
    logError('插入失败:', error.message);
    return null;
  }
}

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
    logError('更新失败:', error.message);
    return null;
  }
}

export function onChannelChange(channel, callback) {
  const channelName = `realtime:${channel}`;
  const subscription = supabase
    .channel(channelName)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: channel, filter: '*' })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: channel, filter: '*' })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: channel, filter: '*' })
    .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      log(`已订阅频道: ${channel}`);
    } else if (status === 'CLOSED') {
      log(`与频道断开连接: ${channel}`);
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
