import { describe, it, expect } from 'vitest';
import {
  BoardView,
  candidateBreathAlpha,
  drawNodeMark,
  drawYinYangFish,
  GUIYI_RING_INK,
  NODE_AURA_OUTSET_RATIO,
  PREVIEW_BREATH_SPEED,
  resolveActionPath,
} from '../../src/minigame/views/board-view.js';
import { ActionType, NodeLevel, PlayerId, Polarity, WuXing } from '../../src/core/types/domain.js';
import { WUXING_PALETTE } from '../../src/minigame/pixel-art.js';
import { THEME } from '../../src/minigame/theme.js';
import { boardWith } from '../../tools/BoardFixture.js';
import { RecordingContext } from './helpers/recording-context.js';
import { CANDIDATE_BREATH_PERIOD } from '../../src/minigame/views/board-view.js';

/**
 * 同心双环几何（ADR 0015 / LLD §4.1）：
 * 内环恒为己方盘（P1）、外环恒为对方盘（P2），外环相对内环逆时针偏移 2 格。
 * 期望坐标一律按「环半径 + 射线角」手算，不从被测代码抄。
 */
const RING_STEP = (Math.PI * 2) / 5;
/** 默认布局：圆心 (0,0)、内环 90、外环 150、主印半径 22.5、木居正上方。 */
const INNER_RADIUS = 90;
const OUTER_RADIUS = 150;
const START_ANGLE = -Math.PI / 2;

/** 内环五行（射线 0..4，角度 -90° 起每 72° 一格）的手算坐标。 */
const INNER_EXPECTED: Record<WuXing, { x: number; y: number }> = {
  [WuXing.WOOD]: { x: 0, y: -90 },
  [WuXing.FIRE]: { x: 85.595086, y: -27.811529 },
  [WuXing.EARTH]: { x: 52.900673, y: 72.811529 },
  [WuXing.METAL]: { x: -52.900673, y: 72.811529 },
  [WuXing.WATER]: { x: -85.595086, y: -27.811529 },
};

/** 外环五行（射线 = (相生序 + 3) % 5，即逆时针偏移 2 格）的手算坐标。 */
const OUTER_EXPECTED: Record<WuXing, { x: number; y: number }> = {
  [WuXing.WOOD]: { x: -88.167788, y: 121.352549 },
  [WuXing.FIRE]: { x: -142.658477, y: -46.352549 },
  [WuXing.EARTH]: { x: 0, y: -150 },
  [WuXing.METAL]: { x: 142.658477, y: -46.352549 },
  [WuXing.WATER]: { x: 88.167788, y: 121.352549 },
};

/** 每根射线上的「内克外」配对（木克土、火克金、土克水、金克木、水克火）。 */
const OVERCOMING_RAY_PAIRS: readonly [WuXing, WuXing][] = [
  [WuXing.WOOD, WuXing.EARTH],
  [WuXing.FIRE, WuXing.METAL],
  [WuXing.EARTH, WuXing.WATER],
  [WuXing.METAL, WuXing.WOOD],
  [WuXing.WATER, WuXing.FIRE],
];

/** 相生环顺序（角度递增 = 屏幕顺时针）。 */
const RING_ORDER: readonly WuXing[] = [
  WuXing.WOOD,
  WuXing.FIRE,
  WuXing.EARTH,
  WuXing.METAL,
  WuXing.WATER,
];

function sealOf(view: BoardView, player: PlayerId, element: WuXing) {
  const seal = view.elements.find((entry) => entry.player === player && entry.element === element);
  if (seal === undefined) {
    throw new Error(`测试找不到 ${player} 的 ${element} 主印。`);
  }
  return seal;
}

describe('Minigame BoardView: 同心双环几何', () => {
  it('内环为己方盘、外环为对方盘：十个主印按环半径分层，相生序不变', () => {
    const view = new BoardView();

    expect(view.elements).toHaveLength(10);
    const own = view.elements.filter((entry) => entry.player === 'P1');
    const opponent = view.elements.filter((entry) => entry.player === 'P2');
    expect(own.map((entry) => entry.element)).toEqual(RING_ORDER);
    expect(opponent.map((entry) => entry.element)).toEqual(RING_ORDER);

    // 坐标由「半径 × (cos, sin)」手算（见上方常量表），保留 5 位小数。
    for (const entry of own) {
      expect(entry.x).toBeCloseTo(INNER_EXPECTED[entry.element].x, 5);
      expect(entry.y).toBeCloseTo(INNER_EXPECTED[entry.element].y, 5);
      expect(Math.hypot(entry.x, entry.y)).toBeCloseTo(INNER_RADIUS, 5);
    }
    for (const entry of opponent) {
      expect(entry.x).toBeCloseTo(OUTER_EXPECTED[entry.element].x, 5);
      expect(entry.y).toBeCloseTo(OUTER_EXPECTED[entry.element].y, 5);
      expect(Math.hypot(entry.x, entry.y)).toBeCloseTo(OUTER_RADIUS, 5);
    }
  });

  it('外环逆时针偏移 2 格：每根射线上「己方克对方」且内外不同五行', () => {
    const view = new BoardView();

    for (let ray = 0; ray < RING_ORDER.length; ray += 1) {
      const rayAngle = START_ANGLE + ray * RING_STEP;
      const own = view.elements.find(
        (entry) => entry.player === 'P1' && Math.abs(entry.angle - rayAngle) < 1e-9,
      );
      const opponent = view.elements.find(
        (entry) => entry.player === 'P2' && Math.abs(entry.angle - rayAngle) < 1e-9,
      );

      expect(own).toBeDefined();
      expect(opponent).toBeDefined();
      // 每根射线：内环是相生序第 ray 个，外环是「内克外」的配对目标。
      expect(own?.element).toBe(RING_ORDER[ray]);
      expect(opponent?.element).toBe(OVERCOMING_RAY_PAIRS[ray][1]);
      expect(own?.element).not.toBe(opponent?.element);
    }

    // 等价说法：同一五行的外环角度 = 内环角度 - 2 * RING_STEP（按 2π 取模）。
    for (const element of RING_ORDER) {
      const own = sealOf(view, 'P1', element);
      const opponent = sealOf(view, 'P2', element);
      const delta =
        (((opponent.angle - (own.angle - 2 * RING_STEP)) % (Math.PI * 2)) + Math.PI * 2) %
        (Math.PI * 2);
      expect(delta).toBeCloseTo(0, 9);
    }
  });
});

