import { describe, expect, it } from 'vitest';
import { GameScene } from '../../src/minigame/game-scene.js';
import { ActionType, WuXing, type PlayerId } from '../../src/core/types/domain.js';
import { gameStateWith } from '../../tools/BoardFixture.js';

import { RecordingContext } from '../core/helpers/recording-context.js';
import { SWORD_SINGLE } from '../../src/minigame/vfx/params/sword.js';

/** Record the geometry actually submitted by render, including nested Canvas transforms. */
class LayoutContext extends RecordingContext {
  public filter = 'none';
  public globalCompositeOperation = 'source-over';
  public readonly imageFilters: string[] = [];
  override drawImage(...args: Parameters<RecordingContext['drawImage']>): void {
    this.imageFilters.push(this.globalCompositeOperation);
    super.drawImage(...args);
  }
  private matrix = [1, 0, 0, 1, 0, 0];
  private matrices: number[][] = [];
  public ink: { x: number; y: number }[] = [];
  private points: { x: number; y: number }[] = [];
  override save(): void {
    super.save();
    this.matrices.push([...this.matrix]);
  }
  override restore(): void {
    super.restore();
    this.matrix = this.matrices.pop()!;
  }
  override translate(x: number, y: number): void {
    const m = this.matrix;
    m[4] += m[0] * x + m[2] * y;
    m[5] += m[1] * x + m[3] * y;
  }
  override scale(x: number, y: number): void {
    const m = this.matrix;
    m[0] *= x;
    m[1] *= x;
    m[2] *= y;
    m[3] *= y;
  }
  override rotate(angle: number): void {
    const [a, b, c, d] = this.matrix;
    const co = Math.cos(angle),
      si = Math.sin(angle);
    Object.assign(this.matrix, {
      0: a * co + c * si,
      1: b * co + d * si,
      2: c * co - a * si,
      3: d * co - b * si,
    });
  }
  private point(x: number, y: number): { x: number; y: number } {
    const [a, b, c, d, e, f] = this.matrix;
    return { x: a * x + c * y + e, y: b * x + d * y + f };
  }
  override beginPath(): void {
    this.points = [];
  }
  override moveTo(x: number, y: number): void {
    this.points.push(this.point(x, y));
  }
  override lineTo(x: number, y: number): void {
    this.points.push(this.point(x, y));
  }
  override arc(x: number, y: number, radius: number): void {
    this.points.push(this.point(x - radius, y - radius), this.point(x + radius, y + radius));
  }
  override fill(): void {
    if (SWORD_SINGLE.material.ramp.includes(String(this.fillStyle))) this.ink.push(...this.points);
  }
  override stroke(): void {
    if (SWORD_SINGLE.material.ramp.includes(String(this.strokeStyle)))
      this.ink.push(...this.points);
  }
}

function attackScene(width = 375, height = 667, actor: PlayerId = 'P1') {
  const scene = new GameScene({
    width,
    height,
    entranceDuration: 0.01,
    flightDuration: 0.01,
    impactDuration: 0.01,
    resultHold: 0.01,
    initialState: {
      ...gameStateWith({ [actor]: { [WuXing.WOOD]: { yin: 1, yang: 1 } } }),
      currentPlayer: actor,
    },
    prng: { next: () => 0, nextInt: () => 0, getState: () => 0 },
  });
  scene.start();
  scene.update(0.02);
  return scene;
}

