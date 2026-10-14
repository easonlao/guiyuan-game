import { describe, it, expect } from 'vitest';
import { BoardView } from '../../src/minigame/views/board-view.js';
import { RuneFlightView } from '../../src/minigame/views/rune-flight-view.js';
import { Polarity, TianGanInfo, WuXing } from '../../src/core/types/domain.js';
import { RecordingContext } from './helpers/recording-context.js';

/** 甲：木·阳（金乌日冕）。 */
const TIAN_GAN_JIA: TianGanInfo = { name: '甲', element: WuXing.WOOD, polarity: Polarity.YANG };

/** 乙：木·阴（玄阴幽光）。 */
const TIAN_GAN_YI: TianGanInfo = { name: '乙', element: WuXing.WOOD, polarity: Polarity.YIN };

/** 测试用法盘：固定极坐标参数，槽位坐标由 `getSlot` 给出（不在这里重算几何）。 */
function makeBoardView(): BoardView {
  return new BoardView({
    centerX: 0,
    centerY: 0,
    innerRadius: 100,
    outerRadius: 200,
    sealSize: 24,
    startAngle: -Math.PI / 2,
  });
}

/** 点到「起点→终点」直线的**带符号**垂距：用来独立判定轨迹弯曲方向。 */
function signedDistanceFromLine(
  point: { x: number; y: number },
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return (dx * (point.y - from.y) - dy * (point.x - from.x)) / length;
}

/** 飞满全程并记录每一步的位置（用于观察轨迹形状）。 */
function sampleFlight(
  view: RuneFlightView,
  duration: number,
  steps: number,
): { x: number; y: number }[] {
  const samples: { x: number; y: number }[] = [];
  for (let index = 0; index < steps; index += 1) {
    view.update(duration / steps);
    samples.push(view.position);
  }
  return samples;
}

describe('Minigame RuneFlightView: 天干入场浮空', () => {
  it('入场动效跑满时长后停在待机态，回调只触发一次', () => {
    const view = new RuneFlightView({
      board: makeBoardView(),
      centerX: 0,
      centerY: 0,
      entranceDuration: 0.4,
    });
    const completions: string[] = [];

    expect(view.phase).toBe('hidden');
    expect(view.isAnimating).toBe(false);

    view.playEntrance(TIAN_GAN_JIA, { onComplete: () => completions.push('entrance') });
    expect(view.phase).toBe('entering');
    expect(view.isAnimating).toBe(true);
    expect(view.tianGan).toEqual(TIAN_GAN_JIA);

    view.update(0.2);
    expect(view.phase).toBe('entering');
    expect(completions).toEqual([]);

    view.update(0.2);
    expect(view.phase).toBe('ready');
    expect(view.isAnimating).toBe(false);
    expect(completions).toEqual(['entrance']);
    expect(view.position).toEqual({ x: 0, y: 0 });

    view.update(1);
    expect(completions).toEqual(['entrance']);
  });

  it('阳天干取金乌日冕、阴天干取玄阴幽光', () => {
    const view = new RuneFlightView({ board: makeBoardView(), entranceDuration: 0.4 });

    view.playEntrance(TIAN_GAN_JIA);
    expect(view.haloStyle).toBe('corona');

    view.playEntrance(TIAN_GAN_YI);
    expect(view.haloStyle).toBe('moonlight');
    expect(view.tianGan).toEqual(TIAN_GAN_YI);
  });

  it('支持传入 options.duration 动态覆盖默认入场时长（连动加速）', () => {
    const view = new RuneFlightView({ board: makeBoardView(), entranceDuration: 0.8 });
    const completions: string[] = [];

    view.playEntrance(TIAN_GAN_JIA, {
      duration: 0.4,
      onComplete: () => completions.push('done'),
    });
    expect(view.phase).toBe('entering');

    view.update(0.39);
    expect(view.phase).toBe('entering');
    expect(completions).toEqual([]);

    view.update(0.02);
    expect(view.phase).toBe('ready');
    expect(completions).toEqual(['done']);
  });

  it('五行灵气光旋粒子系统依据行动方正确初始化并在 update 中推进', () => {
    const board = makeBoardView();
    const view = new RuneFlightView({ board, entranceDuration: 0.8 });

    // 己方 P1
    view.playEntrance(TIAN_GAN_JIA, { owner: 'P1' });
    expect(view.vortexNode.visible).toBe(true);
    expect(view.vortexNode.owner).toBe('P1');
    expect(view.vortexNode.sources).toHaveLength(5);
    expect(view.vortexNode.particles).toHaveLength(90);

    // 验证 P1 粒子源半径对应内环 (100)
    for (const src of view.vortexNode.sources) {
      const dist = Math.hypot(src.x, src.y);
      expect(dist).toBeCloseTo(100, 1);
    }

    // 推进 0.4 秒 (progress = 0.5)
    view.update(0.4);
    expect(view.vortexNode.progress).toBeCloseTo(0.5, 2);
    expect(view.vortexNode.visible).toBe(true);

    // 推进到完成 (0.8 秒)
    view.update(0.4);
    expect(view.phase).toBe('ready');
    expect(view.vortexNode.visible).toBe(false);
    expect(view.vortexNode.particles).toHaveLength(0);
  });

  it('对方 P2 触发时粒子源对齐外环半径且旋向为逆时针', () => {
    const board = makeBoardView();
    const view = new RuneFlightView({ board, entranceDuration: 0.8 });

    view.playEntrance(TIAN_GAN_YI, { owner: 'P2' });
    expect(view.vortexNode.owner).toBe('P2');
    expect(view.vortexNode.sources).toHaveLength(5);

    // 验证 P2 粒子源半径对应外环 (200)
    for (const src of view.vortexNode.sources) {
      const dist = Math.hypot(src.x, src.y);
      expect(dist).toBeCloseTo(200, 1);
    }
  });

  it('提前打断时粒子系统立即回收并归零', () => {
    const board = makeBoardView();
    const view = new RuneFlightView({ board, entranceDuration: 0.8 });

    view.playEntrance(TIAN_GAN_JIA, { owner: 'P1' });
    view.update(0.2);
    expect(view.vortexNode.visible).toBe(true);

    // 提前起飞打断入场
    view.flyTo('P1', WuXing.WOOD, Polarity.YIN);
    expect(view.phase).toBe('flying');
    expect(view.vortexNode.visible).toBe(false);
    expect(view.vortexNode.particles).toHaveLength(0);
  });
});

