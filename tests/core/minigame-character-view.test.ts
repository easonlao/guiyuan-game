import { describe, it, expect } from 'vitest';
import { CharacterView } from '../../src/minigame/views/character-view.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import { GameState } from '../../src/core/types/domain.js';

/** 记录绘制调用的伪 Canvas 2D 上下文：只关心「有没有画东西」，不关心具体像素。 */
class RecordingContext {
  public globalAlpha = 1;
  public fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  public strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  public lineWidth = 1;
  public lineCap: CanvasLineCap = 'butt';
  public font = '';
  public textAlign: CanvasTextAlign = 'start';
  public textBaseline: CanvasTextBaseline = 'alphabetic';
  public shadowColor = '#000';
  public shadowBlur = 0;
  public readonly calls: string[] = [];
  /** 记录落笔文本（文本、锚点、字号），供「文本不越界」这类版面断言使用。 */
  public readonly texts: { text: string; x: number; y: number; fontSize: number }[] = [];

  public save(): void {
    this.calls.push('save');
  }
  public restore(): void {
    this.calls.push('restore');
  }
  public translate(_x: number, _y: number): void {
    this.calls.push('translate');
  }
  public scale(_x: number, _y: number): void {
    this.calls.push('scale');
  }
  public rotate(_angle: number): void {
    this.calls.push('rotate');
  }
  public beginPath(): void {
    this.calls.push('beginPath');
  }
  public arc(
    _x: number,
    _y: number,
    _radius: number,
    _start: number,
    _end: number,
    _anticlockwise?: boolean,
  ): void {
    this.calls.push('arc');
  }
  public rect(_x: number, _y: number, _w: number, _h: number): void {
    this.calls.push('rect');
  }
  public roundRect(
    _x: number,
    _y: number,
    _w: number,
    _h: number,
    _radii?: number | number[],
  ): void {
    this.calls.push('roundRect');
  }
  public moveTo(_x: number, _y: number): void {
    this.calls.push('moveTo');
  }
  public lineTo(_x: number, _y: number): void {
    this.calls.push('lineTo');
  }
  public stroke(): void {
    this.calls.push('stroke');
  }
  public fill(): void {
    this.calls.push('fill');
  }
  public fillRect(_x: number, _y: number, _w: number, _h: number): void {
    this.calls.push('fillRect');
  }
  public fillText(text: string, x: number, y: number): void {
    this.calls.push('fillText');
    this.texts.push({ text, x, y, fontSize: Number.parseFloat(this.font) || 10 });
  }
  public setLineDash(_segments: number[]): void {
    this.calls.push('setLineDash');
  }
  public createRadialGradient(
    _x0: number,
    _y0: number,
    _r0: number,
    _x1: number,
    _y1: number,
    _r1: number,
  ): CanvasGradient {
    this.calls.push('createRadialGradient');
    return { addColorStop: () => {} } as unknown as CanvasGradient;
  }
  public asContext(): CanvasRenderingContext2D {
    return this as unknown as CanvasRenderingContext2D;
  }
  public drawCallCount(): number {
    return this.calls.filter(
      (call) => call === 'fill' || call === 'stroke' || call === 'fillRect' || call === 'fillText',
    ).length;
  }
}

