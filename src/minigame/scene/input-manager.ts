import { Node } from './node.js';

/** 微信小游戏触摸事件里本层用到的字段（`touches` / `changedTouches` 均为触点列表）。 */
export interface TouchEventLike {
  touches?: ReadonlyArray<{ clientX: number; clientY: number }>;
  changedTouches?: ReadonlyArray<{ clientX: number; clientY: number }>;
}

/** 触摸事件源：`wx` 在结构上满足本接口。 */
export interface TouchEventSource {
  onTouchStart(callback: (event: TouchEventLike) => void): void;
  onTouchEnd(callback: (event: TouchEventLike) => void): void;
}

/**
 * 触控调度器：把屏幕触摸输入翻译成场景树上的命中检测与事件派发。
 *
 * 派发规则：命中检测自顶向下，事件只交给**首个**命中的节点，不会冒泡到祖先、也不会穿透到下层兄弟
 * 节点（即「阻止冒泡 / 阻止穿透」）。回调收到的坐标是屏幕坐标。引擎只跟踪单指（首个触点）。
 */
export class InputManager {
  /** 本次触摸按下时命中的节点；抬起时与同一节点重合才算一次点击。 */
  private pressedNode: Node | null = null;

  public constructor(private readonly stage: Node) {}

  public handleTouchStart(screenX: number, screenY: number): void {
    const target = this.stage.hitTest(screenX, screenY);
    this.pressedNode = target;
    target?.onTouchStart?.(screenX, screenY);
  }

  public handleTouchEnd(screenX: number, screenY: number): void {
    const target = this.stage.hitTest(screenX, screenY);
    target?.onTouchEnd?.(screenX, screenY);
    const pressed = this.pressedNode;
    this.pressedNode = null;
    if (pressed !== null && pressed === target) {
      pressed.onTap?.(screenX, screenY);
    }
  }

  /** 绑定 `wx.onTouchStart` / `wx.onTouchEnd` 风格的事件源。 */
  public bindTouchEvents(source: TouchEventSource): void {
    source.onTouchStart((event) => {
      const point = firstTouch(event, false);
      if (point !== null) {
        this.handleTouchStart(point.x, point.y);
      }
    });
    source.onTouchEnd((event) => {
      const point = firstTouch(event, true);
      if (point !== null) {
        this.handleTouchEnd(point.x, point.y);
      }
    });
  }
}

/**
 * 取首个触点坐标。抬起事件优先读 `changedTouches`（此时 `touches` 里剩下的是别的仍按着的手指）。
 */
function firstTouch(
  event: TouchEventLike,
  preferChanged: boolean,
): { x: number; y: number } | null {
  const primary = preferChanged ? event.changedTouches : event.touches;
  const fallback = preferChanged ? event.touches : event.changedTouches;
  const touch = primary?.[0] ?? fallback?.[0];
  return touch === undefined ? null : { x: touch.clientX, y: touch.clientY };
}
