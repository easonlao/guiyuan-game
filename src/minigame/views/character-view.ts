/**
 * 双方对战角色卡视图（Layer 3）：玩家（P1）与天道（P2）的头像框架、行动回合标识、
 * 连动标记、比分、表情反馈与播报气泡/横幅。
 *
 * 数据流是单向的（`docs/LLD.md` §4）：`update(state, options)` 只读 `GameState` 快照投影
 * 回合 / 比分 / 当前行动方，本视图不缓存也不改写任何核心状态。
 * 表情与气泡是纯表现态，由调用方（`GameScene`）触发，靠 `updateTimers(dt)` 自行衰减。
 */

import { GameState, PlayerId } from '../../core/types/domain.js';
import { CharacterActionState } from '../types.js';
import { drawPixelBox, drawPixelCharacter, drawPixelRect } from '../pixel-art.js';
import { Container } from '../scene/container.js';
import { estimateTextWidth } from '../text-metrics.js';

export interface CharacterViewOptions {
  /** 视口宽度（父坐标系）。 */
  readonly width: number;
  /** 安全区顶部偏移（刘海屏），默认 24。 */
  readonly safeTop?: number;
}

/** 投影选项：连动回合是核心状态之外的回合语义，由调用方传入。 */
export interface CharacterProjectionOptions {
  /** 当前是否处于爆发连动带来的额外行动中。 */
  readonly isExtraTurn?: boolean;
}

/** 头像框架尺寸与边距（本视图局部样式常量，不引入共享主题模块）。 */
const AVATAR_SIZE = 54;
const SIDE_MARGIN = 10;
const TOP_BAR_HEIGHT = 26;
const BANNER_GAP = 10;
const BANNER_HEIGHT = 68;

/* 配色（仅本视图使用）。 */
const PANEL_COLOR = '#111827';
const PANEL_BORDER = '#374151';
const ACTIVE_COLOR = '#f6e05e';
const EXTRA_TURN_COLOR = '#4fd1c5';
const TEXT_COLOR = '#e2e8f0';
const MUTED_COLOR = '#9ca3af';
const P1_COLOR = '#63b3ed';
const P2_COLOR = '#b794f4';
const HURT_COLOR = '#fc8181';

/** 表情对应的框架描边色；待机时用当前行动方颜色。 */
const EXPRESSION_COLOR: Record<CharacterActionState, string | null> = {
  idle: null,
  attack: '#f6e05e',
  hurt: HURT_COLOR,
  cast: '#4fd1c5',
};

const PLAYER_LABEL: Record<PlayerId, string> = { P1: '玩家 P1', P2: '天道 P2' };
const PLAYER_COLOR: Record<PlayerId, string> = { P1: P1_COLOR, P2: P2_COLOR };

export class CharacterView extends Container {
  private _width: number;
  private _safeTop: number;

  private _round = 0;
  private _maxRounds = 0;
  private _currentPlayer: PlayerId | null = null;
  private _isExtraTurn = false;
  private _scores: Record<PlayerId, number> = { P1: 0, P2: 0 };
  private _expressions: Record<PlayerId, CharacterActionState> = { P1: 'idle', P2: 'idle' };
  private _expressionTimers: Record<PlayerId, number> = { P1: 0, P2: 0 };
  private _bubbles: Record<PlayerId, { text: string; timer: number } | null> = {
    P1: null,
    P2: null,
  };
  private _bannerText = '';
  private _bannerSubText = '';
  /** 头像呼吸动画的累积时间（秒）。 */
  private _tick = 0;

  public constructor(options: CharacterViewOptions) {
    super();
    this._width = options.width;
    this._safeTop = options.safeTop ?? 24;
  }

  /** 回合数（未投影时为 0）。 */
  public get round(): number {
    return this._round;
  }

  /** 回合上限（未投影时为 0）。 */
  public get maxRounds(): number {
    return this._maxRounds;
  }

  /** 当前行动方（未投影时为 null）。 */
  public get currentPlayer(): PlayerId | null {
    return this._currentPlayer;
  }

  /** 当前是否处于连动额外行动。 */
  public get isExtraTurn(): boolean {
    return this._isExtraTurn;
  }

  /** 指定玩家的比分。 */
  public scoreOf(player: PlayerId): number {
    return this._scores[player];
  }

  /** 当前横幅主文案。 */
  public get bannerText(): string {
    return this._bannerText;
  }

  /** 当前横幅副文案。 */
  public get bannerSubText(): string {
    return this._bannerSubText;
  }

