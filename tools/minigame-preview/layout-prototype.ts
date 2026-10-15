/**
 * 布局原型（throwaway，非正式实现，不进微信构建）：在同一份**真实对局快照**上比较三种竖屏布局。
 *
 * 变体（`?variant=`）：
 * - A 人物上方 + 棋盘中央
 * - B 人物分列棋盘两侧
 * - C 人物融入背景 + 棋盘前景（小屏有重叠风险，见侧栏说明）
 *
 * 数据与组件都用**真实**的：快照由真实 `GameScene` 在内存里跑到固定种子 / 回合后冻结；
 * 盘面用真实 `BoardView` 投影同一份只读快照；按钮与「上一招」用真实 `ActionBarView` / `ActionResultView`；
 * 角色用仓库现有占位素材 `minigame/assets/characters.png` + 真实 `drawCharacterSprite`；背景用真实 `drawLandscape`。
 * 本文件只写「放在哪、怎么排」和少量原创氛围草图，不复制任何规则或动作引擎。
 *
 * 按钮为静态展示：`createFrozenTurnManager` 的 `executeAction` 是 no-op，点击不会结算、不写回快照。
 */
import {
  CHARACTER_ATLAS_FRAMES,
  CharacterSpriteAtlas,
  drawCharacterSprite,
} from '@guiyuan/game/minigame/character-sprite.js';
import { GameScene } from '@guiyuan/game/minigame/game-scene.js';
import { resolveCandidateTarget } from '@guiyuan/game/minigame/candidate-target.js';
import { Container } from '@guiyuan/game/minigame/scene/container.js';
import { InputManager } from '@guiyuan/game/minigame/scene/input-manager.js';
import { drawLandscape, drawPanel, THEME } from '@guiyuan/game/minigame/theme.js';
import { Button } from '@guiyuan/game/minigame/scene/button.js';
import { ActionBarView } from '@guiyuan/game/minigame/views/action-bar-view.js';
import {
  ACTION_LABEL,
  ActionResultView,
  changedNodes,
  describeNodeChange,
  LEVEL_LABEL,
  NodeChange,
} from '@guiyuan/game/minigame/views/action-result-view.js';
import {
  BoardView,
  drawYinYangFish,
  LEGEND_BASELINE_RATIO,
  resolveActionPath,
} from '@guiyuan/game/minigame/views/board-view.js';
import { WUXING_PALETTE } from '@guiyuan/game/minigame/pixel-art.js';
import { TurnManager } from '@guiyuan/game/core/logic/TurnManager.js';
import {
  ActionPayload,
  ActionType,
  GameState,
  NodeLevel,
  PlayerId,
  Polarity,
  TianGanInfo,
  WuXing,
} from '@guiyuan/game/core/types/domain.js';

type VariantKey = 'A' | 'B' | 'C';

interface LastActionResult {
  readonly actor: PlayerId;
  readonly actionType: ActionType;
  readonly stem: string;
  readonly changes: readonly NodeChange[];
  readonly note?: string;
}

/** 从真实对局里冻结出来的只读快照：三个布局共用这一份。 */
interface Snapshot {
  readonly state: GameState;
  readonly tianGan: TianGanInfo | null;
  readonly actions: readonly ActionPayload[];
  readonly lastAction: LastActionResult | null;
}

interface VariantMeta {
  readonly key: VariantKey;
  readonly title: string;
  readonly blurb: string;
}

const VARIANTS: readonly VariantMeta[] = [
  {
    key: 'A',
    title: '人物上方 + 棋盘中央',
    blurb:
      '顶部一条人物舞台，棋盘在中央拿最大可用高度，操作栏与「上一招」贴底。信息层级与当前游戏最接近，只是人物更大。',
  },
  {
    key: 'B',
    title: '人物分列棋盘两侧',
    blurb: '左右窄侧栏放人物，棋盘被挤成中间窄列。窄屏上盘面会明显变小——本原型如实呈现这个代价。',
  },
  {
    key: 'C',
    title: '人物融入背景 + 棋盘前景',
    blurb:
      '人物压暗进背景，棋盘前景最大，靠盘下一圈暗场保证可读。小屏上人物与盘面重叠更多，是本方案要盯的风险点。',
  },
];

const SAFE_TOP = 10;
const SAFE_BOTTOM = 12;
const SIDE_MARGIN = 10;
const REF_WIDTH = 460;
const DEFAULT_SEED = 13;
const DEFAULT_ROUND = 4;
const MAX_CAPTURE_STEPS = 60 * 60 * 20;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/* ---------------------------------------------------------------- 快照捕获 */

