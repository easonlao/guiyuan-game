import { describe, it, expect } from 'vitest';
import { Container } from '../../src/minigame/scene/container.js';
import { Node } from '../../src/minigame/scene/node.js';

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * 伪 Canvas 2D 上下文：只实现场景树契约用到的部分（变换矩阵 + globalAlpha + save/restore），
 * 语义与浏览器 Canvas 2D 一致，用来观察「局部变换是否被正确复合」。
 */
class FakeCanvasContext {
  public globalAlpha = 1;
  private matrix: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  private readonly stack: { m: Matrix; alpha: number }[] = [];

  public save(): void {
    this.stack.push({ m: { ...this.matrix }, alpha: this.globalAlpha });
  }

  public restore(): void {
    const saved = this.stack.pop();
    if (saved) {
      this.matrix = saved.m;
      this.globalAlpha = saved.alpha;
    }
  }

  public translate(x: number, y: number): void {
    this.matrix.e += this.matrix.a * x + this.matrix.c * y;
    this.matrix.f += this.matrix.b * x + this.matrix.d * y;
  }

  public scale(x: number, y: number): void {
    this.matrix.a *= x;
    this.matrix.b *= x;
    this.matrix.c *= y;
    this.matrix.d *= y;
  }

  /** 当前变换矩阵的平移分量，即调用点在世界（屏幕）空间的位置。 */
  public origin(): { x: number; y: number } {
    return { x: this.matrix.e, y: this.matrix.f };
  }

  public asContext(): CanvasRenderingContext2D {
    return this as unknown as CanvasRenderingContext2D;
  }
}

/** 探针节点：在 renderSelf 里记录自己「被画」时看到的变换与透明度。 */
class ProbeNode extends Node {
  public readonly draws: { x: number; y: number; alpha: number }[] = [];

  public constructor(private readonly context: FakeCanvasContext) {
    super();
  }

  protected override renderSelf(_ctx: CanvasRenderingContext2D): void {
    const origin = this.context.origin();
    this.draws.push({ x: origin.x, y: origin.y, alpha: this.context.globalAlpha });
  }
}

describe('Minigame scene graph: Container local transforms', () => {
  it('composes nested local position/scale and propagates alpha to descendants', () => {
    const ctx = new FakeCanvasContext();
    const stage = new Container();
    const outer = new Container();
    outer.x = 100;
    outer.y = 50;
    outer.scaleX = 2;
    outer.scaleY = 3;
    outer.alpha = 0.5;
    const inner = new Container();
    inner.x = 10;
    inner.y = 20;
    inner.alpha = 0.5;
    const probe = new ProbeNode(ctx);
    probe.x = 5;
    probe.y = 5;

    stage.addChild(outer);
    outer.addChild(inner);
    inner.addChild(probe);

    stage.render(ctx.asContext());

    // 手算：x = 100 + 2*(10 + 1*5) = 130，y = 50 + 3*(20 + 1*5) = 125，alpha = 0.5*0.5*1 = 0.25
    expect(probe.draws).toEqual([{ x: 130, y: 125, alpha: 0.25 }]);
  });

  it('skips a subtree whose Container is not visible', () => {
    const ctx = new FakeCanvasContext();
    const stage = new Container();
    const hidden = new Container();
    hidden.visible = false;
    const hiddenProbe = new ProbeNode(ctx);
    const shownProbe = new ProbeNode(ctx);

    stage.addChild(hidden);
    hidden.addChild(hiddenProbe);
    stage.addChild(shownProbe);

    stage.render(ctx.asContext());

    expect(hiddenProbe.draws).toEqual([]);
    expect(shownProbe.draws).toHaveLength(1);
  });

  it('skips a subtree whose Container is fully transparent', () => {
    const ctx = new FakeCanvasContext();
    const stage = new Container();
    const fadedOut = new Container();
    fadedOut.alpha = 0;
    const probe = new ProbeNode(ctx);

    stage.addChild(fadedOut);
    fadedOut.addChild(probe);

    stage.render(ctx.asContext());

    expect(probe.draws).toEqual([]);
  });
});

