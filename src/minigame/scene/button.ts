/**
 * 轻量交互按钮组件（Layer 3）：自动尺寸 + 按压缩放反馈 + 禁用态 + `onTap` 回调。
 *
 * 尺寸策略：标题与副标题按字号估算文本宽度（口径见 `text-metrics.ts`：全角 1.2 倍字号、
 * 其余 0.6 倍的上界），加上内边距得到自动尺寸；`hitArea` 始终以节点原点为中心，因此按钮的
 * `x` / `y` 即按钮中心。
 * 命中检测、局部变换与渲染顺序由 `Node` 提供，见 `docs/HLD.md` §2 Layer 3。
 *
 * 抬起回调由 `InputManager` 恒定回给**按下时命中的节点**，因此手指移出按钮后抬起也会复位按压态；
 * 调用方仍可在需要时手动调用 `release()`（例如预览宿主在指针取消时兜底）。
 */

import { estimateTextWidth } from '../text-metrics.js';
import { drawPanel, THEME } from '../theme.js';
import { Node } from './node.js';

/** 按钮内边距与字号（保持原有命中区尺寸）。 */
const PADDING_X = 12;
const PADDING_Y = 8;
const LABEL_FONT_SIZE = 14;
const SUB_LABEL_FONT_SIZE = 10;
const LABEL_LINE_HEIGHT = 20;
const SUB_LABEL_LINE_HEIGHT = 14;
/** 最小按钮宽度，保证短标签（如【破】）也有可点面积。 */
const MIN_WIDTH = 72;

/** 按下时的缩放系数（触觉级微动）。 */
const DEFAULT_PRESS_SCALE = 0.92;

/** 未被选中时按钮描边与文字的颜色。 */
const DEFAULT_COLOR = THEME.jade;

const SUB_LABEL_COLOR = THEME.muted;
/** 禁用态描边与文字颜色。 */
const DISABLED_COLOR = THEME.edge;

export interface ButtonOptions {
  /** 主标题，如【吸纳】。 */
  readonly label: string;
  /** 副标题，如“生火(阳)+1”。 */
  readonly subLabel?: string;
  /** 主标题与描边颜色。 */
  readonly color?: string;
  /** 覆盖自动宽度。 */
  readonly width?: number;
  /** 覆盖自动高度。 */
  readonly height?: number;
  /** 初始是否置灰禁用（禁用时不可点击、不响应按压）。 */
  readonly disabled?: boolean;
  /** 按下时的缩放系数，默认 0.92。 */
  readonly pressScale?: number;
  /** 按下回调（命中并按下时触发，禁用态不触发）；用于「按住预览」这类交互。 */
  readonly onPress?: (button: Button) => void;
  /** 抬起 / 取消回调（与 `onPress` 配对，含手指移出后抬起的手动 / 自动复位）。 */
  readonly onRelease?: (button: Button) => void;
  readonly onTap?: (button: Button) => void;
}

export class Button extends Node {
  public readonly label: string;
  public readonly subLabel: string;
  public readonly color: string;
  /** 按下时的缩放系数。 */
  public pressScale: number;

  private readonly tapHandler?: (button: Button) => void;
  private readonly pressHandler?: (button: Button) => void;
  private readonly releaseHandler?: (button: Button) => void;
  private _disabled: boolean;
  private _width: number;
  private _height: number;

  public constructor(options: ButtonOptions) {
    super();
    this.label = options.label;
    this.subLabel = options.subLabel ?? '';
    this.color = options.color ?? DEFAULT_COLOR;
    this.tapHandler = options.onTap;
    this.pressHandler = options.onPress;
    this.releaseHandler = options.onRelease;
    this.pressScale = options.pressScale ?? DEFAULT_PRESS_SCALE;
    this._disabled = options.disabled ?? false;
    this._width = options.width ?? autoWidth(this.label, this.subLabel);
    this._height = options.height ?? autoHeight(this.subLabel);
    this.applySize();
    // `InputManager` 只认 `Node` 上的这三个回调字段，这里包一层接入按压缩放与禁用拦截。
    this.onTouchStart = () => this.press();
    this.onTouchEnd = () => this.release();
    this.onTap = () => {
      if (!this._disabled) {
        this.tapHandler?.(this);
      }
    };
  }

