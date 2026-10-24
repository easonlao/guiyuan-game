/**
 * 归元弈 · 国风水墨全屏弹层基类 (ModalOverlay)
 *
 * 挂载于场景树中，居中渲染半透明水墨遮罩与漆器框体。
 * 拦截背景点击，提供统一的右上角关闭按钮【✕】。
 */

import { Node } from '../scene/node.js';
import { drawPanel, THEME } from '../theme.js';
import { audioSynthesizer } from '../audio/audio-synthesizer.js';

export interface ModalOverlayOptions {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly panelWidth?: number;
  readonly panelHeight?: number;
  readonly onClose?: () => void;
}

export class ModalOverlay extends Node {
  public title: string;
  protected screenWidth: number;
  protected screenHeight: number;
  protected panelW: number;
  protected panelH: number;
  protected panelX: number;
  protected panelY: number;
  protected closeX: number;
  protected closeY: number;
  protected closeSize = 28;

  public onClose?: () => void;

  public constructor(options: ModalOverlayOptions) {
    super();
    this.title = options.title;
    this.screenWidth = options.width;
    this.screenHeight = options.height;
    this.onClose = options.onClose;

    this.panelW = options.panelWidth ?? Math.min(this.screenWidth - 32, 360);
    this.panelH = options.panelHeight ?? Math.min(this.screenHeight - 120, 520);
    this.panelX = (this.screenWidth - this.panelW) / 2;
    this.panelY = (this.screenHeight - this.panelH) / 2;

    this.closeX = this.panelX + this.panelW - this.closeSize - 12;
    this.closeY = this.panelY + 12;

    // 覆盖整个屏幕以阻断下层点击
    this.hitArea = {
      x: 0,
      y: 0,
      width: this.screenWidth,
      height: this.screenHeight,
    };

    this.onTap = (screenX, screenY) => {
      // 检查是否点击了关闭按钮
      if (
        screenX >= this.closeX - 4 &&
        screenX <= this.closeX + this.closeSize + 4 &&
        screenY >= this.closeY - 4 &&
        screenY <= this.closeY + this.closeSize + 4
      ) {
        audioSynthesizer.play('tap');
        this.close();
        return;
      }

      // 如果点击在弹窗外侧半透明遮罩，也可以退出
      if (
        screenX < this.panelX ||
        screenX > this.panelX + this.panelW ||
        screenY < this.panelY ||
        screenY > this.panelY + this.panelH
      ) {
        audioSynthesizer.play('tap');
        this.close();
        return;
      }

      this.handlePanelTap(screenX, screenY);
    };
  }

  public resize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    this.panelW = Math.min(this.screenWidth - 32, 360);
    this.panelH = Math.min(this.screenHeight - 120, 520);
    this.panelX = (this.screenWidth - this.panelW) / 2;
    this.panelY = (this.screenHeight - this.panelH) / 2;
    this.closeX = this.panelX + this.panelW - this.closeSize - 12;
    this.closeY = this.panelY + 12;

    this.hitArea = {
      x: 0,
      y: 0,
      width: this.screenWidth,
      height: this.screenHeight,
    };
  }

  public close(): void {
    this.visible = false;
    this.onClose?.();
  }

  public open(): void {
    this.visible = true;
  }

  protected handlePanelTap(_screenX: number, _screenY: number): void {
    // 子类按需实现内容区交互
  }

  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    // 1. 半透明水墨背景遮罩
    ctx.fillStyle = 'rgba(8, 27, 34, 0.82)';
    ctx.fillRect(0, 0, this.screenWidth, this.screenHeight);

    // 2. 漆器主画框
    drawPanel(
      ctx,
      this.panelX,
      this.panelY,
      this.panelW,
      this.panelH,
      THEME.gold,
      THEME.panelRaised,
    );

    // 3. 标题与分割装饰线
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 16px ${THEME.font}`;
    ctx.fillStyle = THEME.gold;
    ctx.fillText(this.title, this.panelX + this.panelW / 2, this.panelY + 26);

    ctx.strokeStyle = 'rgba(216, 184, 118, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.panelX + 16, this.panelY + 44);
    ctx.lineTo(this.panelX + this.panelW - 16, this.panelY + 44);
    ctx.stroke();

    // 4. 关闭按钮【✕】
    ctx.strokeStyle = THEME.muted;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.closeX, this.closeY, this.closeSize, this.closeSize);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `14px ${THEME.font}`;
    ctx.fillStyle = THEME.muted;
    ctx.fillText('✕', this.closeX + this.closeSize / 2, this.closeY + this.closeSize / 2);

    // 5. 渲染子类面板内容
    this.renderContent(ctx);
  }

  protected renderContent(_ctx: CanvasRenderingContext2D): void {
    // 由子类复写
  }
}
