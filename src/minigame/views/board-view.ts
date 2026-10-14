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
 * 主印半径的可读性下限（像素）：可用高度宽裕时不再往小缩——再小鱼身上的等级就读不出来了。
 * `MIN_SEAL_COMPACT` 是内容区极矮（只剩一条缝）时的下限。
 */
const MIN_SEAL_READABLE = 18;
const MIN_SEAL_COMPACT = 4;
/** 避让把主印挤小了也不能低于可读性下限的这个比例：再小就不成其为法盘了，宁可让外溢稍稍越界。 */
const SEAL_READABILITY_FLOOR = 0.6;

/**
 * 对方盘主印相对己方盘主印的缩放：外环只比内环略小，仍一眼分得清主次（ADR 0015 的「环级区分」）。
 * 只改尺寸、不改亮度——「暗」已被等级通道征用（虚空 = 空心），归属由环带实线 / 虚线与标签承担（ADR 0018）。
 */
export const OPPONENT_SEAL_SCALE = 0.92;

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
const NODE_RING_SCALE = 1.13;
const NODE_RING_WIDTH_RATIO = 0.07;
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
 * 法盘底晕（`_drawEngraving`）、盘面上下外沿与 `resize` 的高度预算都拿它当口径（票 05）。
 */
export const NODE_AURA_OUTSET_RATIO = KANGJI_OVERFLOW_SCALE + AURA_FALLOFF;
/** 亢极涟漪能扩到的最外半径：再叠上最大厚度也不超过 `NODE_AURA_OUTSET_RATIO`。 */
const KANGJI_RIPPLE_OUTER = NODE_AURA_OUTSET_RATIO - KANGJI_RIPPLE_THICKNESS;

/**
 * 金环外沿相对主印半径的最大外沿（环半径 + 半线宽；线宽的 1px 下界最多再多 0.5px，按比例算即可）。
 * `resize` 的环间距按它预留：环是实线，与相邻主印压不得（票 05）。
 */
export const NODE_RING_OUTSET_RATIO = NODE_RING_SCALE + NODE_RING_WIDTH_RATIO / 2;

/** 阴阳槽位相对主印中心在阴/阳一侧的横向偏移（占主印半径的比例）。 */
const SLOT_SIDE_RATIO = 0.7;

/** 跨环最小间隙（像素）：两枚主印的环外沿之间留这一点，不留就贴着。 */
const BOARD_RING_CLEARANCE = 3;

/**
 * 归元图例的基线位置与字号（占主印半径的比例与像素下界）：`_drawGuiYuanLegend` 与 `resize` 的高度预算共用，
 * 免得「算高度」与「画在哪儿」各存一份。
 */
export const LEGEND_BASELINE_RATIO = 2.2;
export const LEGEND_FONT_RATIO = 0.55;
export const LEGEND_FONT_MIN = 11;

/**
 * 图例文字下沿相对主印半径的外沿（比例部分；主印很小时字号有像素下界，实际下沿更靠外）。
 * `resize` 的可用高度按它留底，图例才不会被操作栏或结果条压住。
 */
export const LEGEND_OUTSET_RATIO = LEGEND_BASELINE_RATIO + LEGEND_FONT_RATIO / 2;

/** 盘面上下各留的边距：法盘顶到内容区上沿、外沿到下沿（像素）。 */
const BOARD_EDGE_PADDING = 14;

/**
 * 候选标记的尺度：直接染「会变的那半身」自己（不另画括号 / 弧）。三条线索——
 * **专属强调色**（`THEME.candidate` 系；不取五行色，靠色相而不是明暗，亮底上也读得出）、
 * **一条薄轮廓**（勾住半身形状）、**随呼吸胀缩**（位移不受底色影响）。
 *
 * 半身染色的透明度：两端都用强调紫，**外圈不能用近白**——近白会把半身洗白，肉眼读不到紫。
 * 保留约一半透明度，底层等级（虚空 / 点亮 / 加持）仍透得出来。
 */
const CANDIDATE_TINT_INNER_ALPHA = 0.5;
const CANDIDATE_TINT_OUTER_ALPHA = 0.72;
/**
 * 半身轮廓只用**一条薄边**勾形：颜色换成专属强调色之后，色相自己就能读，
 * 早前为救「淡白对比度」加的「外暗内亮双色粗边」不再需要——那会读成一条不自然的大粗边。
 * 线宽取与鱼身自身描边同一档，看起来仍是这条鱼自己的边在呼吸。
 */
const CANDIDATE_OUTLINE_ALPHA = 0.95;
const CANDIDATE_OUTLINE_WIDTH_RATIO = 0.07;
const CANDIDATE_OUTLINE_WIDTH_MIN = 1.5;
/** 柔光半径随呼吸伸缩的区间（占主印半径）。 */
const CANDIDATE_GLOW_MIN_RATIO = 0.92;
const CANDIDATE_GLOW_MAX_RATIO = 1.24;
/**
 * 半身标记随呼吸胀缩的比例：底色本来就亮的节点（归一后的金最明显）上，加色填充一加就打到
 * 上限、明暗变化看不出来，于是再给一条不依赖底色的位移线索（仍在金环内侧）。 */
