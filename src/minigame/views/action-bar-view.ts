/**
 * 操作面板视图（Layer 3）：把 `TurnManager` 的当前合法动作候选投影成一排按钮。
 *
 * 数据流是单向的（`docs/LLD.md` §4）：本视图只读 `getAvailableActions()` 排版，
 * 点击后把候选载荷原样交给 `executeAction()`；不缓存、不改写任何核心状态。
 *
 * 自动尺寸、按压缩放与禁用态由 `Button` 提供；本视图只负责「谁可用、怎么排、点了交给谁」。
 */

import { ActionPayload } from '../../core/types/domain.js';
import { TurnManager, TurnPhase } from '../../core/logic/TurnManager.js';
import { formatActionButton } from '../action-button-formatter.js';
import { Button } from '../scene/button.js';
import { Container } from '../scene/container.js';

/** 默认单行最多按钮数。 */
const DEFAULT_MAX_COLUMNS = 2;
/** 默认按钮水平/垂直间距。 */
const DEFAULT_GAP_X = 12;
const DEFAULT_GAP_Y = 10;

export interface ActionBarViewOptions {
  /** 核心状态机：本视图的唯一数据来源与动作出口。 */
  readonly turnManager: TurnManager;
  /** 面板可用宽度（父坐标系），按钮按列等宽铺满。 */
  readonly width: number;
  /** 面板顶边在父坐标系里的 y，默认 0。 */
  readonly y?: number;
  /** 单行最多按钮数，默认 2。 */
  readonly maxColumns?: number;
  readonly gapX?: number;
  readonly gapY?: number;
  /** 是否允许玩家操作（如非玩家回合置 false）；默认 true。 */
  readonly interactive?: boolean;
}

export class ActionBarView extends Container {
  /** 面板是否允许玩家操作；改完需调用 `refresh()` 重新投影。 */
  public interactive: boolean;

  private readonly turnManager: TurnManager;
  private readonly availableWidth: number;
  private readonly maxColumns: number;
  private readonly gapX: number;
  private readonly gapY: number;
  /** 按动作键复用按钮，避免每次重排都重建节点（保住按压反馈与节点身份）。 */
  private readonly buttonsByKey = new Map<string, Button>();
  /** 当前排版顺序的按钮（与 `getAvailableActions()` 顺序一致）。 */
  private readonly buttons: Button[] = [];
  private readonly unsubscribes: (() => void)[] = [];

  public constructor(options: ActionBarViewOptions) {
    super();
    this.turnManager = options.turnManager;
    this.availableWidth = options.width;
    this.maxColumns = options.maxColumns ?? DEFAULT_MAX_COLUMNS;
    this.gapX = options.gapX ?? DEFAULT_GAP_X;
    this.gapY = options.gapY ?? DEFAULT_GAP_Y;
    this.interactive = options.interactive ?? true;
    this.y = options.y ?? 0;
    // 订阅核心事件：回合一旦结算，按钮立刻置灰，不会留下能点的陈旧按钮。
    this.unsubscribes.push(
      this.turnManager.getEventBus().on('action:executed', () => this.refresh()),
    );
  }

  /** 当前排版的按钮，顺序与候选动作一致。 */
  public getButtons(): readonly Button[] {
    return this.buttons;
  }

  /**
   * 按 `TurnManager` 的最新候选动作重新投影：
   * 新候选补按钮、消失的候选摘按钮、当前不可执行的候选一律置灰。
   */
  public refresh(): void {
    const actions = this.turnManager.getAvailableActions();
    const enabled = this.canExecuteNow();

    const liveKeys = new Set(actions.map(actionKey));
    for (const [key, button] of this.buttonsByKey) {
      if (!liveKeys.has(key)) {
        this.removeChild(button);
        this.buttonsByKey.delete(key);
      }
    }

    this.buttons.length = 0;
    for (const action of actions) {
      const key = actionKey(action);
      let button = this.buttonsByKey.get(key);
      if (button === undefined) {
        button = this.createButton(action);
        this.buttonsByKey.set(key, button);
        this.addChild(button);
      }
      button.disabled = !enabled;
      this.buttons.push(button);
    }

    this.layout();
  }

  /** 退订核心事件（场景销毁时调用）。 */
  public dispose(): void {
    for (const unsubscribe of this.unsubscribes) {
      unsubscribe();
    }
    this.unsubscribes.length = 0;
  }

  private createButton(action: ActionPayload): Button {
    const formatted = formatActionButton(action);
    return new Button({
      label: formatted.label,
      subLabel: formatted.subLabel,
      color: formatted.color,
      onTap: () => this.dispatch(action),
    });
  }

  /** 派发前再校验一次：只有仍处于可执行阶段、且仍是候选的动作才会提交给核心。 */
  private dispatch(action: ActionPayload): void {
    if (!this.canExecuteNow()) {
      return;
    }
    if (!this.turnManager.getAvailableActions().some((c) => actionKey(c) === actionKey(action))) {
      return;
    }
    this.turnManager.executeAction(action);
  }

  /** 核心当前是否接受动作提交：面板可交互、非终局，且处于动作执行阶段。 */
  private canExecuteNow(): boolean {
    if (!this.interactive) {
      return false;
    }
    if (this.turnManager.getState().isGameOver) {
      return false;
    }
    return this.turnManager.getCurrentPhase() === TurnPhase.EXECUTE_ACTION;
  }

  /** 等宽网格排版：`columns` 列、行内垂直居中，行高取该行最高的按钮。 */
  private layout(): void {
    const count = this.buttons.length;
    if (count === 0) {
      return;
    }
    const columns = Math.max(1, Math.min(this.maxColumns, count));
    const cellWidth = Math.floor((this.availableWidth - (columns - 1) * this.gapX) / columns);
    const rowHeights: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const row = Math.floor(index / columns);
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, this.buttons[index].height);
    }

    let cursor = 0;
    for (let row = 0; row < rowHeights.length; row += 1) {
      const rowHeight = rowHeights[row];
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        if (index >= count) {
          break;
        }
        const button = this.buttons[index];
        button.width = cellWidth;
        button.x = column * (cellWidth + this.gapX) + cellWidth / 2;
        button.y = cursor + rowHeight / 2;
      }
      cursor += rowHeight + this.gapY;
    }
  }
}

/** 动作键：逐字段标识一个载荷，用于把候选与已排版的按钮对上。 */
function actionKey(action: ActionPayload): string {
  return [
    action.actionType,
    action.player,
    action.element ?? '',
    action.sourceElement ?? '',
    action.polarity ?? '',
    action.consumePolarity ?? '',
  ].join('|');
}
