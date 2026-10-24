/**
 * 归元弈 · 天机玄枢配置弹层 (SettingsModal)
 *
 * 允许玩家实时切换对局模式（四大天道 AI 性格 / 同屏双人 PVP）、
 * 调节动效播放倍速、音效开关与音量，并支持直接重开对局。
 */

import { ModalOverlay, ModalOverlayOptions } from './modal-overlay.js';
import { THEME } from '../theme.js';
import { audioSynthesizer } from '../audio/audio-synthesizer.js';
import { GameSettings, storageService } from '../services/storage-service.js';

export type GameModeKey = 'ai_balanced' | 'ai_rush' | 'ai_aggressive' | 'ai_defensive' | 'pvp';

export interface SettingsModalOptions extends Omit<ModalOverlayOptions, 'title'> {
  readonly currentMode: GameModeKey;
  readonly onApplySettings: (settings: {
    mode: GameModeKey;
    speed: number;
    soundEnabled: boolean;
    restartGame: boolean;
  }) => void;
}

interface ModeOption {
  key: GameModeKey;
  name: string;
  tag: string;
}

const MODES: ModeOption[] = [
  { key: 'ai_balanced', name: '太虚道人 · 平衡天道', tag: '攻守均衡 · 稳重自保' },
  { key: 'ai_rush', name: '青木神君 · 归元冲刺', tag: '抢速归一 · 追求圆满' },
  { key: 'ai_aggressive', name: '裂天剑祖 · 激进压制', tag: '疯狂克敌 · 制造道损' },
  { key: 'ai_defensive', name: '镇岳真人 · 保守防御', tag: '优先自愈 · 固若金汤' },
  { key: 'pvp', name: '阴阳对弈 · 同屏双人', tag: '双人同机 · 面对面博弈' },
];

export class SettingsModal extends ModalOverlay {
  private selectedMode: GameModeKey;
  private selectedSpeed: number;
  private soundEnabled: boolean;
  private readonly onApply: SettingsModalOptions['onApplySettings'];

  public constructor(options: SettingsModalOptions) {
    super({
      ...options,
      title: '天机玄枢 · 对局调谐',
      panelHeight: Math.min(options.height - 70, 560),
    });
    this.selectedMode = options.currentMode;
    const settings: GameSettings = storageService.getSettings();
    this.selectedSpeed = settings.gameSpeed;
    this.soundEnabled = settings.soundEnabled;
    this.onApply = options.onApplySettings;
  }

  public setMode(mode: GameModeKey): void {
    this.selectedMode = mode;
  }

