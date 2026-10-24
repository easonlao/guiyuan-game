/**
 * 归元弈 · 战绩与设置持久化服务
 *
 * 统一抽象本地存储，在 Web 端使用 LocalStorageAdapter，在小游戏端使用 WechatStorageAdapter，
 * 在 Node.js / 测试环境中自动降级到 MockStorage。
 */

import { IStorageManager } from '../../adapters/IStorageManager.js';
import { LocalStorageAdapter } from '../../adapters/LocalStorageAdapter.js';
import { WechatStorageAdapter } from '../../adapters/WechatStorageAdapter.js';
import { MockStorage } from '../../adapters/MockStorage.js';

export interface GameSettings {
  soundEnabled: boolean;
  soundVolume: number;
  gameSpeed: number; // 1 | 1.5 | 2
  autoDelay: number;
}

export interface MatchRecord {
  timestamp: number;
  winner: string;
  reason: string;
  rounds: number;
  p1Score: number;
  p2Score: number;
  mode: string;
}

export interface GameStats {
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  guiYuanCount: number;
  highestScore: number;
  recentMatches: MatchRecord[];
}

const SETTINGS_KEY = 'guiyuan_user_settings';
const STATS_KEY = 'guiyuan_user_stats';

const DEFAULT_SETTINGS: GameSettings = {
  soundEnabled: true,
  soundVolume: 0.8,
  gameSpeed: 1,
  autoDelay: 0.75,
};

const DEFAULT_STATS: GameStats = {
  matchesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  guiYuanCount: 0,
  highestScore: 0,
  recentMatches: [],
};

declare const wx: { getStorageSync?: unknown } | undefined;

function detectStorage(): IStorageManager {
  if (typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function') {
    return new WechatStorageAdapter();
  }
  if (typeof localStorage !== 'undefined') {
    return new LocalStorageAdapter();
  }
  return new MockStorage();
}

export class StorageService {
  private storage: IStorageManager;
  private cachedSettings: GameSettings | null = null;
  private cachedStats: GameStats | null = null;

  public constructor(storage?: IStorageManager) {
    this.storage = storage ?? detectStorage();
  }

  public getSettings(): GameSettings {
    if (this.cachedSettings !== null) {
      return this.cachedSettings;
    }
    const saved = this.storage.getItem<Partial<GameSettings>>(SETTINGS_KEY);
    this.cachedSettings = saved ? { ...DEFAULT_SETTINGS, ...saved } : { ...DEFAULT_SETTINGS };
    return this.cachedSettings;
  }

  public saveSettings(settings: Partial<GameSettings>): void {
    const current = this.getSettings();
    this.cachedSettings = { ...current, ...settings };
    this.storage.setItem(SETTINGS_KEY, this.cachedSettings);
  }

  public getStats(): GameStats {
    if (this.cachedStats !== null) {
      return this.cachedStats;
    }
    const saved = this.storage.getItem<Partial<GameStats>>(STATS_KEY);
    this.cachedStats = saved ? { ...DEFAULT_STATS, ...saved } : { ...DEFAULT_STATS };
    return this.cachedStats;
  }

  public recordMatch(record: MatchRecord): void {
    const stats = this.getStats();
    stats.matchesPlayed += 1;
    if (record.winner === 'P1') {
      stats.wins += 1;
    } else if (record.winner === 'P2') {
      stats.losses += 1;
    } else {
      stats.draws += 1;
    }

    if (record.reason === 'GUI_YUAN') {
      stats.guiYuanCount += 1;
    }

    if (record.p1Score > stats.highestScore) {
      stats.highestScore = record.p1Score;
    }

    stats.recentMatches.unshift(record);
    if (stats.recentMatches.length > 20) {
      stats.recentMatches.pop();
    }

    this.cachedStats = stats;
    this.storage.setItem(STATS_KEY, stats);
  }

  public clearStats(): void {
    this.cachedStats = { ...DEFAULT_STATS, recentMatches: [] };
    this.storage.setItem(STATS_KEY, this.cachedStats);
  }
}

export const storageService = new StorageService();
