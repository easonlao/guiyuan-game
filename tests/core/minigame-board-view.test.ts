import { describe, it, expect } from 'vitest';
import { BoardView, resolveActionPath } from '../../src/minigame/views/board-view.js';
import { ActionType, PlayerId, Polarity, WuXing } from '../../src/core/types/domain.js';
import { boardWith } from '../../tools/BoardFixture.js';
import { RecordingContext } from './helpers/recording-context.js';

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
/** 槽位相对主印中心的阴/阳横向偏移：主印半径 22.5 * 0.7。 */
const SLOT_SIDE = 15.75;

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

    // 己方木：主印 (0,-90)，阴侧偏左、阳侧偏右，偏移量 = 22.5 * 0.7。
    const ownYin = view.getSlot('P1', WuXing.WOOD, Polarity.YIN);
    const ownYang = view.getSlot('P1', WuXing.WOOD, Polarity.YANG);
    expect(ownYin.x).toBeCloseTo(-SLOT_SIDE, 5);
    expect(ownYin.y).toBeCloseTo(-90, 5);
    expect(ownYang.x).toBeCloseTo(SLOT_SIDE, 5);
    expect(ownYang.y).toBeCloseTo(-90, 5);
    expect(ownYin.angle).toBeCloseTo(START_ANGLE, 9);
    expect(ownYang.angle).toBeCloseTo(START_ANGLE, 9);

    // 对方木：在射线 126°（= 内环木角 - 2 * 72°）的外环主印 (-88.167788, 121.352549) 上。
    const opponentYin = view.getSlot('P2', WuXing.WOOD, Polarity.YIN);
    expect(opponentYin.x).toBeCloseTo(-88.167788 - SLOT_SIDE, 5);
    expect(opponentYin.y).toBeCloseTo(121.352549, 5);
    expect(opponentYin.angle).toBeCloseTo(START_ANGLE + 3 * RING_STEP, 9);
    expect(view.getSlot('P2', WuXing.WOOD, Polarity.YANG).x).toBeCloseTo(-88.167788 + SLOT_SIDE, 5);

    // 同一个五行的两块盘落在不同半径上，阴在左、阳在右。
    expect(ownYin.x).toBeLessThan(0);
    expect(ownYang.x).toBeGreaterThan(0);
    expect(opponentYin.x).toBeLessThan(-88.167788);
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

    expect(view.connections.every((line) => !line.active)).toBe(true);
  });

  it('setActivePaths 只点亮给定的 (kind, from)，其余九条静默', () => {
    const view = new BoardView();

    view.setActivePaths([
      { kind: 'generation', from: WuXing.WOOD },
      { kind: 'attack', from: WuXing.WATER },
    ]);

    expect(
      view.connections.filter((line) => line.active).map((line) => [line.kind, line.from, line.to]),
    ).toEqual([
      ['generation', WuXing.WOOD, WuXing.FIRE],
      ['attack', WuXing.WATER, WuXing.FIRE],
    ]);
  });

  it('setActivePaths([]) 清空高亮；换盘面快照不清除已设置的高亮', () => {
    const view = new BoardView();
    view.setActivePaths([{ kind: 'attack', from: WuXing.WOOD }]);
    expect(view.connections.filter((line) => line.active)).toHaveLength(1);

    // 高亮由动作驱动、与盘面等级解耦：投影新快照只换数据，不换高亮。
    view.update(boardWith(), boardWith());
    expect(view.connections.filter((line) => line.active)).toHaveLength(1);

    view.setActivePaths([]);
    expect(view.connections.every((line) => !line.active)).toBe(true);
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
    expect(ctx.texts.map((entry) => entry.text)).toContain('己 3/5 · 敌 1/5 归一');
    // 环级归属徽记：己方盘与对方盘各一个（不是主印上的五行名）。
    expect(ctx.texts.map((entry) => entry.text)).toContain('己');
    expect(ctx.texts.map((entry) => entry.text)).toContain('敌');
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

describe('Minigame BoardView: 渲染', () => {
  it('render 在 Canvas 2D 上下文上输出绘制指令（未投影快照也不崩）', () => {
    const empty = new RecordingContext();
    const view = new BoardView();
    expect(() => view.render(empty.asContext())).not.toThrow();
    expect(empty.drawCallCount()).toBeGreaterThan(0);

    const populated = new RecordingContext();
    view.update(
      boardWith({ [WuXing.WATER]: { yin: 2, yang: 2 } }),
      boardWith({ [WuXing.WOOD]: { yin: -1, yang: 1 } }),
    );
    expect(() => view.render(populated.asContext())).not.toThrow();
    expect(populated.drawCallCount()).toBeGreaterThan(0);
  });
});
