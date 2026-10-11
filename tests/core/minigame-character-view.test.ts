import { describe, it, expect } from 'vitest';
import { CharacterView } from '../../src/minigame/views/character-view.js';
import {
  CHARACTER_PIXEL_SIZE,
  CHARACTER_SPRITE_BOUNDS,
  drawPixelCharacter,
} from '../../src/minigame/pixel-art.js';
import { CharacterActionState } from '../../src/minigame/types.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import { GameState } from '../../src/core/types/domain.js';
import { RecordingContext } from './helpers/recording-context.js';

/** 受控状态：只覆盖本视图关心的字段（回合 / 玩家 / 比分）。 */
function stateWith(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeView(): CharacterView {
  return new CharacterView({ width: 375, safeTop: 24 });
}

/** 视图布局契约：头像框宽度与边距（与 `character-view.ts` 的常量一致，改布局要同步改这里）。 */
const AVATAR_WIDTH = 88;
const SIDE_MARGIN = 10;
const BANNER_GAP = 10;

/** 全部角色姿势：新增状态必须逐个出现在姿势与配色断言里。 */
const ALL_POSES: readonly CharacterActionState[] = [
  'idle',
  'attack',
  'hurt',
  'cast',
  'celebrate',
  'win',
  'lose',
];

/** 归一庆祝 / 终局胜 / 终局负的表情描边色（票 03 的配色契约）。 */
const NEW_STATE_COLORS: readonly [CharacterActionState, string][] = [
  ['celebrate', '#ed8936'],
  ['win', '#48bb78'],
  ['lose', '#a0aec0'],
];

/** 用伪上下文单独渲染一个角色姿势（不经视图布局）。 */
function renderPose(state: CharacterActionState, isPlayer = true, animTick = 0): RecordingContext {
  const ctx = new RecordingContext();
  drawPixelCharacter(ctx.asContext(), 0, 0, isPlayer, state, animTick);
  return ctx;
}

/** 一组矩形的像素包围盒（含首个 `translate` 的浮动偏移，即屏幕上实际落笔的范围）。 */
function boundsOf(ctx: RecordingContext): {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
} {
  const offsetX = ctx.translations[0]?.x ?? 0;
  const offsetY = ctx.translations[0]?.y ?? 0;
  const left = Math.min(...ctx.rects.map((rect) => Math.floor(offsetX + rect.x)));
  const right = Math.max(...ctx.rects.map((rect) => Math.floor(offsetX + rect.x) + rect.w));
  const top = Math.min(...ctx.rects.map((rect) => Math.floor(offsetY + rect.y)));
  const bottom = Math.max(...ctx.rects.map((rect) => Math.floor(offsetY + rect.y) + rect.h));
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

/** 头像框的四条描边（宽 ≥ 60 的横条或高 ≥ 60 的竖条）。 */
function frameBorders(ctx: RecordingContext): string[] {
  return ctx.rects
    .filter((rect) => (rect.h === 2 && rect.w >= 60) || (rect.w === 2 && rect.h >= 60))
    .map((rect) => rect.color);
}

describe('drawPixelCharacter：放大重画（票 03）', () => {
  it('待机全身像在屏幕上的高度落在 100–120px（提高逻辑分辨率，不靠视图缩放）', () => {
    const box = boundsOf(renderPose('idle'));
    expect(box.height).toBeGreaterThanOrEqual(100);
    expect(box.height).toBeLessThanOrEqual(120);
  });

  it('每个姿势都画在声明的精灵包围盒内（放大后仍装得进头像框）', () => {
    const limit = {
      left: CHARACTER_SPRITE_BOUNDS.left * CHARACTER_PIXEL_SIZE,
      right: CHARACTER_SPRITE_BOUNDS.right * CHARACTER_PIXEL_SIZE,
      top: CHARACTER_SPRITE_BOUNDS.top * CHARACTER_PIXEL_SIZE,
      bottom: CHARACTER_SPRITE_BOUNDS.bottom * CHARACTER_PIXEL_SIZE,
    };
    // 呼吸 / 跳跃的浮动幅度也算进包围盒：跨多个动画时刻检查。
    for (const state of ALL_POSES) {
      for (const isPlayer of [true, false]) {
        for (const tick of [0, 12, 24, 39]) {
          const box = boundsOf(renderPose(state, isPlayer, tick));
          expect(box.left).toBeGreaterThanOrEqual(limit.left);
          expect(box.right).toBeLessThanOrEqual(limit.right);
          expect(box.top).toBeGreaterThanOrEqual(limit.top);
          expect(box.bottom).toBeLessThanOrEqual(limit.bottom);
        }
      }
    }
  });

  it('七种姿势各自画出不同的像素矩形，无一静默落回同一姿势', () => {
    const shapes = new Map<string, string>();
    for (const state of ALL_POSES) {
      for (const isPlayer of [true, false]) {
        const key = `${state}:${String(isPlayer)}`;
        shapes.set(key, JSON.stringify(renderPose(state, isPlayer).rects));
      }
    }
    const entries = [...shapes.entries()];
    for (const [leftKey, leftShape] of entries) {
      for (const [rightKey, rightShape] of entries) {
        if (leftKey >= rightKey) continue;
        expect(leftShape, `${leftKey} 与 ${rightKey} 的姿势不应相同`).not.toBe(rightShape);
      }
    }
  });

  it('放大是重画而非缩放：绘制过程不产生任何 scale 指令', () => {
    for (const state of ALL_POSES) {
      for (const isPlayer of [true, false]) {
        expect(renderPose(state, isPlayer).calls).not.toContain('scale');
      }
    }
  });

  it('待机呼吸随时间上下浮动', () => {
    const still = boundsOf(renderPose('idle', true, 0));
    const breathing = boundsOf(renderPose('idle', true, 12));
    expect(breathing.top).not.toBe(still.top);
  });
});

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

    // 横幅夹在两侧头像列之间：左侧 10 边距 + 88 头像 + 10 间距。
    const bannerX = SIDE_MARGIN + AVATAR_WIDTH + BANNER_GAP;
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

  it('放大后的角色仍夹在两侧头像列里：视图渲染不产生非 1:1 的缩放', () => {
    const view = makeView();
    view.update(stateWith({ currentPlayer: 'P1' }));
    view.setExpression('P1', 'celebrate', 0.5);

    const ctx = new RecordingContext();
    view.render(ctx.asContext());
    // 场景树每个节点自身会写一次 scale(1,1)；角色本体不得再叠任何缩放。
    expect(ctx.scales.filter((entry) => entry.x !== 1 || entry.y !== 1)).toEqual([]);
  });

  it('新状态各有自己的描边色，不静默落回默认分支', () => {
    const view = makeView();
    // P1 非行动方：默认描边色应是 P1 本色 #63b3ed，新状态必须把它换掉。
    view.update(stateWith({ currentPlayer: 'P2' }));

    for (const [state, color] of NEW_STATE_COLORS) {
      view.setExpression('P1', state, 999);
      const ctx = new RecordingContext();
      view.render(ctx.asContext());
      const borders = frameBorders(ctx);
      expect(borders, `${state} 的描边色`).toContain(color);
      expect(borders, `${state} 不应落回 P1 默认描边色`).not.toContain('#63b3ed');
    }
  });

  it('新状态的描边色互不相同', () => {
    const colors = NEW_STATE_COLORS.map(([, color]) => color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('放大后的角色画在 100px 以上的头像框里，两列分居左右且不越出屏幕', () => {
    const view = makeView();
    view.update(stateWith({ currentPlayer: 'P1' }));
    view.setExpression('P1', 'attack', 0.5);
    view.setExpression('P2', 'celebrate', 0.5);
    const ctx = new RecordingContext();
    view.render(ctx.asContext());

    // 两侧头像框的底色矩形（宽 88 高 ≥ 100）分居左右、不越出屏幕。
    const frames = ctx.rects.filter((rect) => rect.w === AVATAR_WIDTH && rect.h >= 100);
    expect(frames.length).toBe(2);
    const [left, right] = [...frames].sort((a, b) => a.x - b.x);
    expect(left.x).toBe(SIDE_MARGIN);
    expect(right.x).toBe(375 - SIDE_MARGIN - AVATAR_WIDTH);

    // 头像框高度落在 100–120px：放大后的角色装得下。
    const borders = ctx.rects.filter((rect) => rect.h === 2 && rect.w === AVATAR_WIDTH);
    const frameTop = Math.min(...borders.map((rect) => rect.y));
    const frameBottom = Math.max(...borders.map((rect) => rect.y));
    expect(frameBottom - frameTop).toBeGreaterThanOrEqual(100);
    expect(frameBottom - frameTop).toBeLessThanOrEqual(120);
  });

  it('视口变化后重新投影不抛错', () => {
    const view = makeView();
    view.update(stateWith({ currentPlayer: 'P2' }));
    view.resize(320, 20);

    const ctx = new RecordingContext();
    expect(() => view.render(ctx.asContext())).not.toThrow();
    expect(view.currentPlayer).toBe('P2');
  });
});
