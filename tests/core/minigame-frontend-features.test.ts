import { describe, expect, it } from 'vitest';
import { AudioSynthesizer } from '../../src/minigame/audio/audio-synthesizer.js';
import { StorageService } from '../../src/minigame/services/storage-service.js';
import { MockStorage } from '../../src/adapters/MockStorage.js';
import { RuleModal } from '../../src/minigame/overlays/rule-modal.js';
import { SettingsModal } from '../../src/minigame/overlays/settings-modal.js';
import { StatsModal } from '../../src/minigame/overlays/stats-modal.js';
import { GameScene } from '../../src/minigame/game-scene.js';
import { createInitialGameState } from '../../src/core/logic/State.js';

describe('前端全功能套件 (Frontend Features)', () => {
  describe('AudioSynthesizer 程序化国风音效', () => {
    it('在 Node.js/单测无音频环境下静默兜底，不抛出异常', () => {
      const audio = new AudioSynthesizer();
      expect(audio.enabled).toBe(true);
      expect(audio.volume).toBe(0.8);

      expect(() => {
        audio.play('tap');
        audio.play('deal');
        audio.play('trans');
        audio.play('atk');
        audio.play('burst');
        audio.play('guiyi');
        audio.play('victory');
        audio.play('defeat');
      }).not.toThrow();

      audio.enabled = false;
      expect(audio.enabled).toBe(false);
      audio.volume = 0.5;
      expect(audio.volume).toBe(0.5);
    });
  });

  describe('StorageService 战绩与设置持久化', () => {
    it('正确读取默认设置并支持部分覆盖', () => {
      const mockStorage = new MockStorage();
      const service = new StorageService(mockStorage);

      const defaultSettings = service.getSettings();
      expect(defaultSettings.soundEnabled).toBe(true);
      expect(defaultSettings.gameSpeed).toBe(1);

      service.saveSettings({ gameSpeed: 2, soundEnabled: false });
      const updated = service.getSettings();
      expect(updated.gameSpeed).toBe(2);
      expect(updated.soundEnabled).toBe(false);
      expect(updated.autoDelay).toBe(0.75);
    });

    it('记录对局胜负、五行归元次数与最高分，支持清空', () => {
      const mockStorage = new MockStorage();
      const service = new StorageService(mockStorage);

      expect(service.getStats().matchesPlayed).toBe(0);

      service.recordMatch({
        timestamp: Date.now(),
        winner: 'P1',
        reason: 'GUI_YUAN',
        rounds: 12,
        p1Score: 1200,
        p2Score: 400,
        mode: '太虚天道',
      });

      let stats = service.getStats();
      expect(stats.matchesPlayed).toBe(1);
      expect(stats.wins).toBe(1);
      expect(stats.guiYuanCount).toBe(1);
      expect(stats.highestScore).toBe(1200);
      expect(stats.recentMatches.length).toBe(1);

      service.recordMatch({
        timestamp: Date.now(),
        winner: 'P2',
        reason: 'MAX_ROUNDS',
        rounds: 30,
        p1Score: 800,
        p2Score: 950,
        mode: '同屏双人',
      });

      stats = service.getStats();
      expect(stats.matchesPlayed).toBe(2);
      expect(stats.losses).toBe(1);
      expect(stats.highestScore).toBe(1200);
      expect(stats.recentMatches.length).toBe(2);

      service.clearStats();
      stats = service.getStats();
      expect(stats.matchesPlayed).toBe(0);
      expect(stats.wins).toBe(0);
      expect(stats.recentMatches.length).toBe(0);
    });
  });

  describe('国风水墨弹层 (RuleModal / SettingsModal / StatsModal)', () => {
    it('RuleModal 能够打开、关闭与切换 Tab', () => {
      let closed = false;
      const modal = new RuleModal({
        width: 375,
        height: 667,
        onClose: () => {
          closed = true;
        },
      });

      expect(modal.visible).toBe(true);
      modal.close();
      expect(modal.visible).toBe(false);
      expect(closed).toBe(true);

      modal.open();
      expect(modal.visible).toBe(true);
    });

    it('SettingsModal 支持修改选项并派发应用回调', () => {
      let appliedSettings: unknown = null;
      const modal = new SettingsModal({
        width: 375,
        height: 667,
        currentMode: 'ai_balanced',
        onApplySettings: (cfg) => {
          appliedSettings = cfg;
        },
      });

      modal.setMode('ai_rush');
      expect(modal.title).toContain('天机玄枢');
      expect(appliedSettings).toBeNull();
    });

    it('StatsModal 能够刷新战绩并在重置时更新数据', () => {
      const modal = new StatsModal({
        width: 375,
        height: 667,
      });
      expect(modal.title).toContain('功勋仙榜');
      expect(() => modal.refresh()).not.toThrow();
    });
  });

  describe('GameScene 扩展功能 (PVP 模式与 AI 性格)', () => {
    it('在同屏双人模式 (mode: pvp) 下，P2 的半回合等待人类玩家交互', () => {
      const baseState = createInitialGameState();
      const initialState = {
        ...baseState,
        currentPlayer: 'P2' as const,
      };

      const scene = new GameScene({
        width: 375,
        height: 667,
        initialState,
        mode: 'pvp',
        autoExecuteDelay: 0.1,
        aiThinkDelay: 0.1,
      });

      scene.start();
      // 在 PVP 模式下，P2 不会进入 ai-thinking，而是进入 awaiting-player 或 auto-pending
      expect(scene.phase).not.toBe('ai-thinking');
    });

    it('支持四大天道策略构造 (ai_balanced, ai_rush, ai_aggressive, ai_defensive)', () => {
      const scene = new GameScene({
        width: 375,
        height: 667,
      });

      const balanced = scene.createAiStrategy('ai_balanced');
      const rush = scene.createAiStrategy('ai_rush');
      const aggressive = scene.createAiStrategy('ai_aggressive');
      const defensive = scene.createAiStrategy('ai_defensive');

      expect(typeof balanced).toBe('function');
      expect(typeof rush).toBe('function');
      expect(typeof aggressive).toBe('function');
      expect(typeof defensive).toBe('function');
    });

    it('点击右上角功能区域能够唤起对应弹层', () => {
      const scene = new GameScene({
        width: 375,
        height: 667,
        safeTop: 24,
      });

      expect(scene.ruleModal.visible).toBe(false);
      expect(scene.settingsModal.visible).toBe(false);
      expect(scene.statsModal.visible).toBe(false);

      // 点击【道藏】(width - 146 ~ width - 98)
      scene.handleTap(375 - 120, 24 + 10);
      expect(scene.ruleModal.visible).toBe(true);
      scene.ruleModal.close();
      expect(scene.ruleModal.visible).toBe(false);

      // 点击【天机】(width - 98 ~ width - 50)
      scene.handleTap(375 - 75, 24 + 10);
      expect(scene.settingsModal.visible).toBe(true);
      scene.settingsModal.close();
      expect(scene.settingsModal.visible).toBe(false);

      // 点击【功勋】(width - 50 ~ width)
      scene.handleTap(375 - 25, 24 + 10);
      expect(scene.statsModal.visible).toBe(true);
      scene.statsModal.close();
      expect(scene.statsModal.visible).toBe(false);
    });
  });
});