/** 用真实 `GameScene` 跑到「第 targetRound 回合、玩家抉择中」后冻结；驱动固定取第一个候选，可复现。 */
function captureSnapshot(
  seed: number,
  targetRound: number,
): { snapshot: Snapshot; turnManager: TurnManager } {
  const engine = new GameScene({
    width: REF_WIDTH,
    height: 900,
    safeTop: SAFE_TOP,
    safeBottom: SAFE_BOTTOM,
    seed,
  });
  const bus = engine.turnManager.getEventBus();
  let before: GameState | null = null;
  let lastAction: LastActionResult | null = null;
  bus.on('action:execute', () => {
    before = engine.turnManager.getState();
  });
  bus.on('action:executed', (event) => {
    const after = engine.turnManager.getState();
    lastAction = {
      actor: event.player,
      actionType: event.actionType,
      stem: engine.visualTurn.stem?.name ?? '',
      changes: changedNodes(before, after),
      note: engine.lastAction.note,
    };
    before = null;
  });
  engine.start();
  const dt = 1 / 60;
  for (let steps = 0; steps < MAX_CAPTURE_STEPS; steps += 1) {
    if (engine.phase === 'awaiting-player') {
      const state = engine.turnManager.getState();
      if (state.round >= targetRound) break;
      const action = engine.turnManager.getAvailableActions()[0];
      if (action === undefined) break;
      if (!engine.turnManager.executeAction(action).success) break;
      continue;
    }
    if (engine.phase === 'game-over') break;
    engine.update(dt);
  }
  const state = engine.turnManager.getState();
  return {
    snapshot: {
      state,
      tianGan: engine.turnManager.getCurrentTianGan(),
      actions: [...engine.turnManager.getAvailableActions()],
      lastAction,
    },
    turnManager: engine.turnManager,
  };
}

/** 只读门面：真实 `ActionBarView` 照常读候选与阶段，但 `executeAction` 不落盘，静态快照不被改写。 */
function createFrozenTurnManager(real: TurnManager, onBlocked: () => void): TurnManager {
  const facade: Partial<TurnManager> = {
    getState: () => real.getState(),
    getCurrentTianGan: () => real.getCurrentTianGan(),
    getCurrentPhase: () => real.getCurrentPhase(),
    getAvailableActions: () => real.getAvailableActions(),
    isExtraTurnActive: () => real.isExtraTurnActive(),
    getEventBus: () => real.getEventBus(),
    executeAction: () => {
      onBlocked();
      return {
        success: false,
        nextState: real.getState(),
        scoreDelta: 0,
        extraTurn: false,
        message: '布局原型为静态快照，不执行动作',
      };
    },
  };
  return facade as TurnManager;
}

/* ------------------------------------------------------------ 通用绘制部件 */

/** 只负责在场景树里画一笔的原型节点。 */
class PaintNode extends Container {
  public paint: (ctx: CanvasRenderingContext2D) => void = () => {};

  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    this.paint(ctx);
  }
}

/** 角色占位：真实图集 + 真实 `drawCharacterSprite`，只换槽位大小与位置。 */
class FigureNode extends Container {
  public tick = 0;
  public slotWidth = 120;
  public slotHeight = 180;

  public constructor(
    private readonly atlas: CharacterSpriteAtlas,
    private readonly player: PlayerId,
  ) {
    super();
  }

  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    drawCharacterSprite(
      ctx,
      this.atlas,
      this.player,
      'idle',
      this.tick * 60,
      0,
      0,
      this.slotWidth,
      this.slotHeight,
    );
  }
}

interface TextOptions {
  readonly size?: number;
  readonly bold?: boolean;
  readonly color?: string;
  readonly align?: CanvasTextAlign;
  readonly baseline?: CanvasTextBaseline;
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  options: TextOptions = {},
): void {
  ctx.save();
  ctx.font = `${options.bold === true ? 'bold ' : ''}${options.size ?? 11}px ${THEME.font}`;
  ctx.fillStyle = options.color ?? THEME.ivory;
  ctx.textAlign = options.align ?? 'center';
  ctx.textBaseline = options.baseline ?? 'middle';
  ctx.fillText(value, x, y);
  ctx.restore();
}