/** 受控状态：只覆盖本视图关心的字段（回合 / 玩家 / 比分）。 */
function stateWith(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeView(): CharacterView {
  return new CharacterView({ width: 375, height: 667, safeTop: 24 });
}

describe('CharacterView：双方角色卡投影', () => {
  it('从只读快照投影回合、比分与当前行动方', () => {
    const view = makeView();
    expect(view.round).toBe(0);
    expect(view.currentPlayer).toBeNull();
    expect(view.scoreOf('P1')).toBe(0);
    expect(view.scoreOf('P2')).toBe(0);

    const state = stateWith({
      round: 7,
      maxRounds: 60,
      currentPlayer: 'P2',
      players: {
        P1: { score: 12, board: createInitialGameState().players.P1.board },
        P2: { score: 34, board: createInitialGameState().players.P2.board },
      },
    });
    view.update(state, { isExtraTurn: false });

    expect(view.round).toBe(7);
    expect(view.maxRounds).toBe(60);
    expect(view.currentPlayer).toBe('P2');
    expect(view.scoreOf('P1')).toBe(12);
    expect(view.scoreOf('P2')).toBe(34);
    expect(view.isExtraTurn).toBe(false);
  });

  it('连动回合标记由投影选项给出，且不改变当前行动方', () => {
    const view = makeView();
    view.update(stateWith({ round: 3, currentPlayer: 'P1' }), { isExtraTurn: true });

    expect(view.isExtraTurn).toBe(true);
    expect(view.currentPlayer).toBe('P1');
  });

  it('表情反馈按玩家各自记录，超时后回落待机', () => {
    const view = makeView();
    view.update(stateWith());

    expect(view.getExpression('P1')).toBe('idle');
    expect(view.getExpression('P2')).toBe('idle');

    view.setExpression('P1', 'attack', 0.5);
    view.setExpression('P2', 'hurt', 0.2);
    expect(view.getExpression('P1')).toBe('attack');
    expect(view.getExpression('P2')).toBe('hurt');

    // 0.2 秒后 P2 的表情到期，P1 仍在持续
    view.updateTimers(0.2);
    expect(view.getExpression('P1')).toBe('attack');
    expect(view.getExpression('P2')).toBe('idle');

    view.updateTimers(0.3);
    expect(view.getExpression('P1')).toBe('idle');
  });

  it('表情持续时间内被再次触发时重新计时', () => {
    const view = makeView();
    view.setExpression('P1', 'cast', 0.4);
    view.updateTimers(0.3);
    view.setExpression('P1', 'hurt', 0.4);
    expect(view.getExpression('P1')).toBe('hurt');

    view.updateTimers(0.3);
    expect(view.getExpression('P1')).toBe('hurt');
    view.updateTimers(0.2);
    expect(view.getExpression('P1')).toBe('idle');
  });

  it('气泡播报按玩家记录并按时长消散', () => {
    const view = makeView();
    expect(view.getBubble('P1')).toBeNull();

    view.announce('P1', '势在必行·强化', 1);
    view.announce('P2', '天道推演', 0.5);
    expect(view.getBubble('P1')).toBe('势在必行·强化');
    expect(view.getBubble('P2')).toBe('天道推演');

    view.updateTimers(0.5);
    expect(view.getBubble('P1')).toBe('势在必行·强化');
    expect(view.getBubble('P2')).toBeNull();

    view.updateTimers(0.5);
    expect(view.getBubble('P1')).toBeNull();
  });

  it('横幅播报保留主文案与副文案', () => {
    const view = makeView();
    expect(view.bannerText).toBe('');
    expect(view.bannerSubText).toBe('');

    view.showBanner('玩家回合 · 天干【甲】降临', '属性: 木 (阳)');
    expect(view.bannerText).toBe('玩家回合 · 天干【甲】降临');
    expect(view.bannerSubText).toBe('属性: 木 (阳)');

    view.showBanner('【终轮绝杀·天命抽牌】');
    expect(view.bannerText).toBe('【终轮绝杀·天命抽牌】');
    expect(view.bannerSubText).toBe('');
  });

  it('渲染双方角色、横幅与回合信息不抛错，且确实落笔', () => {
    const view = makeView();
    view.update(stateWith({ round: 4, currentPlayer: 'P1' }), { isExtraTurn: true });
    view.setExpression('P1', 'cast', 0.5);
    view.setExpression('P2', 'hurt', 0.5);
    view.announce('P2', '天道推演生克中', 1);
    view.showBanner('【连动回合】玩家额外行动！', '唯一机缘·破');

    const ctx = new RecordingContext();
    expect(() => view.render(ctx.asContext())).not.toThrow();
    expect(ctx.drawCallCount()).toBeGreaterThan(10);
  });

  it('长文案折行后不越出横幅（按保守字宽上界断言绘制指令）', () => {
    const view = makeView();
    view.update(stateWith({ round: 16, currentPlayer: 'P2' }));
    view.showBanner('【终轮绝杀·天命抽牌】', '【天命难违】差之一线·先手锁定胜局！(抽中【壬水】)');

    const ctx = new RecordingContext();
    view.render(ctx.asContext());

    // 横幅夹在两侧头像列之间：左侧 10 边距 + 54 头像 + 10 间距。
    const bannerX = 10 + 54 + 10;
    const bannerWidth = 375 - 2 * bannerX;
    const bannerTexts = ctx.texts.filter(
      (line) => line.y > 50 && line.y < 130 && line.x > 60 && line.x < 320,
    );
    expect(bannerTexts.length).toBeGreaterThan(0);
    for (const line of bannerTexts) {
      // 全角等宽字的上界：每字不超过 1.25 倍字号。
      const upperBound = [...line.text].length * line.fontSize * 1.25;
      expect(line.x - upperBound / 2).toBeGreaterThanOrEqual(bannerX);
      expect(line.x + upperBound / 2).toBeLessThanOrEqual(bannerX + bannerWidth);
    }
  });

  it('视口变化后重新投影不抛错', () => {
    const view = makeView();
    view.update(stateWith({ currentPlayer: 'P2' }));
    view.resize(320, 568, 20);

    const ctx = new RecordingContext();
    expect(() => view.render(ctx.asContext())).not.toThrow();
    expect(view.currentPlayer).toBe('P2');
  });
});
