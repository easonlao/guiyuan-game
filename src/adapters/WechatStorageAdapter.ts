/**
 * 微信小游戏本地存储适配器 (WechatStorageAdapter)
 * 调用微信原生 wx.getStorageSync / wx.setStorageSync 实现本地脱机持久化
 */

import { IStorageManager } from './IStorageManager.js';

// 微信小游戏全局类型声明
declare const wx: {
  getStorageSync?: (key: string) => any;
  setStorageSync?: (key: string, data: any) => void;
  removeStorageSync?: (key: string) => void;
  clearStorageSync?: () => void;
} | undefined;

export class WechatStorageAdapter implements IStorageManager {
  getItem<T = unknown>(key: string): T | null {
    if (typeof wx === 'undefined' || !wx.getStorageSync) {
      return null;
    }
    try {
      const data = wx.getStorageSync(key);
      return (data !== '' && data !== undefined) ? (data as T) : null;
    } catch {
      return null;
    }
  }

  setItem<T = unknown>(key: string, value: T): void {
    if (typeof wx === 'undefined' || !wx.setStorageSync) return;
    try {
      wx.setStorageSync(key, value);
    } catch (e) {
      console.error('[WechatStorageAdapter] setStorageSync failed:', e);
    }
  }

  removeItem(key: string): void {
    if (typeof wx === 'undefined' || !wx.removeStorageSync) return;
    try {
      wx.removeStorageSync(key);
    } catch (e) {
      console.error('[WechatStorageAdapter] removeStorageSync failed:', e);
    }
  }

  clear(): void {
    if (typeof wx === 'undefined' || !wx.clearStorageSync) return;
    try {
      wx.clearStorageSync();
    } catch (e) {
      console.error('[WechatStorageAdapter] clearStorageSync failed:', e);
    }
  }
}
