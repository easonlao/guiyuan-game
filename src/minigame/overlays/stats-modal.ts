/**
 * 归元弈 · 功勋仙榜与战绩统计弹层 (StatsModal)
 *
 * 展示玩家总局数、胜率、五行归元大捷数、最高分与境界评定。
 * 滚动展示最近战报，支持清空重置。
 */

import { ModalOverlay, ModalOverlayOptions } from './modal-overlay.js';
import { THEME } from '../theme.js';
import { audioSynthesizer } from '../audio/audio-synthesizer.js';
import { GameStats, storageService } from '../services/storage-service.js';

export class StatsModal extends ModalOverlay {
  private stats: GameStats;

  public constructor(options: Omit<ModalOverlayOptions, 'title'>) {
    super({
      ...options,
      title: '功勋仙榜 · 战绩推演',
      panelHeight: Math.min(options.height - 70, 560),
    });
    this.stats = storageService.getStats();
  }

  public refresh(): void {
    this.stats = storageService.getStats();
  }

  private getCultivationTitle(
    wins: number,
    guiYuanCount: number,
  ): {
    title: string;
    desc: string;
  } {
    if (guiYuanCount >= 10 || wins >= 30) {
      return { title: '太虚玄祖', desc: '五行随心 · 阴阳归一' };
    }
    if (guiYuanCount >= 5 || wins >= 15) {
      return { title: '五行神尊', desc: '生克洞彻 · 阵法通神' };
    }
    if (wins >= 5) {
      return { title: '通玄真人', desc: '渐入佳境 · 运筹帷幄' };
    }
    if (wins >= 1) {
      return { title: '悟道剑士', desc: '初露锋芒 · 灵气初开' };
    }
    return { title: '入道童子', desc: '初涉仙途 · 探索生克' };
  }

  protected override handlePanelTap(screenX: number, screenY: number): void {
    // 检测【清空战绩】按钮
    const clearY = this.panelY + this.panelH - 46;
    const btnW = 120;
    const btnX = this.panelX + (this.panelW - btnW) / 2;

    if (screenX >= btnX && screenX <= btnX + btnW && screenY >= clearY && screenY <= clearY + 32) {
      audioSynthesizer.play('tap');
      storageService.clearStats();
      this.stats = storageService.getStats();
    }
  }

  protected override renderContent(ctx: CanvasRenderingContext2D): void {
    const x = this.panelX + 16;
    const w = this.panelW - 32;
    const startY = this.panelY + 54;

    // 1. 境界评定横幅
    const realm = this.getCultivationTitle(this.stats.wins, this.stats.guiYuanCount);
    ctx.fillStyle = 'rgba(216, 184, 118, 0.12)';
    ctx.fillRect(x, startY, w, 56);
    ctx.strokeStyle = THEME.gold;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, startY, w, 56);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `bold 16px ${THEME.font}`;
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`【当前境界】${realm.title}`, x + 16, startY + 10);

    ctx.font = `11px ${THEME.font}`;
    ctx.fillStyle = THEME.muted;
    ctx.fillText(realm.desc, x + 16, startY + 34);

    // 2. 四格核心数据盘
    const gridY = startY + 68;
    const colW = (w - 12) / 2;
    const rowH = 46;

    const winRate =
      this.stats.matchesPlayed > 0
        ? `${Math.round((this.stats.wins / this.stats.matchesPlayed) * 100)}%`
        : '0%';

    const metrics = [
      { label: '累计对弈', val: `${this.stats.matchesPlayed} 局` },
      { label: '胜率 / 胜局', val: `${winRate} (${this.stats.wins}胜)` },
      { label: '五行归元胜', val: `${this.stats.guiYuanCount} 次` },
      { label: '单局最高得分', val: `${this.stats.highestScore} 分` },
    ];

    metrics.forEach((m, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const mx = x + col * (colW + 12);
      const my = gridY + row * (rowH + 8);

      ctx.fillStyle = 'rgba(16, 46, 53, 0.5)';
      ctx.fillRect(mx, my, colW, rowH);
      ctx.strokeStyle = THEME.edge;
      ctx.strokeRect(mx, my, colW, rowH);

      ctx.font = `10px ${THEME.font}`;
      ctx.fillStyle = THEME.muted;
      ctx.fillText(m.label, mx + 10, my + 6);

      ctx.font = `bold 14px ${THEME.font}`;
      ctx.fillStyle = THEME.ivory;
      ctx.fillText(m.val, mx + 10, my + 24);
    });

    // 3. 最近战报
    const listY = gridY + 2 * (rowH + 8) + 12;
    ctx.font = `bold 13px ${THEME.font}`;
    ctx.fillStyle = THEME.gold;
    ctx.fillText('最近演武实录', x, listY);

    const listStartY = listY + 22;
    const recent = this.stats.recentMatches.slice(0, 4);

    if (recent.length === 0) {
      ctx.fillStyle = 'rgba(8, 27, 34, 0.4)';
      ctx.fillRect(x, listStartY, w, 68);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `12px ${THEME.font}`;
      ctx.fillStyle = THEME.muted;
      ctx.fillText('暂无演武记录，且去对弈一局！', x + w / 2, listStartY + 34);
    } else {
      recent.forEach((m, idx) => {
        const itemY = listStartY + idx * 34;
        const isWin = m.winner === 'P1';
        ctx.fillStyle = idx % 2 === 0 ? 'rgba(16, 46, 53, 0.4)' : 'transparent';
        ctx.fillRect(x, itemY, w, 30);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `bold 12px ${THEME.font}`;
        ctx.fillStyle = isWin ? THEME.jade : THEME.damage;
        ctx.fillText(isWin ? '【胜】' : '【负】', x + 6, itemY + 15);

        ctx.font = `11px ${THEME.font}`;
        ctx.fillStyle = THEME.ivory;
        const reasonText = m.reason === 'GUI_YUAN' ? '五行归元' : '大回合终结';
        ctx.fillText(`${m.mode} · ${reasonText} (${m.rounds}轮)`, x + 44, itemY + 15);

        ctx.textAlign = 'right';
        ctx.fillStyle = THEME.gold;
        ctx.fillText(`${m.p1Score} : ${m.p2Score}`, x + w - 8, itemY + 15);
      });
    }

    // 4. 清空战绩按钮
    const clearY = this.panelY + this.panelH - 46;
    const btnW = 120;
    const btnX = this.panelX + (this.panelW - btnW) / 2;

    ctx.fillStyle = 'rgba(238, 141, 119, 0.15)';
    ctx.fillRect(btnX, clearY, btnW, 32);
    ctx.strokeStyle = THEME.damage;
    ctx.strokeRect(btnX, clearY, btnW, 32);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `12px ${THEME.font}`;
    ctx.fillStyle = THEME.damage;
    ctx.fillText('重置清空战绩', btnX + btnW / 2, clearY + 16);
  }
}
