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

/**
 * 全部角色姿势：`satisfies Record<CharacterActionState, true>` 做类型级穷举——
 * 新增一个姿势却漏在这里，`npm run typecheck` 当场判红，不会静默漏测。
 */
const ALL_POSES = Object.keys({
  idle: true,
  attack: true,
  hurt: true,
  cast: true,
  celebrate: true,
  win: true,
  lose: true,
} satisfies Record<CharacterActionState, true>) as readonly CharacterActionState[];

/** 归一庆祝与终局胜负：票 03 新增的三类状态，必须有独立画法。 */
const NEW_POSES: readonly CharacterActionState[] = ['celebrate', 'win', 'lose'];

/** 用伪上下文单独渲染一个角色姿势（不经视图布局）。 */
function renderPose(state: CharacterActionState, isPlayer = true, animTick = 0): RecordingContext {
  const ctx = new RecordingContext();
  drawPixelCharacter(ctx.asContext(), 0, 0, isPlayer, state, animTick);
  return ctx;
}

/** 曲线路径的保守包围盒（控制点凸包、描边半径与嵌套位移全部计入）。 */
function boundsOf(ctx: RecordingContext): {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
} {
  const extents = ctx.paths
    .filter((path) => path.points.length > 0)
    .flatMap((path) =>
      path.points.map((point) => ({
        x: point.x + path.offset.x,
        y: point.y + path.offset.y,
        margin: path.strokeWidth / 2,
      })),
    );
  const left = Math.min(...extents.map((point) => point.x - point.margin));
  const right = Math.max(...extents.map((point) => point.x + point.margin));
  const top = Math.min(...extents.map((point) => point.y - point.margin));
  const bottom = Math.max(...extents.map((point) => point.y + point.margin));
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

/** Avatar frame outlines, excluding the smaller narration panel. */
function frameBorders(ctx: RecordingContext): string[] {
  return ctx.strokedRects.filter((rect) => rect.w >= 60 && rect.h >= 100).map((rect) => rect.color);
}

describe('drawPixelCharacter：卡通修士造型', () => {
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

  it('七种姿势各自的落笔序列（曲线路径 + 浮动）互不相同，新状态不落回待机', () => {
    const sequences = new Map<string, string>();
    for (const state of ALL_POSES) {
      for (const isPlayer of [true, false]) {
        const ctx = renderPose(state, isPlayer);
        sequences.set(
          `${state}:${String(isPlayer)}`,
          JSON.stringify({ paths: ctx.paths, translations: ctx.translations }),
        );
      }
    }
    const entries = [...sequences.entries()];
    for (const [leftKey, leftSequence] of entries) {
      for (const [rightKey, rightSequence] of entries) {
        if (leftKey >= rightKey) continue;
        expect(leftSequence, `${leftKey} 与 ${rightKey} 的姿势不应相同`).not.toBe(rightSequence);
      }
    }
    // 归一庆祝与终局胜负必须有独立画法，不许静默沿用待机。
    for (const pose of NEW_POSES) {
      expect(sequences.get(`${pose}:true`)).not.toBe(sequences.get('idle:true'));
      expect(sequences.get(`${pose}:false`)).not.toBe(sequences.get('idle:false'));
    }
  });

  it('两名角色都使用曲线塑造轮廓，直接按屏幕尺寸绘制', () => {
    for (const state of ALL_POSES) {
      for (const isPlayer of [true, false]) {
        const ctx = renderPose(state, isPlayer);
        expect(ctx.calls).toContain('quadraticCurveTo');
        expect(ctx.paths.length).toBeGreaterThan(0);
        expect(ctx.scales).toEqual([]);
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

  it('长文案折行后不越出横幅底板（按保守字宽上界断言落笔文本）', () => {
    const view = makeView();
    view.update(stateWith({ round: 16, currentPlayer: 'P2' }));
    view.showBanner('【终轮绝杀·天命抽牌】', '【天命难违】差之一线·先手锁定胜局！(抽中【壬水】)');

    const ctx = new RecordingContext();
    view.render(ctx.asContext());

    // 横幅底板不靠实现常量识别：它是画面里最宽的一块底板（两侧头像列给它让位）。
    const banner = ctx.rects.reduce((widest, rect) => (rect.w > widest.w ? rect : widest));
    const bannerTexts = ctx.texts.filter(
      (line) => line.y >= banner.y && line.y <= banner.y + banner.h,
    );
    expect(bannerTexts.length).toBeGreaterThan(0);
    for (const line of bannerTexts) {
      // 全角等宽字的上界：每字不超过 1.25 倍字号。
      const upperBound = [...line.text].length * line.fontSize * 1.25;
      expect(line.x - upperBound / 2).toBeGreaterThanOrEqual(banner.x);
      expect(line.x + upperBound / 2).toBeLessThanOrEqual(banner.x + banner.w);
    }
  });

  it('视图按原尺寸落笔角色：头像里的路径与直接渲染该姿势一致', () => {
    const view = makeView();
    view.update(stateWith({ currentPlayer: 'P1' }));
    view.setExpression('P1', 'celebrate', 0.5);
    view.setExpression('P2', 'lose', 0.5);

    const ctx = new RecordingContext();
    view.render(ctx.asContext());

    // 视图不得再叠任何缩放：头像里的路径必须与直接绘制同一姿势完全相同。
    const poses: readonly (readonly ['P1' | 'P2', CharacterActionState])[] = [
      ['P1', 'celebrate'],
      ['P2', 'lose'],
    ];
    for (const [player, pose] of poses) {
      const expected = renderPose(pose, player === 'P1').paths.map(
        ({ offset: _offset, ...path }) => path,
      );
      expect(expected.length).toBeGreaterThan(0);
      for (const path of expected) {
        expect(
          ctx.paths.map(({ offset: _offset, ...drawn }) => drawn),
          `${player} 的 ${pose} 路径`,
        ).toContainEqual(path);
      }
    }
  });

  it('七种姿势的描边色两两不同：新状态不静默落回待机 / 默认色', () => {
    const view = makeView();
    // P1 非行动方：待机取 P1 本色，其余六态必须各自换色。
    view.update(stateWith({ currentPlayer: 'P2' }));

    const colors = new Map<CharacterActionState, string>();
    for (const pose of ALL_POSES) {
      view.setExpression('P1', pose, 999);
      const ctx = new RecordingContext();
      view.render(ctx.asContext());
      const borders = frameBorders(ctx);
      expect(borders.length, `${pose} 的头像框描边`).toBeGreaterThan(0);
      colors.set(pose, borders[0]);
    }

    // 配色取值不抄实现：只要两两不同，就算真的给每个姿势各自配了色。
    expect(new Set(colors.values()).size, JSON.stringify([...colors])).toBe(ALL_POSES.length);
  });

  it('放大后的角色画在 100px 以上的头像框里，两列对称地分居左右且不越出屏幕', () => {
    const view = makeView();
    view.update(stateWith({ currentPlayer: 'P1' }));
    view.setExpression('P1', 'attack', 0.5);
    view.setExpression('P2', 'celebrate', 0.5);
    const ctx = new RecordingContext();
    view.render(ctx.asContext());

    // 头像框底板不靠实现常量识别：画面里仅有的两块高 ≥ 100px 的大底板。
    const frames = ctx.rects.filter((rect) => rect.w >= 60 && rect.h >= 100);
    expect(frames.length).toBe(2);
    const [left, right] = [...frames].sort((a, b) => a.x - b.x);
    expect(left.x).toBeGreaterThanOrEqual(0);
    expect(right.x + right.w).toBeLessThanOrEqual(375);
    // 两列左右对称，中间留给横幅。
    expect(left.x).toBeCloseTo(375 - (right.x + right.w), 5);
    expect(right.x - (left.x + left.w)).toBeGreaterThan(0);

    // 框高落在 100–120px，且装得下放大后的角色（含跳跃浮动）。
    expect(left.h).toBeGreaterThanOrEqual(100);
    expect(left.h).toBeLessThanOrEqual(120);
    const sprite = boundsOf(renderPose('celebrate'));
    expect(left.h).toBeGreaterThanOrEqual(sprite.height);
    expect(left.w).toBeGreaterThanOrEqual(sprite.width);
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