const CANDIDATE_SWELL_MIN_RATIO = 1;
const CANDIDATE_SWELL_MAX_RATIO = 1.08;
/** 候选呼吸周期（秒）：慢呼吸，一次往返远长于归一金环流光的一圈（4.5s）。 */
export const CANDIDATE_BREATH_PERIOD = 2.6;
/** 呼吸的最低 / 最高不透明度：全程可见（低位也保持色相），只是有节拍地深浅。 */
const CANDIDATE_BREATH_MIN = 0.6;
/** 呼吸的最高不透明度。 */
const CANDIDATE_BREATH_MAX = 1;

/**
 * 按住预览时候选标记的呼吸倍率（票 04）：加快节拍，在节点级常驻流动之上仍读得出「我正在预览这一下」。
 * 所有候选共用一条相位，做不到只加快被按住那一个；「是哪一下」由路径箭头与目标侧幽灵态指出。
 */
export const PREVIEW_BREATH_SPEED = 3;
/**
 * 幽灵态的绘制不透明度：明显低于实心等级，玩家一眼能分出「这是结算后的样子，不是现在的样子」。
 * 先把目标半身压暗再画目标形态，否则「降级到虚空」会压在仍然实心的当前形态上看不出来。
 */
const GHOST_ALPHA = 0.85;
const GHOST_SCRIM_ALPHA = 0.5;
/**
 * 路径箭头的墨与线宽：复用候选标记的专属强调色（紫），与节点级状态的金色流光 / 元素外溢分开——
 * 箭头答的是「这一下走哪条线」，和「这里能打」（半身紫）属于同一层临时提示。
 */
const PREVIEW_ARROW_INK = THEME.candidateLit;
const PREVIEW_ARROW_ALPHA = 0.95;
const PREVIEW_ARROW_WIDTH_RATIO = 0.11;
const PREVIEW_ARROW_WIDTH_MIN = 2;
/** 内环相生弧箭相对内环外推的距离（占主印半径）：走到两环之间，不压主印也不压环带。 */
const PREVIEW_ARROW_RING_OFFSET = 0.9;
/** 箭头长度相对主印半径的区间（像素下界兜底）。 */
const PREVIEW_ARROW_HEAD_RATIO = 0.4;
const PREVIEW_ARROW_HEAD_MIN = 6;
/** 箭头的两撇相对箭尖长度的比例。 */
const PREVIEW_ARROW_BARB_RATIO = 0.7;
/** 相生弧箭两端的主印缩进上限（弧度）：主印在盘心张角超过它时按它截断。 */
const PREVIEW_ARROW_SEAL_ANGLE_MAX = 0.85;
/** 相生弧箭两端从主印中心各自缩进的比例（乘主印张角），留出与鱼形的间隙。 */
const PREVIEW_ARROW_PAD_RATIO = 0.35;
/** 突刺尾部相对源主印半径的间隙。 */
const PREVIEW_ATTACK_TAIL_GAP_RATIO = 0.15;
/** 突刺尖端越过目标主印外沿的距离（占主印半径）：贯穿敌节点，尖端从它外侧探出。 */
const PREVIEW_ATTACK_OVERSHOOT_RATIO = 0.7;
/** 突刺最宽处相对主印半径的宽度。 */
const PREVIEW_ATTACK_WAIST_RATIO = 0.42;
/** 最宽处落在尾到尖的哪个比例。 */
const PREVIEW_ATTACK_WAIST_AT = 0.32;
/** 两侧速度线相对主印半径的横向偏移。 */
const PREVIEW_ATTACK_SPEED_OFFSET_RATIO = 1.7;
/** 能量头循环一圈的秒数（能量反复从本阵喷向敌阵）。 */
const PREVIEW_ATTACK_FLOW_PERIOD = 1.1;
/** 能量头半径（占主印半径）。 */
const PREVIEW_ATTACK_HEAD_RATIO = 0.34;
/** 命中冲击波的最大半径（占敌主印半径）：从敌节点往外扩、淡出，给出「打实了」的重感。 */
const PREVIEW_ATTACK_SHOCK_SCALE = 1.6;

/**
 * 调息漩涡：从当前点亮侧（大半径）螺旋一卷到对侧（小半径），像能量被卷进节点里。
 * 调息节点不可能归一（对侧必 ≤ 0），主印外没有金环占位，所以可以绕到 1.4 倍主印半径。
 */
const PREVIEW_CONVERT_VORTEX_OUTER_RATIO = 1.4;
const PREVIEW_CONVERT_VORTEX_INNER_RATIO = 0.95;
/** 除半圈位移外额外多绕的整圈数。 */
const PREVIEW_CONVERT_VORTEX_TURNS = 1;
/** 调息一股能量从源侧卷到对侧的秒数。 */
const PREVIEW_CONVERT_FLOW_PERIOD = 1.6;
/** 调息流动尾长（占整条螺旋的比例）。 */
const PREVIEW_CONVERT_TAIL_RATIO = 0.55;
/** 漩涡线宽（占主印半径）。 */
const PREVIEW_CONVERT_WIDTH_RATIO = 0.11;
/** 漩涡采样段数。 */
const PREVIEW_CONVERT_SAMPLES = 90;

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
export type BoardCandidatePath = CandidateTarget;

