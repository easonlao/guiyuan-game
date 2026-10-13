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
import { CandidateTarget } from '../candidate-target.js';
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

/**
 * 对方盘主印相对己方盘主印的缩放：外环更小，一眼分出主次（ADR 0015 的「环级区分」）。
 * 只改尺寸、不改亮度——「暗」已被等级通道征用（虚空 = 空心），归属由环带实线 / 虚线与标签承担（ADR 0018）。
 */
const OPPONENT_SEAL_SCALE = 0.82;

/** 虚空描边的不透明度：只描边不填充，元素色淡到仍能读出身份（ADR 0018 的亮度阶梯最低档）。 */
const VOID_OUTLINE_ALPHA = 0.55;

/** 归一 / 亢极外圈：金环底色与沿环流动的高光色（高光比底色亮，才读成「光」）。 */
export const GUIYI_RING_INK = { main: '#d8b876', light: '#ffe4a0' } as const;
/**
 * 归一 / 亢极外圈：一个金环 + 沿环缓慢流动的金色高光。
 * 归一只有这一层；亢极（`layers === 2`）再叠一层元素色柔光与外扩涟漪，
 * 表达「满溢 / 泄露 / 不稳」——环本身不变，只多一层往外漫的元素色。
 * `KANGJI_OVERFLOW_SCALE + AURA_FALLOFF` 是元素外溢相对主印中心的最大外沿（票 05 的 `resize` 避让口径）。
 */
/** 归一金环半径占主印半径的比例：候选弧画在它之外（票 03）。导出供测试按同一口径筛弧，不手抄数字。 */
export const NODE_RING_SCALE = 1.13;
export const NODE_RING_WIDTH_RATIO = 0.07;
const NODE_RING_WIDTH_MIN = 1;
/** 金色高光绕环一圈的秒数与拖尾长度（弧度）：慢、长尾、淡，才自然。 */
const GUIYI_FLOW_PERIOD = 4.5;
const GUIYI_FLOW_TAIL = Math.PI * 1.5;
const KANGJI_OVERFLOW_SCALE = 1.6;
/** 柔光渐变在 `scale + AURA_FALLOFF` 处淡到 0（额外的柔和外沿）。 */
const AURA_FALLOFF = 0.25;
/** 亢极外溢涟漪的扩张速度（圈 / 秒）：7.5s 一圈，更慢。 */
const KANGJI_RIPPLE_SPEED = 1 / 7.5;
/** 亢极涟漪带的最大厚度（相对主印半径）。 */
const KANGJI_RIPPLE_THICKNESS = 0.16;
/** 亢极涟漪从主印内缘扩起。 */
const KANGJI_RIPPLE_INNER = 1.05;
/**
 * 元素外溢相对主印半径的最大外沿：柔光渐变的淡出半径。
 * 法盘底晕（`_drawEngraving`）与票 05 的 `resize` 避让都拿它当口径。
 */
export const NODE_AURA_OUTSET_RATIO = KANGJI_OVERFLOW_SCALE + AURA_FALLOFF;
/** 亢极涟漪能扩到的最外半径：再叠上最大厚度也不超过 `NODE_AURA_OUTSET_RATIO`。 */
const KANGJI_RIPPLE_OUTER = NODE_AURA_OUTSET_RATIO - KANGJI_RIPPLE_THICKNESS;

/** 阴阳槽位相对主印中心在阴/阳一侧的横向偏移（占主印半径的比例）。 */
const SLOT_SIDE_RATIO = 0.7;

/**
 * 归一金环的外沿（占主印半径的比例）：主印 → 金环（`NODE_RING_SCALE`）→ 候选弧，
 * 候选弧画在金环外沿之外，与它几乎贴着（票 03）。两步之外不再有别的外圈，法盘底晕因此不放大。
 */
