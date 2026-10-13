/**
 * 伪 Canvas 2D 上下文（测试共用）：只记录「有没有落笔」与「落了什么字」，
 * 不关心具体像素，也不做变换矩阵运算。
 *
 * 需要真实变换语义（局部变换复合、alpha 继承）的用例请用 `minigame-scene-graph.test.ts`
 * 里那套带矩阵的伪上下文——两者用途不同，不要合并。
 *
 * 用法：`view.render(ctx.asContext())` 之后断言 `ctx.drawCallCount()` / `ctx.texts`。
 */
export class RecordingContext {
  private _globalAlpha = 1;
  public fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  public strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  public lineWidth = 1;
  public lineCap: CanvasLineCap = 'butt';
  public lineJoin: CanvasLineJoin = 'miter';
  public readonly paths: {
    points: { x: number; y: number }[];
    color: string;
    strokeWidth: number;
    offset: { x: number; y: number };
  }[] = [];
  private pathPoints: { x: number; y: number }[] = [];
  private offset = { x: 0, y: 0 };
  private readonly alphaStack: number[] = [];
  private offsetStack: { x: number; y: number }[] = [];
  public font = '';
  public textAlign: CanvasTextAlign = 'start';
  public textBaseline: CanvasTextBaseline = 'alphabetic';
  public shadowColor = '#000';
  public shadowBlur = 0;
  /** 按调用顺序记录全部指令名（含 save / translate 这类状态指令）。 */
  public readonly calls: string[] = [];
  /** 按赋值顺序记录每一次 `globalAlpha` 写入（呼吸节拍就是一条透明度轨迹）。 */
  public readonly alphas: number[] = [];
  public readonly gradients: {
    x0: number;
    y0: number;
    r0: number;
    x1: number;
    y1: number;
    r1: number;
    stops: { offset: number; color: string }[];
  }[] = [];
  public readonly arcs: {
    x: number;
    y: number;
    radius: number;
    start: number;
    end: number;
    anticlockwise: boolean;
    /** 该弧落笔时的 `globalAlpha`（供「同相位呼吸」这类透明度断言使用）。 */
    alpha: number;
  }[] = [];
  public readonly images: {
    image: CanvasImageSource;
    alpha: number;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    x: number;
    y: number;
    w: number;
    h: number;
  }[] = [];
  /** 按调用顺序记录落笔文本（文本、锚点、字号），供「文本不越界」这类版面断言使用。 */
  public readonly texts: { text: string; x: number; y: number; fontSize: number }[] = [];
  /** 按调用顺序记录落笔矩形（坐标、尺寸与当时的填充色），供姿势与配色断言使用。 */
  public readonly rects: { x: number; y: number; w: number; h: number; color: string }[] = [];
  public readonly strokedRects: { x: number; y: number; w: number; h: number; color: string }[] =
    [];
  /** 按调用顺序记录 translate 的位移参数（不参与坐标换算，供「呼吸浮动」这类断言使用）。 */
  public readonly translations: { x: number; y: number }[] = [];
  /** 按调用顺序记录 scale 的缩放参数（节点自身的 1:1 变换与真正的放大都记在这里）。 */
  public readonly scales: { x: number; y: number }[] = [];

