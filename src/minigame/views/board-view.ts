import {
  ActionType,
  BoardState,
  NodeData,
  NodeLevel,
  PlayerId,
  Polarity,
  WuXing,
  GENERATION_CYCLE,
  OVERCOMING_CYCLE,
} from '../../core/types/domain.js';
import { isNodeGuiYi, isNodeKangJi } from '../../core/logic/State.js';
import { isAttackAction } from '../action-semantics.js';
import { WUXING_PALETTE } from '../pixel-art.js';
import { THEME } from '../theme.js';
import { estimateTextWidth } from '../text-metrics.js';
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
  /** 己方盘主印圆的视觉半径（对方盘按 `OPPONENT_SEAL_SCALE` 缩小）。 */
  sealSize: number;
  /** 首个方位（木）的角度，默认正上方。 */
  startAngle: number;
}

/** 视口自适应时，环半径与主印半径占视口短边的比例。 */
const INNER_RADIUS_RATIO = 0.24;
const OUTER_RADIUS_RATIO = 0.4;
const SEAL_SIZE_RATIO = 0.062;

/** 对方盘主印相对己方盘主印的缩放：外环更小、更暗，一眼分出主次（ADR 0015 的「环级区分」）。 */
const OPPONENT_SEAL_SCALE = 0.82;

/** 己方盘主印的填充底色（五行本色的低透明度版，避免变成一坨高饱和「糖果」）。 */
const OWN_SEAL_FILL_ALPHA = 0.16;

/** 阴阳槽位相对主印中心在阴/阳一侧的横向偏移（占主印半径的比例）。 */
const SLOT_SIDE_RATIO = 0.7;