  /** 禁用态：置灰、不响应按压、不派发 `onTap`。 */
  public get disabled(): boolean {
    return this._disabled;
  }

  public set disabled(value: boolean) {
    this._disabled = value;
    if (value) {
      this.release();
    }
  }

  public get width(): number {
    return this._width;
  }

  /** 改尺寸时同步把命中区重新居中到原点。 */
  public set width(value: number) {
    this._width = value;
    this.applySize();
  }

  public get height(): number {
    return this._height;
  }

  public set height(value: number) {
    this._height = value;
    this.applySize();
  }

  public getSize(): { width: number; height: number } {
    return { width: this._width, height: this._height };
  }

  /** 按下：进入缩放反馈态（禁用时忽略）。 */
  public press(): void {
    if (this._disabled) {
      return;
    }
    this.scaleX = this.pressScale;
    this.scaleY = this.pressScale;
    this.pressHandler?.(this);
  }

  /** 抬起（或取消）：恢复常态缩放。 */
  public release(): void {
    this.scaleX = 1;
    this.scaleY = 1;
    this.releaseHandler?.(this);
  }

  /** 画一个底色方块 + 描边 + 标题/副标题；变换与透明度已由 `Node.render` 就位。 */
  protected renderSelf(ctx: CanvasRenderingContext2D): void {
    const left = -this._width / 2;
    const top = -this._height / 2;
    const accent = this._disabled ? DISABLED_COLOR : this.color;
    drawPanel(
      ctx,
      left,
      top,
      this._width,
      this._height,
      accent,
      this._disabled ? THEME.deep : this.scaleX < 1 ? THEME.panelRaised : THEME.panel,
    );
    ctx.fillStyle = accent;
    ctx.fillRect(left + 8, top + 9, 3, this._height - 18);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = this._disabled ? DISABLED_COLOR : THEME.ivory;
    ctx.font = `bold ${LABEL_FONT_SIZE}px ${THEME.font}`;
    ctx.fillText(this.label, 0, top + PADDING_Y + LABEL_LINE_HEIGHT / 2);
    if (this.subLabel !== '') {
      ctx.fillStyle = this._disabled ? DISABLED_COLOR : SUB_LABEL_COLOR;
      ctx.font = `${SUB_LABEL_FONT_SIZE}px ${THEME.font}`;
      ctx.fillText(
        this.subLabel,
        0,
        top + PADDING_Y + LABEL_LINE_HEIGHT + SUB_LABEL_LINE_HEIGHT / 2,
      );
    }
  }

  /** 把命中区重新居中到原点。 */
  private applySize(): void {
    this.hitArea = {
      x: -this._width / 2,
      y: -this._height / 2,
      width: this._width,
      height: this._height,
    };
  }
}

/** 自动宽度：左右内边距 + 较长一行的文本宽度，且不小于最小宽度。 */
function autoWidth(label: string, subLabel: string): number {
  const contentWidth = Math.ceil(
    Math.max(
      estimateTextWidth(label, LABEL_FONT_SIZE),
      estimateTextWidth(subLabel, SUB_LABEL_FONT_SIZE),
    ),
  );
  return Math.max(MIN_WIDTH, PADDING_X * 2 + contentWidth);
}

/** 自动高度：上下内边距 + 标题行 + 有副标题时的副标题行。 */
function autoHeight(subLabel: string): number {
  const lines = subLabel === '' ? LABEL_LINE_HEIGHT : LABEL_LINE_HEIGHT + SUB_LABEL_LINE_HEIGHT;
  return PADDING_Y * 2 + lines;
}