  public save(): void {
    this.calls.push('save');
    this.alphaStack.push(this.globalAlpha);
    this.offsetStack.push({ ...this.offset });
  }
  public restore(): void {
    this.calls.push('restore');
    this.globalAlpha = this.alphaStack.pop() ?? 1;
    this.offset = this.offsetStack.pop() ?? { x: 0, y: 0 };
  }
  public translate(x: number, y: number): void {
    this.calls.push('translate');
    this.translations.push({ x, y });
    this.offset = { x: this.offset.x + x, y: this.offset.y + y };
  }
  public scale(x: number, y: number): void {
    this.calls.push('scale');
    this.scales.push({ x, y });
  }
  public rotate(_angle: number): void {
    this.calls.push('rotate');
  }
  public beginPath(): void {
    this.calls.push('beginPath');
    this.pathPoints = [];
  }
  public closePath(): void {
    this.calls.push('closePath');
  }
  public arc(
    _x: number,
    _y: number,
    _radius: number,
    _start: number,
    _end: number,
    _anticlockwise?: boolean,
  ): void {
    this.calls.push('arc');
    this.arcs.push({
      x: _x,
      y: _y,
      radius: _radius,
      start: _start,
      end: _end,
      anticlockwise: _anticlockwise ?? false,
      alpha: this.globalAlpha,
    });
  }
  public clip(): void {
    this.calls.push('clip');
  }
  public rect(_x: number, _y: number, _w: number, _h: number): void {
    this.calls.push('rect');
  }
  public roundRect(
    _x: number,
    _y: number,
    _w: number,
    _h: number,
    _radii?: number | number[],
  ): void {
    this.calls.push('roundRect');
  }
  public moveTo(x: number, y: number): void {
    this.calls.push('moveTo');
    this.pathPoints.push({ x, y });
  }
  public lineTo(x: number, y: number): void {
    this.calls.push('lineTo');
    this.pathPoints.push({ x, y });
  }
  public quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.calls.push('quadraticCurveTo');
    // Bezier curves remain inside the convex hull of their control points.
    this.pathPoints.push({ x: cx, y: cy }, { x, y });
  }
  public stroke(): void {
    this.calls.push('stroke');
    this.paths.push({
      points: [...this.pathPoints],
      color: String(this.strokeStyle),
      strokeWidth: this.lineWidth,
      offset: { ...this.offset },
    });
  }
  public fill(): void {
    this.calls.push('fill');
    this.paths.push({
      points: [...this.pathPoints],
      color: String(this.fillStyle),
      strokeWidth: 0,
      offset: { ...this.offset },
    });
  }
  public fillRect(x: number, y: number, w: number, h: number): void {
    this.calls.push('fillRect');
    this.rects.push({ x, y, w, h, color: String(this.fillStyle) });
  }
  public strokeRect(x: number, y: number, w: number, h: number): void {
    this.calls.push('strokeRect');
    this.strokedRects.push({ x, y, w, h, color: String(this.strokeStyle) });
  }
  public drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    this.calls.push('drawImage');
    this.images.push({ image, alpha: this.globalAlpha, sx, sy, sw, sh, x, y, w, h });
  }
  public fillText(text: string, x: number, y: number): void {
    this.calls.push('fillText');
    // 字号从 `font` 里粗读：'9px monospace' -> 9；'bold 12px monospace' 读不出数字时按 10 计。
    this.texts.push({ text, x, y, fontSize: Number.parseFloat(this.font) || 10 });
  }
  /** 当前的全局不透明度；setter 把每次赋值记进 `alphas`（画布内部也是属性，测试要能读到赋值轨迹）。 */
  public get globalAlpha(): number {
    return this._globalAlpha;
  }
  public set globalAlpha(alpha: number) {
    this._globalAlpha = alpha;
    this.alphas.push(alpha);
  }

  public setLineDash(_segments: number[]): void {
    this.calls.push('setLineDash');
  }
  public createRadialGradient(
    _x0: number,
    _y0: number,
    _r0: number,
    _x1: number,
    _y1: number,
    _r1: number,
  ): CanvasGradient {
    this.calls.push('createRadialGradient');
    const gradient = {
      x0: _x0,
      y0: _y0,
      r0: _r0,
      x1: _x1,
      y1: _y1,
      r1: _r1,
      stops: [] as { offset: number; color: string }[],
    };
    this.gradients.push(gradient);
    return {
      addColorStop: (offset: number, color: string) => gradient.stops.push({ offset, color }),
    } as unknown as CanvasGradient;
  }
  public asContext(): CanvasRenderingContext2D {
    return this as unknown as CanvasRenderingContext2D;
  }
  /** 真正落笔的绘制指令数（排除 save / translate 之类的状态指令）。 */
  public drawCallCount(): number {
    return this.calls.filter(
      (call) =>
        call === 'fill' ||
        call === 'stroke' ||
        call === 'fillRect' ||
        call === 'fillText' ||
        call === 'drawImage',
    ).length;
  }
}