  /** 按只读快照投影回合、比分与当前行动方。 */
  public update(state: GameState, options: CharacterProjectionOptions = {}): void {
    this._round = state.round;
    this._maxRounds = state.maxRounds;
    this._currentPlayer = state.currentPlayer;
    this._isExtraTurn = options.isExtraTurn ?? false;
    this._scores = { P1: state.players.P1.score, P2: state.players.P2.score };
  }

  /** 视口自适应（安全区与宽度变化时调用）。 */
  public resize(width: number, safeTop?: number): void {
    this._width = width;
    this._safeTop = safeTop ?? this._safeTop;
  }

  /** 表情反馈：`holdSeconds` 秒后自动回落待机；重复触发会重新计时。 */
  public setExpression(
    player: PlayerId,
    expression: CharacterActionState,
    holdSeconds = 0.6,
  ): void {
    this._expressions[player] = expression;
    this._expressionTimers[player] = expression === 'idle' ? 0 : Math.max(0, holdSeconds);
  }

  /** 指定玩家当前的表情。 */
  public getExpression(player: PlayerId): CharacterActionState {
    return this._expressions[player];
  }

  /** 气泡播报：`holdSeconds` 秒后消散。 */
  public announce(player: PlayerId, text: string, holdSeconds = 1.6): void {
    this._bubbles[player] = { text, timer: Math.max(0, holdSeconds) };
  }

  /** 指定玩家当前的气泡文案（无气泡时为 null）。 */
  public getBubble(player: PlayerId): string | null {
    return this._bubbles[player]?.text ?? null;
  }

  /** 横幅播报：主文案 + 可选副文案，常驻直到下一次播报。 */
  public showBanner(mainText: string, subText = ''): void {
    this._bannerText = mainText;
    this._bannerSubText = subText;
  }

  /** 由调用方每帧驱动（秒）：推进呼吸动画与表情/气泡的衰减。 */
  public updateTimers(dt: number): void {
    this._tick += dt;
    for (const player of PLAYER_IDS) {
      if (this._expressionTimers[player] > 0) {
        this._expressionTimers[player] -= dt;
        if (this._expressionTimers[player] <= 0) {
          this._expressionTimers[player] = 0;
          this._expressions[player] = 'idle';
        }
      }
      const bubble = this._bubbles[player];
      if (bubble !== null) {
        bubble.timer -= dt;
        if (bubble.timer <= 0) {
          this._bubbles[player] = null;
        }
      }
    }
  }