describe('Minigame BoardView: 槽位投影与 getSlot', () => {
  it('getSlot(player, …) 返回对应环上阴/阳半环一侧的点，角度为主印射线角', () => {
    const view = new BoardView();
    const sealRadius = view.layout.sealSize;

    // 己方木：主印 (0,-90)，阴侧偏左、阳侧偏右；两点关于主印中心对称、且都落在主印半径内
    // （横向偏移不抄实现的比例常量，只按布局参数与「落在半环一侧」的关系断言）。
    const ownYin = view.getSlot('P1', WuXing.WOOD, Polarity.YIN);
    const ownYang = view.getSlot('P1', WuXing.WOOD, Polarity.YANG);
    expect(ownYin.x).toBeCloseTo(-ownYang.x, 9);
    expect(ownYin.x).toBeLessThan(0);
    expect(ownYang.x).toBeGreaterThan(0);
    expect(Math.abs(ownYin.x)).toBeLessThan(sealRadius);
    expect(ownYin.y).toBeCloseTo(-90, 5);
    expect(ownYang.y).toBeCloseTo(-90, 5);
    expect(ownYin.angle).toBeCloseTo(START_ANGLE, 9);
    expect(ownYang.angle).toBeCloseTo(START_ANGLE, 9);

    // 对方木：在射线 126°（= 内环木角 - 2 * 72°）的外环主印 (-88.167788, 121.352549) 上。
    // 阴阳偏移按各自主印半径等比：外环主印更小，偏移也按比例更小。
    const opponentYin = view.getSlot('P2', WuXing.WOOD, Polarity.YIN);
    const opponentYang = view.getSlot('P2', WuXing.WOOD, Polarity.YANG);
    const opponentSeal = sealOf(view, 'P2', WuXing.WOOD);
    const opponentCenterX = -88.167788;
    const ownOffset = ownYang.x;
    const opponentOffset = opponentYang.x - opponentCenterX;
    expect(opponentYin.x).toBeCloseTo(opponentCenterX - opponentOffset, 5);
    expect(opponentOffset).toBeGreaterThan(0);
    expect(opponentOffset / opponentSeal.sealSize).toBeCloseTo(ownOffset / sealRadius, 7);
    expect(opponentYin.y).toBeCloseTo(121.352549, 5);
    expect(opponentYin.angle).toBeCloseTo(START_ANGLE + 3 * RING_STEP, 9);
  });

  it('两块盘各自投影：同一五行在内外环上的等级互不串台', () => {
    const view = new BoardView();
    view.update(
      boardWith({ [WuXing.WOOD]: { yin: 1, yang: 1 } }),
      boardWith({ [WuXing.WOOD]: { yin: 0, yang: 2 }, [WuXing.WATER]: { yin: 2, yang: 2 } }),
    );

    expect(view.getSlot('P1', WuXing.WOOD, Polarity.YIN).level).toBe(1);
    expect(view.getSlot('P1', WuXing.WOOD, Polarity.YANG).level).toBe(1);
    expect(view.getSlot('P2', WuXing.WOOD, Polarity.YIN).level).toBe(0);
    expect(view.getSlot('P2', WuXing.WOOD, Polarity.YANG).level).toBe(2);

    // 归一/亢极是节点级高亮，按归属盘计算：己方木归一、对方水亢极、对方木都不算。
    expect(view.getSlot('P1', WuXing.WOOD, Polarity.YIN).isGuiYi).toBe(true);
    expect(view.getSlot('P2', WuXing.WOOD, Polarity.YIN).isGuiYi).toBe(false);
    expect(view.getSlot('P2', WuXing.WATER, Polarity.YIN).isKangJi).toBe(true);
    expect(view.getSlot('P1', WuXing.WATER, Polarity.YIN).isKangJi).toBe(false);
  });

  it('未投影快照前，内外环全部阴阳槽位按虚空 (0) 呈现', () => {
    const view = new BoardView();

    // 十个主印各带阴/阳两个槽位：内外环各十个，共二十个。
    expect(view.slots).toHaveLength(20);
    expect(view.slots.filter((slot) => slot.player === 'P1')).toHaveLength(10);
    expect(view.slots.filter((slot) => slot.player === 'P2')).toHaveLength(10);
    expect(view.slots.every((slot) => slot.level === 0)).toBe(true);
    expect(view.slots.map((slot) => slot.element)).toEqual([
      ...RING_ORDER.flatMap((element) => [element, element]),
      ...RING_ORDER.flatMap((element) => [element, element]),
    ]);
  });

  it('未知玩家 / 未知元素抛错，不静默返回别的槽位', () => {
    const view = new BoardView();

    expect(() => view.getSlot('P3' as unknown as PlayerId, WuXing.WOOD, Polarity.YIN)).toThrow();
    expect(() => view.getSlot('P1', 'NOPE' as unknown as WuXing, Polarity.YIN)).toThrow();
  });
});

describe('Minigame BoardView: 相生边与跨环径向线', () => {
  it('十条连线：五条内环相生边 + 五条跨环径向线，内环不再有相克星弦', () => {
    const view = new BoardView();

    const generation = view.connections.filter((line) => line.kind === 'generation');
    const attack = view.connections.filter((line) => line.kind === 'attack');
    expect(view.connections).toHaveLength(10);
    expect(generation).toHaveLength(5);
    expect(attack).toHaveLength(5);

    // 相生边：内环内部，木生火、火生土、土生金、金生水、水生木。
    expect(generation.map((line) => [line.from, line.to])).toEqual([
      [WuXing.WOOD, WuXing.FIRE],
      [WuXing.FIRE, WuXing.EARTH],
      [WuXing.EARTH, WuXing.METAL],
      [WuXing.METAL, WuXing.WATER],
      [WuXing.WATER, WuXing.WOOD],
    ]);
    // 径向线：内环五行指向同射线上的外环五行（内克外）。
    expect(attack.map((line) => [line.from, line.to])).toEqual(
      OVERCOMING_RAY_PAIRS.map((pair) => [...pair]),
    );

    for (const line of generation) {
      const source = sealOf(view, 'P1', line.from);
      const target = sealOf(view, 'P1', line.to);
      expect([line.x1, line.y1, line.x2, line.y2]).toEqual([
        source.x,
        source.y,
        target.x,
        target.y,
      ]);
    }
    for (const line of attack) {
      const source = sealOf(view, 'P1', line.from);
      const target = sealOf(view, 'P2', line.to);
      expect([line.x1, line.y1, line.x2, line.y2]).toEqual([
        source.x,
        source.y,
        target.x,
        target.y,
      ]);
      // 径向：内外端点与盘心共线（叉积为零），即整条线落在同一条射线上。
      expect(Math.abs(line.x1 * line.y2 - line.y1 * line.x2)).toBeLessThan(1e-6);
    }

    // 除相生边外，内环内部没有别的连线：所有非相生边的终点都在外环。
    for (const line of view.connections) {
      const isInnerTarget = RING_ORDER.some(
        (element) =>
          Math.abs(line.x2 - INNER_EXPECTED[element].x) < 1e-6 &&
          Math.abs(line.y2 - INNER_EXPECTED[element].y) < 1e-6,
      );
      expect(isInnerTarget).toBe(line.kind === 'generation');
    }
  });

  it('连线高亮不再由盘面等级驱动：源主印全亮也不点亮任何连线', () => {
    const view = new BoardView();
    view.update(
      boardWith({ [WuXing.WOOD]: { yin: 1, yang: 1 } }),
      boardWith({ [WuXing.EARTH]: { yin: 1, yang: 1 } }),
    );

    expect(view.connections.every((line) => !line.isActive)).toBe(true);
  });

  it('setActivePaths 只点亮给定的 (kind, from)，其余九条静默', () => {
    const view = new BoardView();

    view.setActivePaths([
      { kind: 'generation', from: WuXing.WOOD },
      { kind: 'attack', from: WuXing.WATER },
    ]);

    expect(
      view.connections
        .filter((line) => line.isActive)
        .map((line) => [line.kind, line.from, line.to]),
    ).toEqual([
      ['generation', WuXing.WOOD, WuXing.FIRE],
      ['attack', WuXing.WATER, WuXing.FIRE],
    ]);
  });

  it('setActivePaths([]) 清空高亮；换盘面快照不清除已设置的高亮', () => {
    const view = new BoardView();
    view.setActivePaths([{ kind: 'attack', from: WuXing.WOOD }]);
    expect(view.connections.filter((line) => line.isActive)).toHaveLength(1);

    // 高亮由动作驱动、与盘面等级解耦：投影新快照只换数据，不换高亮。
    view.update(boardWith(), boardWith());
    expect(view.connections.filter((line) => line.isActive)).toHaveLength(1);

    view.setActivePaths([]);
    expect(view.connections.every((line) => !line.isActive)).toBe(true);
  });
});