export const DEFAULT_BOARD_LAYOUT: BoardViewLayout = {
  centerX: 0,
  centerY: 0,
  innerRadius: 90,
  outerRadius: 150,
  sealSize: 23.25,
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
  /** 主印圆的视觉半径（对方盘更小）。 */
  readonly sealSize: number;
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
/** 虚空节点：未投影过该盘时，归一 / 亢极判定按它走（真源仍是核心层 `isNodeGuiYi`）。 */
const VOID_NODE: NodeData = { yin: VOID_LEVEL, yang: VOID_LEVEL };

/** 连线类型：内环相生边（表「化 / 强化」）与跨环径向线（表「破 / 强破」）。 */
export type BoardConnectionKind = 'generation' | 'attack';

/**
 * 一条被点亮的连线路径：由「当前动作会走哪条线」决定（票 02）。
 * `(kind, from)` 唯一确定一条连线（相生边与径向线的终点各自由生 / 克环推导）。
 */
export interface BoardActivePath {
  readonly kind: BoardConnectionKind;
  readonly from: WuXing;
}

/** Ring ownership remains warm/solid and cool/dashed (ADR 0015). */
const BOARD_BG_COLOR = THEME.deep;
const VOID_COLOR = THEME.edge;
const BLESSED_COLOR = THEME.gold;
const GUI_YI_COLOR = THEME.gold;

/**
 * 环带：内环暖色实线带（己方盘）、外环冷色虚线带（对方盘）。
 * 环带本身承载「这块盘是谁的」，不再用两个大面积底晕——底晕会互相叠成一团浑色。
 */
const OWN_BAND_COLOR = 'rgba(216,184,118,0.16)';
const OWN_BAND_EDGE = THEME.goldDim;
const OWN_RING_COLOR = THEME.gold;
const OPPONENT_BAND_COLOR = 'rgba(134,184,203,0.12)';
const OPPONENT_BAND_EDGE = THEME.edge;
const OPPONENT_RING_COLOR = THEME.rival;
/** 环带宽度占主印半径的比例。 */
const OWN_BAND_WIDTH_RATIO = 0.72;
const OPPONENT_BAND_WIDTH_RATIO = 0.62;
/** 环归属标签画在两枚主印之间的空位上（正下方）。 */
const RING_LABEL_ANGLE = Math.PI / 2;
const RING_LABEL_PADDING_X = 8;
const RING_LABEL_PADDING_Y = 4;

const CONNECTION_IDLE: Record<BoardConnectionKind, string> = {
  generation: '#2f4f3f',
  // 径向线常驻但极淡：不误导，只在当前动作指向它时转亮。
  attack: 'rgba(229, 62, 62, 0.22)',
};
const CONNECTION_ACTIVE: Record<BoardConnectionKind, string> = {
  generation: THEME.jade,
  attack: THEME.damage,
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
  /** 表现态：是否属于当前动作会走的路径（由 `setActivePaths` 驱动，与盘面等级无关）。 */
  readonly isActive: boolean;
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
  /** 当前动作会走的连线（键为 `kind:from`）；高亮与盘面等级无关（票 02）。 */
  private _activePaths = new Set<string>();

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

  /**
   * 点亮「当前动作会走」的连线路径（其余连线静默）；传空数组清空高亮。
   * 高亮只由这个入口驱动，不再从盘面等级推导（票 02）。
   */
  public setActivePaths(paths: readonly BoardActivePath[]): void {
    this._activePaths = new Set(paths.map((path) => connectionKey(path.kind, path.from)));
    this._rebuild();
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
      const sealSize =
        player === OWN_PLAYER ? this._layout.sealSize : this._layout.sealSize * OPPONENT_SEAL_SCALE;
      ring.forEach((element, index) => {
        // 内环五行 ring[i] 落在射线 i；外环整体逆时针偏移 2 格，即 ring[j] 落在射线 (j-2)。
        const rayIndex =
          player === OWN_PLAYER ? index : (index - OUTER_RING_OFFSET + WUXING_COUNT) % WUXING_COUNT;
        const angle = this._layout.startAngle + rayIndex * RING_STEP;
        const node = this._boards[player]?.[element] ?? VOID_NODE;
        const x = this._layout.centerX + radius * Math.cos(angle);
        const y = this._layout.centerY + radius * Math.sin(angle);
        const view: BoardElementView = {
          player,
          element,
          angle,
          x,
          y,
          sealSize,
          yin: node.yin,
          yang: node.yang,
          // 归一 / 亢极的真源在核心层（`src/core/logic/State.ts`），这里不再各推一份。
          isGuiYi: isNodeGuiYi(node),
          isKangJi: isNodeKangJi(node),
        };
        this._elements.push(view);
        // 阴阳状态由主印左右半环承载：阴侧偏左、阳侧偏右，槽位点落在点亮的半环上。
        this._slots.push(
          this._projectSlot(view, Polarity.YIN),
          this._projectSlot(view, Polarity.YANG),
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
    return {
      kind,
      from,
      to,
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
      isActive: this._activePaths.has(connectionKey(kind, from)),
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

  /** 槽位投影：只收主印视图与极性，落点由主印中心向阴 / 阳一侧偏移推出。 */
  private _projectSlot(element: BoardElementView, polarity: Polarity): BoardSlotView {
    const isYin = polarity === Polarity.YIN;
    const sideOffset = element.sealSize * SLOT_SIDE_RATIO;
    return {
      player: element.player,
      element: element.element,
      polarity,
      level: isYin ? element.yin : element.yang,
      angle: element.angle,
      x: element.x + (isYin ? -sideOffset : sideOffset),
      y: element.y,
      isGuiYi: element.isGuiYi,
      isKangJi: element.isKangJi,
    };
  }

  /** 先画环带与连线，再画主印，最后叠加环归属标签（标签压在最上层）。 */
  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    this._drawEngraving(ctx);
    this._drawRingBands(ctx);
    this._drawConnections(ctx);
    this._drawSeals(ctx);
    this._drawRingLabels(ctx);
  }

  /** Decorative concentric engraving has no edges between elements. */
  private _drawEngraving(ctx: CanvasRenderingContext2D): void {
    const { centerX: x, centerY: y, outerRadius, sealSize } = this._layout;
    const radius = outerRadius + sealSize * 1.52;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,27,34,0.72)';
    ctx.fill();
    for (const inset of [0, 5, 10]) {
      ctx.beginPath();
      ctx.arc(x, y, radius - inset, 0, Math.PI * 2);
      ctx.strokeStyle = inset === 5 ? 'rgba(216,184,118,0.28)' : 'rgba(128,214,186,0.10)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (let index = 0; index < 60; index += 1) {
      const angle = (index * Math.PI) / 30;
      const length = index % 5 === 0 ? 7 : 3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * (radius - 5), y + Math.sin(angle) * (radius - 5));
      ctx.lineTo(
        x + Math.cos(angle) * (radius - 5 - length),
        y + Math.sin(angle) * (radius - 5 - length),
      );
      ctx.strokeStyle = 'rgba(216,184,118,0.28)';
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 环带：内环暖色实线带（己方盘）、外环冷色虚线带（对方盘）。
   * 两条带各自细而清晰、互不重叠，让「哪一圈是谁的」在颜色之外还有「实线 / 虚线」这条不依赖颜色的读法。
   */
  private _drawRingBands(ctx: CanvasRenderingContext2D): void {
    const bands: readonly [number, string, string, number, number[]][] = [
      [
        this._layout.innerRadius,
        OWN_BAND_COLOR,
        OWN_BAND_EDGE,
        this._layout.sealSize * OWN_BAND_WIDTH_RATIO,
        [],
      ],
      [
        this._layout.outerRadius,
        OPPONENT_BAND_COLOR,
        OPPONENT_BAND_EDGE,
        this._layout.sealSize * OPPONENT_BAND_WIDTH_RATIO,
        [7, 6],
      ],
    ];
    for (const [radius, fill, edge, width, dash] of bands) {
      ctx.save();
      // 带体（半透明填充）
      ctx.beginPath();
      ctx.arc(this._layout.centerX, this._layout.centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = fill;
      ctx.lineWidth = width;
      ctx.stroke();
      // 带沿（清晰描边，虚实区分内外环）
      ctx.beginPath();
      ctx.arc(this._layout.centerX, this._layout.centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(dash);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** 内环相生边（实线）+ 跨环径向线（虚线）；只有当前动作会走的那条转活动色。 */
  private _drawConnections(ctx: CanvasRenderingContext2D): void {
    for (const line of this._connections) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.strokeStyle = line.isActive ? CONNECTION_ACTIVE[line.kind] : CONNECTION_IDLE[line.kind];
      ctx.lineWidth = line.isActive ? 3 : 1.5;
      ctx.lineCap = 'round';
      if (line.kind === 'attack') {
        ctx.setLineDash([6, 5]);
      }
      ctx.stroke();
      if (line.isActive) {
        const angle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1);
        const x = line.x1 + (line.x2 - line.x1) * 0.56;
        const y = line.y1 + (line.y2 - line.y1) * 0.56;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(angle - 0.6) * 7, y - Math.sin(angle - 0.6) * 7);
        ctx.lineTo(x, y);
        ctx.lineTo(x - Math.cos(angle + 0.6) * 7, y - Math.sin(angle + 0.6) * 7);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /**
   * 十个主印。内外环用**尺寸 + 填充 + 描边亮度**拉开层级（主印本体仍是五行本色，不换色）：
   * 己方盘主印更大、填五行暗色、亮色描边；对方盘主印更小、填底色、暗色描边。
   */
  private _drawSeals(ctx: CanvasRenderingContext2D): void {
    for (const entry of this._elements) {
      const isOwn = entry.player === OWN_PLAYER;
      const palette = WUXING_PALETTE[entry.element];
      const sealRadius = entry.sealSize;
      const ringRadius = halfRingRadius(sealRadius);
      ctx.save();
      ctx.beginPath();
      ctx.arc(entry.x, entry.y, sealRadius, 0, Math.PI * 2);
      ctx.fillStyle = isOwn ? withAlpha(palette.main, OWN_SEAL_FILL_ALPHA) : THEME.deep;
      ctx.fill();
      // A light bevel and recessed face give each seal a physical jade setting.
      ctx.beginPath();
      ctx.arc(entry.x, entry.y, sealRadius - 3, 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(palette.light, isOwn ? 0.24 : 0.12);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(entry.x, entry.y, sealRadius, 0, Math.PI * 2);
      ctx.lineWidth = isOwn ? 2.5 : 2;
      ctx.strokeStyle = isOwn ? palette.main : withAlpha(palette.main, 0.55);
      ctx.stroke();

      drawHalfRing(ctx, entry.x, entry.y, ringRadius, true, entry.yin, entry.element);
      drawHalfRing(ctx, entry.x, entry.y, ringRadius, false, entry.yang, entry.element);

      if (entry.isGuiYi) {
        // 归一：半环之外再套一圈实心金环（不占用主印描边——土 / 金的本色接近金色，占描边会分不出）。
        ctx.beginPath();
        ctx.arc(entry.x, entry.y, ringRadius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = entry.isKangJi ? BLESSED_COLOR : GUI_YI_COLOR;
        ctx.lineWidth = entry.isKangJi ? 3 : 2;
        ctx.stroke();
      }

      ctx.fillStyle = isOwn ? palette.light : withAlpha(palette.light, 0.72);
      ctx.font = `bold ${String(Math.round(Math.max(11, sealRadius * 0.62)))}px ${THEME.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(palette.name, entry.x, entry.y - 3);
      // Explicit polarity and numeric levels supplement the shape-coded half-rings.
      ctx.font = `9px ${THEME.font}`;
      ctx.fillStyle = THEME.muted;
      ctx.fillText(`${entry.yin}`, entry.x - sealRadius * 0.4, entry.y + sealRadius * 0.46);
      ctx.fillText(`${entry.yang}`, entry.x + sealRadius * 0.4, entry.y + sealRadius * 0.46);

      if (entry.isKangJi) {
        ctx.fillStyle = BLESSED_COLOR;
        ctx.font = `bold ${String(Math.round(Math.max(9, sealRadius * 0.42)))}px ${THEME.font}`;
        ctx.fillText('亢', entry.x, entry.y - ringRadius - 13);
      }
      ctx.restore();
    }
  }

  /** 环归属标签：把「己」「敌」钉在各自的环带上（主印之间的正下方空位）。 */
  private _drawRingLabels(ctx: CanvasRenderingContext2D): void {
    this._drawRingLabel(ctx, this._layout.innerRadius, '己', OWN_BAND_EDGE, OWN_RING_COLOR, 0.55);
    this._drawRingLabel(
      ctx,
      this._layout.outerRadius,
      '敌',
      OPPONENT_BAND_EDGE,
      OPPONENT_RING_COLOR,
      0.55,
    );
    this._drawGuiYuanLegend(ctx);
  }

  /**
   * 归元进度图例：盘下方一行「己 x/5」「敌 y/5」，颜色与各自环带对应。
   * 不放环带上：内环主印之间的空位只有 ~44px，放得下「己」一个字却放不下带数量的胶囊。
   */
  private _drawGuiYuanLegend(ctx: CanvasRenderingContext2D): void {
    const fontSize = Math.round(Math.max(11, this._layout.sealSize * 0.55));
    const y = this._layout.centerY + this._layout.outerRadius + this._layout.sealSize * 1.9;
    const gap = this._layout.sealSize * 2.6;
    ctx.save();
    ctx.font = `bold ${String(fontSize)}px ${THEME.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = OWN_RING_COLOR;
    ctx.fillText(
      `己 ${String(this._countGuiYi(OWN_PLAYER))}/${String(WUXING_COUNT)}`,
      this._layout.centerX - gap,
      y,
    );
    ctx.fillStyle = OPPONENT_RING_COLOR;
    ctx.fillText(
      `敌 ${String(this._countGuiYi(OPPONENT_PLAYER))}/${String(WUXING_COUNT)}`,
      this._layout.centerX + gap,
      y,
    );
    ctx.restore();
  }

  /** 一个环归属标签：实心胶囊 + 文案，压在环带上（环带本身是半透明，胶囊保证文字读得清）。 */
  private _drawRingLabel(
    ctx: CanvasRenderingContext2D,
    radius: number,
    text: string,
    edge: string,
    textColor: string,
    fontRatio: number,
  ): void {
    const x = this._layout.centerX + radius * Math.cos(RING_LABEL_ANGLE);
    const y = this._layout.centerY + radius * Math.sin(RING_LABEL_ANGLE);
    const fontSize = Math.round(Math.max(9, this._layout.sealSize * fontRatio));
    const width = Math.ceil(estimateTextWidth(text, fontSize)) + RING_LABEL_PADDING_X * 2;
    const height = fontSize + RING_LABEL_PADDING_Y * 2;
    ctx.save();
    drawPill(ctx, x - width / 2, y - height / 2, width, height, height / 2, BOARD_BG_COLOR, edge);
    ctx.fillStyle = textColor;
    ctx.font = `bold ${String(fontSize)}px ${THEME.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }

  private _countGuiYi(player: PlayerId): number {
    return this._elements.filter((entry) => entry.player === player && entry.isGuiYi).length;
  }
}

/** 把 `#rrggbb` 转成带透明度的 `rgba()`；非法输入原样返回。 */
function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match === null) {
    return hex;
  }
  const value = Number.parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`;
}

/** 圆角胶囊：底板 + 描边（`roundRect` 在部分环境缺失时退回矩形）。 */
function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke: string,
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.rect(x, y, width, height);
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
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
  ctx.lineWidth = level === 2 ? 5 : level === 1 ? 4 : level === -1 ? 3 : 1.5;
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

/** 主印半环相对主印半径的外扩量：给主印与半环之间留出看得见的缝（内外环共用同一口径）。 */
function halfRingRadius(sealRadius: number): number {
  return sealRadius + Math.max(5, sealRadius * 0.24);
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

/** 连线高亮的键：`(kind, from)` 唯一确定一条连线。 */
function connectionKey(kind: BoardConnectionKind, from: WuXing): string {
  return `${kind}:${from}`;
}

/**
 * 把一个动作映射成它在法盘上会走的连线路径；不沿连线走的动作返回 `null`。
 * 起点是当前天干的五行：化 / 强化走内环相生边，攻击类（共享判定 `isAttackAction`）走跨环径向线。
 */
export function resolveActionPath(actionType: ActionType, element: WuXing): BoardActivePath | null {
  if (isAttackAction(actionType)) {
    return { kind: 'attack', from: element };
  }
  switch (actionType) {
    case ActionType.TRANS:
    case ActionType.BURST:
      return { kind: 'generation', from: element };
    case ActionType.AUTO:
    case ActionType.CONVERT:
    case ActionType.DISSIPATE:
    case ActionType.PASS:
      return null;
    default: {
      // 类型穷举保护：新增动作必须显式给路径，不许静默归入「不指向任何连线」。
      const unhandled: never = actionType;
      throw new Error(`未处理的动作类型：${String(unhandled)}`);
    }
  }
}