  protected override handlePanelTap(screenX: number, screenY: number): void {
    const startY = this.panelY + 54;
    const w = this.panelW - 24;
    const x = this.panelX + 12;

    // 1. 检测模式选项点击 (5 个选项)
    for (let i = 0; i < MODES.length; i += 1) {
      const itemY = startY + 22 + i * 44;
      if (screenX >= x && screenX <= x + w && screenY >= itemY && screenY <= itemY + 38) {
        if (this.selectedMode !== MODES[i].key) {
          this.selectedMode = MODES[i].key;
          audioSynthesizer.play('tap');
        }
        return;
      }
    }

    // 2. 检测倍速选项点击
    const speedY = startY + 22 + MODES.length * 44 + 32;
    const speeds = [1, 1.5, 2];
    const speedW = (w - 16) / 3;
    for (let i = 0; i < speeds.length; i += 1) {
      const btnX = x + i * (speedW + 8);
      if (
        screenX >= btnX &&
        screenX <= btnX + speedW &&
        screenY >= speedY &&
        screenY <= speedY + 30
      ) {
        if (this.selectedSpeed !== speeds[i]) {
          this.selectedSpeed = speeds[i];
          audioSynthesizer.play('tap');
        }
        return;
      }
    }

    // 3. 检测音效开关点击
    const soundY = speedY + 48;
    const soundW = (w - 12) / 2;
    if (screenX >= x && screenX <= x + soundW && screenY >= soundY && screenY <= soundY + 30) {
      this.soundEnabled = true;
      audioSynthesizer.enabled = true;
      audioSynthesizer.play('tap');
      return;
    }
    if (
      screenX >= x + soundW + 12 &&
      screenX <= x + w &&
      screenY >= soundY &&
      screenY <= soundY + 30
    ) {
      this.soundEnabled = false;
      audioSynthesizer.enabled = false;
      return;
    }

    // 4. 底部操作按钮：【应用并重开】与【仅保存】
    const bottomY = this.panelY + this.panelH - 46;
    const btnW = (w - 12) / 2;

    // 应用并重开
    if (screenX >= x && screenX <= x + btnW && screenY >= bottomY && screenY <= bottomY + 34) {
      audioSynthesizer.play('tap');
      storageService.saveSettings({
        soundEnabled: this.soundEnabled,
        gameSpeed: this.selectedSpeed,
      });
      this.close();
      this.onApply({
        mode: this.selectedMode,
        speed: this.selectedSpeed,
        soundEnabled: this.soundEnabled,
        restartGame: true,
      });
      return;
    }

    // 仅保存生效
    if (
      screenX >= x + btnW + 12 &&
      screenX <= x + w &&
      screenY >= bottomY &&
      screenY <= bottomY + 34
    ) {
      audioSynthesizer.play('tap');
      storageService.saveSettings({
        soundEnabled: this.soundEnabled,
        gameSpeed: this.selectedSpeed,
      });
      this.close();
      this.onApply({
        mode: this.selectedMode,
        speed: this.selectedSpeed,
        soundEnabled: this.soundEnabled,
        restartGame: false,
      });
    }
  }