describe('Minigame RuneFlightView: 渲染', () => {
  it('render 在 Canvas 2D 上下文上落笔（未入场时也不崩）', () => {
    const hidden = new RecordingContext();
    const view = new RuneFlightView({ board: makeBoardView() });
    expect(() => view.render(hidden.asContext())).not.toThrow();
    expect(hidden.drawCallCount()).toBe(0);

    const entered = new RecordingContext();
    view.playEntrance(TIAN_GAN_JIA);
    view.update(0.2);
    expect(() => view.render(entered.asContext())).not.toThrow();
    expect(entered.drawCallCount()).toBeGreaterThan(0);

    // 命中波纹扩散中也要能落笔（复用 pixel-art 的冲击效果例程）。
    const impact = new RecordingContext();
    view.update(0.24);
    view.flyTo('P1', WuXing.WOOD, Polarity.YIN);
    view.update(0.55);
    expect(view.phase).toBe('impact');
    view.update(0.15);
    expect(() => view.render(impact.asContext())).not.toThrow();
    expect(impact.drawCallCount()).toBeGreaterThan(0);
  });
});

describe('Minigame RuneFlightView: 符文飞行与命中', () => {
  it('从屏幕中央飞向目标槽位，波纹结束后才交回控制权', () => {
    const board = makeBoardView();
    const view = new RuneFlightView({
      board,
      centerX: 150,
      centerY: 320,
      entranceDuration: 0.4,
      flightDuration: 0.5,
      impactDuration: 0.3,
    });
    const completions: string[] = [];
    view.playEntrance(TIAN_GAN_JIA);
    view.update(0.4);

    const start = view.position;
    const target = board.getSlot('P1', WuXing.WOOD, Polarity.YIN);
    expect(start).toEqual({ x: 150, y: 320 });

    view.flyTo('P1', WuXing.WOOD, Polarity.YIN, { onComplete: () => completions.push('flight') });
    expect(view.phase).toBe('flying');
    expect(view.isAnimating).toBe(true);
    // 未步进时仍停在起点，不会瞬间吸过去。
    expect(view.position).toEqual(start);

    // 半程（时长过半）：已离开起点，且不在起点—终点的直线上。
    view.update(0.25);
    const mid = view.position;
    expect(Math.hypot(mid.x - start.x, mid.y - start.y)).toBeGreaterThan(50);
    expect(Math.abs(signedDistanceFromLine(mid, start, target))).toBeGreaterThan(5);

    // 飞满时长：落在目标槽位的投影坐标上，波纹开始、控制权还没交回。
    view.update(0.25);
    expect(view.position.x).toBeCloseTo(target.x, 6);
    expect(view.position.y).toBeCloseTo(target.y, 6);
    expect(view.phase).toBe('impact');
    expect(view.isAnimating).toBe(true);
    expect(completions).toEqual([]);

    // 波纹跑完：控制权交回，且只回调一次。
    view.update(0.3);
    expect(view.phase).toBe('absorbed');
    expect(view.isAnimating).toBe(false);
    expect(completions).toEqual(['flight']);

    view.update(1);
    expect(completions).toEqual(['flight']);
    expect(view.position.x).toBeCloseTo(target.x, 6);
    expect(view.position.y).toBeCloseTo(target.y, 6);
  });

  it('阳天干走流星弧线：全程只偏向直线一侧', () => {
    const board = makeBoardView();
    const view = new RuneFlightView({ board, entranceDuration: 0.4, flightDuration: 0.5 });
    view.playEntrance(TIAN_GAN_JIA);
    view.update(0.4);

    const start = view.position;
    const target = board.getSlot('P1', WuXing.FIRE, Polarity.YANG);
    view.flyTo('P1', WuXing.FIRE, Polarity.YANG);

    const offsets = sampleFlight(view, 0.5, 10).map((point) =>
      signedDistanceFromLine(point, start, target),
    );

    // 流星弧线只偏向一侧（不越过直线），且偏移量确实存在。
    expect(offsets.every((offset) => offset <= 0)).toBe(true);
    expect(Math.min(...offsets)).toBeLessThan(-5);
  });

  it('阴天干走灵蛇蜿蜒：轨迹在直线两侧交替偏移', () => {
    const board = makeBoardView();
    const view = new RuneFlightView({ board, entranceDuration: 0.4, flightDuration: 0.5 });
    view.playEntrance(TIAN_GAN_YI);
    view.update(0.4);

    const start = view.position;
    const target = board.getSlot('P1', WuXing.FIRE, Polarity.YIN);
    view.flyTo('P1', WuXing.FIRE, Polarity.YIN);

    const offsets = sampleFlight(view, 0.5, 10).map((point) =>
      signedDistanceFromLine(point, start, target),
    );

    expect(offsets.some((offset) => offset > 5)).toBe(true);
    expect(offsets.some((offset) => offset < -5)).toBe(true);
    expect(Math.abs(offsets[offsets.length - 1])).toBeCloseTo(0, 6);
  });

  it('player 决定落点所在环：同一五行飞对方盘时落在更外一圈', () => {
    const board = makeBoardView();
    const view = new RuneFlightView({
      board,
      centerX: 0,
      centerY: 0,
      entranceDuration: 0.4,
      flightDuration: 0.5,
      impactDuration: 0.3,
    });
    view.playEntrance(TIAN_GAN_JIA);
    view.update(0.4);

    view.flyTo('P2', WuXing.WOOD, Polarity.YIN);
    view.update(0.5);

    const ownTarget = board.getSlot('P1', WuXing.WOOD, Polarity.YIN);
    const opponentTarget = board.getSlot('P2', WuXing.WOOD, Polarity.YIN);
    expect(view.position.x).toBeCloseTo(opponentTarget.x, 6);
    expect(view.position.y).toBeCloseTo(opponentTarget.y, 6);
    // 对方盘槽位比己方盘槽位离盘心更远：落点确实在外环上。
    expect(Math.hypot(view.position.x, view.position.y)).toBeGreaterThan(
      Math.hypot(ownTarget.x, ownTarget.y),
    );
    expect(Math.hypot(view.position.x, view.position.y)).toBeGreaterThan(board.layout.innerRadius);
  });

  it('未入场就起飞会直接报错，不会静默吞掉', () => {
    const board = makeBoardView();
    const view = new RuneFlightView({ board });

    expect(() => view.flyTo('P1', WuXing.WOOD, Polarity.YIN)).toThrow();
  });

  it('入场还没跑完就派发动作：符文直接落到待机态并起飞，不丢飞行', () => {
    const board = makeBoardView();
    const view = new RuneFlightView({
      board,
      centerX: 150,
      centerY: 320,
      entranceDuration: 0.4,
      flightDuration: 0.5,
      impactDuration: 0.3,
    });
    const completions: string[] = [];
    view.playEntrance(TIAN_GAN_JIA);
    view.update(0.1);

    view.flyTo('P1', WuXing.WOOD, Polarity.YIN, { onComplete: () => completions.push('flight') });
    expect(view.phase).toBe('flying');

    view.update(0.5);
    const target = board.getSlot('P1', WuXing.WOOD, Polarity.YIN);
    expect(view.position.x).toBeCloseTo(target.x, 6);
    expect(view.position.y).toBeCloseTo(target.y, 6);

    view.update(0.3);
    expect(view.phase).toBe('absorbed');
    expect(completions).toEqual(['flight']);
  });

  it('飞行途中重新入场会打断旧动效，两条动效不会互相抢符文', () => {
    const board = makeBoardView();
    const view = new RuneFlightView({
      board,
      centerX: 150,
      centerY: 320,
      entranceDuration: 0.4,
      flightDuration: 0.5,
      impactDuration: 0.3,
    });
    view.playEntrance(TIAN_GAN_JIA);
    view.update(0.4);
    const completions: string[] = [];
    view.flyTo('P1', WuXing.WOOD, Polarity.YIN, { onComplete: () => completions.push('flight') });
    view.update(0.25);

    view.playEntrance(TIAN_GAN_YI);
    expect(view.phase).toBe('entering');
    expect(view.position).toEqual({ x: 150, y: 320 });

    view.update(0.4);
    expect(view.phase).toBe('ready');
    expect(view.position).toEqual({ x: 150, y: 320 });
    expect(completions).toEqual([]);
  });
});