/**
 * 按住按钮的预览（票 04）：这一下会走的连线 + 目标侧结算后的幽灵态。
 * 由 `GameScene` 在按下 / 松开时整体设置；`null` 表示回到决策期口径。
 */
export interface BoardPreview {
  /** 这一下会走的连线（化 / 强化 = 内环相生弧；破 / 强破 = 跨环径向）；PASS 等无路径时为 `null`。 */
  readonly path: BoardActivePath | null;
  /** 调息的同节点换侧（源侧 → 对侧）；非调息时不带（`null` / 缺省都表示不画）。 */
  readonly convert?: BoardConvert | null;
  /** 目标侧「下一步」形态：结算后的目标节点；无落点 / 净零变化时为 `null`。 */
  readonly ghost: BoardGhost | null;
}

/**
 * 调息的换侧方向（票 04 rev）：能量从当前点亮的一侧转到同节点的对侧。
 * 与 `path` 不同，它不跨节点，没有连线可借，用节点内的横向箭单独表达。
 */
export interface BoardConvert {
  readonly player: PlayerId;
  readonly element: WuXing;
  /** 能量从哪一侧转出（抽中天干所在、当前已点亮的那侧）。 */
  readonly from: Polarity;
  /** 转到哪一侧（幽灵态所在侧）。 */
  readonly to: Polarity;
}

