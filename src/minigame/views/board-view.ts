import {
  BoardState,
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

/** 内环恒为己方盘（钉死 P1），外环恒为对方盘（钉死 P2）——ADR 0015。 */
const OWN_PLAYER: PlayerId = 'P1';
const OPPONENT_PLAYER: PlayerId = 'P2';
const BOARD_PLAYERS: readonly PlayerId[] = [OWN_PLAYER, OPPONENT_PLAYER];
/** 外环相对内环逆时针偏移的格数：每根射线上「己方克对方」（ADR 0015）。 */
const OUTER_RING_OFFSET = 2;

/** 法盘极坐标布局参数（单位：像素 / 弧度）。 */
export interface BoardViewLayout {
  /** 法盘圆心（相对父节点坐标系）。 */
  centerX: number;
  centerY: number;
  /** 己方盘（内环）主印环的半径。 */
  innerRadius: number;
  /** 对方盘（外环）主印环的半径。 */
  outerRadius: number;
  /** 主印圆的视觉半径。 */
  sealSize: number;
  /** 首个方位（木）的角度，默认正上方。 */
  startAngle: number;
}

/** 视口自适应时，环半径与主印半径占视口短边的比例。 */
const INNER_RADIUS_RATIO = 0.24;
const OUTER_RADIUS_RATIO = 0.4;
const SEAL_SIZE_RATIO = 0.06;

/** 阴阳槽位相对主印中心在阴/阳一侧的横向偏移（占主印半径的比例）。 */
const SLOT_SIDE_RATIO = 0.7;

export const DEFAULT_BOARD_LAYOUT: BoardViewLayout = {
  centerX: 0,
  centerY: 0,
  innerRadius: 90,
  outerRadius: 150,
  sealSize: 22.5,
  startAngle: -Math.PI / 2,
};

/** 单个五行主印的投影视图。 */
export interface BoardElementView {
  /** 归属盘：P1 恒在内环、P2 恒在外环。 */
  readonly player: PlayerId;
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

/** 单个阴阳槽位的投影视图（落在归属盘主印的阴/阳半环一侧）。 */
export interface BoardSlotView {
  /** 归属盘：P1 恒在内环、P2 恒在外环。 */
  readonly player: PlayerId;
  readonly element: WuXing;
  readonly polarity: Polarity;
  readonly level: NodeLevel;
  /** 所在主印的射线角。 */
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

/** 连线类型：内环相生边（表「化 / 强化」）与跨环径向线（表「破 / 强破」）。 */
export type BoardConnectionKind = 'generation' | 'attack';

/* 法盘配色（仅本视图使用，不进共享主题模块）。 */
const BOARD_BG_COLOR = '#111827';
const VOID_COLOR = '#374151';
const BLESSED_COLOR = '#f6e05e';
const GUI_YI_COLOR = '#ecc94b';
/** 环级归属：内环暖色底晕 + 「己」徽记，外环冷色底晕 + 「敌」徽记。 */
const OWN_RING_HALO = 'rgba(183, 121, 31, 0.16)';
const OWN_RING_BADGE = '#b7791f';
const OPPONENT_RING_HALO = 'rgba(43, 108, 176, 0.16)';
const OPPONENT_RING_BADGE = '#2b6cb0';
const BADGE_TEXT_COLOR = '#f7fafc';
const READOUT_COLOR = '#a0aec0';
/** 环徽记与归元读数所在方位：避开五条射线上的主印。 */
const OWN_BADGE_ANGLE = Math.PI * 0.9;
const OPPONENT_BADGE_ANGLE = Math.PI * 0.1;
const CONNECTION_IDLE: Record<BoardConnectionKind, string> = {
  generation: '#2f4f3f',
  attack: '#4a2a2a',
};
const CONNECTION_ACTIVE: Record<BoardConnectionKind, string> = {
  generation: '#48bb78',
  attack: '#e53e3e',
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
  /** 表现态：源主印（恒在内环）任一侧已点亮（≥1）时，该路径视为有能量流动。 */
  readonly active: boolean;
}

/**
 * 五行法盘视图：同心双环，内环恒为己方盘、外环恒为对方盘（ADR 0015）。
 * 把两块只读 `BoardState` 快照投影成十个主印（含左右阴阳半环）、二十个槽位与十条连线
 * （五条内环相生边 + 五条跨环径向线）；只读投影，不写回任何游戏状态（契约见 LLD §4.1）。
 */
export class BoardView extends Container {
  private _layout: BoardViewLayout;
  private readonly _elements: BoardElementView[] = [];
  private readonly _slots: BoardSlotView[] = [];
  private readonly _connections: BoardConnectionView[] = [];
  private readonly _boards: Record<PlayerId, BoardState | null> = { P1: null, P2: null };

  public constructor(layout: Partial<BoardViewLayout> = {}) {
    super();
    this._layout = { ...DEFAULT_BOARD_LAYOUT, ...layout };
    this._rebuild();
  }

  /** 当前生效的极坐标布局参数（快照副本）。 */
  public get layout(): Readonly<BoardViewLayout> {
    return { ...this._layout };
  }

  /** 按视口自适应：圆心取视口中心，内外环半径与主印半径按短边等比缩放。 */
  public resize(width: number, height: number): void {
    const span = Math.min(width, height);
    this._layout = {
      ...this._layout,
      centerX: width / 2,
      centerY: height / 2,
      innerRadius: span * INNER_RADIUS_RATIO,
      outerRadius: span * OUTER_RADIUS_RATIO,
      sealSize: span * SEAL_SIZE_RATIO,
    };
    this._rebuild();
  }

  /** 十个五行主印：内环（己方）五个在前、外环（对方）五个在后，各按相生环顺序。 */
  public get elements(): readonly BoardElementView[] {
    return this._elements;
  }

  /** 二十个阴阳槽位：十个主印各带阴/阳两个，按主印顺序排列（内环在前）。 */
  public get slots(): readonly BoardSlotView[] {
    return this._slots;
  }

  /** 十条连线：五条内环相生边 + 五条跨环径向线。 */
  public get connections(): readonly BoardConnectionView[] {
    return this._connections;
  }

  /** 按玩家、主印与极性取一个槽位的投影视图；未知玩家 / 元素 / 极性抛错。 */
  public getSlot(player: PlayerId, element: WuXing, polarity: Polarity): BoardSlotView {
    const slot = this._slots.find(
      (entry) =>
        entry.player === player && entry.element === element && entry.polarity === polarity,
    );
    if (slot === undefined) {
      throw new Error(`法盘上不存在 ${player} 的五行 ${element} 的 ${polarity} 槽位。`);
    }
    return slot;
  }

  /** 一次投影双方只读棋盘快照；只读不写回（LLD §4.1）。 */
  public update(p1Board: BoardState, p2Board: BoardState): void {
    this._boards[OWN_PLAYER] = p1Board;
    this._boards[OPPONENT_PLAYER] = p2Board;
    this._rebuild();
  }

  private _rebuild(): void {
    this._elements.length = 0;
    this._slots.length = 0;
    this._connections.length = 0;
    const ring = buildGenerationRing();
    for (const player of BOARD_PLAYERS) {
      const radius = player === OWN_PLAYER ? this._layout.innerRadius : this._layout.outerRadius;
      ring.forEach((element, index) => {
        // 内环五行 ring[i] 落在射线 i；外环整体逆时针偏移 2 格，即 ring[j] 落在射线 (j-2)。
        const rayIndex =
          player === OWN_PLAYER ? index : (index - OUTER_RING_OFFSET + WUXING_COUNT) % WUXING_COUNT;
        const angle = this._layout.startAngle + rayIndex * RING_STEP;
        const node = this._boards[player]?.[element];
        const yin = node?.yin ?? VOID_LEVEL;
        const yang = node?.yang ?? VOID_LEVEL;
        const isGuiYi = yin >= 1 && yang >= 1;
        const isKangJi = yin === 2 && yang === 2;
        const x = this._layout.centerX + radius * Math.cos(angle);
        const y = this._layout.centerY + radius * Math.sin(angle);
        this._elements.push({ player, element, angle, x, y, yin, yang, isGuiYi, isKangJi });
        // 阴阳状态由主印左右半环承载：阴侧偏左、阳侧偏右，槽位点落在点亮的半环上。
        const sideOffset = this._layout.sealSize * SLOT_SIDE_RATIO;
        this._slots.push(
          this._projectSlot(
            player,
            element,
            Polarity.YIN,
            yin,
            angle,
            x - sideOffset,
            y,
            isGuiYi,
            isKangJi,
          ),
          this._projectSlot(
            player,
            element,
            Polarity.YANG,
            yang,
            angle,
            x + sideOffset,
            y,
            isGuiYi,
            isKangJi,
          ),
        );
      });
    }
    for (const element of ring) {
      // 相生边在己方盘内部（表「化 / 强化」）；径向线跨环指向同射线上的对方主印（表「破 / 强破」）。
      this._connections.push(
        this._projectConnection(
          'generation',
          OWN_PLAYER,
          element,
          OWN_PLAYER,
          GENERATION_CYCLE[element],
        ),
        this._projectConnection(
          'attack',
          OWN_PLAYER,
          element,
          OPPONENT_PLAYER,
          OVERCOMING_CYCLE[element],
        ),
      );
    }
  }

  private _projectConnection(
    kind: BoardConnectionKind,
    fromPlayer: PlayerId,
    from: WuXing,
    toPlayer: PlayerId,
    to: WuXing,
  ): BoardConnectionView {
    const source = this._elementView(fromPlayer, from);
    const target = this._elementView(toPlayer, to);
    const node = this._boards[fromPlayer]?.[from];
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

  private _elementView(player: PlayerId, element: WuXing): BoardElementView {
    const view = this._elements.find(
      (entry) => entry.player === player && entry.element === element,
    );
    if (view === undefined) {
      throw new Error(`法盘上不存在 ${player} 的五行 ${element}。`);
    }
    return view;
  }

  private _projectSlot(
    player: PlayerId,
    element: WuXing,
    polarity: Polarity,
    level: NodeLevel,
    angle: number,
    x: number,
    y: number,
    isGuiYi: boolean,
    isKangJi: boolean,
  ): BoardSlotView {
    return { player, element, polarity, level, angle, x, y, isGuiYi, isKangJi };
  }

  /** 先画环级底晕与连线，再画主印，最后叠加归元读数（读数压在最上层）。 */
  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    this._drawRingHalos(ctx);
    this._drawConnections(ctx);
    this._drawSeals(ctx);
    this._drawGuiYuanReadout(ctx);
  }

  /** 环级归属：内环暖色底晕 + 「己」徽记、外环冷色底晕 + 「敌」徽记；主印本体不在这里换色。 */
  private _drawRingHalos(ctx: CanvasRenderingContext2D): void {
    const haloWidth = this._layout.sealSize * 1.9;
    const halos: readonly [number, string][] = [
      [this._layout.innerRadius, OWN_RING_HALO],
      [this._layout.outerRadius, OPPONENT_RING_HALO],
    ];
    for (const [radius, color] of halos) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this._layout.centerX, this._layout.centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = haloWidth;
      ctx.stroke();
      ctx.restore();
    }
    this._drawRingBadge(ctx, this._layout.innerRadius, OWN_BADGE_ANGLE, '己', OWN_RING_BADGE);
    this._drawRingBadge(
      ctx,
      this._layout.outerRadius,
      OPPONENT_BADGE_ANGLE,
      '敌',
      OPPONENT_RING_BADGE,
    );
  }

  /** 环徽记：画在射线之间的空位上，给「这是谁的盘」一个不依赖颜色的读法。 */
  private _drawRingBadge(
    ctx: CanvasRenderingContext2D,
    radius: number,
    angle: number,
    label: string,
    color: string,
  ): void {
    const x = this._layout.centerX + radius * Math.cos(angle);
    const y = this._layout.centerY + radius * Math.sin(angle);
    const badgeRadius = Math.max(10, this._layout.sealSize * 0.7);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, badgeRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = BADGE_TEXT_COLOR;
    ctx.font = `bold ${Math.round(badgeRadius * 1.15)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  /** 内环相生边（实线）+ 跨环径向线（虚线）；源主印任一侧点亮（≥1）时转为活动色。 */
  private _drawConnections(ctx: CanvasRenderingContext2D): void {
    for (const line of this._connections) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.strokeStyle = line.active ? CONNECTION_ACTIVE[line.kind] : CONNECTION_IDLE[line.kind];
      ctx.lineWidth = line.active ? 3 : 1.5;
      ctx.lineCap = 'round';
      if (line.kind === 'attack') {
        ctx.setLineDash([6, 5]);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  /** 十个主印：底盘 + 阴/阳半环 + 归一/亢极高亮 + 五行名；内外环主印共用同一套画法。 */
  private _drawSeals(ctx: CanvasRenderingContext2D): void {
    const sealRadius = this._layout.sealSize;
    const halfRingRadius = sealRadius + Math.max(3, sealRadius * 0.16);
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

      drawHalfRing(ctx, entry.x, entry.y, halfRingRadius, true, entry.yin, entry.element);
      drawHalfRing(ctx, entry.x, entry.y, halfRingRadius, false, entry.yang, entry.element);

      if (entry.isGuiYi) {
        ctx.beginPath();
        ctx.arc(entry.x, entry.y, halfRingRadius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = entry.isKangJi ? BLESSED_COLOR : GUI_YI_COLOR;
        ctx.lineWidth = entry.isKangJi ? 3 : 1.5;
        ctx.setLineDash(entry.isKangJi ? [] : [4, 3]);
        ctx.stroke();
      }

      ctx.fillStyle = palette.light;
      ctx.font = `bold ${Math.round(Math.max(11, sealRadius * 0.55))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(palette.name, entry.x, entry.y);

      if (entry.isGuiYi) {
        ctx.fillStyle = entry.isKangJi ? BLESSED_COLOR : GUI_YI_COLOR;
        ctx.font = `${Math.round(Math.max(9, sealRadius * 0.4))}px monospace`;
        ctx.fillText(entry.isKangJi ? '亢极' : '归一', entry.x, entry.y + sealRadius + 13);
      }
      ctx.restore();
    }
  }

  /** 归元进度读数：统计内外环各自的归一节点数，补上「谁离归元更近」的数值口径。 */
  private _drawGuiYuanReadout(ctx: CanvasRenderingContext2D): void {
    const own = this._countGuiYi(OWN_PLAYER);
    const opponent = this._countGuiYi(OPPONENT_PLAYER);
    const x = this._layout.centerX;
    const y = this._layout.centerY + this._layout.outerRadius - this._layout.sealSize - 10;
    ctx.save();
    ctx.fillStyle = BOARD_BG_COLOR;
    ctx.fillRect(x - 70, y - 10, 140, 20);
    ctx.fillStyle = READOUT_COLOR;
    ctx.font = `bold ${Math.round(Math.max(11, this._layout.sealSize * 0.55))}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`己 ${own}/${WUXING_COUNT} · 敌 ${opponent}/${WUXING_COUNT} 归一`, x, y);
    ctx.restore();
  }

  private _countGuiYi(player: PlayerId): number {
    return this._elements.filter((entry) => entry.player === player && entry.isGuiYi).length;
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

/**
 * 画主印的一侧半环：阴在左半、阳在右半。
 * 等级用**形状档位 + 面积 + 颜色**三重冗余表达（不只靠颜色）：
 * 虚空 = 极细暗弧、道损 = 断口弧、点亮 = 实心弧、加持 = 双线 + 两颗圆点。
 */
function drawHalfRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  isYin: boolean,
  level: NodeLevel,
  element: WuXing,
): void {
  const start = isYin ? Math.PI * 0.5 : -Math.PI * 0.5;
  const end = isYin ? Math.PI * 1.5 : Math.PI * 0.5;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, start, end);
  ctx.strokeStyle = slotColor(level, element);
  ctx.lineWidth = level === 2 ? 6 : level === 1 ? 4.5 : level === -1 ? 3 : 1.5;
  ctx.lineCap = 'round';
  if (level === -1) {
    ctx.setLineDash([4, 3]);
  }
  ctx.stroke();

  if (level === 2) {
    // 加持：外圈补一道细线 + 两颗圆点，形状上数得出等级。
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, start, end);
    ctx.strokeStyle = BLESSED_COLOR;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (const ratio of [0.25, 0.75]) {
      const angle = start + (end - start) * ratio;
      ctx.beginPath();
      ctx.arc(
        x + Math.cos(angle) * (radius + 4),
        y + Math.sin(angle) * (radius + 4),
        2,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = BLESSED_COLOR;
      ctx.fill();
    }
  }
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
