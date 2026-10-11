import {
  BoardState,
  GameState,
  NodeLevel,
  PlayerId,
  Polarity,
  WuXing,
  GENERATION_CYCLE,
  OVERCOMING_CYCLE,
} from '../../core/types/domain.js';
import { WUXING_PALETTE } from '../pixel-art.js';
import { Container } from '../scene/container.js';

/** 五行主印个数，也是相生环的边数。 */
const WUXING_COUNT = 5;
/** 相生环相邻方位夹角（2π / 5）。 */
const RING_STEP = (Math.PI * 2) / WUXING_COUNT;

/** 法盘极坐标布局参数（单位：像素 / 弧度）。 */
export interface BoardViewLayout {
  /** 法盘圆心（相对父节点坐标系）。 */
  centerX: number;
  centerY: number;
  /** 五行主印所在环的半径。 */
  sealRadius: number;
  /** 阴阳槽位所在外环的半径。 */
  slotRadius: number;
  /** 同一五行的两个槽位相对主印方位的角度偏移（阴侧逆时针、阳侧顺时针）。 */
  slotSpread: number;
  /** 首个方位（木）的角度，默认正上方。 */
  startAngle: number;
}

/** 视口自适应时，环半径占视口短边的比例。 */
const SEAL_RADIUS_RATIO = 0.26;
const SLOT_RADIUS_RATIO = 0.37;

export const DEFAULT_BOARD_LAYOUT: BoardViewLayout = {
  centerX: 0,
  centerY: 0,
  sealRadius: 120,
  slotRadius: 170,
  slotSpread: 0.45,
  startAngle: -Math.PI / 2,
};

/** 单个五行主印的投影视图。 */
export interface BoardElementView {
  readonly element: WuXing;
  readonly angle: number;
  readonly x: number;
  readonly y: number;
  readonly yin: NodeLevel;
  readonly yang: NodeLevel;
  /** 归一：阴侧与阳侧均已点亮（均 ≥ 1）。 */
  readonly isGuiYi: boolean;
  /** 亢极：阴侧与阳侧均达加持（(2, 2)）。 */
  readonly isKangJi: boolean;
}

/** 单个阴阳槽位的投影视图。 */
export interface BoardSlotView {
  readonly element: WuXing;
  readonly polarity: Polarity;
  readonly level: NodeLevel;
  readonly angle: number;
  readonly x: number;
  readonly y: number;
  /** 所在主印的归一高亮（节点级，两侧槽位共享）。 */
  readonly isGuiYi: boolean;
  /** 所在主印的亢极高亮（节点级，两侧槽位共享）。 */
  readonly isKangJi: boolean;
}

/** 虚空：未指定快照或快照缺省时的槽位等级。 */
const VOID_LEVEL: NodeLevel = 0;

/** 连线类型：相生环（外环）与相克星（内星）。 */
export type BoardConnectionKind = 'generation' | 'overcoming';

/* 法盘配色（仅本视图使用，不进共享主题模块）。 */
const BOARD_BG_COLOR = '#111827';
const VOID_COLOR = '#374151';
const BLESSED_COLOR = '#f6e05e';
const GUI_YI_COLOR = '#ecc94b';
const SLOT_TEXT_COLOR = '#e2e8f0';
const CONNECTION_IDLE: Record<BoardConnectionKind, string> = {
  generation: '#2f4f3f',
  overcoming: '#4a2a2a',
};
const CONNECTION_ACTIVE: Record<BoardConnectionKind, string> = {
  generation: '#48bb78',
  overcoming: '#e53e3e',
};

/** 一条生克连线的投影视图。 */
export interface BoardConnectionView {
  readonly kind: BoardConnectionKind;
  readonly from: WuXing;
  readonly to: WuXing;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** 表现态：源主印任一侧已点亮（≥1）时，该路径视为有能量流动。 */
  readonly active: boolean;
}

/**
 * 五行法盘视图：把只读 `BoardState` 快照投影成极坐标布局的五个主印、十个阴阳槽位与生克连线。
 * 只读投影，不写回任何游戏状态（契约见 LLD §4）。
 */
export class BoardView extends Container {
  private _layout: BoardViewLayout;
  private readonly _elements: BoardElementView[] = [];
  private readonly _slots: BoardSlotView[] = [];
  private readonly _connections: BoardConnectionView[] = [];
  private _board: BoardState | null = null;

  public constructor(layout: Partial<BoardViewLayout> = {}) {
    super();
    this._layout = { ...DEFAULT_BOARD_LAYOUT, ...layout };
    this._rebuild();
  }

  /** 当前生效的极坐标布局参数（快照副本）。 */
  public get layout(): Readonly<BoardViewLayout> {
    return { ...this._layout };
  }

