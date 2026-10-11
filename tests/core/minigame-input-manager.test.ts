import { describe, it, expect } from 'vitest';
import { Container } from '../../src/minigame/scene/container.js';
import { InputManager, TouchEventLike } from '../../src/minigame/scene/input-manager.js';
import { Node } from '../../src/minigame/scene/node.js';

/** 一个 100x40、以原点为中心的交互节点，挂在屏幕 (100, 100) 处。 */
function createInteractiveNode(): Node {
  const node = new Node();
  node.x = 100;
  node.y = 100;
  node.hitArea = { x: -50, y: -20, width: 100, height: 40 };
  return node;
}

/** 模拟 `wx` 的触摸事件源：记录回调，由测试手动发事件。 */
class FakeTouchSource {
  private startHandler?: (event: TouchEventLike) => void;
  private endHandler?: (event: TouchEventLike) => void;

  public onTouchStart(callback: (event: TouchEventLike) => void): void {
    this.startHandler = callback;
  }

  public onTouchEnd(callback: (event: TouchEventLike) => void): void {
    this.endHandler = callback;
  }

  public emitStart(event: TouchEventLike): void {
    this.startHandler?.(event);
  }

  public emitEnd(event: TouchEventLike): void {
    this.endHandler?.(event);
  }
}

describe('Minigame InputManager: touch dispatch', () => {
  it('dispatches touch start/end to the hit node with screen coordinates', () => {
    const stage = new Container();
    const node = createInteractiveNode();
    const starts: [number, number][] = [];
    const ends: [number, number][] = [];
    node.onTouchStart = (x, y) => starts.push([x, y]);
    node.onTouchEnd = (x, y) => ends.push([x, y]);
    stage.addChild(node);
    const input = new InputManager(stage);

    input.handleTouchStart(120, 110);
    input.handleTouchEnd(120, 110);

    expect(starts).toEqual([[120, 110]]);
    expect(ends).toEqual([[120, 110]]);
  });

  it('dispatches nothing when the touch misses every hit area', () => {
    const stage = new Container();
    const node = createInteractiveNode();
    const starts: [number, number][] = [];
    node.onTouchStart = (x, y) => starts.push([x, y]);
    stage.addChild(node);
    const input = new InputManager(stage);

    input.handleTouchStart(0, 0);
    input.handleTouchEnd(0, 0);

    expect(starts).toEqual([]);
  });

  it('fires onTap when the touch starts and ends on the same node', () => {
    const stage = new Container();
    const node = createInteractiveNode();
    const taps: [number, number][] = [];
    node.onTap = (x, y) => taps.push([x, y]);
    stage.addChild(node);
    const input = new InputManager(stage);

    input.handleTouchStart(120, 110);
    input.handleTouchEnd(125, 115);

    expect(taps).toEqual([[125, 115]]);
  });

  it('does not fire onTap when the finger lifts outside the node', () => {
    const stage = new Container();
    const node = createInteractiveNode();
    const taps: [number, number][] = [];
    node.onTap = (x, y) => taps.push([x, y]);
    stage.addChild(node);
    const input = new InputManager(stage);

    input.handleTouchStart(120, 110);
    input.handleTouchEnd(0, 0);

    expect(taps).toEqual([]);
  });

  it('does not fire onTap when the touch starts outside the node', () => {
    const stage = new Container();
    const node = createInteractiveNode();
    const taps: [number, number][] = [];
    node.onTap = (x, y) => taps.push([x, y]);
    stage.addChild(node);
    const input = new InputManager(stage);

    input.handleTouchStart(0, 0);
    input.handleTouchEnd(120, 110);

    expect(taps).toEqual([]);
  });

  it('delivers the touch only to the top-most overlapping node', () => {
    const stage = new Container();
    const under = createInteractiveNode();
    const over = createInteractiveNode();
    const taps: string[] = [];
    under.onTap = () => taps.push('under');
    over.onTap = () => taps.push('over');
    stage.addChild(under);
    stage.addChild(over);
    const input = new InputManager(stage);

    input.handleTouchStart(120, 110);
    input.handleTouchEnd(120, 110);

    expect(taps).toEqual(['over']);
  });
});

describe('Minigame InputManager: wx touch event source', () => {
  it('translates wx touch events into hit-test dispatch', () => {
    const stage = new Container();
    const node = createInteractiveNode();
    const starts: [number, number][] = [];
    const taps: [number, number][] = [];
    node.onTouchStart = (x, y) => starts.push([x, y]);
    node.onTap = (x, y) => taps.push([x, y]);
    stage.addChild(node);
    const input = new InputManager(stage);
    const source = new FakeTouchSource();
    input.bindTouchEvents(source);

    source.emitStart({ touches: [{ clientX: 120, clientY: 110 }] });
    // 手指抬起：触点只在 changedTouches 里，touches 为空。
    source.emitEnd({ touches: [], changedTouches: [{ clientX: 122, clientY: 112 }] });

    expect(starts).toEqual([[120, 110]]);
    expect(taps).toEqual([[122, 112]]);
  });

  it('ignores touch events that carry no touch point', () => {
    const stage = new Container();
    const node = createInteractiveNode();
    const starts: [number, number][] = [];
    node.onTouchStart = (x, y) => starts.push([x, y]);
    stage.addChild(node);
    const input = new InputManager(stage);
    const source = new FakeTouchSource();
    input.bindTouchEvents(source);

    source.emitStart({ touches: [] });
    source.emitStart({});

    expect(starts).toEqual([]);
  });
});