describe('Minigame scene graph: hierarchy mounting', () => {
  it('moves a node to its new parent when mounted a second time', () => {
    const oldParent = new Container();
    const newParent = new Container();
    const child = new Node();

    oldParent.addChild(child);
    newParent.addChild(child);

    expect(oldParent.children).toEqual([]);
    expect(newParent.children).toEqual([child]);
    expect(child.parent).toBe(newParent);
  });

  it('detaches a node from its parent', () => {
    const parent = new Container();
    const child = new Node();
    parent.addChild(child);

    child.removeFromParent();

    expect(parent.children).toEqual([]);
    expect(child.parent).toBeNull();
  });

  it('ignores removing a node that is not one of its children', () => {
    const parent = new Container();
    const kept = new Node();
    const stranger = new Node();
    parent.addChild(kept);

    parent.removeChild(stranger);

    expect(parent.children).toEqual([kept]);
    expect(stranger.parent).toBeNull();
  });

  it('rejects mounting a node onto itself or its own ancestor', () => {
    const root = new Container();
    const child = new Container();
    root.addChild(child);

    expect(() => root.addChild(root)).toThrow();
    expect(() => child.addChild(root)).toThrow();

    expect(root.parent).toBeNull();
    expect(child.children).toEqual([]);
  });
});

describe('Minigame scene graph: hitTest', () => {
  it('converts the touch point into nested local coordinates before testing the hit area', () => {
    const stage = new Container();
    const outer = new Container();
    outer.x = 100;
    outer.y = 50;
    outer.scaleX = 2;
    outer.scaleY = 2;
    const leaf = new Node();
    leaf.x = 10;
    leaf.y = 10;
    leaf.hitArea = { x: -5, y: -5, width: 10, height: 10 };
    stage.addChild(outer);
    outer.addChild(leaf);

    // leaf 原点在世界坐标 (100 + 2*10, 50 + 2*10) = (120, 70)，缩放 2 使其命中半宽变成 10。
    expect(stage.hitTest(120, 70)).toBe(leaf);
    expect(stage.hitTest(130, 70)).toBe(leaf);
    expect(stage.hitTest(131, 70)).toBeNull();
    expect(stage.hitTest(0, 0)).toBeNull();
  });

  it('returns the top-most node when overlapping siblings are both hit', () => {
    const stage = new Container();
    const under = new Node();
    under.hitArea = { x: -20, y: -20, width: 40, height: 40 };
    const over = new Node();
    over.hitArea = { x: -20, y: -20, width: 40, height: 40 };

    stage.addChild(under);
    stage.addChild(over);

    // 后挂载的兄弟节点渲染在上层，因此先被命中，触摸不会穿透到 under。
    expect(stage.hitTest(0, 0)).toBe(over);
  });

  it('prefers a child node over the parent hit area at the same point', () => {
    const parent = new Node();
    parent.hitArea = { x: -30, y: -30, width: 60, height: 60 };
    const child = new Node();
    child.hitArea = { x: -5, y: -5, width: 10, height: 10 };
    parent.addChild(child);

    expect(parent.hitTest(0, 0)).toBe(child);
    expect(parent.hitTest(20, 20)).toBe(parent);
  });

  it('does not hit hidden or fully transparent nodes', () => {
    const stage = new Container();
    const hidden = new Node();
    hidden.visible = false;
    hidden.hitArea = { x: -20, y: -20, width: 40, height: 40 };
    const transparent = new Node();
    transparent.alpha = 0;
    transparent.hitArea = { x: -20, y: -20, width: 40, height: 40 };
    stage.addChild(hidden);
    stage.addChild(transparent);

    expect(stage.hitTest(0, 0)).toBeNull();
  });
});
