/**
 * 归元弈 (Guiyuan) - 存储适配器抽象契约 (IStorageManager)
 * 解耦特定运行时，支持 Node.js (Mock)、Web (LocalStorage) 与微信小游戏 (wx.setStorageSync)
 */

export interface IStorageManager {
  getItem<T = unknown>(key: string): T | null;
  setItem<T = unknown>(key: string, value: T): void;
  removeItem(key: string): void;
  clear(): void;
}