  /** 按视口自适应：圆心取视口中心，环半径按短边等比缩放。 */
  public resize(width: number, height: number): void {
    const span = Math.min(width, height);
    this._layout = {
      ...this._layout,
      centerX: width / 2,
      centerY: height / 2,
      sealRadius: span * SEAL_RADIUS_RATIO,
      slotRadius: span * SLOT_RADIUS_RATIO,
    };
    this._rebuild();
  }

  /** 五个五行主印，按相生环顺序排列。 */
  public get elements(): readonly BoardElementView[] {
    return this._elements;
  }

  /** 十个阴阳槽位，按主印环顺序、每个主印先阴后阳排列。 */
  public get slots(): readonly BoardSlotView[] {
    return this._slots;
  }

  /** 十条生克连线：五条相生环边 + 五条相克星弦。 */
  public get connections(): readonly BoardConnectionView[] {
    return this._connections;
  }

  /** 按主印与极性取一个槽位的投影视图。 */
  public getSlot(element: WuXing, polarity: Polarity): BoardSlotView {
    const elementIndex = this._elements.findIndex((entry) => entry.element === element);
    const slot = this._slots[elementIndex * 2 + (polarity === Polarity.YIN ? 0 : 1)];
    if (slot === undefined) {
      throw new Error(`法盘上不存在五行 ${element} 的 ${polarity} 槽位。`);
    }
    return slot;
  }

  /** 投影一份只读棋盘快照；只读不写回（LLD §4）。 */
  public update(board: BoardState): void {
    this._board = board;
    this._rebuild();
  }

  /** 从只读 `GameState` 快照中取指定玩家的棋盘并投影。 */
  public updateFromState(state: GameState, player: PlayerId): void {
    this.update(state.players[player].board);
  }

  private _rebuild(): void {
    this._elements.length = 0;
    this._slots.length = 0;
    this._connections.length = 0;
    const ring = buildGenerationRing();
    ring.forEach((element, index) => {
      const angle = this._layout.startAngle + index * RING_STEP;
      const node = this._board?.[element];
      const yin = node?.yin ?? VOID_LEVEL;
      const yang = node?.yang ?? VOID_LEVEL;
      const isGuiYi = yin >= 1 && yang >= 1;
      const isKangJi = yin === 2 && yang === 2;
      this._elements.push({
        element,
        angle,
        x: this._layout.centerX + this._layout.sealRadius * Math.cos(angle),
        y: this._layout.centerY + this._layout.sealRadius * Math.sin(angle),
        yin,
        yang,
        isGuiYi,
        isKangJi,
      });
      this._slots.push(
        this._projectSlot(
          element,
          Polarity.YIN,
          yin,
          angle - this._layout.slotSpread,
          isGuiYi,
          isKangJi,
        ),
        this._projectSlot(
          element,
          Polarity.YANG,
          yang,
          angle + this._layout.slotSpread,
          isGuiYi,
          isKangJi,
        ),
      );
    });
    for (const element of ring) {
      this._connections.push(
        this._projectConnection('generation', element, GENERATION_CYCLE[element]),
        this._projectConnection('overcoming', element, OVERCOMING_CYCLE[element]),
      );
    }
  }

  private _projectConnection(
    kind: BoardConnectionKind,
    from: WuXing,
    to: WuXing,
  ): BoardConnectionView {
    const source = this._elementView(from);
    const target = this._elementView(to);
    const node = this._board?.[from];
    return {
      kind,
      from,
      to,
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
      active: node !== undefined && (node.yin >= 1 || node.yang >= 1),
    };
  }

  private _elementView(element: WuXing): BoardElementView {
    const view = this._elements.find((entry) => entry.element === element);
    if (view === undefined) {
      throw new Error(`法盘上不存在五行 ${element}。`);
    }
    return view;
  }

  private _projectSlot(
    element: WuXing,
    polarity: Polarity,
    level: NodeLevel,
    angle: number,
    isGuiYi: boolean,
    isKangJi: boolean,
  ): BoardSlotView {
    return {
      element,
      polarity,
      level,
      angle,
      x: this._layout.centerX + this._layout.slotRadius * Math.cos(angle),
      y: this._layout.centerY + this._layout.slotRadius * Math.sin(angle),
      isGuiYi,
      isKangJi,
    };
  }