describe('GameScene 玩家剑术真实事件接入', () => {
  it.each([
    [460, 588, 24],
    [460, 588, 88],
    [280, 480, 24],
  ])('%sx%s safeTop %s 保持主印与标签可读', (width, height, safeTop) => {
    const scene = new GameScene({ width, height, safeTop, safeBottom: 20 });
    scene.start();
    scene.update(1);
    expect(scene.board.layout.sealSize).toBeGreaterThanOrEqual(12);
    expect(scene.board.layout.innerRadius).toBeGreaterThanOrEqual(40);
    const nodes = scene.board.elements;
    const labels = nodes.map((node) => {
      const direction = node.player === 'P1' ? -1 : 1;
      const distance = node.sealSize + Math.max(7, node.sealSize * 0.55);
      return {
        x: node.x + direction * Math.cos(node.angle) * distance,
        y: node.y + direction * Math.sin(node.angle) * distance,
      };
    });
    for (const label of labels)
      for (const other of labels) {
        if (label === other) continue;
        expect(Math.abs(label.x - other.x) >= 12 || Math.abs(label.y - other.y) >= 12).toBe(true);
      }
    for (const node of nodes)
      for (const other of nodes) {
        if (node === other) continue;
        expect(Math.hypot(node.x - other.x, node.y - other.y)).toBeGreaterThan(
          node.sealSize + other.sealSize + 2,
        );
      }
    scene.dispose();
  });
  it.each([
    [460, 1215],
    [320, 568],
    [375, 667],
    [280, 480],
  ])('真实 render 在 %sx%s 保留完整刀光并避开顶部播报', (width, height) => {
    for (const type of [ActionType.ATK, ActionType.BURST_ATK]) {
      const scene = attackScene(width, height);
      const action = scene.turnManager.getAvailableActions().find((a) => a.actionType === type)!;
      scene.turnManager.executeAction(action);
      let inkFrames = 0;
      for (let i = 0; i < 360 && scene.phase === 'flying'; i++) {
        scene.update(1 / 120);
        const ctx = new LayoutContext();
        scene.render(ctx.asContext());
        if (ctx.ink.length === 0) continue;
        inkFrames++;
        for (const point of ctx.ink) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(width);
          // The approved shared combat area sits at the top, above the board.
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThanOrEqual(height < 650 ? 204 : 212);
        }
        const anchor = scene.characters.combatAnchor('P1');
        expect(anchor.y + scene.characters.combatOffsets.P1.y).toBeLessThan(150);
        expect(scene.characters.combatScales.P1).toBe(1);
      }
      expect(inkFrames).toBeGreaterThan(10);
      scene.dispose();
    }
  });

  it.each([ActionType.ATK, ActionType.BURST_ATK])('P2 %s 原地施法、命中闪色并等待回位', (type) => {
    const scene = attackScene(460, 588, 'P2');
    scene.characters.setSpriteAtlas({ image: {} as CanvasImageSource, width: 1254, height: 1254 });
    const action = scene.turnManager.getAvailableActions().find((a) => a.actionType === type)!;
    expect(scene.turnManager.executeAction(action).success).toBe(true);
    let flashes = 0;
    let inkFrames = 0;
    for (let i = 0; i < 900 && scene.phase === 'flying'; i++) {
      scene.update(1 / 120);
      expect(scene.characters.combatOffsets.P2).toEqual({ x: 0, y: 0 });
      if (scene.phase === 'flying') {
        expect(scene.characters.getExpression('P2')).toBe('cast');
        expect(scene.combatElement).toBe(WuXing.EARTH);
      }
      if (scene.characters.combatFlash.P1 > 0) flashes++;
      const ctx = new LayoutContext();
      scene.render(ctx.asContext());
      if (scene.characters.combatFlash.P1 > 0) expect(ctx.imageFilters).toContain('lighter');
      if (ctx.ink.length > 0) inkFrames++;
      for (const point of ctx.ink) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(460);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(204);
      }
    }
    expect(flashes).toBeGreaterThan(0);
    expect(inkFrames).toBeGreaterThan(10);
    expect(scene.phase).toBe('result');
    expect(scene.characters.combatOffsets.P1).toEqual({ x: 0, y: 0 });
    scene.dispose();
  });

  it('攻击途中销毁清除半身位移、震屏和旧时间线', () => {
    const scene = attackScene();
    const action = scene.turnManager
      .getAvailableActions()
      .find((candidate) => candidate.actionType === ActionType.ATK)!;
    scene.turnManager.executeAction(action);
    scene.update(0.17);
    expect(scene.characters.combatOffsets.P1.x).toBeGreaterThan(0);
    scene.dispose();
    scene.update(0.2);
    expect(scene.characters.combatOffsets.P1).toEqual({ x: 0, y: 0 });
    expect(scene.characters.combatOffsets.P2).toEqual({ x: 0, y: 0 });
    expect(scene.x).toBe(0);
    expect(scene.y).toBe(0);
    expect(scene.phase).toBe('idle');
  });

  it.each([ActionType.ATK, ActionType.BURST_ATK])(
    '%s 从 executeAction 触发剑术并等待回位，重开会清理',
    (type) => {
      const scene = attackScene();
      const action = scene.turnManager
        .getAvailableActions()
        .find((candidate) => candidate.actionType === type)!;
      expect(action).toBeDefined();
      expect(scene.turnManager.executeAction(action).success).toBe(true);
      scene.update(0.07);
      expect(scene.characters.combatOffsets.P1.x).toBeGreaterThan(0);
      scene.update(0.1);
      expect(scene.phase).toBe('flying');
      const offset = { ...scene.characters.combatOffsets.P1 };
      scene.update(0.02);
      expect(scene.characters.combatOffsets.P1).toEqual(offset);
      for (let i = 0; i < 900 && scene.phase === 'flying'; i++) scene.update(1 / 120);
      expect(scene.phase).toBe('result');
      expect(scene.characters.combatOffsets.P1).toEqual({ x: 0, y: 0 });
      expect(scene.characters.combatOffsets.P2).toEqual({ x: 0, y: 0 });
      scene.restart(1);
      expect(scene.x).toBe(0);
      expect(scene.y).toBe(0);
      scene.dispose();
    },
  );
});
