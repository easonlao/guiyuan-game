/**
 * LocalStorage 适配器 (LocalStorageAdapter)
 * 用于 Cocos Creator 本地 Web 预览环境
 */

import { IStorageManager } from './IStorageManager.js';

export class LocalStorageAdapter implements IStorageManager {
  getItem<T = unknown>(key: string): T | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  setItem<T = unknown>(key: string, value: T): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  }

  removeItem(key: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  }

  clear(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.clear();
  }
}