  /** 先画横幅与头像，再画回合信息条（后者盖在上层）。 */
  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    this.drawBanner(ctx);
    for (const player of PLAYER_IDS) {
      this.drawAvatar(ctx, player);
    }
    this.drawTurnStrip(ctx);
  }

  private drawTurnStrip(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = MUTED_COLOR;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `回合 ${this._round}/${this._maxRounds}`,
      this._width / 2,
      this._safeTop + TOP_BAR_HEIGHT / 2,
    );
    if (this._isExtraTurn) {
      ctx.fillStyle = EXTRA_TURN_COLOR;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('连动', SIDE_MARGIN, this._safeTop + TOP_BAR_HEIGHT / 2);
    }
    ctx.restore();
  }

  private drawAvatar(ctx: CanvasRenderingContext2D, player: PlayerId): void {
    const isPlayer = player === 'P1';
    const frameX = isPlayer ? SIDE_MARGIN : this._width - SIDE_MARGIN - AVATAR_SIZE;
    const frameY = this._safeTop + TOP_BAR_HEIGHT + 4;
    const isCurrent = this._currentPlayer === player;
    const expression = this._expressions[player];
    const border =
      EXPRESSION_COLOR[expression] ?? (isCurrent ? ACTIVE_COLOR : isPlayer ? P1_COLOR : P2_COLOR);

    ctx.save();
    drawPixelBox(ctx, frameX, frameY, AVATAR_SIZE, AVATAR_SIZE, PANEL_COLOR, border, 2);
    // 角色本体按框架缩放居中：绘制例程以角色腰腹为原点、总高约 66px。
    ctx.save();
    ctx.translate(frameX + AVATAR_SIZE / 2, frameY + AVATAR_SIZE / 2 + 6);
    ctx.scale(0.66, 0.66);
    drawPixelCharacter(ctx, 0, 0, isPlayer, expression, this._tick * 60);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PLAYER_COLOR[player];
    ctx.font = 'bold 11px monospace';
    ctx.fillText(PLAYER_LABEL[player], frameX + AVATAR_SIZE / 2, frameY + AVATAR_SIZE + 12);
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`${this._scores[player]} 分`, frameX + AVATAR_SIZE / 2, frameY + AVATAR_SIZE + 26);

    if (isCurrent) {
      ctx.fillStyle = this._isExtraTurn ? EXTRA_TURN_COLOR : ACTIVE_COLOR;
      ctx.font = 'bold 10px monospace';
      ctx.fillText(
        this._isExtraTurn ? '连动行动中' : '行动中',
        frameX + AVATAR_SIZE / 2,
        frameY + AVATAR_SIZE + 40,
      );
    }

    const bubble = this._bubbles[player];
    if (bubble !== null) {
      this.drawBubble(ctx, player, frameX, frameY, bubble.text);
    }
    ctx.restore();
  }

  /** 气泡：挂在头像上方，宽度按头像列夹紧，文本超宽时截断。 */
  private drawBubble(
    ctx: CanvasRenderingContext2D,
    player: PlayerId,
    frameX: number,
    frameY: number,
    text: string,
  ): void {
    const isPlayer = player === 'P1';
    const maxWidth = this._width / 2 - SIDE_MARGIN * 2;
    const fontSize = 10;
    const label = truncateToWidth(text, maxWidth - 12, fontSize);
    const width = estimateTextWidth(label, fontSize) + 12;
    const height = 20;
    const x = isPlayer
      ? Math.min(frameX, Math.max(SIDE_MARGIN, frameX + AVATAR_SIZE - width))
      : Math.max(frameX + AVATAR_SIZE - width, this._width - SIDE_MARGIN - width);
    const y = frameY - height - 4;

    drawPixelRect(ctx, x, y, width, height, '#1a202c');
    drawPixelRect(ctx, x, y, width, 2, EXTRA_TURN_COLOR);
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + width / 2, y + height / 2 + 1);
  }

  /** 横幅：主文案（12px，最多两行）+ 副文案（9px，最多两行）。 */
  private drawBanner(ctx: CanvasRenderingContext2D): void {
    if (this._bannerText === '' && this._bannerSubText === '') {
      return;
    }
    // 横幅夹在两侧头像列之间（左右各让出头像列 + 间距），长文案折行而不越界。
    const x = SIDE_MARGIN + AVATAR_SIZE + BANNER_GAP;
    const width = Math.max(80, this._width - 2 * x);
    const y = this._safeTop + TOP_BAR_HEIGHT + 4;

    ctx.save();
    drawPixelBox(ctx, x, y, width, BANNER_HEIGHT, '#171e2e', PANEL_BORDER, 2);

    const textWidth = width - 16;
    const mainLines = wrapText(this._bannerText, textWidth, 12, 2);
    const subLines = wrapText(this._bannerSubText, textWidth, 9, 2);
    const mainLineHeight = 16;
    const subLineHeight = 12;
    const blockHeight = mainLines.length * mainLineHeight + subLines.length * subLineHeight;
    let cursor = y + (BANNER_HEIGHT - blockHeight) / 2 + mainLineHeight / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = 'bold 12px monospace';
    for (const line of mainLines) {
      ctx.fillText(line, x + width / 2, cursor);
      cursor += mainLineHeight;
    }
    ctx.fillStyle = MUTED_COLOR;
    ctx.font = '9px monospace';
    for (const line of subLines) {
      ctx.fillText(line, x + width / 2, cursor);
      cursor += subLineHeight;
    }
    ctx.restore();
  }
}

const PLAYER_IDS: readonly PlayerId[] = ['P1', 'P2'];

/** 按可用宽度折行：最多 `maxLines` 行；放不下的部分在末行以省略号收尾。 */
function wrapText(text: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  if (text === '') {
    return [];
  }
  const lines: string[] = [];
  let current = '';
  for (const char of text) {
    const next = current + char;
    if (current !== '' && estimateTextWidth(next, fontSize) > maxWidth) {
      lines.push(current);
      current = char;
      if (lines.length === maxLines) {
        break;
      }
    } else {
      current = next;
    }
  }
  if (lines.length < maxLines && current !== '') {
    lines.push(current);
  }
  if ([...lines.join('')].length < [...text].length) {
    const last = lines[lines.length - 1] ?? '';
    lines[lines.length - 1] = `${truncateToWidth(last, maxWidth, fontSize)}…`;
  }
  return lines;
}

/** 截断到可用宽度（超出部分用省略号）。 */
function truncateToWidth(text: string, maxWidth: number, fontSize: number): string {
  if (estimateTextWidth(text, fontSize) <= maxWidth) {
    return text;
  }
  const chars = [...text];
  while (chars.length > 1 && estimateTextWidth(`${chars.join('')}…`, fontSize) > maxWidth) {
    chars.pop();
  }
  return `${chars.join('')}…`;
}
