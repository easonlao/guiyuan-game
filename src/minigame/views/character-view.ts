import { ActionType, GameState, PlayerId } from '../../core/types/domain.js';
import { CharacterActionState } from '../types.js';
import { CharacterSpriteAtlas, drawCharacterSprite } from '../character-sprite.js';
import { CHARACTER_PIXEL_SIZE, CHARACTER_SPRITE_BOUNDS, drawPixelCharacter } from '../pixel-art.js';
import { THEME } from '../theme.js';
import { Container } from '../scene/container.js';
import { SWORD_DISPLAY } from '../vfx/params/sword.js';

export interface CharacterViewOptions {
  readonly width: number;
  readonly safeTop?: number;
  readonly compact?: boolean;
}
export interface CharacterProjectionOptions {
  readonly actingPlayer?: PlayerId;
  readonly isExtraTurn?: boolean;
}
const PLAYERS = ['P1', 'P2'] as const;

/** Shared combat area. Announcement data remains available to result consumers. */
export class CharacterView extends Container {
  private width: number;
  private safeTop: number;
  private compact: boolean;
  private atlas: CharacterSpriteAtlas | null = null;
  private tick = 0;
  public round = 0;
  public maxRounds = 0;
  public currentPlayer: PlayerId | null = null;
  public isExtraTurn = false;
  /** 核心层终局标记：回合条与「行动中」尾缀在终局后改口，不再谎报「你行动」。 */
  public isGameOver = false;
  public bannerText = '';
  public bannerSubText = '';
  private scores = { P1: 0, P2: 0 };
  private expressions: Record<PlayerId, CharacterActionState> = { P1: 'idle', P2: 'idle' };
  private readonly transitions: Partial<
    Record<PlayerId, { from: CharacterActionState; elapsed: number; duration: number }>
  > = {};
  private timers = { P1: 0, P2: 0 };
  private bubbles: Record<PlayerId, { text: string; timer: number } | null> = {
    P1: null,
    P2: null,
  };
  private readonly motions: Partial<
    Record<PlayerId, { action: ActionType; elapsed: number; flight: number; total: number }>
  > = {};
  public readonly combatOffsets = { P1: { x: 0, y: 0 }, P2: { x: 0, y: 0 } };
  public readonly combatScales = { P1: 1, P2: 1 };
  public readonly combatFlash = { P1: 0, P2: 0 };
  public readonly combatShake = { x: 0, y: 0 };