describe('Minigame BoardView: 动作到连线路径的映射（票 02）', () => {
  it('化 / 强化走相生边，破 / 强破走径向线，其余动作不指向任何连线', () => {
    // 映射表来自票面契约：路径类型由动作决定，起点是当前天干的五行。
    expect(resolveActionPath(ActionType.TRANS, WuXing.WOOD)).toEqual({
      kind: 'generation',
      from: WuXing.WOOD,
    });
    expect(resolveActionPath(ActionType.BURST, WuXing.FIRE)).toEqual({
      kind: 'generation',
      from: WuXing.FIRE,
    });
    expect(resolveActionPath(ActionType.ATK, WuXing.EARTH)).toEqual({
      kind: 'attack',
      from: WuXing.EARTH,
    });
    expect(resolveActionPath(ActionType.BURST_ATK, WuXing.WATER)).toEqual({
      kind: 'attack',
      from: WuXing.WATER,
    });

    for (const actionType of [
      ActionType.AUTO,
      ActionType.CONVERT,
      ActionType.DISSIPATE,
      ActionType.PASS,
    ]) {
      expect(resolveActionPath(actionType, WuXing.WOOD)).toBeNull();
    }
  });
});

describe('Minigame BoardView: 归一分层与进度读数', () => {
  it('归一/亢极高亮按环半径分层，读数统计各环归一个数', () => {
    const view = new BoardView();
    view.update(
      boardWith({
        [WuXing.WOOD]: { yin: 1, yang: 1 },
        [WuXing.FIRE]: { yin: 1, yang: 1 },
        [WuXing.EARTH]: { yin: 1, yang: 1 },
      }),
      boardWith({ [WuXing.METAL]: { yin: 2, yang: 2 } }),
    );

    const ownGuiYi = sealOf(view, 'P1', WuXing.WOOD);
    const opponentKangJi = sealOf(view, 'P2', WuXing.METAL);
    expect(ownGuiYi.isGuiYi).toBe(true);
    expect(Math.hypot(ownGuiYi.x, ownGuiYi.y)).toBeCloseTo(INNER_RADIUS, 5);
    expect(opponentKangJi.isKangJi).toBe(true);
    expect(Math.hypot(opponentKangJi.x, opponentKangJi.y)).toBeCloseTo(OUTER_RADIUS, 5);

    const ctx = new RecordingContext();
    view.render(ctx.asContext());
    expect(ctx.texts.map((entry) => entry.text)).toContain('你 3/5');
    expect(ctx.texts.map((entry) => entry.text)).toContain('天道 1/5');
    // 环级归属徽记：己方盘与对方盘各一个（不是主印上的五行名）。
    expect(ctx.texts.map((entry) => entry.text)).toContain('你');
    expect(ctx.texts.map((entry) => entry.text)).toContain('天道');
  });
});

describe('Minigame BoardView: 归一金环流光与亢极元素外溢（票 02）', () => {
  /** 六种阴阳配对：只有两侧均 ≥1 才有金环，只有 (2, 2) 才外溢。 */
  const PAIRS: readonly (readonly [NodeLevel, NodeLevel, 0 | 1 | 2])[] = [
    [0, 0, 0],
    [2, 0, 0],
    [1, 1, 1],
    [2, 1, 1],
    [1, 2, 1],
    [2, 2, 2],
  ];
  const GOLD = GUIYI_RING_INK;
  const SEAL = 20;

  function rgbOf(hex: string): string {
    const value = Number.parseInt(hex.slice(1), 16);
    return `${String((value >> 16) & 0xff)}, ${String((value >> 8) & 0xff)}, ${String(value & 0xff)}`;
  }

  /** 直接画一个节点的标记层（不含鱼身），隔离出它自己的落笔。 */
  function mark(layers: 0 | 1 | 2, element: WuXing, time: number) {
    const ctx = new RecordingContext();
    drawNodeMark(ctx.asContext(), 0, 0, SEAL, element, layers, time);
    return ctx;
  }

  /** 主印外那一圈金环的弧（鱼身外弧半径恒等于主印半径，故以 `> 主印半径` 筛出）。 */
  function ringArcs(ctx: RecordingContext) {
    return ctx.arcs.filter((arc) => arc.radius > SEAL && arc.radius < SEAL * 1.3);
  }

  it('标记层数由节点级归一 / 亢极决定：0 层不画、1 层金环、2 层金环 + 元素色外溢', () => {
    expect(mark(0, WuXing.WOOD, 0).paths).toHaveLength(0);

    // 归一 = 一圈金环 + 沿环流动的金色高光；没有元素色外溢。
    const guiYi = mark(1, WuXing.WOOD, 0);
    expect(ringArcs(guiYi).length).toBeGreaterThan(0);
    expect(guiYi.paths.some((path) => path.color === GOLD.main && path.strokeWidth > 0)).toBe(true);
    expect(guiYi.gradients).toHaveLength(0);

    // 亢极 = 金环之外再叠元素色柔光 + 一圈涟漪。
    const kangJi = mark(2, WuXing.WOOD, 0);
    expect(ringArcs(kangJi).length).toBeGreaterThan(0);
    expect(kangJi.paths.some((path) => path.color === GOLD.main && path.strokeWidth > 0)).toBe(
      true,
    );
    const palette = WUXING_PALETTE[WuXing.WOOD];
    expect(kangJi.gradients.length).toBeGreaterThan(0);
    expect(
      kangJi.gradients.some((gradient) =>
        gradient.stops.some(
          (stop) =>
            stop.color.includes(rgbOf(palette.light)) || stop.color.includes(rgbOf(palette.main)),
        ),
      ),
    ).toBe(true);
  });

  it('金环高光随时间沿环流动', () => {
    // 高光是一串小弧，金环本身是一整圈（start 0 → end 2π）。
    const flow = (ctx: RecordingContext) =>
      ringArcs(ctx).filter((arc) => !(arc.start === 0 && arc.end === Math.PI * 2));
    const at0 = flow(mark(1, WuXing.WOOD, 0));
    const at2 = flow(mark(1, WuXing.WOOD, 2));
    expect(at0.length).toBeGreaterThan(0);
    expect(at2.length).toBe(at0.length);
    // 头部小弧的终点随钟移到另一个方位。
    expect(at2[0].end).not.toBeCloseTo(at0[0].end, 6);
  });

  it('盘面渲染：归一节点有金环无外溢、亢极节点有金环有元素外溢、虚空节点不画', () => {
    const view = new BoardView();
    view.update(
      boardWith({ [WuXing.WOOD]: { yin: 1, yang: 1 }, [WuXing.FIRE]: { yin: 2, yang: 2 } }),
      boardWith(),
    );
    const ctx = new RecordingContext();
    view.render(ctx.asContext());

    const ringsAt = (seal: { x: number; y: number; sealSize: number }) =>
      ctx.arcs.filter((arc) => arc.x === seal.x && arc.y === seal.y && arc.radius > seal.sealSize);
    const aurasAt = (seal: { x: number; y: number }) =>
      ctx.gradients.filter((gradient) => gradient.x1 === seal.x && gradient.y1 === seal.y);

    // 归一木：金环在、无外溢。
    const wood = sealOf(view, 'P1', WuXing.WOOD);
    expect(ringsAt(wood).length).toBeGreaterThan(0);
    expect(aurasAt(wood)).toHaveLength(0);

    // 亢极火：金环在，另有元素色外溢渐变。
    const fire = sealOf(view, 'P1', WuXing.FIRE);
    expect(ringsAt(fire).length).toBeGreaterThan(0);
    const firePalette = WUXING_PALETTE[WuXing.FIRE];
    expect(
      aurasAt(fire).some((gradient) =>
        gradient.stops.some((stop) => stop.color.includes(rgbOf(firePalette.light))),
      ),
    ).toBe(true);

    // 虚空土：金环与外溢都没有。
    const earth = sealOf(view, 'P1', WuXing.EARTH);
    expect(ringsAt(earth)).toHaveLength(0);
    expect(aurasAt(earth)).toHaveLength(0);
  });

  it('六种配对在内外两盘得到相同的标记层数（一视同仁）', () => {
    for (const [yin, yang, layers] of PAIRS) {
      const node = { yin, yang };
      const view = new BoardView();
      view.update(boardWith({ [WuXing.WOOD]: node }), boardWith({ [WuXing.WOOD]: node }));
      for (const player of ['P1', 'P2'] as const) {
        const seal = sealOf(view, player, WuXing.WOOD);
        const ctx = new RecordingContext();
        drawNodeMark(ctx.asContext(), seal.x, seal.y, seal.sealSize, seal.element, layers, 0);
        const hasRing = ctx.arcs.some(
          (arc) => arc.x === seal.x && arc.y === seal.y && arc.radius > seal.sealSize,
        );
        expect(hasRing, `${player} 在 (${String(yin)},${String(yang)}) 有金环`).toBe(layers > 0);
        expect(
          ctx.gradients.length > 0,
          `${player} 在 (${String(yin)},${String(yang)}) 的外溢层数`,
        ).toBe(layers === 2);
      }
    }
  });

  it('亢极外溢整个周期都不越出法盘底晕（内外两盘、三尺寸）', () => {
    const allKangJi = boardWith(
      Object.fromEntries(Object.values(WuXing).map((element) => [element, { yin: 2, yang: 2 }])),
    );
    // 涟漪周期 7.5s；扫一个完整周期，不只采 `_clock = 0` 那个最内圈的瞬间。
    const TIMES = Array.from({ length: 11 }, (_, index) => index * 0.75);
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [460, 900],
    ] as const) {
      for (const time of TIMES) {
        const view = new BoardView();
        view.resize(width, height);
        view.update(allKangJi, allKangJi);
        view.tick(time);
        const ctx = new RecordingContext();
        view.render(ctx.asContext());
        const haloRadius = view.layout.outerRadius + view.layout.sealSize * NODE_AURA_OUTSET_RATIO;
        const where = `${String(width)}x${String(height)} @${time.toFixed(2)}s`;
        for (const seal of view.elements) {
          const fromCenter = Math.hypot(seal.x - view.layout.centerX, seal.y - view.layout.centerY);
          for (const gradient of ctx.gradients) {
            if (gradient.x1 !== seal.x || gradient.y1 !== seal.y) continue;
            expect(
              fromCenter + gradient.r1,
              `${where} ${seal.player}${seal.element}`,
            ).toBeLessThanOrEqual(haloRadius + 1e-9);
          }
          for (const arc of ctx.arcs) {
            if (arc.x !== seal.x || arc.y !== seal.y) continue;
            expect(
              fromCenter + arc.radius,
              `${where} ${seal.player}${seal.element} 金环`,
            ).toBeLessThanOrEqual(haloRadius + 1e-9);
          }
        }
      }
    }
  });
});