const CANDIDATE_ARC_OFFSET = 0.2;
/** 候选弧的线宽（占主印半径的比例）：比归一金环粗，才和「细一圈的金」分得开。 */
const CANDIDATE_ARC_WIDTH_RATIO = 0.16;
/** 候选弧的最小线宽（像素）：窄屏主印缩到 4px 半径时仍看得见。 */
const CANDIDATE_ARC_WIDTH_MIN = 2;
/** 候选弧的角长（弧度）：主印外沿上一段，短到不与整圈金环混淆、长到在半鱼旁读得出。 */
const CANDIDATE_ARC_SWEEP = Math.PI / 3;
/** 候选弧相对主印射线角的侧偏（弧度）：让弧心落在该侧的扇区，对应槽位点的左右偏移。 */
const CANDIDATE_ARC_SIDE_BIAS = Math.PI / 6;
/** 候选弧呼吸周期（秒）：慢呼吸，一次往返远长于归一金环流光的一圈（4.5s）。 */
export const CANDIDATE_BREATH_PERIOD = 2.6;
/** 候选弧呼吸的最低不透明度：全程可见，只是有节拍地强弱（不做逐节点闪动）。 */
const CANDIDATE_BREATH_MIN = 0.4;
/** 候选弧呼吸的最高不透明度。 */
const CANDIDATE_BREATH_MAX = 1;

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

/**
 * 一个候选动作的落点（票 03）：会变的那一侧。由 `resolveCandidateTarget` 从候选载荷与盘面解出，
 * 与按钮文案的目标五行同源（`getActionTargetElement`），不从抽中天干的极性推导。
 */
export interface BoardCandidatePath extends CandidateTarget {}

/** Ring ownership remains warm/solid and cool/dashed (ADR 0015). */
const BOARD_BG_COLOR = THEME.deep;
/**
 * 环带：内环暖色实线带（己方盘）、外环冷色虚线带（对方盘）。
 * 环带本身承载「这块盘是谁的」，不再用两个大面积底晕——底晕会互相叠成一团浑色。
 */