/** 目标侧的幽灵态：结算后的目标节点（由 `resolvePreviewGhost` 真跑解析器得到）。 */
export interface BoardGhost {
  readonly player: PlayerId;
  readonly element: WuXing;
  readonly yin: NodeLevel;
  readonly yang: NodeLevel;
}

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
  /** 按住按钮的预览（票 04）：按下时收窄连线高亮并叠加箭头 / 幽灵态，松开回到决策期。 */
  private _preview: BoardPreview | null = null;
  /** 候选弧的呼吸相位（0..1）：所有候选共用一个节拍，做不到逐节点独立闪动（票 03）。 */
  private _breathPhase = 0;
  /** 表现层时钟（秒），由 `tick` 推进；只驱动归一 / 亢极柔光，不参与任何投影。 */
  private _clock = 0;
  /** 各节点达成归一的形成时刻（秒，键为 `${player}:${element}`），驱动光环独立起转时间。 */
  private readonly _guiYiFormedAt = new Map<string, number>();

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
    // 预览期整盘候选一起加快（同一条相位），「是哪一下」交给路径箭头与幽灵态。
    const speed = this._preview === null ? 1 : PREVIEW_BREATH_SPEED;
    this._breathPhase = (this._breathPhase + (dt * speed) / CANDIDATE_BREATH_PERIOD) % 1;
  }

  /**
   * 按视口自适应：内外环半径与主印半径按短边等比缩放，盘心落在可用区域里。
   *
   * 预留的不只是主印本身：票 02 之后主印外还有归一金环与亢极元素外溢，只按主印预留就会让它们压到
   * 相邻主印、盘外顶到操作栏或结果条。两套避让口径各司其职：
   *
   * 1. **环间距**按 `NODE_RING_OUTSET_RATIO` 预留：金环是实线，压不得。跨环直接推外环半径
   *    （内环主印的环外沿 + 外环主印的环外沿 + 间隙）；同环不相交则由另外两个更大的下限兼管——
   *    内环半径既不小于按短边算的值，也不小于可读性下限对应的值，两者都已远大于同环所需，
   *    故不再单列一条同环公式（单列的那条永远取不到 max，会是死代码）。
   * 2. **盘面外沿**按**最坏情况**预留：上下各留到标记最外缘（底部含归元图例），免得亢极外溢或图例
   *    越出内容边界。元素外溢那圈是渐隐到 0 的柔光，与相邻主印交叠只读成更亮的一层晕，交叠本身
   *    不算失败，故**不**拿它约束环间距（那会把主印压得看不清）——但盘外没有邻盘可交叠，越界就没得
   *    让，故外沿仍按满额预留。只有对方盘真的没有节点级标记时才按金环外沿收（省下的高度归主印）。
   * 3. **主印下限** `MIN_SEAL_READABLE`：高度宽裕时不再往小缩（再小鱼身上的等级就读不出来）；
   *    装不下时按比例让位给避让，但不低于 `MIN_SEAL_READABLE * SEAL_READABILITY_FLOOR`——
   *    再小就改不叫法盘了，宁可让外溢稍稍越界。
   *
   * 横向不另设约束：外环半径按短边比例算出，恒小于半宽（环带之外的部分才可能越界），
   * 故外环最外两枚主印的本体不会越出视口——测得到才写，写不到就是死代码。
   *
   * `bounds` 是原生胶囊与操作区之间的内容边界（`GameScene.layoutBoard` 传入）；没传就按视口短边缩放。
   */
  public resize(width: number, height: number, bounds?: { top: number; bottom: number }): void {
    const span = Math.min(width, height);
    const available = bounds === undefined ? height : Math.max(100, bounds.bottom - bounds.top);
    const top = bounds?.top ?? 0;
    const minInner = available < 244 ? Math.min(40, Math.max(30, (available - 80) / 3.3)) : 40;
    const floor = available < 244 ? MIN_SEAL_COMPACT : MIN_SEAL_READABLE;
    // 主印半径下限只管「再小就读不出来」：装不下时允许走到这个下限之下，
    // 上面的二分自然会把主印缩到刚好放得下（下限高于它时就宁可让外溢稍稍越界）。
    const sealFloor = floor * SEAL_READABILITY_FLOOR;
    // 对方盘的标记外沿按最坏情况（整盘都亢极）预留，但只在它真的有节点级标记时才收这份高度。
    const markOut = this._elements.some(
      (entry) => entry.player === OPPONENT_PLAYER && (entry.isGuiYi || entry.isKangJi),
    )
      ? NODE_AURA_OUTSET_RATIO
      : NODE_RING_OUTSET_RATIO;
    const dimensions = (size: number) => {
      const seal = Math.max(sealFloor, size * SEAL_SIZE_RATIO);
      const inner = Math.max(minInner, size * INNER_RADIUS_RATIO);
      const outer = Math.max(
        size * OUTER_RADIUS_RATIO,
        inner + seal * NODE_RING_OUTSET_RATIO * (1 + OPPONENT_SEAL_SCALE) + BOARD_RING_CLEARANCE,
      );
      const topEdge = outer + seal * OPPONENT_SEAL_SCALE * markOut;
      const bottomEdge = outer + seal * LEGEND_OUTSET_RATIO;
      return {
        seal,
        inner,
        outer,
        height: topEdge + bottomEdge + BOARD_EDGE_PADDING * 2,
      };
    };
    let low = 0;
    let high = span;
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      if (dimensions(mid).height <= available) low = mid;
      else high = mid;
    }
    const fitted = dimensions(low);
    this._layout = {
      ...this._layout,
      centerX: width / 2,
      // 盘心落在可用区域里：装得下就居中（bounds === undefined 时严格为视口中点）。
      centerY: bounds === undefined ? height / 2 : top + Math.max(fitted.height, available) / 2,
      innerRadius: fitted.inner,
      outerRadius: fitted.outer,
      sealSize: fitted.seal,
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

  /**
   * 设置 / 清除按住预览（票 04）：设置后连线高亮收窄到该动作的路径，并叠加路径箭头与目标侧幽灵态；
   * 传 `null` 回到决策期口径（高亮恢复为 `setActivePaths` 给的全部候选）。
   */
  public setPreview(preview: BoardPreview | null): void {
    this._preview = preview;
    this._rebuild();
  }

  /** 当前预览（`null` 表示未按住任何按钮）；返回内部引用，调用方只读。 */
  public get preview(): BoardPreview | null {
    return this._preview;
  }

  /** 一次投影双方只读棋盘快照；只读不写回（LLD §4.1）。 */
  public update(p1Board: BoardState, p2Board: BoardState): void {
    this._boards[OWN_PLAYER] = p1Board;
    this._boards[OPPONENT_PLAYER] = p2Board;
    this._syncGuiYiTimes();
    this._rebuild();
  }

  /**
   * 同步各节点归一形成时刻：
   * - 首次由未归一变为归一时，记录当下的表现层时钟；
   * - 失去归一时移除记录（后续重获归一将重新从零起转）；
   * - 进阶亢极或降级但仍归一时，保留既有时钟平滑延续。
   */
  private _syncGuiYiTimes(): void {
    const ring = buildGenerationRing();
    for (const player of BOARD_PLAYERS) {
      const board = this._boards[player];
      for (const element of ring) {
        const node = board?.[element];
        const isGuiYi = node !== undefined && isNodeGuiYi(node);
        const key = `${player}:${element}`;
        if (isGuiYi) {
          if (!this._guiYiFormedAt.has(key)) {
            this._guiYiFormedAt.set(key, this._clock);
          }
        } else {
          this._guiYiFormedAt.delete(key);
        }
      }
    }
  }

  /** 清空各节点归一形成时刻（重开对局或全盘重置时调用）。 */
  public resetGuiYiTimes(): void {
    this._guiYiFormedAt.clear();
  }

  /** 查询指定节点达成归一的形成时刻（秒）；未达成归一返回 undefined。 */
  public getGuiYiFormedAt(player: PlayerId, element: WuXing): number | undefined {
    return this._guiYiFormedAt.get(`${player}:${element}`);
  }

  /** 查询指定节点自达成归一以来的独立历时（秒）；未达成归一返回 0。 */
  public getGuiYiNodeTime(player: PlayerId, element: WuXing): number {
    const formedAt = this.getGuiYiFormedAt(player, element);
    if (formedAt === undefined) return 0;
    return Math.max(0, this._clock - formedAt);
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
      isActive: this._isActivePath(kind, from),
    };
  }

  /**
   * 一条连线当前是否被强调：按住预览时只强调被按住那一下的路径（`BoardPreview.path`），
   * 其余候选静默；未预览时回到 `setActivePaths` 给的全部候选路径。
   */
  private _isActivePath(kind: BoardConnectionKind, from: WuXing): boolean {
    const preview = this._preview;
    if (preview !== null) {
      return preview.path !== null && preview.path.kind === kind && preview.path.from === from;
    }
    return this._activePaths.has(connectionKey(kind, from));
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

  /** 先画环带与主印，再叠归一 / 亢极柔光，最后画候选弧、幽灵态与预览箭头（都压在最上层）。 */
  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    this._drawEngraving(ctx);
    this._drawRingBands(ctx);
    this._drawSeals(ctx);
    this._drawNodeMarks(ctx);
    this._drawCandidateMarks(ctx);
    this._drawGhost(ctx);
    this._drawPreviewArrow(ctx);
    this._drawConvertVortex(ctx);
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
      this._layout.outerRadius + this._layout.sealSize * NODE_RING_OUTSET_RATIO,
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
   * 旋转流光与亢极外溢采用各节点自达成归一以来的独立时钟，相位自然错开。
   */
  private _drawNodeMarks(ctx: CanvasRenderingContext2D): void {
    for (const entry of this._elements) {
      const key = `${entry.player}:${entry.element}`;
      const formedAt = this._guiYiFormedAt.get(key) ?? this._clock;
      const nodeTime = Math.max(0, this._clock - formedAt);
      drawNodeMark(
        ctx,
        entry.x,
        entry.y,
        entry.sealSize,
        entry.element,
        nodeMarkLayers(entry),
        nodeTime,
      );
    }
  }

  /**
   * 决策期的候选落点标记（票 03，rev）：每个候选把「会变的那半身」整片点亮，
   * 所有候选共用同一个呼吸节拍（不逐节点闪动）。与票 02 的节点级常驻流动区分开：
   * 元素色 vs 金、半边 vs 整圈、慢呼吸 vs 流动。
   */
  private _drawCandidateMarks(ctx: CanvasRenderingContext2D): void {
    for (const candidate of this._candidates) {
      const seal = this._elementView(candidate.player, candidate.element);
      drawCandidateMark(ctx, seal.x, seal.y, seal.sealSize, candidate.polarity, this._breathPhase);
    }
  }

  /**
   * 按住预览的目标侧幽灵态（票 04）：只画**真的会变**的那几侧结算后的形态。
   * 未变的半身一概不碰（否则升级 / 降级之外的半身也会被洗一层）。
   */
  private _drawGhost(ctx: CanvasRenderingContext2D): void {
    const ghost = this._preview?.ghost;
    if (ghost === null || ghost === undefined) return;
    const seal = this._elementView(ghost.player, ghost.element);
    const before = this._boards[ghost.player]?.[ghost.element] ?? VOID_NODE;
    for (const polarity of [Polarity.YIN, Polarity.YANG]) {
      const after = polarity === Polarity.YIN ? ghost.yin : ghost.yang;
      const prev = polarity === Polarity.YIN ? before.yin : before.yang;
      if (after === prev) continue;
      drawGhostHalf(ctx, seal.x, seal.y, seal.sealSize, seal.element, polarity, after);
    }
  }

  /** 按住预览的路径箭头（票 04）：化 / 强化 = 内环顺时针弧箭，破 / 强破 = 跨环径向箭。 */
  private _drawPreviewArrow(ctx: CanvasRenderingContext2D): void {
    if (this._preview === null) return;
    const width = Math.max(
      PREVIEW_ARROW_WIDTH_MIN,
      this._layout.sealSize * PREVIEW_ARROW_WIDTH_RATIO,
    );
    const head = Math.max(PREVIEW_ARROW_HEAD_MIN, this._layout.sealSize * PREVIEW_ARROW_HEAD_RATIO);
    for (const line of this._connections) {
      if (!line.isActive) continue;
      if (line.kind === 'generation') {
        this._drawGenerationArrow(ctx, line, width, head);
      } else {
        this._drawAttackThrust(ctx, line);
      }
    }
  }

  /** 内环相生弧箭：沿内环顺时针扫到相生目标，箭尖指向环序的下一个节点。 */
  private _drawGenerationArrow(
    ctx: CanvasRenderingContext2D,
    line: BoardConnectionView,
    width: number,
    head: number,
  ): void {
    const { centerX, centerY } = this._layout;
    const radius = this._layout.innerRadius + this._layout.sealSize * PREVIEW_ARROW_RING_OFFSET;
    const startAngle = Math.atan2(line.y1 - centerY, line.x1 - centerX);
    const endAngle = Math.atan2(line.y2 - centerY, line.x2 - centerX);
    // 内环顺时针 = 角度递增；相生目标恒在下一个环位，把差值归一到 (0, 2π)。
    const sweep = (((endAngle - startAngle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    // 弧两端的缩进：别伸进主印本体，留出与鱼形的间隙；弧太短时仍保住一段可见长度。
    const halfSealAngle = Math.asin(
      Math.min(
        PREVIEW_ARROW_SEAL_ANGLE_MAX,
        this._layout.sealSize / Math.max(1, this._layout.innerRadius),
      ),
    );
    const pad = Math.min(halfSealAngle, sweep * PREVIEW_ARROW_PAD_RATIO);
    const from = startAngle + pad;
    const to = startAngle + sweep - pad;
    if (to <= from) return;
    ctx.save();
    ctx.strokeStyle = withAlpha(PREVIEW_ARROW_INK, PREVIEW_ARROW_ALPHA);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, from, to);
    ctx.stroke();
    // 箭尖：沿角度递增的切向，落在弧的终点上。
    const tipX = centerX + radius * Math.cos(to);
    const tipY = centerY + radius * Math.sin(to);
    drawArrowHead(ctx, tipX, tipY, -Math.sin(to), Math.cos(to), head);
    ctx.restore();
  }

  /**
   * 相克的贯穿突刺（票 04 rev3，用户选定 B 方案）：一枚能量尖锥从本阵主印外沿刺向敌节点，
   * 尖端穿出敌印；两侧拉出速度线，落点处有向外扩的冲击波，尖端有能量头。不是一条平直线。
   */
  private _drawAttackThrust(ctx: CanvasRenderingContext2D, line: BoardConnectionView): void {
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const sealSize = this._layout.sealSize;
    const targetSeal = sealSize * OPPONENT_SEAL_SCALE;
    const tail = sealSize * (1 + PREVIEW_ATTACK_TAIL_GAP_RATIO);
    const tipDistance = length + targetSeal + sealSize * PREVIEW_ATTACK_OVERSHOOT_RATIO;
    if (tipDistance <= tail) return;
    const tailX = line.x1 + ux * tail;
    const tailY = line.y1 + uy * tail;
    const tipX = line.x1 + ux * tipDistance;
    const tipY = line.y1 + uy * tipDistance;
    const waistDistance = tail + (tipDistance - tail) * PREVIEW_ATTACK_WAIST_AT;
    const waistX = line.x1 + ux * waistDistance;
    const waistY = line.y1 + uy * waistDistance;
    const waist = sealSize * PREVIEW_ATTACK_WAIST_RATIO;
    const progress = (this._clock / PREVIEW_ATTACK_FLOW_PERIOD) % 1;

    ctx.save();
    // 尖锥本体：尾细、腰宽、尖端收成一点，渐变从尾部的暗紫到尖端的亮紫白。
    const body = ctx.createLinearGradient(tailX, tailY, tipX, tipY);
    body.addColorStop(0, withAlpha(THEME.candidateDeep, 0.05));
    body.addColorStop(0.45, withAlpha(THEME.candidate, 0.6));
    body.addColorStop(1, withAlpha('#ffffff', 0.98));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(waistX + nx * waist, waistY + ny * waist);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(waistX - nx * waist, waistY - ny * waist);
    ctx.closePath();
    ctx.fill();
    // 两侧速度线：随能量头前推而伸长。
    ctx.strokeStyle = withAlpha(THEME.candidateLit, 0.5);
    ctx.lineWidth = Math.max(1, sealSize * 0.05);
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      for (const [a, b] of [
        [0.3, 0.95],
        [0.15, 0.7],
      ] as const) {
        const s0 = tail + (tipDistance - tail) * a * (0.6 + 0.4 * progress);
        const s1 = tail + (tipDistance - tail) * b * (0.6 + 0.4 * progress);
        const offset = waist * PREVIEW_ATTACK_SPEED_OFFSET_RATIO * side;
        ctx.beginPath();
        ctx.moveTo(line.x1 + ux * s0 + nx * offset, line.y1 + uy * s0 + ny * offset);
        ctx.lineTo(line.x1 + ux * s1 + nx * offset, line.y1 + uy * s1 + ny * offset);
        ctx.stroke();
      }
    }
    // 命中冲击波：从敌节点向外扩、淡出，每圈能量头抵敌时重来一次。
    ctx.strokeStyle = withAlpha(THEME.candidateLit, 0.7 * (1 - progress));
    ctx.lineWidth = Math.max(1.2, sealSize * 0.09);
    ctx.beginPath();
    ctx.arc(
      line.x2,
      line.y2,
      targetSeal * (0.7 + progress * PREVIEW_ATTACK_SHOCK_SCALE),
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    // 尖端能量头。
    const headRadius = sealSize * PREVIEW_ATTACK_HEAD_RATIO;
    const glow = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, headRadius);
    glow.addColorStop(0, withAlpha('#ffffff', 0.95));
    glow.addColorStop(0.5, withAlpha(THEME.candidateLit, 0.55));
    glow.addColorStop(1, withAlpha(THEME.candidate, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(tipX, tipY, headRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 调息的内部流转（票 04 rev3，用户选定 B 方案漩涡）：一股能量从当前点亮侧（大半径）
   * 螺旋一卷卷到对侧（小半径），拖一条渐隐的尾——「转化」是卷进节点里，不是横线也不是半环。
   */
  private _drawConvertVortex(ctx: CanvasRenderingContext2D): void {
    const convert = this._preview?.convert;
    if (convert === null || convert === undefined) return;
    const seal = this._elementView(convert.player, convert.element);
    const fromRight = convert.from === Polarity.YANG;
    // 阴在左（π）、阳在右（0 / 2π）。
    const sourceAngle = fromRight ? 0 : Math.PI;
    const targetAngle = fromRight ? Math.PI : Math.PI * 2;
    const sweep = targetAngle - sourceAngle + Math.PI * 2 * PREVIEW_CONVERT_VORTEX_TURNS;
    const outer = seal.sealSize * PREVIEW_CONVERT_VORTEX_OUTER_RATIO;
    const inner = seal.sealSize * PREVIEW_CONVERT_VORTEX_INNER_RATIO;
    const width = Math.max(PREVIEW_ARROW_WIDTH_MIN, seal.sealSize * PREVIEW_CONVERT_WIDTH_RATIO);
    const progress = (this._clock / PREVIEW_CONVERT_FLOW_PERIOD) % 1;
    const samples = PREVIEW_CONVERT_SAMPLES;
    const pointAt = (s: number) => {
      const angle = sourceAngle + sweep * s;
      const radius = outer + (inner - outer) * s;
      return { x: seal.x + radius * Math.cos(angle), y: seal.y + radius * Math.sin(angle) };
    };

    ctx.save();
    ctx.lineCap = 'round';
    // 底螺旋：淡淡的整条，先把「卷进去」的路径交代清楚。
    ctx.strokeStyle = withAlpha(THEME.candidateDeep, 0.4);
    ctx.lineWidth = width;
    for (let index = 0; index < samples; index += 1) {
      const a = pointAt(index / samples);
      const b = pointAt((index + 1) / samples);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // 亮尾：从头往后渐隐，随能量头一起卷。
    for (let index = 0; index < samples; index += 1) {
      const s0 = index / samples;
      const behind = progress - s0;
      if (behind < 0 || behind >= PREVIEW_CONVERT_TAIL_RATIO) continue;
      const a = pointAt(s0);
      const b = pointAt((index + 1) / samples);
      const falloff = 1 - behind / PREVIEW_CONVERT_TAIL_RATIO;
      ctx.strokeStyle = withAlpha(THEME.candidateLit, falloff ** 1.5 * 0.95);
      ctx.lineWidth = width * (0.6 + falloff);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // 卷入末端的能量头。
    const headPoint = pointAt(progress);
    const headRadius = seal.sealSize * PREVIEW_ATTACK_HEAD_RATIO;
    const glow = ctx.createRadialGradient(
      headPoint.x,
      headPoint.y,
      0,
      headPoint.x,
      headPoint.y,
      headRadius,
    );
    glow.addColorStop(0, withAlpha('#ffffff', 0.95));
    glow.addColorStop(0.5, withAlpha(THEME.candidateLit, 0.55));
    glow.addColorStop(1, withAlpha(THEME.candidate, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(headPoint.x, headPoint.y, headRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Each node owns two independent fish. Element labels sit radially outside each ring's readable silhouette. */
  private _drawSeals(ctx: CanvasRenderingContext2D): void {
    for (const entry of this._elements) {
      const radius = entry.sealSize;
      const isInner = entry.player === OWN_PLAYER;
      const dir = isInner ? -1 : 1;
      const offset = Math.max(7, radius * 0.55);
      const labelX = entry.x + dir * Math.cos(entry.angle) * (radius + offset);
      const labelY = entry.y + dir * Math.sin(entry.angle) * (radius + offset);
      ctx.save();
      drawYinYangFish(ctx, entry.x, entry.y, radius, Polarity.YIN, entry.yin, entry.element);
      drawYinYangFish(ctx, entry.x, entry.y, radius, Polarity.YANG, entry.yang, entry.element);
      ctx.fillStyle = THEME.ivory;
      ctx.font = `bold ${Math.round(Math.max(11, radius * 0.5))}px ${THEME.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(WUXING_PALETTE[entry.element].name, labelX, labelY);
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
    const fontSize = Math.round(
      Math.max(LEGEND_FONT_MIN, this._layout.sealSize * LEGEND_FONT_RATIO),
    );
    const y =
      this._layout.centerY +
      this._layout.outerRadius +
      this._layout.sealSize * LEGEND_BASELINE_RATIO;
    const gap = Math.max(76, this._layout.sealSize * 4.4);
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
  traceFishHalf(ctx, x, y, radius, polarity);
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
 * 画一个候选落点标记（票 03，rev）：**直接亮「会变的那半身」自己**——把该半身的鱼形
 * 填一层元素色光（加色）、轮廓再描亮，随共享节拍慢呼吸。
 *
 * 不另画括号 / 弧：额外符号要先解码「这个括号代表什么」，而「阴鱼在闪 / 阳鱼在闪」
 * 是直接可读的（与按钮上的「(阴)」「(阳)」一一对应）。
 * 仍然只借「动」与「元素色」，不借亮度阶梯——鱼身的填充仍由等级决定（虚空依旧空心）；
 * 标记只在决策期出现，与常驻的归一金环 / 亢极外溢靠「只亮半边 + 同相位呼吸」区分。
 */
export function drawCandidateMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sealSize: number,
  polarity: Polarity,
  phase: number,
): void {
  const wave = breathWave(phase);
  const alpha = candidateBreathAlpha(phase);
  const glowOuter =
    sealSize *
    (CANDIDATE_GLOW_MIN_RATIO + (CANDIDATE_GLOW_MAX_RATIO - CANDIDATE_GLOW_MIN_RATIO) * wave);
  const swell =
    CANDIDATE_SWELL_MIN_RATIO + (CANDIDATE_SWELL_MAX_RATIO - CANDIDATE_SWELL_MIN_RATIO) * wave;
  ctx.save();
  ctx.globalAlpha = alpha;
  // 整个标记裁在鱼半身以内：不碰主印外的归一金环 / 亢极外溢，也不改变与邻印的间距。
  traceFishHalf(ctx, x, y, sealSize * swell, polarity);
  ctx.clip();
  // ① 整半身染上强调色。用正常混合而不是加色：加色在亮底上会洗成白，正是上一版与「加持」混淆的原因。
  const tint = ctx.createRadialGradient(x, y, sealSize * 0.1, x, y, glowOuter);
  tint.addColorStop(0, withAlpha(THEME.candidate, CANDIDATE_TINT_INNER_ALPHA));
  tint.addColorStop(1, withAlpha(THEME.candidateDeep, CANDIDATE_TINT_OUTER_ALPHA));
  ctx.fillStyle = tint;
  ctx.fill();
  // ② 一条薄边：勾住这半身的形状（与鱼身自身描边同一档线宽），不做粗边框。
  ctx.strokeStyle = withAlpha(THEME.candidateLit, CANDIDATE_OUTLINE_ALPHA);
  ctx.lineWidth =
    Math.max(CANDIDATE_OUTLINE_WIDTH_MIN, sealSize * CANDIDATE_OUTLINE_WIDTH_RATIO) * swell;
  ctx.stroke();
  ctx.restore();
}

/**
 * 目标侧幽灵态的单个半身：先把当前半身压暗（否则降级到虚空时看不出变化），
 * 再用半透明画结算后的等级形态——「下一步」是这个形状。
 */
function drawGhostHalf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  element: WuXing,
  polarity: Polarity,
  level: NodeLevel,
): void {
  ctx.save();
  traceFishHalf(ctx, x, y, radius, polarity);
  ctx.clip();
  ctx.globalAlpha = GHOST_SCRIM_ALPHA;
  ctx.fillStyle = THEME.ink;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = GHOST_ALPHA;
  drawYinYangFish(ctx, x, y, radius, polarity, level, element);
  ctx.restore();
}

/** 箭头头部：以 `(tipX, tipY)` 为尖、沿单位方向 `(dirX, dirY)` 退后 `size` 画两撇。 */
function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  dirX: number,
  dirY: number,
  size: number,
): void {
  const barbs = size * PREVIEW_ARROW_BARB_RATIO;
  const normalX = -dirY;
  const normalY = dirX;
  ctx.beginPath();
  ctx.moveTo(tipX - dirX * size + normalX * barbs, tipY - dirY * size + normalY * barbs);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(tipX - dirX * size - normalX * barbs, tipY - dirY * size - normalY * barbs);
  ctx.stroke();
}

/** 阴阳鱼的半身轮廓（与 `drawYinYangFish` 同一套 S 形）：阴在左、阳在右。 */
function traceFishHalf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  polarity: Polarity,
): void {
  const yin = polarity === Polarity.YIN;
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.arc(x, y, radius, -Math.PI / 2, Math.PI / 2, yin);
  ctx.arc(x, y + radius / 2, radius / 2, Math.PI / 2, -Math.PI / 2, true);
  ctx.arc(x, y - radius / 2, radius / 2, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
}

/**
 * 同相位慢呼吸（票 03）：一次低位与满值之间的往返。所有候选共用一个相位，
 * 半周期正弦一次到位——没有逐节点独立闪动；透明度与柔光半径都从这条波推。
 */
function breathWave(phase: number): number {
  return (1 - Math.cos(phase * Math.PI * 2)) / 2;
}

/** 该相位下的标记不透明度；导出供测试直接验呼吸两端。 */
export function candidateBreathAlpha(phase: number): number {
  return CANDIDATE_BREATH_MIN + (CANDIDATE_BREATH_MAX - CANDIDATE_BREATH_MIN) * breathWave(phase);
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