describe('Minigame BoardView: 候选落点半身标记与同相位慢呼吸（票 03）', () => {
  /**
   * 半身标记的识别口径：鱼身外弧（半径 = 主印半径、圆心 = 主印中心）。
   * 每个半身本体各一条（阴 anticlockwise、阳顺时针），被标记的那个半身会**多出同样一条上加色描边**，
   * 因此「该侧两条 / 对侧一条」即「这一侧的鱼在闪」——不看颜色、不手抄半径。
   */
  function halfOuterArcs(
    ctx: RecordingContext,
    view: BoardView,
    player: 'P1' | 'P2',
    element: WuXing,
  ) {
    const seal = view.elements.find(
      (entry) => entry.player === player && entry.element === element,
    );
    if (seal === undefined) throw new Error(`找不到 ${player} 的 ${element} 主印`);
    return ctx.arcs.filter(
      (arc) => arc.x === seal.x && arc.y === seal.y && arc.radius === seal.sealSize,
    );
  }

  /** 被标记的半身：外弧比本体多一条的那一侧；两侧一样多时返回 null。 */
  function markedSide(
    ctx: RecordingContext,
    view: BoardView,
    player: 'P1' | 'P2',
    element: WuXing,
  ): Polarity | null {
    const arcs = halfOuterArcs(ctx, view, player, element);
    const yin = arcs.filter((arc) => arc.anticlockwise).length;
    const yang = arcs.length - yin;
    if (yin === yang) return null;
    return yin > yang ? Polarity.YIN : Polarity.YANG;
  }

  /** 标记层的落笔（加色描边的那些）：透明度的呼吸轨迹从它们的弧里读。 */
  function markAlphas(
    ctx: RecordingContext,
    view: BoardView,
    player: 'P1' | 'P2',
    element: WuXing,
  ): number[] {
    return halfOuterArcs(ctx, view, player, element)
      .filter((arc) => arc.alpha < 1)
      .map((arc) => arc.alpha);
  }

  /** 画当前的候选标记，返回落笔记录。 */
  /** 画当前的候选标记，返回落笔记录。 */
  function render(view: BoardView): RecordingContext {
    const ctx = new RecordingContext();
    view.render(ctx.asContext());
    return ctx;
  }

  /** `#rrggbb` → `r, g, b`，用来在记录里按元素色找落笔。 */
  function rgbOf(hex: string): string {
    const value = Number.parseInt(hex.slice(1), 16);
    return `${String((value >> 16) & 0xff)}, ${String((value >> 8) & 0xff)}, ${String(value & 0xff)}`;
  }

  it('阴 / 阳鱼本身在闪：标记落在会变的那半身，不从抽中天干的极性推导', () => {
    // 同一根阳木天干（甲木）：抽中侧是阳，但三个候选各自落在自己要变的那一侧。
    const view = new BoardView();
    view.setCandidates([
      { player: 'P1', element: WuXing.WOOD, polarity: Polarity.YANG }, // 吸纳：源节点阳侧
      { player: 'P1', element: WuXing.FIRE, polarity: Polarity.YIN }, // 化：相生目标阴侧
      { player: 'P2', element: WuXing.EARTH, polarity: Polarity.YIN }, // 破：对方相克目标阴侧
    ]);
    const ctx = render(view);

    for (const [player, element, polarity] of [
      ['P1', WuXing.WOOD, Polarity.YANG],
      ['P1', WuXing.FIRE, Polarity.YIN],
      ['P2', WuXing.EARTH, Polarity.YIN],
    ] as const) {
      expect(markedSide(ctx, view, player, element), `${player} ${element} 闪的半身`).toBe(
        polarity,
      );
    }
    // 没被候选点到的节点两侧一样亮（没有多出来的标记层）。
    for (const [player, element] of [
      ['P1', WuXing.METAL],
      ['P2', WuXing.FIRE],
    ] as const) {
      expect(markedSide(ctx, view, player, element), `${player} ${element} 不该有标记`).toBeNull();
    }

    // 标记色是专属强调色，不取五行色（否则亮底上与「加持」混淆）：
    // 三个不同五行的候选（木 / 火 / 土）都用同一个强调色，各一段亮边。
    const markRgb = rgbOf(THEME.candidateLit);
    const markStrokes = ctx.paths.filter(
      (path) => path.strokeWidth > 0 && path.color.includes(markRgb),
    );
    expect(markStrokes, '每个候选一段强调色亮边，与五行无关').toHaveLength(3);
    // 五行色不参与标记：没有哪个候选的半身是用元素色描边的（本轮之前正是那样）。
    for (const element of [WuXing.WOOD, WuXing.FIRE, WuXing.EARTH]) {
      const elementRgb = rgbOf(WUXING_PALETTE[element].light);
      expect(
        ctx.paths.filter((path) => path.strokeWidth > 0 && path.color.includes(elementRgb)),
        `${element} 的元素色不该出现在标记里`,
      ).toHaveLength(0);
    }
  });

  it('同一节点两侧各被一个候选点到时是两个半身；同侧重复候选不叠第二层', () => {
    const view = new BoardView();
    view.setCandidates([
      { player: 'P1', element: WuXing.WOOD, polarity: Polarity.YIN },
      { player: 'P1', element: WuXing.WOOD, polarity: Polarity.YIN },
    ]);

    expect(view.candidates).toHaveLength(1);
    const single = render(view);
    expect(markedSide(single, view, 'P1', WuXing.WOOD)).toBe(Polarity.YIN);
    // 同侧只叠一层：该侧外弧恰好比本体多一条。
    expect(
      halfOuterArcs(single, view, 'P1', WuXing.WOOD).filter((arc) => arc.anticlockwise),
    ).toHaveLength(2);

    view.setCandidates([
      { player: 'P1', element: WuXing.WOOD, polarity: Polarity.YIN },
      { player: 'P1', element: WuXing.WOOD, polarity: Polarity.YANG },
    ]);
    expect(view.candidates).toHaveLength(2);
    const both = render(view);
    // 两侧都被标记时 `markedSide` 判不出单侧（两侧一样多），用计数直接断。
    expect(halfOuterArcs(both, view, 'P1', WuXing.WOOD)).toHaveLength(4);
  });

  it('setCandidates([]) 清空标记；标记与盘面快照、连线高亮互不影响', () => {
    const view = new BoardView();
    view.setCandidates([{ player: 'P1', element: WuXing.WOOD, polarity: Polarity.YANG }]);
    expect(markedSide(render(view), view, 'P1', WuXing.WOOD)).toBe(Polarity.YANG);

    // 换盘面快照只换数据，不动候选（投影与候选解耦，与连线高亮同一约定）。
    view.update(boardWith(), boardWith());
    expect(markedSide(render(view), view, 'P1', WuXing.WOOD)).toBe(Polarity.YANG);

    view.setCandidates([]);
    expect(markedSide(render(view), view, 'P1', WuXing.WOOD)).toBeNull();
  });

  it('同相位慢呼吸：所有候选标记共用一条透明度曲线，相位 0 / 0.5 分别是低位与满值', () => {
    const view = new BoardView();
    view.setCandidates([
      { player: 'P1', element: WuXing.WOOD, polarity: Polarity.YANG },
      { player: 'P2', element: WuXing.EARTH, polarity: Polarity.YIN },
    ]);

    view.tick(0);
    expect(view.breathPhase).toBe(0);
    const low = [
      ...markAlphas(render(view), view, 'P1', WuXing.WOOD),
      ...markAlphas(render(view), view, 'P2', WuXing.EARTH),
    ];
    // 决策期全程可见：低位不是 0，玩家仍知道「这里能打」；两处此刻透明度相同（同相位）。
    expect(low.length).toBeGreaterThan(0);
    for (const alpha of low) {
      expect(alpha).toBeCloseTo(candidateBreathAlpha(0), 9);
      expect(alpha).toBeGreaterThan(0.5);
    }
    expect(new Set(low.map((alpha) => alpha.toFixed(9))).size).toBe(1);

    // 半周期后到满值：同一个相位、同一个透明度（不是逐节点各走各的）。
    view.tick(CANDIDATE_BREATH_PERIOD / 2);
    expect(view.breathPhase).toBeCloseTo(0.5, 9);
    for (const alpha of [
      ...markAlphas(render(view), view, 'P1', WuXing.WOOD),
      ...markAlphas(render(view), view, 'P2', WuXing.EARTH),
    ]) {
      expect(alpha).toBeCloseTo(candidateBreathAlpha(0.5), 9);
      expect(alpha).toBeGreaterThan(low[0]);
    }

    // 一整圈回到起点；相位按周期取模，不会无限增大。
    view.tick(CANDIDATE_BREATH_PERIOD / 2);
    expect(view.breathPhase).toBeCloseTo(0, 9);
  });

  it('候选标记不越出法盘底晕（三尺寸）', () => {
    // 全亢极盘 + 决策期候选：金环、外溢与候选标记同时在场，取最坏情况。
    const allKangJi = boardWith(
      Object.fromEntries(Object.values(WuXing).map((element) => [element, { yin: 2, yang: 2 }])),
    );
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [460, 900],
    ] as const) {
      const view = new BoardView();
      view.resize(width, height);
      view.update(allKangJi, allKangJi);
      for (const polarity of [Polarity.YIN, Polarity.YANG]) {
        view.setCandidates([{ player: 'P2', element: WuXing.WOOD, polarity }]);
        const ctx = render(view);
        expect(markedSide(ctx, view, 'P2', WuXing.WOOD), `${String(width)}x${String(height)}`).toBe(
          polarity,
        );
        // 标记只画在鱼身轮廓上（半径 = 主印半径），故不可能越出以主印外沿为口径的底晕。
        const haloRadius = view.layout.outerRadius + view.layout.sealSize * NODE_AURA_OUTSET_RATIO;
        for (const arc of halfOuterArcs(ctx, view, 'P2', WuXing.WOOD)) {
          const seal = sealOf(view, 'P2', WuXing.WOOD);
          const fromCenter = Math.hypot(seal.x - view.layout.centerX, seal.y - view.layout.centerY);
          expect(
            fromCenter + arc.radius,
            `${String(width)}x${String(height)} 候选标记越出底晕`,
          ).toBeLessThanOrEqual(haloRadius + 1e-9);
        }
      }
    }
  });
});

