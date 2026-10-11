/**
 * 轻量场景树基座（Layer 3）：节点持有局部变换与子节点，负责递归渲染。
 *
 * 坐标约定：`x` / `y` / `scaleX` / `scaleY` 都相对**父节点**的坐标系（根舞台的父坐标系即屏幕）。
 * 渲染时先应用自身变换，再递归子节点，因此子节点天然继承父节点的位移、缩放与透明度。
 *
 * 契约归 `docs/HLD.md` §2 Layer 3 与 ADR 0005。
 */

/** 触摸回调。坐标为屏幕坐标（与命中检测的入参同一空间）。 */
export type TouchHandler = (screenX: number, screenY: number) => void;

/** 局部命中矩形：`x` / `y` 是左上角在节点局部坐标里的偏移，可传负值实现以原点为中心。 */
export interface HitArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Node {
  public x = 0;
  public y = 0;
  public scaleX = 1;
  public scaleY = 1;
  /** 局部透明度，最终渲染透明度是整条祖先链的乘积。 */
  public alpha = 1;
  public visible = true;
  /** 局部命中矩形；不设置即不参与命中检测（触摸会穿透到下层节点）。 */
  public hitArea: HitArea | null = null;

  public onTouchStart?: TouchHandler;
  public onTouchEnd?: TouchHandler;
  public onTap?: TouchHandler;

  private _parent: Node | null = null;
  private readonly _children: Node[] = [];

  public get parent(): Node | null {
    return this._parent;
  }

  public get children(): readonly Node[] {
    return this._children;
  }

  /** 挂载子节点；若子节点已有父节点则先摘除（即「移动」而非「复制」）。 */
  public addChild(child: Node): this {
    if (isSelfOrAncestorOf(child, this)) {
      throw new Error('场景树不允许成环：不能把自身或祖先挂为自己的子节点。');
    }
    child.removeFromParent();
    child._parent = this;
    this._children.push(child);
    return this;
  }

  /** 摘除子节点；不是自己的孩子时静默忽略。 */
  public removeChild(child: Node): void {
    const index = this._children.indexOf(child);
    if (index < 0) {
      return;
    }
    this._children.splice(index, 1);
    child._parent = null;
  }

  public removeFromParent(): void {
    this._parent?.removeChild(this);
  }

  /** 递归渲染：应用局部变换与透明度后先画自己，再按挂载顺序画子节点（后者覆盖前者）。 */
  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.visible || this.alpha <= 0) {
      return;
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scaleX, this.scaleY);
    ctx.globalAlpha *= this.alpha;
    this.renderSelf(ctx);
    for (const child of this._children) {
      child.render(ctx);
    }
    ctx.restore();
  }

  /** 子类在这里画自己；变换与透明度已由 `render` 就位。 */
  protected renderSelf(_ctx: CanvasRenderingContext2D): void {}

  /**
   * 自顶向下命中检测：`(x, y)` 与 `x` / `y` 同一坐标系（即父节点坐标系，根舞台即屏幕坐标）。
   * 命中时返回该节点，未命中返回 `null`。
   */
  public hitTest(x: number, y: number): Node | null {
    if (!this.visible || this.alpha <= 0 || this.scaleX === 0 || this.scaleY === 0) {
      return null;
    }
    const localX = (x - this.x) / this.scaleX;
    const localY = (y - this.y) / this.scaleY;
    for (let index = this._children.length - 1; index >= 0; index -= 1) {
      const hit = this._children[index].hitTest(localX, localY);
      if (hit !== null) {
        return hit;
      }
    }
    return this.containsPoint(localX, localY) ? this : null;
  }

  /** 局部坐标是否落在命中区（默认取 `hitArea`）；子类可覆盖以实现圆形等异形命中区。 */
  public containsPoint(localX: number, localY: number): boolean {
    const area = this.hitArea;
    if (area === null) {
      return false;
    }
    return (
      localX >= area.x &&
      localX <= area.x + area.width &&
      localY >= area.y &&
      localY <= area.y + area.height
    );
  }
}

/** `candidate` 是不是 `node` 自身或其祖先（用于拦成环）。 */
function isSelfOrAncestorOf(candidate: Node, node: Node): boolean {
  for (let current: Node | null = node; current !== null; current = current.parent) {
    if (current === candidate) {
      return true;
    }
  }
  return false;
}