  /** 先画连线，再画槽位与主印（后者盖在前者之上）。 */
  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    this._drawConnections(ctx);
    this._drawSlots(ctx);
    this._drawSeals(ctx);
  }

  /** 外环相生环 + 内星相克弦；源主印任一侧点亮（≥1）时转为活动色。 */
  private _drawConnections(ctx: CanvasRenderingContext2D): void {
    for (const line of this._connections) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.strokeStyle = line.active ? CONNECTION_ACTIVE[line.kind] : CONNECTION_IDLE[line.kind];
      ctx.lineWidth = line.active ? 3 : 1.5;
      ctx.lineCap = 'round';
      if (line.kind === 'overcoming') {
        ctx.setLineDash([6, 5]);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  /** 十个阴阳槽位：-1 道损 / 0 虚空 / 1 点亮 / 2 加持 四档着色，归一与亢极加金环。 */
  private _drawSlots(ctx: CanvasRenderingContext2D): void {
    const radius = Math.max(8, this._layout.slotRadius * 0.07);
    for (const slot of this._slots) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(slot.x, slot.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = BOARD_BG_COLOR;
      ctx.fill();
      ctx.lineWidth = slot.level === 2 ? 4 : 2;
      ctx.strokeStyle = slotColor(slot.level, slot.element);
      ctx.stroke();

      ctx.fillStyle = slot.level >= 1 ? SLOT_TEXT_COLOR : VOID_COLOR;
      ctx.font = `bold ${Math.round(radius)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(slot.polarity === Polarity.YIN ? '阴' : '阳', slot.x, slot.y);

      if (slot.isGuiYi) {
        ctx.beginPath();
        ctx.arc(slot.x, slot.y, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = slot.isKangJi ? BLESSED_COLOR : GUI_YI_COLOR;
        ctx.lineWidth = slot.isKangJi ? 3 : 1.5;
        ctx.setLineDash(slot.isKangJi ? [] : [3, 3]);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** 五个五行主印：底盘 + 阴/阳半环 + 归一/亢极高亮 + 五行名。 */
  private _drawSeals(ctx: CanvasRenderingContext2D): void {
    const sealRadius = Math.max(14, this._layout.sealRadius * 0.22);
    for (const entry of this._elements) {
      const palette = WUXING_PALETTE[entry.element];
      ctx.save();
      ctx.beginPath();
      ctx.arc(entry.x, entry.y, sealRadius, 0, Math.PI * 2);
      ctx.fillStyle = BOARD_BG_COLOR;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = entry.isKangJi ? BLESSED_COLOR : palette.dark;
      ctx.stroke();

      drawHalfRing(ctx, entry.x, entry.y, sealRadius + 4, true, entry.yin, entry.element);
      drawHalfRing(ctx, entry.x, entry.y, sealRadius + 4, false, entry.yang, entry.element);

      if (entry.isGuiYi) {
        ctx.beginPath();
        ctx.arc(entry.x, entry.y, sealRadius + 9, 0, Math.PI * 2);
        ctx.strokeStyle = entry.isKangJi ? BLESSED_COLOR : GUI_YI_COLOR;
        ctx.lineWidth = entry.isKangJi ? 3 : 1.5;
        ctx.setLineDash(entry.isKangJi ? [] : [4, 3]);
        ctx.stroke();
      }

      ctx.fillStyle = palette.light;
      ctx.font = `bold ${Math.round(Math.max(10, sealRadius * 0.55))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(palette.name, entry.x, entry.y);

      if (entry.isGuiYi) {
        ctx.fillStyle = entry.isKangJi ? BLESSED_COLOR : GUI_YI_COLOR;
        ctx.font = `${Math.round(Math.max(9, sealRadius * 0.45))}px monospace`;
        ctx.fillText(entry.isKangJi ? '亢极' : '归一', entry.x, entry.y + sealRadius + 14);
      }
      ctx.restore();
    }
  }
}

/** 槽位与半环的笔触颜色：点亮取五行本色，道损取五行暗色。 */
function slotColor(level: NodeLevel, element: WuXing): string {
  const palette = WUXING_PALETTE[element];
  switch (level) {
    case -1:
      return palette.dark;
    case 0:
      return VOID_COLOR;
    case 1:
      return palette.main;
    case 2:
      return BLESSED_COLOR;
  }
}

/** 画主印的一侧半环：阴在左半、阳在右半；道损用虚纹表现破损。 */
function drawHalfRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  isYin: boolean,
  level: NodeLevel,
  element: WuXing,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(
    x,
    y,
    radius,
    isYin ? Math.PI * 0.5 : -Math.PI * 0.5,
    isYin ? Math.PI * 1.5 : Math.PI * 0.5,
  );
  ctx.strokeStyle = slotColor(level, element);
  ctx.lineWidth = level === 2 ? 6 : level === 0 ? 2 : 4;
  ctx.lineCap = 'round';
  if (level === -1) {
    ctx.setLineDash([4, 3]);
  }
  ctx.stroke();
  ctx.restore();
}

/** 沿相生环从木出发遍历五行；环本身以 `GENERATION_CYCLE` 为唯一真源（LLD §2.3）。 */
function buildGenerationRing(): readonly WuXing[] {
  const ring: WuXing[] = [];
  let current: WuXing = WuXing.WOOD;
  for (let index = 0; index < WUXING_COUNT; index += 1) {
    ring.push(current);
    current = GENERATION_CYCLE[current];
  }
  return ring;
}