describe('Minigame BoardView: 按住预览的路径箭头与幽灵态（票 04）', () => {
  /** 幽灵态的压暗层：颜色就是 `THEME.ink`，盘面其他地方不用这个颜色。 */
  function scrimFills(ctx: RecordingContext) {
    return ctx.paths.filter((path) => path.color === THEME.ink && path.strokeWidth === 0);
  }

  /** `#rrggbb` → `r, g, b`，用来按颜色在落笔记录里找回箭头。 */
  function rgbOf(hex: string): string {
    const value = Number.parseInt(hex.slice(1), 16);
    return `${String((value >> 16) & 0xff)}, ${String((value >> 8) & 0xff)}, ${String(value & 0xff)}`;
  }

  function render(view: BoardView): RecordingContext {
    const ctx = new RecordingContext();
    view.render(ctx.asContext());
    return ctx;
  }

  it('按住时连线高亮收窄到这一下的路径，松开恢复决策期的全部候选', () => {
    const view = new BoardView();
    view.update(boardWith(), boardWith());
    view.setActivePaths([
      { kind: 'generation', from: WuXing.WOOD },
      { kind: 'attack', from: WuXing.WOOD },
    ]);
    const active = () =>
      view.connections.filter((line) => line.isActive).map((line) => `${line.kind}:${line.from}`);

    expect(active()).toEqual(['generation:WOOD', 'attack:WOOD']);

    view.setPreview({ path: { kind: 'attack', from: WuXing.WOOD }, ghost: null });
    expect(active()).toEqual(['attack:WOOD']);

    view.setPreview(null);
    expect(active()).toEqual(['generation:WOOD', 'attack:WOOD']);
  });

  it('化 / 强化走内环顺时针弧箭：两环之间一段弧 + 箭尖', () => {
    const view = new BoardView();
    view.setPreview({ path: { kind: 'generation', from: WuXing.WOOD }, ghost: null });
    const ctx = render(view);
    const { centerX, centerY, innerRadius, outerRadius } = view.layout;

    // 弧心是盘心、半径落在两环之间（环带本身在半径等于内外环处，不在区间内）。
    const arc = ctx.arcs.find(
      (entry) =>
        entry.x === centerX &&
        entry.y === centerY &&
        entry.radius > innerRadius &&
        entry.radius < outerRadius,
    );
    expect(arc, '内环相生弧箭').toBeDefined();
    // 沿环顺时针（角度递增）从木扫到相生火，两端各给主印留一段缩进。
    const woodAngle = sealOf(view, 'P1', WuXing.WOOD).angle;
    const fireAngle = sealOf(view, 'P1', WuXing.FIRE).angle;
    expect(arc!.end).toBeGreaterThan(arc!.start);
    expect(arc!.start).toBeGreaterThan(woodAngle);
    expect(arc!.end).toBeLessThan(fireAngle);
    // 箭尖：三段折点（两撇）的强调色落笔。
    const arrowHead = rgbOf(THEME.candidateLit);
    expect(
      ctx.paths.filter((path) => path.strokeWidth > 0 && path.color.includes(arrowHead)),
      '弧线 + 两撇箭尖',
    ).toHaveLength(2);
  });

  it('破 / 强破走径向箭：从己方主印外沿直插，箭尖从敌节点外侧探出', () => {
    const view = new BoardView();
    view.setPreview({ path: { kind: 'attack', from: WuXing.WOOD }, ghost: null });
    const ctx = render(view);
    const arrowHead = rgbOf(THEME.candidateLit);

    const line = ctx.paths.find(
      (path) => path.strokeWidth > 0 && path.color.includes(arrowHead) && path.points.length === 2,
    );
    expect(line, '跨环径向线').toBeDefined();
    const { centerX, centerY, innerRadius, outerRadius, sealSize } = view.layout;
    const fromCenter = line!.points.map((point) =>
      Math.hypot(point.x - centerX, point.y - centerY),
    );
    // 尾部在己方主印外沿之外（不压自己的鱼）。
    expect(fromCenter[0]).toBeGreaterThan(innerRadius + sealSize);
    expect(fromCenter[0]).toBeLessThan(innerRadius + sealSize * 1.5);
    // 箭尖越过敌主印外沿（贯穿，而不是缩在两印之间）。
    expect(fromCenter[1]).toBeGreaterThan(outerRadius + sealSize * 0.82);
    // 没有内环弧箭：这条路径是径向而不是相生弧。
    expect(
      ctx.arcs.filter(
        (entry) =>
          entry.x === centerX &&
          entry.y === centerY &&
          entry.radius > innerRadius &&
          entry.radius < outerRadius,
      ),
    ).toHaveLength(0);
  });

  it('调息在源节点内画换侧箭：从当前点亮侧指向对侧，阴左阳右', () => {
    const view = new BoardView();
    const arrowHead = rgbOf(THEME.candidateLit);
    const arrowLines = (ctx: RecordingContext) =>
      ctx.paths.filter(
        (path) =>
          path.strokeWidth > 0 && path.color.includes(arrowHead) && path.points.length === 2,
      );
    const seal = sealOf(view, 'P1', WuXing.WOOD);

    // 阴 -> 阳：箭尖在右半边。
    view.setPreview({
      path: null,
      convert: { player: 'P1', element: WuXing.WOOD, from: Polarity.YIN, to: Polarity.YANG },
      ghost: null,
    });
    const right = arrowLines(render(view))[0];
    expect(right).toBeDefined();
    expect(right.points[0].x).toBeLessThan(seal.x);
    expect(right.points[1].x).toBeGreaterThan(seal.x);

    // 阳 -> 阴：方向反过来。
    view.setPreview({
      path: null,
      convert: { player: 'P1', element: WuXing.WOOD, from: Polarity.YANG, to: Polarity.YIN },
      ghost: null,
    });
    const left = arrowLines(render(view))[0];
    expect(left.points[0].x).toBeGreaterThan(seal.x);
    expect(left.points[1].x).toBeLessThan(seal.x);

    // 没有调息换侧就不画。
    view.setPreview({ path: null, ghost: null });
    expect(arrowLines(render(view))).toHaveLength(0);
  });

  it('未按住时不画任何路径箭头：决策期只靠候选半身标记', () => {
    const view = new BoardView();
    view.setActivePaths([
      { kind: 'generation', from: WuXing.WOOD },
      { kind: 'attack', from: WuXing.WOOD },
    ]);
    const arrowHead = rgbOf(THEME.candidateLit);
    const ctx = render(view);

    expect(ctx.paths.filter((path) => path.color.includes(arrowHead))).toHaveLength(0);
  });

  it('幽灵态只画真的会变的那几侧：未变的半身不压暗', () => {
    const view = new BoardView();
    view.update(boardWith(), boardWith());

    // 火 (0,0) -> 阴侧升到点亮：只有阴半身被压暗。
    view.setPreview({
      path: null,
      ghost: { player: 'P1', element: WuXing.FIRE, yin: 1, yang: 0 },
    });
    expect(scrimFills(render(view))).toHaveLength(1);

    // 阳侧也变：两个半身都进幽灵态。
    view.setPreview({
      path: null,
      ghost: { player: 'P1', element: WuXing.FIRE, yin: 1, yang: 1 },
    });
    expect(scrimFills(render(view))).toHaveLength(2);

    // 结算前后完全相同：不画（净零变化不伪造预览）。
    view.setPreview({
      path: null,
      ghost: { player: 'P1', element: WuXing.FIRE, yin: 0, yang: 0 },
    });
    expect(scrimFills(render(view))).toHaveLength(0);
  });

  it('预览期候选呼吸加快，松开后恢复原速，共用同一个时钟', () => {
    const baseline = new BoardView();
    baseline.tick(CANDIDATE_BREATH_PERIOD / 4);
    expect(baseline.breathPhase).toBeCloseTo(0.25, 9);

    const view = new BoardView();
    view.setPreview({ path: null, ghost: null });
    view.tick(CANDIDATE_BREATH_PERIOD / 4);
    expect(view.breathPhase).toBeCloseTo(0.25 * PREVIEW_BREATH_SPEED, 9);

    // 松开后从当前相位继续，按原速推进。
    view.setPreview(null);
    const phase = view.breathPhase;
    view.tick(CANDIDATE_BREATH_PERIOD / 4);
    expect(view.breathPhase).toBeCloseTo((phase + 0.25) % 1, 9);
  });

  it('setPreview(null) 清空箭头与幽灵态，不影响候选标记与盘面投影', () => {
    const view = new BoardView();
    view.update(boardWith(), boardWith());
    view.setCandidates([{ player: 'P1', element: WuXing.WOOD, polarity: Polarity.YANG }]);
    view.setPreview({
      path: { kind: 'attack', from: WuXing.WOOD },
      ghost: { player: 'P2', element: WuXing.EARTH, yin: -1, yang: 0 },
    });
    expect(view.preview).not.toBeNull();
    expect(scrimFills(render(view)).length).toBeGreaterThan(0);

    view.setPreview(null);
    expect(view.preview).toBeNull();
    expect(scrimFills(render(view))).toHaveLength(0);
    // 候选标记是另一条通道，不受预览清除影响。
    expect(view.candidates).toHaveLength(1);
  });

  it('幽灵态的压暗不越出主印自身轮廓（三尺寸）', () => {
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [460, 900],
    ] as const) {
      const view = new BoardView();
      view.resize(width, height);
      view.update(boardWith(), boardWith());
      view.setPreview({
        path: null,
        ghost: { player: 'P2', element: WuXing.WOOD, yin: 2, yang: 2 },
      });
      const ctx = render(view);
      const seal = sealOf(view, 'P2', WuXing.WOOD);
      // 压暗层裁在半径 = 主印半径的鱼形里：落笔点到主印中心的距离不超过主印半径。
      for (const path of scrimFills(ctx)) {
        for (const point of path.points) {
          expect(
            Math.hypot(point.x - seal.x, point.y - seal.y),
            `${String(width)}x${String(height)} 幽灵态越出主印`,
          ).toBeLessThanOrEqual(seal.sealSize + 1e-9);
        }
      }
    }
  });
});