const OWN_BAND_EDGE = THEME.goldDim;
const OWN_RING_COLOR = THEME.gold;
const OPPONENT_BAND_EDGE = THEME.edge;
const OPPONENT_RING_COLOR = THEME.rival;
/** 环归属标签画在两枚主印之间的空位上（正下方）。 */
const RING_LABEL_ANGLE = Math.PI / 2;
const RING_LABEL_PADDING_X = 8;
const RING_LABEL_PADDING_Y = 4;

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
  /** 决策期的候选落点（键为 `player:element:polarity`）；弧与盘面等级、连线高亮都无关（票 03）。 */
  private _candidates: BoardCandidatePath[] = [];
  /** 候选弧的呼吸相位（0..1）：所有候选共用一个节拍，做不到逐节点独立闪动（票 03）。 */
  private _breathPhase = 0;
  /** 表现层时钟（秒），由 `tick` 推进；只驱动归一 / 亢极柔光，不参与任何投影。 */
  private _clock = 0;

  public constructor(layout: Partial<BoardViewLayout> = {}) {
    super();
    this._layout = { ...DEFAULT_BOARD_LAYOUT, ...layout };
    this._rebuild();
  }

  /** 当前生效的极坐标布局参数（快照副本）。 */
  public get layout(): Readonly<BoardViewLayout> {
    return { ...this._layout };
  }

  /**
   * 推进表现层时钟（秒）：驱动归一 / 亢极的流动与候选弧的同相位慢呼吸。
   * 命名不叫 `update`——那个名字已被双盘快照投影占用（LLD §4.1）。
   */
  public tick(dt: number): void {
    this._clock += dt;
    // 慢呼吸：共用一条相位曲线，所有候选弧同时亮 / 同时暗——玩家才分得清「这里能打」。
    this._breathPhase = (this._clock / CANDIDATE_BREATH_PERIOD) % 1;
  }

  /** 按视口自适应：圆心取视口中心，内外环半径与主印半径按短边等比缩放。 */
  public resize(width: number, height: number, bounds?: { top: number; bottom: number }): void {
    let span = Math.min(width, height);
    let centerY = height / 2;
    let sealSize = span * SEAL_SIZE_RATIO;
    let innerRadius = span * INNER_RADIUS_RATIO;
    let outerRadius = span * OUTER_RADIUS_RATIO;
    if (bounds !== undefined) {
      const available = Math.max(100, bounds.bottom - bounds.top);
      const minInner = available < 244 ? Math.min(40, Math.max(30, (available - 80) / 3.3)) : 40;
      const minSeal = available < 244 ? Math.max(4, (available - minInner * 2 - 46) / 6.54) : 18;
      const dimensions = (size: number) => {
        const seal = Math.max(minSeal, size * SEAL_SIZE_RATIO);
        const inner = Math.max(minInner, size * INNER_RADIUS_RATIO);
        const outer = Math.max(
          size * OUTER_RADIUS_RATIO,
          inner + seal * (1 + OPPONENT_SEAL_SCALE) + 3,
        );
        return { seal, inner, outer, height: outer * 2 + seal * 2.9 + 40 };
      };
      let low = 0;
      let high = span;
      for (let i = 0; i < 20; i++) {
        const mid = (low + high) / 2;
        if (dimensions(mid).height <= available) low = mid;
        else high = mid;
      }
      span = low;
      const fitted = dimensions(span);
      sealSize = fitted.seal;
      innerRadius = fitted.inner;
      outerRadius = fitted.outer;
      centerY = bounds.top + outerRadius + sealSize + 14;
    }
    this._layout = {
      ...this._layout,
      centerX: width / 2,
      centerY,
      innerRadius,
      outerRadius,
      sealSize,
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

  /**
   * 设置决策期的候选落点（票 03）：每个候选在「会变的那一侧」外侧画一段元素色弧。
   * 同一侧被多个候选共享时只画一段（按 `player:element:polarity` 去重）；
   * 传空数组清空（非抉择阶段、唯一候选的自动流转、PASS 都不画弧）。
   */
  public setCandidates(candidates: readonly BoardCandidatePath[]): void {
    const seen = new Set<string>();
    this._candidates = candidates.filter((candidate) => {
      const key = candidateKey(candidate);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /** 当前候选落点（副本）：决策期才有内容，供行为测试断言「候选 → 弧的落点」映射。 */
  public get candidates(): readonly BoardCandidatePath[] {
    return [...this._candidates];
  }

  /** 候选弧呼吸相位（0..1）：由 `tick` 推进，与归一 / 亢极的流动共用同一个时钟。 */
  public get breathPhase(): number {
    return this._breathPhase;
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

  /** 先画环带与主印，再叠归一 / 亢极柔光，最后画候选弧与环归属标签（都压在最上层）。 */
  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    this._drawEngraving(ctx);
    this._drawRingBands(ctx);
    this._drawSeals(ctx);
    this._drawNodeMarks(ctx);
    this._drawCandidateArcs(ctx);
    this._drawRingLabels(ctx);
  }

  /** Quiet backing and one ownership guide per ring; decoration does not encode state. */
  private _drawEngraving(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = 'rgba(8,27,34,0.72)';
    ctx.beginPath();
    ctx.arc(
      this._layout.centerX,
      this._layout.centerY,
      this._layout.outerRadius + this._layout.sealSize * NODE_AURA_OUTSET_RATIO,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }

  private _drawRingBands(ctx: CanvasRenderingContext2D): void {
    for (const [radius, color, dash] of [
      [this._layout.innerRadius, OWN_BAND_EDGE, []],
      [this._layout.outerRadius, OPPONENT_BAND_EDGE, [5, 5]],
    ] as const) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this._layout.centerX, this._layout.centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([...dash]);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * 归一 = 主印外一圈金环 + 沿环流动的金色高光；亢极 = 再叠元素色外溢（ADR 0018，票 02 修订）：
   * 中性、内外两盘一视同仁；环半径与外溢尺度按各自主印半径等比缩放。
   */
  private _drawNodeMarks(ctx: CanvasRenderingContext2D): void {
    for (const entry of this._elements) {
      drawNodeMark(
        ctx,
        entry.x,
        entry.y,
        entry.sealSize,
        entry.element,
        nodeMarkLayers(entry),
        this._clock,
      );
    }
  }

  /**
   * 决策期的候选落点弧（票 03）：每个候选在「会变的那一侧」外侧画一段元素色弧，
   * 所有候选共用同一个呼吸节拍（不逐节点闪动）。与票 02 的节点级常驻流动区分开：
   * 元素色 vs 金、半弧 vs 整圈、慢呼吸 vs 流动。
   */
  private _drawCandidateArcs(ctx: CanvasRenderingContext2D): void {
    for (const candidate of this._candidates) {
      const seal = this._elementView(candidate.player, candidate.element);
      drawCandidateArc(
        ctx,
        seal.x,
        seal.y,
        seal.angle,
        seal.sealSize,
        seal.element,
        candidate.polarity,
        candidateBreathAlpha(this._breathPhase),
      );
    }
  }

  /** Each node owns two independent fish. Element labels sit outside the readable silhouette. */
  private _drawSeals(ctx: CanvasRenderingContext2D): void {
    for (const entry of this._elements) {
      const radius = entry.sealSize;
      ctx.save();
      drawYinYangFish(ctx, entry.x, entry.y, radius, Polarity.YIN, entry.yin, entry.element);
      drawYinYangFish(ctx, entry.x, entry.y, radius, Polarity.YANG, entry.yang, entry.element);
      ctx.fillStyle = THEME.ivory;
      ctx.font = `bold ${Math.round(Math.max(11, radius * 0.5))}px ${THEME.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(WUXING_PALETTE[entry.element].name, entry.x, entry.y - radius - 10);
      ctx.restore();
    }
  }

  /** 环归属标签：把「己」「敌」钉在各自的环带上（主印之间的正下方空位）。 */
  private _drawRingLabels(ctx: CanvasRenderingContext2D): void {
    this._drawRingLabel(ctx, this._layout.innerRadius, '你', OWN_BAND_EDGE, OWN_RING_COLOR, 0.55);
    this._drawRingLabel(
      ctx,
      this._layout.outerRadius,
      '天道',
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
      `你 ${String(this._countGuiYi(OWN_PLAYER))}/${String(WUXING_COUNT)}`,
      this._layout.centerX - gap,
      y,
    );
    ctx.fillStyle = OPPONENT_RING_COLOR;
    ctx.fillText(
      `天道 ${String(this._countGuiYi(OPPONENT_PLAYER))}/${String(WUXING_COUNT)}`,
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

/** 主印的节点级状态层数：亢极 2、归一 1、其余 0（ADR 0018）。 */
function nodeMarkLayers(element: BoardElementView): 0 | 1 | 2 {
  if (element.isKangJi) return 2;
  if (element.isGuiYi) return 1;
  return 0;
}

/**
 * 画一个主印的节点级状态标记（ADR 0018，票 02 修订）：
 * 0 层不画；1 层（归一）= 一圈金环 + 沿环缓慢流动的金色高光；
 * 2 层（亢极）= 归一那一层之外再叠元素色柔光与外扩涟漪（满溢 / 泄露 / 不稳）。
 */
export function drawNodeMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sealSize: number,
  element: WuXing,
  layers: 0 | 1 | 2,
  time: number,
): void {
  if (layers === 0) return;
  const width = Math.max(NODE_RING_WIDTH_MIN, sealSize * NODE_RING_WIDTH_RATIO);
  const radius = sealSize * NODE_RING_SCALE;
  if (layers === 2) {
    const ink = WUXING_PALETTE[element];
    drawSoftAura(ctx, x, y, sealSize, ink, 0.85, KANGJI_OVERFLOW_SCALE, time);
    drawOverflowRipples(ctx, x, y, sealSize, ink, time);
  }
  drawRing(ctx, x, y, radius, GUIYI_RING_INK.main, width);
  drawRingFlow(ctx, x, y, radius, width, GUIYI_RING_INK.light, time);
}

/** 一圈金环。 */
function drawRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  lineWidth: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

/**
 * 沿环缓慢流动的金色高光：一段头部最亮、尾部渐隐的弧，绕环一圈 `GUIYI_FLOW_PERIOD` 秒。
 * 用多段小弧拼出渐隐拖尾（不用 `lineDashOffset`，避开与归属环带虚线语义混淆）。
 */
function drawRingFlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  lineWidth: number,
  color: string,
  time: number,
): void {
  const head = -Math.PI / 2 + ((time / GUIYI_FLOW_PERIOD) % 1) * Math.PI * 2;
  const steps = 48;
  ctx.save();
  for (let index = 0; index < steps; index += 1) {
    const t = index / steps;
    const a0 = head - GUIYI_FLOW_TAIL * t;
    const a1 = head - GUIYI_FLOW_TAIL * ((index + 1) / steps);
    ctx.beginPath();
    ctx.arc(x, y, radius, a1, a0);
    ctx.strokeStyle = withAlpha(color, (1 - t) ** 2 * 0.6);
    ctx.lineWidth = lineWidth * (1.6 - t * 0.6);
    ctx.stroke();
  }
  ctx.restore();
}

/** 一圈平滑径向柔光：光心随时间缓慢偏移（一侧偏亮），渐变淡到 0，没有硬边。 */
function drawSoftAura(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sealSize: number,
  ink: { readonly main: string; readonly light: string },
  strength: number,
  scale: number,
  time: number,
): void {
  const offsetX = Math.cos(time * 0.23) * sealSize * 0.3;
  const offsetY = Math.sin(time * 0.17) * sealSize * 0.3;
  const outer = sealSize * (scale + AURA_FALLOFF);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(x + offsetX, y + offsetY, sealSize * 0.78, x, y, outer);
  grad.addColorStop(0, withAlpha(ink.light, 0));
  grad.addColorStop(0.4, withAlpha(ink.light, 0.5 * strength));
  grad.addColorStop(0.75, withAlpha(ink.main, 0.22 * strength));
  grad.addColorStop(1, withAlpha(ink.main, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, outer, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 亢极外溢：元素色软边光带一圈圈向外扩、淡入再淡出，像装不住往外漫。 */
function drawOverflowRipples(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sealSize: number,
  ink: { readonly main: string; readonly light: string },
  time: number,
): void {
  const count = 1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let index = 0; index < count; index += 1) {
    const progress = (time * KANGJI_RIPPLE_SPEED + index / count) % 1;
    const eased = 1 - (1 - progress) ** 2;
    const radius =
      sealSize * (KANGJI_RIPPLE_INNER + eased * (KANGJI_RIPPLE_OUTER - KANGJI_RIPPLE_INNER));
    const alpha = 0.3 * Math.sin(Math.PI * progress) ** 1.2;
    const thickness = sealSize * KANGJI_RIPPLE_THICKNESS * (1 - progress * 0.3);
    const outer = radius + thickness;
    const grad = ctx.createRadialGradient(x, y, Math.max(0.1, radius - thickness), x, y, outer);
    grad.addColorStop(0, withAlpha(ink.main, 0));
    grad.addColorStop(0.5, withAlpha(ink.light, alpha));
    grad.addColorStop(1, withAlpha(ink.main, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, outer, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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

/**
 * 把 `#rrggbb` 压到指定不透明度（归一流光、亢极柔光与涟漪共用，避免为每档新增调色板常量）。
 */
function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return `rgba(${String(red)}, ${String(green)}, ${String(blue)}, ${String(alpha)})`;
}

/**
 * 画一条 S 形阴阳鱼：色相恒表五行身份，等级只走亮度阶梯（ADR 0018）。
 * 虚空 = 空心（元素色淡描边、无填充）、点亮 = 元素色实心、加持 = 实心 + 径向光晕 + 闪点、
 * 道损 = 暗化元素色实心 + 裂纹；四档都保留元素色描边。
 */
export function drawYinYangFish(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  polarity: Polarity,
  level: NodeLevel,
  element: WuXing,
): void {
  const yin = polarity === Polarity.YIN;
  const palette = WUXING_PALETTE[element];
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.arc(x, y, radius, -Math.PI / 2, Math.PI / 2, yin);
  ctx.arc(x, y + radius / 2, radius / 2, Math.PI / 2, -Math.PI / 2, true);
  ctx.arc(x, y - radius / 2, radius / 2, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  // 裂纹（道损）与闪点（加持）裁进鱼身；虚空是空心，不需要裁剪。
  if (level === 2 || level === -1) ctx.clip();
  if (level !== 0) {
    // 三档实心填充：点亮 = 元素本色、加持 = 径向光晕、道损 = 暗化元素色。
    if (level === 2) {
      const core = ctx.createRadialGradient(
        x,
        y + ((yin ? 1 : -1) * radius) / 2,
        0,
        x,
        y + ((yin ? 1 : -1) * radius) / 2,
        radius * 1.5,
      );
      core.addColorStop(0, palette.light);
      core.addColorStop(0.45, palette.light);
      core.addColorStop(1, palette.main);
      ctx.fillStyle = core;
      ctx.shadowColor = palette.main;
      ctx.shadowBlur = 7;
    } else {
      ctx.fillStyle = level === -1 ? palette.dark : palette.main;
    }
    ctx.fill();
  }
  // 四档都保留元素色描边：虚空最淡、道损暗化、点亮本色、加持亮色。
  ctx.strokeStyle =
    level === 0
      ? withAlpha(palette.main, VOID_OUTLINE_ALPHA)
      : level === -1
        ? palette.dark
        : level === 1
          ? palette.main
          : palette.light;
  ctx.lineWidth = level === 2 ? 2.2 : level === 0 ? 1.4 : 1;
  ctx.stroke();
  ctx.shadowBlur = 0;
  const eyeY = y + ((yin ? 1 : -1) * radius) / 2;
  ctx.beginPath();
  ctx.arc(x, eyeY, Math.max(2, radius * 0.13), 0, Math.PI * 2);
  ctx.fillStyle = yin ? '#112129' : '#e5eee4';
  ctx.fill();
  if (level === -1) {
    const side = yin ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(x + side * radius * 0.62, y - radius * 0.48);
    ctx.lineTo(x + side * radius * 0.36, y - radius * 0.1);
    ctx.lineTo(x + side * radius * 0.6, y + radius * 0.04);
    ctx.lineTo(x + side * radius * 0.72, y + radius * 0.48);
    ctx.strokeStyle = '#0b1d24';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  if (level === 2) {
    const sx = x + (yin ? -1 : 1) * radius * 0.66;
    ctx.beginPath();
    ctx.moveTo(sx - 2, y - 2);
    ctx.lineTo(sx + 2, y + 2);
    ctx.moveTo(sx + 2, y - 2);
    ctx.lineTo(sx - 2, y + 2);
    ctx.strokeStyle = palette.light;
    ctx.lineWidth = 1.5;
    ctx.stroke();
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

/** 连线高亮的键：`(kind, from)` 唯一确定一条连线。 */
function connectionKey(kind: BoardConnectionKind, from: WuXing): string {
  return `${kind}:${from}`;
}

/**
 * 画一段候选落点弧（票 03）：与主印同圆心，半径钉在归一金环（`NODE_RING_SCALE`）之外，
 * 只取落点那一侧的一段。与金环的区分：元素色 vs 金、一段 vs 整圈、慢呼吸 vs 流动（票 03 的衔接要求）。
 * 暗底上的元素色弧必须加色混合才读得出（票 02 的柔光经验），故先叠一层宽而淡的光晕再描边。
 */
export function drawCandidateArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  sealSize: number,
  element: WuXing,
  polarity: Polarity,
  alpha: number,
): void {
  const isYin = polarity === Polarity.YIN;
  // 金环外沿（半径 + 半线宽）之外再让出一段间隙，弧才读成「外侧的另一环信息」。
  const radius = sealSize * (NODE_RING_SCALE + NODE_RING_WIDTH_RATIO / 2 + CANDIDATE_ARC_OFFSET);
  const lineWidth = Math.max(CANDIDATE_ARC_WIDTH_MIN, sealSize * CANDIDATE_ARC_WIDTH_RATIO);
  // 主印左右两侧各偏同样一个角度（与槽位点的左右偏移同一侧），弧心因此落在该侧扇区内。
  const center = angle + (isYin ? -CANDIDATE_ARC_SIDE_BIAS : CANDIDATE_ARC_SIDE_BIAS);
  const start = center - CANDIDATE_ARC_SWEEP / 2;
  const end = center + CANDIDATE_ARC_SWEEP / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  // 先叠一层宽而淡的同色光晕：暗底上细描边会被底晕吃掉，宽光晕把它托出来。
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.arc(x, y, radius, start, end);
  ctx.strokeStyle = withAlpha(WUXING_PALETTE[element].light, 0.5);
  ctx.lineWidth = lineWidth * 2.5;
  ctx.lineCap = 'round';
  ctx.stroke();
  // 再描一段实边：光晕负责「亮」，实边负责「形状清楚」。
  ctx.beginPath();
  ctx.arc(x, y, radius, start, end);
  ctx.strokeStyle = WUXING_PALETTE[element].light;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

/**
 * 同相位慢呼吸（票 03）：一次低位与满值之间的往返。
 * 所有候选共用一个相位，半周期正弦一次到位——没有逐节点独立闪动。
 */
export function candidateBreathAlpha(phase: number): number {
  const wave = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  return CANDIDATE_BREATH_MIN + (CANDIDATE_BREATH_MAX - CANDIDATE_BREATH_MIN) * wave;
}

/** 候选弧键：`player:element:polarity` 唯一确定一段弧（同一侧被多个候选共享时不叠成两段）。 */
function candidateKey(candidate: BoardCandidatePath): string {
  return `${candidate.player}:${candidate.element}:${candidate.polarity}`;
}

/**
 * 把一个候选动作映射成它在法盘上的落点；不沿连线走的动作返回 `null`。
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
