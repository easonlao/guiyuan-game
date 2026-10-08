/**
 * 内存存储适配器 (MockStorage)
 * 用于 Node.js 测试环境与无头推演
 */

import { IStorageManager } from './IStorageManager.js';

export class MockStorage implements IStorageManager {
  private readonly store = new Map<string, string>();

  getItem<T = unknown>(key: string): T | null {
    const raw = this.store.get(key);
    if (raw === undefined) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  setItem<T = unknown>(key: string, value: T): void {
    this.store.set(key, JSON.stringify(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