describe('Minigame BoardView: 自适应视口布局', () => {
  it('构造时可覆盖圆心与内外环半径', () => {
    const view = new BoardView({ centerX: 100, centerY: 50, innerRadius: 60, outerRadius: 110 });

    // 木在 -90°：内环 x = 100 + 60*cos(-90°) = 100，y = 50 - 60 = -10。
    expect(sealOf(view, 'P1', WuXing.WOOD).x).toBeCloseTo(100, 5);
    expect(sealOf(view, 'P1', WuXing.WOOD).y).toBeCloseTo(-10, 5);
    expect(sealOf(view, 'P2', WuXing.EARTH).x).toBeCloseTo(100, 5);
    expect(sealOf(view, 'P2', WuXing.EARTH).y).toBeCloseTo(-60, 5);
    expect(view.layout.innerRadius).toBe(60);
    expect(view.layout.outerRadius).toBe(110);
  });

  it('resize 后法盘居中、双环按短边缩放，主印半径达到可读性下限且不溢出', () => {
    const view = new BoardView();
    view.resize(375, 667);

    expect(view.layout.centerX).toBe(187.5);
    expect(view.layout.centerY).toBe(333.5);
    expect(view.layout.innerRadius).toBeCloseTo(90, 5);
    expect(view.layout.outerRadius).toBeCloseTo(150, 5);
    // spec 可读性下限：375px 宽下主印半径 ≥ ~22px；外环加主印不得溢出半宽。
    expect(view.layout.sealSize).toBeGreaterThanOrEqual(22);
    expect(view.layout.outerRadius + view.layout.sealSize).toBeLessThan(375 / 2);

    for (const point of [...view.elements, ...view.slots]) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(375);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(667);
    }
    // 内外环绕视口中心对称：各自相对圆心的位移和为零。
    for (const player of ['P1', 'P2'] as const) {
      const ring = view.elements.filter((entry) => entry.player === player);
      const sumX = ring.reduce((acc, entry) => acc + (entry.x - 187.5), 0);
      const sumY = ring.reduce((acc, entry) => acc + (entry.y - 333.5), 0);
      expect(sumX).toBeCloseTo(0, 6);
      expect(sumY).toBeCloseTo(0, 6);
    }
  });

  it('窄视口按短边缩放，法盘不溢出', () => {
    const view = new BoardView();
    view.resize(300, 900);

    expect(view.layout.centerX).toBe(150);
    expect(view.layout.centerY).toBe(450);
    expect(view.layout.outerRadius + view.layout.sealSize).toBeLessThan(150);
    for (const point of [...view.elements, ...view.slots]) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(300);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(900);
    }
  });
});