/** 一道笔压渐变的横向墨线 + 下方淡雾：给人物一条「站得住」的地平线。 */
function drawInkGround(
  ctx: CanvasRenderingContext2D,
  x: number,
  width: number,
  y: number,
  accent: string,
): void {
  ctx.save();
  const line = ctx.createLinearGradient(x, 0, x + width, 0);
  line.addColorStop(0, 'rgba(216,184,118,0)');
  line.addColorStop(0.5, accent);
  line.addColorStop(1, 'rgba(216,184,118,0)');
  ctx.fillStyle = line;
  ctx.fillRect(x, y, width, 1.2);
  const mist = ctx.createLinearGradient(0, y, 0, y + 30);
  mist.addColorStop(0, 'rgba(163,184,179,0.10)');
  mist.addColorStop(1, 'rgba(163,184,179,0)');
  ctx.fillStyle = mist;
  ctx.fillRect(x, y, width, 30);
  ctx.restore();
}

/** 原创草图：月洞式细弧，只作氛围，不代表最终画风。 */
function drawMoonArc(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 8, Math.PI * 1.14, Math.PI * 1.86);
  ctx.stroke();
  ctx.restore();
}

/** 侧栏底：竖向淡染 + 内侧一条归属色细线（B 用）。 */
function drawRail(
  ctx: CanvasRenderingContext2D,
  x: number,
  width: number,
  top: number,
  bottom: number,
  accent: string,
  innerOnLeft: boolean,
): void {
  ctx.save();
  const wash = ctx.createLinearGradient(0, top, 0, bottom);
  wash.addColorStop(0, 'rgba(16,46,53,0)');
  wash.addColorStop(0.42, 'rgba(16,46,53,0.62)');
  wash.addColorStop(1, 'rgba(16,46,53,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(x, top, width, bottom - top);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(innerOnLeft ? x + width - 1 : x, top + 12, 1, bottom - top - 24);
  ctx.restore();
}

/** 顶部状态条：三个布局共用同一份状态，只换承载方式（面板 / 浮字）。 */
function drawStatusStrip(
  ctx: CanvasRenderingContext2D,
  width: number,
  snapshot: Snapshot,
  style: 'panel' | 'float',
): void {
  const { state, tianGan } = snapshot;
  const height = 32;
  const y = SAFE_TOP;
  const centerY = y + height / 2;
  const elementName = tianGan === null ? '—' : WUXING_PALETTE[tianGan.element].name;
  const stem =
    tianGan === null
      ? '未抽签'
      : `${tianGan.name}${elementName}${tianGan.polarity === Polarity.YANG ? '阳' : '阴'}`;
  const turn = state.currentPlayer === 'P1' ? '你行动' : '天道行动';
  const score = `${String(state.players.P1.score)} : ${String(state.players.P2.score)}`;

  if (style === 'panel') {
    drawPanel(
      ctx,
      SIDE_MARGIN,
      y,
      width - SIDE_MARGIN * 2,
      height,
      THEME.edge,
      'rgba(12,37,45,0.78)',
    );
  } else {
    ctx.save();
    ctx.fillStyle = 'rgba(163,184,179,0.22)';
    ctx.fillRect(SIDE_MARGIN, y + height, width - SIDE_MARGIN * 2, 1);
    ctx.restore();
  }

  text(
    ctx,
    `第 ${String(state.round)}/${String(state.maxRounds)} 回合`,
    SIDE_MARGIN + 12,
    centerY,
    {
      size: 11,
      color: THEME.muted,
      align: 'left',
    },
  );
  if (style === 'panel') {
    text(ctx, `天干 ${stem}`, width / 2, centerY, { size: 12, bold: true, color: THEME.gold });
    text(ctx, turn, width - SIDE_MARGIN - 12, centerY, {
      size: 11,
      color: state.currentPlayer === 'P1' ? THEME.jade : THEME.rival,
      align: 'right',
    });
  } else {
    text(ctx, `天干 ${stem}`, width / 2 - 20, centerY, { size: 12, bold: true, color: THEME.gold });
    text(ctx, `${turn} · ${score}`, width - SIDE_MARGIN - 12, centerY, {
      size: 11,
      color: state.currentPlayer === 'P1' ? THEME.jade : THEME.rival,
      align: 'right',
    });
  }
}

/** 角色名牌：名字 + 分数（+ 当前行动方）。 */
function drawPlayerLabel(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  nameY: number,
  scoreY: number,
  player: PlayerId,
  state: GameState,
): void {
  const color = player === 'P1' ? THEME.jade : THEME.rival;
  const current = state.currentPlayer === player;
  text(ctx, player === 'P1' ? '你 · 弈者' : '天道', centerX, nameY, {
    size: 12,
    bold: true,
    color: current ? THEME.gold : color,
  });
  text(
    ctx,
    `得分 ${String(state.players[player].score)}${current ? ' · 行动中' : ''}`,
    centerX,
    scoreY,
    { size: 11, color: current ? THEME.gold : THEME.ivory },
  );
}

/** 法盘图例：与当前游戏同一口径（真源 `GameScene.drawDecisionGuide` 的移植，只画不判）。 */
function drawBoardLegend(ctx: CanvasRenderingContext2D, width: number, board: BoardView): void {
  const layout = board.layout;
  const yGui = layout.centerY + layout.outerRadius + layout.sealSize * LEGEND_BASELINE_RATIO;
  ctx.save();
  ctx.fillStyle = THEME.muted;
  ctx.font = `11px ${THEME.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('木示例', (width * 0.5) / 4 - 13, yGui);
  ctx.fillText('左阴 · 右阳', width / 2, yGui);
  const yLevels = yGui + 20;
  const levels: readonly NodeLevel[] = [-1, 0, 1, 2];
  for (const [index, level] of levels.entries()) {
    const column = (width * (index + 0.5)) / 4;
    drawYinYangFish(ctx, column - 13, yLevels, 7, Polarity.YIN, level, WuXing.WOOD);
    drawYinYangFish(ctx, column - 13, yLevels, 7, Polarity.YANG, level, WuXing.WOOD);
    ctx.fillStyle = THEME.ivory;
    ctx.textAlign = 'left';
    ctx.fillText(LEVEL_LABEL[level], column - 2, yLevels);
  }
  ctx.restore();
}

/* -------------------------------------------------------------- 布局变体 */

interface VariantBase {
  readonly snapshot: Snapshot;
  readonly turnManager: TurnManager;
  readonly atlas: CharacterSpriteAtlas;
  readonly width: number;
  readonly height: number;
}

interface VariantScene {
  readonly root: Container;
  readonly board: BoardView;
  readonly figures: readonly FigureNode[];
  resize(width: number, height: number): void;
  tick(dt: number): void;
  releasePresses(): void;
  dispose(): void;
}

interface Footer {
  readonly actionBar: ActionBarView;
  readonly result: ActionResultView;
}

function createFooter(base: VariantBase): Footer {
  const actionBar = new ActionBarView({
    turnManager: base.turnManager,
    width: base.width - SIDE_MARGIN * 2,
  });
  actionBar.refresh();
  const result = new ActionResultView(base.width - 20);
  result.x = SIDE_MARGIN;
  const last = base.snapshot.lastAction;
  if (last !== null) {
    result.setResult(last.actor, last.actionType, last.stem, last.changes, last.note);
  }
  return { actionBar, result };
}

/** 把操作栏与「上一招」贴到安全区底部，返回棋盘可用内容区下沿。 */
function placeFooter(footer: Footer, width: number, height: number): number {
  footer.actionBar.resize(width - SIDE_MARGIN * 2);
  footer.actionBar.x = SIDE_MARGIN;
  footer.actionBar.y = height - SAFE_BOTTOM - footer.actionBar.contentHeight;
  footer.result.resize(width - 20);
  footer.result.x = SIDE_MARGIN;
  footer.result.y = footer.actionBar.y - 42;
  return (footer.result.visible ? footer.result.y : footer.actionBar.y) - 8;
}

/** 一次投影：盘面只读快照 + 候选弧 / 高亮连线（与 `GameScene` 同一套真实投影函数）。 */
function projectBoard(board: BoardView, snapshot: Snapshot): void {
  const { state, tianGan, actions } = snapshot;
  board.update(state.players.P1.board, state.players.P2.board);
  if (tianGan === null) return;
  const paths = actions
    .map((action) => resolveActionPath(action.actionType, tianGan.element))
    .filter((path) => path !== null);
  const candidates = actions
    .map((action) =>
      resolveCandidateTarget(action, {
        tianGan,
        boards: { P1: state.players.P1.board, P2: state.players.P2.board },
      }),
    )
    .filter((target) => target !== null);
  board.setActivePaths(paths);
  board.setCandidates(candidates);
}

function actionButtonList(footer: Footer): readonly Button[] {
  return footer.actionBar.getButtons();
}

/** A：人物上方舞台 + 棋盘中央。 */
function buildVariantA(base: VariantBase): VariantScene {
  const { snapshot, atlas } = base;
  const root = new Container();
  const footer = createFooter(base);
  const board = new BoardView();
  projectBoard(board, snapshot);
  const p1 = new FigureNode(atlas, 'P1');
  const p2 = new FigureNode(atlas, 'P2');
  const geometry = {
    width: base.width,
    height: base.height,
    stageTop: 0,
    stageBottom: 0,
    groundY: 0,
  };

  const backdrop = new PaintNode();
  backdrop.paint = (ctx) => {
    drawLandscape(ctx, geometry.width, geometry.height);
    drawMoonArc(
      ctx,
      geometry.width * 0.27,
      p1.y + p1.slotHeight * 0.42,
      Math.min(p1.slotWidth, 96) * 0.52,
      'rgba(216,184,118,0.20)',
    );
    drawMoonArc(
      ctx,
      geometry.width * 0.73,
      p2.y + p2.slotHeight * 0.42,
      Math.min(p2.slotWidth, 96) * 0.52,
      'rgba(134,184,203,0.18)',
    );
    drawInkGround(
      ctx,
      SIDE_MARGIN + 6,
      geometry.width - (SIDE_MARGIN + 6) * 2,
      geometry.groundY,
      'rgba(216,184,118,0.42)',
    );
  };
  const status = new PaintNode();
  status.paint = (ctx) => {
    drawStatusStrip(ctx, geometry.width, snapshot, 'panel');
  };
  const tags = new PaintNode();
  tags.paint = (ctx) => {
    drawPlayerLabel(
      ctx,
      geometry.width * 0.27,
      geometry.stageBottom - 30,
      geometry.stageBottom - 14,
      'P1',
      snapshot.state,
    );
    drawPlayerLabel(
      ctx,
      geometry.width * 0.73,
      geometry.stageBottom - 30,
      geometry.stageBottom - 14,
      'P2',
      snapshot.state,
    );
  };
  const legend = new PaintNode();
  legend.paint = (ctx) => {
    drawBoardLegend(ctx, geometry.width, board);
  };

  function resize(width: number, height: number): void {
    geometry.width = width;
    geometry.height = height;
    const contentBottom = placeFooter(footer, width, height);
    const stageTop = SAFE_TOP + 36;
    const stageHeight = clamp(height * 0.27, 168, 248);
    geometry.stageTop = stageTop;
    geometry.stageBottom = stageTop + stageHeight;
    const figureWidth = Math.min(width * 0.42, 190);
    const figureHeight = stageHeight - 48;
    p1.slotWidth = figureWidth;
    p2.slotWidth = figureWidth;
    p1.slotHeight = figureHeight;
    p2.slotHeight = figureHeight;
    p1.x = width * 0.27 - figureWidth / 2;
    p2.x = width * 0.73 - figureWidth / 2;
    p1.y = stageTop + 2;
    p2.y = stageTop + 2;
    geometry.groundY = p1.y + figureHeight - 8;
    board.resize(width, height, { top: geometry.stageBottom + 4, bottom: contentBottom - 6 });
    root.hitArea = { x: 0, y: 0, width, height };
  }

  for (const child of [
    backdrop,
    board,
    p1,
    p2,
    tags,
    legend,
    footer.result,
    footer.actionBar,
    status,
  ]) {
    root.addChild(child);
  }
  const scene: VariantScene = {
    root,
    board,
    figures: [p1, p2],
    resize,
    tick: (dt) => {
      p1.tick += dt;
      p2.tick += dt;
    },
    releasePresses: () => {
      for (const button of actionButtonList(footer)) button.release();
    },
    dispose: () => footer.actionBar.dispose(),
  };
  scene.resize(base.width, base.height);
  return scene;
}

/** B：人物分列棋盘两侧。 */
function buildVariantB(base: VariantBase): VariantScene {
  const { snapshot, atlas } = base;
  const root = new Container();
  const footer = createFooter(base);
  const board = new BoardView();
  projectBoard(board, snapshot);
  const p1 = new FigureNode(atlas, 'P1');
  const p2 = new FigureNode(atlas, 'P2');
  const geometry = {
    width: base.width,
    height: base.height,
    railWidth: 0,
    railTop: 0,
    railBottom: 0,
  };

  const backdrop = new PaintNode();
  backdrop.paint = (ctx) => {
    drawLandscape(ctx, geometry.width, geometry.height);
    drawRail(ctx, 0, geometry.railWidth, geometry.railTop, geometry.railBottom, THEME.jade, false);
    drawRail(
      ctx,
      geometry.width - geometry.railWidth,
      geometry.railWidth,
      geometry.railTop,
      geometry.railBottom,
      THEME.rival,
      true,
    );
  };
  const status = new PaintNode();
  status.paint = (ctx) => {
    drawStatusStrip(ctx, geometry.width, snapshot, 'panel');
  };
  const tags = new PaintNode();
  tags.paint = (ctx) => {
    for (const [player, figure] of [
      ['P1', p1],
      ['P2', p2],
    ] as const) {
      const centerX = figure.x + figure.slotWidth / 2;
      const current = snapshot.state.currentPlayer === player;
      text(ctx, player === 'P1' ? '你 · 弈者' : '天道', centerX, geometry.railTop + 14, {
        size: 12,
        bold: true,
        color: current ? THEME.gold : player === 'P1' ? THEME.jade : THEME.rival,
      });
      const feet = figure.y + figure.slotHeight + 14;
      text(ctx, `得分 ${String(snapshot.state.players[player].score)}`, centerX, feet, {
        size: 11,
        color: current ? THEME.gold : THEME.ivory,
      });
      if (current) {
        text(ctx, '行动中', centerX, feet + 15, { size: 11, color: THEME.gold });
      }
    }
  };
  const legend = new PaintNode();
  legend.paint = (ctx) => {
    drawBoardLegend(ctx, geometry.width, board);
  };

  function resize(width: number, height: number): void {
    geometry.width = width;
    geometry.height = height;
    const contentBottom = placeFooter(footer, width, height);
    const railWidth = clamp(width * 0.2, 64, 92);
    geometry.railWidth = railWidth;
    geometry.railTop = SAFE_TOP + 36;
    geometry.railBottom = contentBottom;
    const columnWidth = width - railWidth * 2;
    board.x = railWidth;
    board.resize(columnWidth, height, { top: geometry.railTop, bottom: contentBottom - 6 });
    const figureWidth = railWidth + 10;
    const figureHeight = clamp((geometry.railBottom - geometry.railTop) * 0.34, 140, 210);
    const figureTop =
      geometry.railTop + (geometry.railBottom - geometry.railTop) * 0.34 - figureHeight / 2;
    for (const [index, figure] of [p1, p2].entries()) {
      figure.slotWidth = figureWidth;
      figure.slotHeight = figureHeight;
      const centerX = index === 0 ? railWidth / 2 : width - railWidth / 2;
      figure.x = centerX - figureWidth / 2;
      figure.y = figureTop;
    }
    root.hitArea = { x: 0, y: 0, width, height };
  }

  for (const child of [
    backdrop,
    board,
    p1,
    p2,
    tags,
    legend,
    footer.result,
    footer.actionBar,
    status,
  ]) {
    root.addChild(child);
  }
  const scene: VariantScene = {
    root,
    board,
    figures: [p1, p2],
    resize,
    tick: (dt) => {
      p1.tick += dt;
      p2.tick += dt;
    },
    releasePresses: () => {
      for (const button of actionButtonList(footer)) button.release();
    },
    dispose: () => footer.actionBar.dispose(),
  };
  scene.resize(base.width, base.height);
  return scene;
}

/** C：人物融入背景 + 棋盘前景。 */
function buildVariantC(base: VariantBase): VariantScene {
  const { snapshot, atlas } = base;
  const root = new Container();
  const footer = createFooter(base);
  const board = new BoardView();
  projectBoard(board, snapshot);
  const p1 = new FigureNode(atlas, 'P1');
  const p2 = new FigureNode(atlas, 'P2');
  p1.alpha = 0.55;
  p2.alpha = 0.55;
  const geometry = { width: base.width, height: base.height, boardTop: 0 };

  const backdrop = new PaintNode();
  backdrop.paint = (ctx) => {
    drawLandscape(ctx, geometry.width, geometry.height);
    drawMoonArc(
      ctx,
      geometry.width * 0.5,
      geometry.boardTop + 90,
      Math.min(geometry.width, geometry.height) * 0.3,
      'rgba(244,234,210,0.10)',
    );
  };
  const scrim = new PaintNode();
  scrim.paint = (ctx) => {
    const layout = board.layout;
    const radius = layout.outerRadius + layout.sealSize * 2.6;
    const gradient = ctx.createRadialGradient(
      layout.centerX,
      layout.centerY,
      layout.innerRadius * 0.5,
      layout.centerX,
      layout.centerY,
      radius,
    );
    gradient.addColorStop(0, 'rgba(8,27,34,0.62)');
    gradient.addColorStop(0.7, 'rgba(8,27,34,0.34)');
    gradient.addColorStop(1, 'rgba(8,27,34,0)');
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(layout.centerX, layout.centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  const status = new PaintNode();
  status.paint = (ctx) => {
    drawStatusStrip(ctx, geometry.width, snapshot, 'float');
  };
  const legend = new PaintNode();
  legend.paint = (ctx) => {
    drawBoardLegend(ctx, geometry.width, board);
  };

  function resize(width: number, height: number): void {
    geometry.width = width;
    geometry.height = height;
    const contentBottom = placeFooter(footer, width, height);
    geometry.boardTop = SAFE_TOP + 40;
    board.resize(width, height, { top: geometry.boardTop, bottom: contentBottom - 6 });
    const figureWidth = width * 0.6;
    const figureHeight = height * 0.38;
    p1.slotWidth = figureWidth;
    p2.slotWidth = figureWidth;
    p1.slotHeight = figureHeight;
    p2.slotHeight = figureHeight;
    p1.x = -width * 0.04;
    p2.x = width * 0.52;
    p1.y = height * 0.13;
    p2.y = height * 0.1;
    root.hitArea = { x: 0, y: 0, width, height };
  }

  for (const child of [
    backdrop,
    p1,
    p2,
    scrim,
    board,
    legend,
    footer.result,
    footer.actionBar,
    status,
  ]) {
    root.addChild(child);
  }
  const scene: VariantScene = {
    root,
    board,
    figures: [p1, p2],
    resize,
    tick: (dt) => {
      p1.tick += dt;
      p2.tick += dt;
    },
    releasePresses: () => {
      for (const button of actionButtonList(footer)) button.release();
    },
    dispose: () => footer.actionBar.dispose(),
  };
  scene.resize(base.width, base.height);
  return scene;
}

function buildVariant(key: VariantKey, base: VariantBase): VariantScene {
  if (key === 'B') return buildVariantB(base);
  if (key === 'C') return buildVariantC(base);
  return buildVariantA(base);
}

/* ------------------------------------------------------------ 页面与切换 */

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`布局原型缺少页面元素：${selector}`);
  return element;
}

function loadAtlas(): Promise<CharacterSpriteAtlas> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        frames: CHARACTER_ATLAS_FRAMES,
      });
    };
    image.onerror = () => {
      reject(new Error('占位角色图加载失败'));
    };
    image.src = new URL('../../minigame/assets/characters.png', import.meta.url).href;
  });
}

function tianGanLabel(tianGan: TianGanInfo | null): string {
  if (tianGan === null) return '未抽签';
  const element = WUXING_PALETTE[tianGan.element].name;
  return `${tianGan.name}${element}${tianGan.polarity === Polarity.YANG ? '阳' : '阴'}`;
}

function fillSidePanel(snapshot: Snapshot, seed: number, round: number): void {
  const state = snapshot.state;
  const last = snapshot.lastAction;
  const lastText =
    last === null
      ? '无'
      : `${last.actor === 'P1' ? '你' : '天道'}用${last.stem}·${ACTION_LABEL[last.actionType]}（${
          last.changes.length === 0 ? '未改变阴阳' : describeNodeChange(last.changes[0])
        }）`;
  requireElement<HTMLElement>('#side-snapshot').textContent =
    `种子 ${String(seed)} · 第 ${String(state.round)}/${String(state.maxRounds)} 回合（固定重放目标第 ${String(round)} 回合） · ` +
    `天干 ${tianGanLabel(snapshot.tianGan)} · ${state.currentPlayer === 'P1' ? '你行动' : '天道行动'} · ` +
    `比分 ${String(state.players.P1.score)} : ${String(state.players.P2.score)} · 候选 ${String(snapshot.actions.length)} 个 · 上一招：${lastText}`;
}

function markVariantList(key: VariantKey): void {
  const items = document.querySelectorAll<HTMLElement>('[data-variant-item]');
  for (const item of Array.from(items)) {
    item.classList.toggle('active', item.dataset.variantItem === key);
  }
}

function main(): void {
  const canvas = requireElement<HTMLCanvasElement>('#layout-canvas');
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('浏览器不支持 Canvas 2D');
  const label = requireElement<HTMLElement>('#variant-label');
  const frozenNote = requireElement<HTMLElement>('#frozen-note');

  const query = new URLSearchParams(location.search);
  const numberParam = (name: string): number | null => {
    const raw = query.get(name);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const seed = numberParam('seed') ?? DEFAULT_SEED;
  const round = numberParam('round') ?? DEFAULT_ROUND;

  let frozenTimer: number | undefined;
  const flashFrozen = (): void => {
    frozenNote.classList.add('flash');
    window.clearTimeout(frozenTimer);
    frozenTimer = window.setTimeout(() => {
      frozenNote.classList.remove('flash');
    }, 1300);
  };

  const { snapshot, turnManager } = captureSnapshot(seed, round);
  const frozenTurnManager = createFrozenTurnManager(turnManager, flashFrozen);

  let activeKey: VariantKey = 'A';
  let activeScene: VariantScene | null = null;
  let input: InputManager | null = null;
  let atlas: CharacterSpriteAtlas | null = null;

  const applyCanvasSize = (): { width: number; height: number } => {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width: bounds.width, height: bounds.height };
  };

  const rebuild = (): void => {
    if (atlas === null) return;
    const size = applyCanvasSize();
    activeScene?.dispose();
    activeScene = buildVariant(activeKey, {
      snapshot,
      turnManager: frozenTurnManager,
      atlas,
      width: size.width,
      height: size.height,
    });
    input = new InputManager(activeScene.root);
  };

  const updateChrome = (): void => {
    const meta = VARIANTS.find((variant) => variant.key === activeKey) ?? VARIANTS[0];
    label.textContent = `${meta.key} · ${meta.title}`;
    requireElement<HTMLElement>('#side-current').textContent = `${meta.key} · ${meta.title}`;
    requireElement<HTMLElement>('#side-current-blurb').textContent = meta.blurb;
    markVariantList(activeKey);
  };

  const setVariant = (key: VariantKey, updateUrl: boolean): void => {
    activeKey = key;
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set('variant', key);
      history.replaceState(null, '', url);
    }
    updateChrome();
    rebuild();
  };

  const cycle = (delta: number): void => {
    const index = VARIANTS.findIndex((variant) => variant.key === activeKey);
    const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
    setVariant(next.key, true);
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    const bounds = canvas.getBoundingClientRect();
    input?.handleTouchStart(event.clientX - bounds.left, event.clientY - bounds.top);
  });
  canvas.addEventListener('pointerup', (event) => {
    const bounds = canvas.getBoundingClientRect();
    input?.handleTouchEnd(event.clientX - bounds.left, event.clientY - bounds.top);
    activeScene?.releasePresses();
  });
  canvas.addEventListener('pointercancel', () => {
    input?.handleTouchEnd(-1, -1);
    activeScene?.releasePresses();
  });

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return;
    }
    if (event.key === 'ArrowLeft') cycle(-1);
    else if (event.key === 'ArrowRight') cycle(1);
    else if (event.key === '1' || event.key === '2' || event.key === '3') {
      const meta = VARIANTS[Number(event.key) - 1];
      if (meta !== undefined) setVariant(meta.key, true);
    }
  });

  requireElement<HTMLButtonElement>('#prev').addEventListener('click', () => {
    cycle(-1);
  });
  requireElement<HTMLButtonElement>('#next').addEventListener('click', () => {
    cycle(1);
  });

  // 开发页限定：生产构建下不挂切换条（正常情况本页也不会被打进微信构建）。
  const isProd = (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD === true;
  if (isProd) requireElement<HTMLElement>('#switcher').remove();

  fillSidePanel(snapshot, seed, round);
  const fromUrl = query.get('variant');
  const initial = VARIANTS.find((variant) => variant.key === fromUrl)?.key ?? 'A';

  void loadAtlas().then((loaded) => {
    atlas = loaded;
    setVariant(initial, fromUrl !== null);
    let previousTimestamp: number | null = null;
    const frame = (timestamp: number): void => {
      const scene = activeScene;
      if (scene !== null) {
        const dt =
          previousTimestamp === null
            ? 0
            : Math.min(1 / 20, Math.max(0, (timestamp - previousTimestamp) / 1000));
        scene.tick(dt);
        scene.root.render(context);
      }
      previousTimestamp = timestamp;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  window.addEventListener('resize', () => {
    rebuild();
  });
}

main();

/** 原型自检提示：只在控制台说明这份页面怎么用，不参与界面。 */
console.info(
  '[LayoutPrototype] 布局原型：?variant=A|B|C 切换，←/→ 或 1/2/3；静态快照，按钮点击不结算。',
);