  public constructor(options: CharacterViewOptions) {
    super();
    this.width = options.width;
    this.safeTop = options.safeTop ?? 24;
    this.compact = options.compact ?? false;
  }
  public get combatLayout(): { gap: number; top: number; height: number; bottom: number } {
    const p = SWORD_DISPLAY;
    const height = this.compact ? p.compactAvatarHeight : p.avatarHeight;
    const top = this.safeTop + p.turnBarHeight + (this.compact ? 2 : p.frameTopGap);
    return {
      gap: Math.min(p.standingGap, this.width - 2 * p.sideMargin - p.avatarWidth),
      top,
      height,
      bottom: top + height + p.labelRoom,
    };
  }
  public combatAnchor(player: PlayerId): { x: number; y: number } {
    const l = this.combatLayout;
    return {
      x: this.width / 2 + ((player === 'P1' ? -1 : 1) * l.gap) / 2,
      y: l.top + l.height / 2,
    };
  }
  public setSpriteAtlas(atlas: CharacterSpriteAtlas | null): void {
    this.atlas =
      atlas !== null &&
      Number.isFinite(atlas.width) &&
      Number.isFinite(atlas.height) &&
      atlas.width > 0 &&
      atlas.height > 0
        ? atlas
        : null;
  }
  public scoreOf(player: PlayerId): number {
    return this.scores[player];
  }
  public update(state: GameState, options: CharacterProjectionOptions = {}): void {
    this.round = state.round;
    this.maxRounds = state.maxRounds;
    this.currentPlayer = options.actingPlayer ?? state.currentPlayer;
    this.isExtraTurn = options.isExtraTurn ?? false;
    this.isGameOver = state.isGameOver;
    this.scores = { P1: state.players.P1.score, P2: state.players.P2.score };
  }
  public resize(width: number, safeTop = this.safeTop, compact = this.compact): void {
    this.width = width;
    this.safeTop = safeTop;
    this.compact = compact;
  }
  public setExpression(
    player: PlayerId,
    expression: CharacterActionState,
    holdSeconds = 0.6,
    transitionSeconds = 0,
  ): void {
    delete this.motions[player];
    if (transitionSeconds > 0 && this.expressions[player] !== expression)
      this.transitions[player] = {
        from: this.expressions[player],
        elapsed: 0,
        duration: transitionSeconds,
      };
    else if (transitionSeconds === 0) delete this.transitions[player];
    this.expressions[player] = expression;
    this.timers[player] = expression === 'idle' ? 0 : Math.max(0, holdSeconds);
  }
  public getExpression(player: PlayerId): CharacterActionState {
    return this.expressions[player];
  }
  public playAction(player: PlayerId, action: ActionType, flight: number, impact: number): void {
    this.setExpression(player, 'cast', 0, Math.min(0.08, flight * 0.18));
    this.motions[player] = { action, elapsed: 0, flight, total: flight + impact };
  }
  public resetFeedback(): void {
    for (const p of PLAYERS) {
      this.setExpression(p, 'idle');
      this.bubbles[p] = null;
      Object.assign(this.combatOffsets[p], { x: 0, y: 0 });
      this.combatFlash[p] = 0;
    }
  }
  public announce(player: PlayerId, text: string, holdSeconds = 1.6): void {
    this.bubbles[player] = { text, timer: Math.max(0, holdSeconds) };
  }
  public getBubble(player: PlayerId): string | null {
    return this.bubbles[player]?.text ?? null;
  }
  public showBanner(mainText: string, subText = ''): void {
    this.bannerText = mainText;
    this.bannerSubText = subText;
  }
  public updateTimers(dt: number): void {
    this.tick += dt;
    for (const p of PLAYERS) {
      const transition = this.transitions[p];
      if (transition !== undefined) {
        transition.elapsed += dt;
        if (transition.elapsed >= transition.duration) delete this.transitions[p];
      }
      const m = this.motions[p];
      if (m !== undefined) {
        m.elapsed += dt;
        this.expressions[p] =
          m.elapsed >= m.total
            ? 'idle'
            : m.elapsed >= m.flight * 0.18 &&
                p === 'P1' &&
                (m.action === ActionType.ATK || m.action === ActionType.BURST_ATK)
              ? 'attack'
              : 'cast';
        if (m.elapsed >= m.total) delete this.motions[p];
      }
      if (this.timers[p] > 0) {
        this.timers[p] -= dt;
        if (this.timers[p] <= 0) this.expressions[p] = 'idle';
      }
      const b = this.bubbles[p];
      if (b !== null) {
        b.timer -= dt;
        if (b.timer <= 0) this.bubbles[p] = null;
      }
    }
  }
  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    const l = this.combatLayout;
    ctx.save();
    ctx.translate(this.combatShake.x, this.combatShake.y);
    ctx.strokeStyle = THEME.edge;
    ctx.beginPath();
    ctx.moveTo(SWORD_DISPLAY.sideMargin, l.top + l.height - 8);
    ctx.lineTo(this.width - SWORD_DISPLAY.sideMargin, l.top + l.height - 8);
    ctx.stroke();
    for (const p of PLAYERS) this.drawActor(ctx, p);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = THEME.muted;
    ctx.font = `bold 12px ${THEME.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `回合 ${this.round}/${this.maxRounds} · ${
        this.isGameOver
          ? '本局结束'
          : this.currentPlayer === 'P1'
            ? '你行动'
            : this.currentPlayer === 'P2'
              ? '天道行动'
              : '等待开局'
      }${!this.isGameOver && this.isExtraTurn ? ' · 连动' : ''}`,
      this.width / 2,
      this.safeTop + 13,
    );
    ctx.restore();
  }
  private drawActor(ctx: CanvasRenderingContext2D, p: PlayerId): void {
    const a = this.combatAnchor(p),
      l = this.combatLayout;
    ctx.save();
    ctx.translate(this.combatOffsets[p].x, this.combatOffsets[p].y);
    if (this.atlas !== null) {
      // Prototype P2 flip: mirror only sprite pixels around this actor's own center.
      if (p === 'P2') {
        ctx.translate(a.x * 2, 0);
        ctx.scale(-1, 1);
      }
      const drawPose = (pose: CharacterActionState): void => {
        const draw = (): void =>
          drawCharacterSprite(
            ctx,
            this.atlas!,
            p,
            pose,
            this.tick * 60,
            a.x - 44,
            l.top,
            88,
            l.height,
            { x: 0, y: 0 },
          );
        draw();
        if (this.combatFlash[p] > 0) {
          ctx.save();
          // Basic Canvas additive blending works on WeChat without filter or a rebuilt atlas.
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha *= Math.min(1, this.combatFlash[p]);
          draw();
          draw();
          ctx.restore();
        }
      };
      const transition = this.transitions[p];
      if (transition !== undefined) {
        const t = transition.elapsed / transition.duration;
        const weight = t * t * (3 - 2 * t);
        ctx.save();
        ctx.globalAlpha *= 1 - weight;
        drawPose(transition.from);
        ctx.restore();
        ctx.globalAlpha *= weight;
      }
      drawPose(this.expressions[p]);
    } else {
      const top = CHARACTER_SPRITE_BOUNDS.top * CHARACTER_PIXEL_SIZE;
      const height =
        (CHARACTER_SPRITE_BOUNDS.bottom - CHARACTER_SPRITE_BOUNDS.top) * CHARACTER_PIXEL_SIZE;
      ctx.translate(a.x, l.top + (l.height - height) / 2 - top);
      drawPixelCharacter(ctx, 0, 0, p === 'P1', this.expressions[p], this.tick * 60);
    }
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p === 'P1' ? THEME.jade : THEME.rival;
    ctx.font = `bold 11px ${THEME.font}`;
    ctx.fillText(p === 'P1' ? '你 · 弈者' : '天道', a.x, l.top + l.height + 8);
    ctx.fillStyle = THEME.ivory;
    ctx.fillText(
      `得分 ${this.scores[p]}${!this.isGameOver && this.currentPlayer === p ? ' · 行动中' : ''}`,
      a.x,
      l.top + l.height + 24,
    );
    ctx.restore();
  }
}