describe('Minigame BoardView: 只读快照投影', () => {
  it('投影深冻结的双盘快照不会写入（严格模式下写入会抛错）', () => {
    const own = boardWith({ [WuXing.WOOD]: { yin: 2, yang: 1 } });
    const opponent = boardWith({ [WuXing.EARTH]: { yin: 0, yang: 1 } });
    for (const board of [own, opponent]) {
      for (const node of Object.values(board)) {
        Object.freeze(node);
      }
      Object.freeze(board);
    }
    const view = new BoardView();

    expect(() => view.update(own, opponent)).not.toThrow();

    expect(view.getSlot('P1', WuXing.WOOD, Polarity.YIN).level).toBe(2);
    expect(view.getSlot('P1', WuXing.WOOD, Polarity.YANG).level).toBe(1);
    expect(view.getSlot('P2', WuXing.EARTH, Polarity.YANG).level).toBe(1);
  });
});

describe('Minigame BoardView: 环带与归元图例版面', () => {
  /** 全归一 / 全亢极的盘面：半环与归一外环都画到最大，读数的避让按最坏情况算。 */
  const fullGuiYi = boardWith({
    [WuXing.WOOD]: { yin: 1, yang: 1 },
    [WuXing.FIRE]: { yin: 1, yang: 1 },
    [WuXing.EARTH]: { yin: 1, yang: 1 },
    [WuXing.METAL]: { yin: 1, yang: 1 },
    [WuXing.WATER]: { yin: 1, yang: 1 },
  });
  const fullKangJi = boardWith({
    [WuXing.WOOD]: { yin: 2, yang: 2 },
    [WuXing.FIRE]: { yin: 2, yang: 2 },
    [WuXing.EARTH]: { yin: 2, yang: 2 },
    [WuXing.METAL]: { yin: 2, yang: 2 },
    [WuXing.WATER]: { yin: 2, yang: 2 },
  });

  /** 常见竖屏视口（含 spec 点名的 375 与更宽的 390 / 414）。 */
  const VIEWPORTS: readonly (readonly [number, number])[] = [
    [375, 667],
    [375, 812],
    [390, 844],
    [414, 896],
    [300, 900],
  ];

  /** 盘下方归元图例的两个文字锚点（「你 x/5」「天道 y/5」）。 */
  function legendTexts(view: BoardView): { x: number; y: number; texts: string[] } {
    const ctx = new RecordingContext();
    view.render(ctx.asContext());
    const own = ctx.texts.find((entry) => /^你 \d\/5$/.test(entry.text));
    const opponent = ctx.texts.find((entry) => /^天道 \d\/5$/.test(entry.text));
    expect(own).toBeDefined();
    expect(opponent).toBeDefined();
    return {
      x: ((own?.x ?? 0) + (opponent?.x ?? 0)) / 2,
      y: ((own?.y ?? 0) + (opponent?.y ?? 0)) / 2,
      texts: [own?.text ?? '', opponent?.text ?? ''],
    };
  }

  it('归元图例按各环归一个数分列，字号随主印半径变大', () => {
    const narrow = new BoardView();
    narrow.resize(375, 667);
    const wide = new BoardView();
    wide.resize(414, 896);
    expect(wide.layout.sealSize).toBeGreaterThan(narrow.layout.sealSize);

    narrow.update(fullGuiYi, fullKangJi);
    const narrowCtx = new RecordingContext();
    narrow.render(narrowCtx.asContext());
    expect(narrowCtx.texts.map((entry) => entry.text)).toContain('你 5/5');
    expect(narrowCtx.texts.map((entry) => entry.text)).toContain('天道 5/5');

    wide.update(fullGuiYi, fullKangJi);
    const wideCtx = new RecordingContext();
    wide.render(wideCtx.asContext());
    // 图例随视口整体缩放：宽屏的法盘更大，图例的 y（圆心 + 外环 + 主印）也更靠下。
    // （不断言像素字号：RecordingContext 只能从非 bold 的 font 串里读出数字。）
    const narrowOwn = narrowCtx.texts.find((entry) => entry.text === '你 5/5');
    const wideOwn = wideCtx.texts.find((entry) => entry.text === '你 5/5');
    expect(wideOwn?.y).toBeGreaterThan(narrowOwn?.y ?? 0);
  });

  it('归元图例排在对方盘外侧（不压任何主印）且落在视口内', () => {
    for (const [width, height] of VIEWPORTS) {
      const view = new BoardView();
      view.resize(width, height);
      view.update(fullGuiYi, fullKangJi);
      const where = `${String(width)}x${String(height)}`;
      // 十个主印都真的在盘上：下面的不相交断言不是空循环。
      expect(view.elements).toHaveLength(10);

      const legend = legendTexts(view);
      expect(legend.y, `${where} 图例在对方盘外侧`).toBeGreaterThan(
        view.layout.centerY + view.layout.outerRadius,
      );
      expect(legend.y, `${where} 图例上边界`).toBeGreaterThanOrEqual(0);
      expect(legend.y, `${where} 图例下边界`).toBeLessThanOrEqual(height);

      const clearance = view.layout.sealSize + 4;
      for (const seal of view.elements) {
        expect(
          Math.hypot(seal.x - legend.x, seal.y - legend.y),
          `${where} 的 ${seal.player} ${seal.element} 主印被图例压住`,
        ).toBeGreaterThan(clearance);
      }
    }
  });

  it('环级区分落到主印本体：己方盘主印比对方盘大', () => {
    const view = new BoardView();
    const own = sealOf(view, 'P1', WuXing.WOOD);
    const opponent = sealOf(view, 'P2', WuXing.WOOD);
    expect(own.sealSize).toBeGreaterThan(opponent.sealSize);
    expect(opponent.sealSize).toBeGreaterThan(0);
  });
});