  protected override renderContent(ctx: CanvasRenderingContext2D): void {
    const startY = this.panelY + 54;
    const w = this.panelW - 24;
    const x = this.panelX + 12;

    // 标题：对战模式
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `bold 13px ${THEME.font}`;
    ctx.fillStyle = THEME.gold;
    ctx.fillText('对弈阵营与天道性格', x, startY);

    // 模式列表
    for (let i = 0; i < MODES.length; i += 1) {
      const mode = MODES[i];
      const itemY = startY + 20 + i * 44;
      const isSel = this.selectedMode === mode.key;

      ctx.fillStyle = isSel ? 'rgba(216, 184, 118, 0.16)' : 'rgba(8, 27, 34, 0.45)';
      ctx.fillRect(x, itemY, w, 38);

      ctx.strokeStyle = isSel ? THEME.gold : THEME.edge;
      ctx.lineWidth = isSel ? 1.5 : 1;
      ctx.strokeRect(x, itemY, w, 38);

      // 单选圆点
      ctx.beginPath();
      ctx.arc(x + 18, itemY + 19, 6, 0, Math.PI * 2);
      ctx.strokeStyle = isSel ? THEME.gold : THEME.muted;
      ctx.stroke();
      if (isSel) {
        ctx.beginPath();
        ctx.arc(x + 18, itemY + 19, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = THEME.gold;
        ctx.fill();
      }

      ctx.font = `bold 12px ${THEME.font}`;
      ctx.fillStyle = isSel ? THEME.gold : THEME.ivory;
      ctx.fillText(mode.name, x + 34, itemY + 6);

      ctx.font = `10px ${THEME.font}`;
      ctx.fillStyle = THEME.muted;
      ctx.fillText(mode.tag, x + 34, itemY + 22);
    }

    // 标题：演武动效倍速
    const speedY = startY + 20 + MODES.length * 44 + 14;
    ctx.font = `bold 13px ${THEME.font}`;
    ctx.fillStyle = THEME.gold;
    ctx.fillText('推演节奏与时空流速', x, speedY);

    const speeds = [
      { val: 1, label: '1.0x 仙风道骨' },
      { val: 1.5, label: '1.5x 疾风骤雨' },
      { val: 2, label: '2.0x 极速神行' },
    ];
    const speedBtnY = speedY + 20;
    const speedW = (w - 16) / 3;

    for (let i = 0; i < speeds.length; i += 1) {
      const sp = speeds[i];
      const btnX = x + i * (speedW + 8);
      const isSel = Math.abs(this.selectedSpeed - sp.val) < 0.1;

      ctx.fillStyle = isSel ? THEME.gold : 'rgba(16, 46, 53, 0.5)';
      ctx.fillRect(btnX, speedBtnY, speedW, 28);
      ctx.strokeStyle = isSel ? THEME.gold : THEME.edge;
      ctx.strokeRect(btnX, speedBtnY, speedW, 28);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${isSel ? 'bold' : 'normal'} 11px ${THEME.font}`;
      ctx.fillStyle = isSel ? THEME.ink : THEME.ivory;
      ctx.fillText(sp.label, btnX + speedW / 2, speedBtnY + 14);
    }

    // 标题：音效控制
    const soundTitleY = speedBtnY + 38;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `bold 13px ${THEME.font}`;
    ctx.fillStyle = THEME.gold;
    ctx.fillText('国风程序化合成音效', x, soundTitleY);

    const soundBtnY = soundTitleY + 20;
    const soundW = (w - 12) / 2;

    // 开
    const isAudioOn = this.soundEnabled;
    ctx.fillStyle = isAudioOn ? THEME.jade : 'rgba(16, 46, 53, 0.5)';
    ctx.fillRect(x, soundBtnY, soundW, 28);
    ctx.strokeStyle = isAudioOn ? THEME.jade : THEME.edge;
    ctx.strokeRect(x, soundBtnY, soundW, 28);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${isAudioOn ? 'bold' : 'normal'} 12px ${THEME.font}`;
    ctx.fillStyle = isAudioOn ? THEME.ink : THEME.ivory;
    ctx.fillText('🔊 仙乐齐鸣 (开启)', x + soundW / 2, soundBtnY + 14);

    // 关
    ctx.fillStyle = !isAudioOn ? THEME.damage : 'rgba(16, 46, 53, 0.5)';
    ctx.fillRect(x + soundW + 12, soundBtnY, soundW, 28);
    ctx.strokeStyle = !isAudioOn ? THEME.damage : THEME.edge;
    ctx.strokeRect(x + soundW + 12, soundBtnY, soundW, 28);
    ctx.fillStyle = !isAudioOn ? THEME.ink : THEME.ivory;
    ctx.font = `${!isAudioOn ? 'bold' : 'normal'} 12px ${THEME.font}`;
    ctx.fillText('🔇 清虚寂灭 (静音)', x + soundW + 12 + soundW / 2, soundBtnY + 14);

    // 底部按钮
    const bottomY = this.panelY + this.panelH - 46;
    const btnW = (w - 12) / 2;

    // 应用并重开
    ctx.fillStyle = THEME.gold;
    ctx.fillRect(x, bottomY, btnW, 34);
    ctx.strokeStyle = THEME.goldDim;
    ctx.strokeRect(x, bottomY, btnW, 34);
    ctx.fillStyle = THEME.ink;
    ctx.font = `bold 12px ${THEME.font}`;
    ctx.fillText('🔄 应用并重新开局', x + btnW / 2, bottomY + 17);

    // 仅保存
    ctx.fillStyle = THEME.panelRaised;
    ctx.fillRect(x + btnW + 12, bottomY, btnW, 34);
    ctx.strokeStyle = THEME.edge;
    ctx.strokeRect(x + btnW + 12, bottomY, btnW, 34);
    ctx.fillStyle = THEME.ivory;
    ctx.font = `12px ${THEME.font}`;
    ctx.fillText('✓ 仅保存本局生效', x + btnW + 12 + btnW / 2, bottomY + 17);
  }
}