describe('Minigame BoardView: 渲染', () => {
  it('render 画出十个五行名、环归属徽记与归元图例（未投影快照也不崩）', () => {
    const view = new BoardView();
    const empty = new RecordingContext();
    expect(() => view.render(empty.asContext())).not.toThrow();

    const texts = empty.texts.map((entry) => entry.text);
    for (const element of RING_ORDER) {
      expect(texts).toContain(WUXING_PALETTE[element].name);
    }
    // 环归属徽记（各一个）与归元图例（各一个）。
    expect(texts).toContain('你');
    expect(texts).toContain('天道');
    expect(texts).toContain('你 0/5');
    expect(texts).toContain('天道 0/5');

    // 投影后图例换文案。
    const populated = new RecordingContext();
    view.update(
      boardWith({ [WuXing.WATER]: { yin: 2, yang: 2 } }),
      boardWith({ [WuXing.WOOD]: { yin: -1, yang: 1 } }),
    );
    expect(() => view.render(populated.asContext())).not.toThrow();
    const populatedTexts = populated.texts.map((entry) => entry.text);
    expect(populatedTexts).toContain('你 1/5');
    expect(populatedTexts).toContain('天道 0/5');
  });
});

describe('Minigame BoardView: independent yin-yang fish', () => {
  /** 鱼身本体（`moveTo` 起步的闭合路径）的填充与描边，按落笔顺序：先填充后描边。 */
  function bodyPaths(ctx: RecordingContext) {
    return ctx.paths.filter((path) => path.points.length === 1);
  }

  it('uses complementary S outlines and clips cracks / sparks for all sixteen level pairs', () => {
    const levels = [-1, 0, 1, 2] as const;
    for (const yin of levels)
      for (const yang of levels) {
        const ctx = new RecordingContext();
        drawYinYangFish(ctx.asContext(), 0, 0, 20, Polarity.YIN, yin, WuXing.WOOD);
        drawYinYangFish(ctx.asContext(), 0, 0, 20, Polarity.YANG, yang, WuXing.WOOD);
        const outer = ctx.arcs.filter((arc) => arc.radius === 20);
        expect(outer.map((arc) => arc.anticlockwise)).toEqual([true, false]);
        expect(ctx.arcs.filter((arc) => arc.radius === 10)).toHaveLength(4);
        // 只有道损（裂纹）与加持（闪点）需要裁进鱼身；虚空 / 点亮不裁剪。
        expect(ctx.calls.filter((call) => call === 'clip')).toHaveLength(
          [yin, yang].filter((level) => level === -1 || level === 2).length,
        );
      }
  });

  it('encodes the four levels as a brightness ladder, all keeping an elemental outline', () => {
    const palette = WUXING_PALETTE[WuXing.WOOD];

    // 道损：暗化的元素色填充 + 暗化元素色描边 + 裂纹。
    const damaged = new RecordingContext();
    drawYinYangFish(damaged.asContext(), 0, 0, 20, Polarity.YANG, -1, WuXing.WOOD);
    expect(bodyPaths(damaged).map((path) => path.color)).toEqual([palette.dark, palette.dark]);
    expect(bodyPaths(damaged)[0].strokeWidth).toBe(0);
    expect(bodyPaths(damaged)[1].strokeWidth).toBeGreaterThan(0);
    expect(damaged.paths.some((path) => path.color === '#0b1d24' && path.strokeWidth === 2.5)).toBe(
      true,
    );

    // 虚空：空心，只有元素色淡描边；没有元素色实心填充（剩下的实心是阴阳对照眼）。
    const empty = new RecordingContext();
    drawYinYangFish(empty.asContext(), 0, 0, 20, Polarity.YANG, 0, WuXing.WOOD);
    const emptyBody = bodyPaths(empty);
    expect(emptyBody).toHaveLength(1);
    expect(emptyBody[0].strokeWidth).toBeGreaterThan(0);
    expect(emptyBody[0].color).toBe('rgba(99, 186, 140, 0.55)');
    expect(empty.paths.filter((path) => path.strokeWidth === 0).map((path) => path.color)).toEqual([
      '#e5eee4',
    ]);

    // 点亮：元素本色实心 + 本色描边。
    const lit = new RecordingContext();
    drawYinYangFish(lit.asContext(), 0, 0, 20, Polarity.YANG, 1, WuXing.WOOD);
    expect(bodyPaths(lit).map((path) => path.color)).toEqual([palette.main, palette.main]);
    expect(bodyPaths(lit)[0].strokeWidth).toBe(0);

    // 加持：径向光晕填充 + 亮色描边 + 闪点。
    const blessed = new RecordingContext();
    drawYinYangFish(blessed.asContext(), 0, 0, 20, Polarity.YANG, 2, WuXing.WOOD);
    expect(blessed.gradients).toHaveLength(1);
    const stops = blessed.gradients[0].stops;
    expect(stops[0].color).toBe(palette.light);
    expect(stops.at(-1)!.color).toBe(palette.main);
    const blessedBody = bodyPaths(blessed);
    expect(blessedBody[0].color).toBe('[object Object]');
    expect(blessedBody[1].color).toBe(palette.light);
    expect(
      blessed.paths.some((path) => path.color === palette.light && path.strokeWidth === 1.5),
    ).toBe(true);
  });

  it('keeps blessed colors elemental and leaves void fish without any elemental fill', () => {
    const blessedColors: string[] = [];
    const voidOutlines: string[] = [];
    for (const element of Object.values(WuXing)) {
      const glow = new RecordingContext();
      drawYinYangFish(glow.asContext(), 0, 0, 20, Polarity.YANG, 2, element);
      expect(glow.gradients).toHaveLength(1);
      const stops = glow.gradients[0].stops;
      expect(stops[0].color).toBe(WUXING_PALETTE[element].light);
      expect(stops.at(-1)!.color).toBe(WUXING_PALETTE[element].main);
      blessedColors.push(stops.at(-1)!.color);
      const empty = new RecordingContext();
      drawYinYangFish(empty.asContext(), 0, 0, 20, Polarity.YANG, 0, element);
      // 虚空只剩描边（元素色淡描边）与对照眼，没有元素色实心填充。
      expect(
        empty.paths.filter((path) => path.strokeWidth === 0).map((path) => path.color),
      ).toEqual(['#e5eee4']);
      const voidBody = bodyPaths(empty);
      expect(voidBody).toHaveLength(1);
      expect(voidBody[0].strokeWidth).toBeGreaterThan(0);
      expect(voidBody[0].color.startsWith('rgba(')).toBe(true);
      voidOutlines.push(voidBody[0].color);
    }
    expect(new Set(blessedColors).size).toBe(5);
    expect(new Set(voidOutlines).size).toBe(5);
  });
});
