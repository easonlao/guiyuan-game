import { describe, it, expect } from 'vitest';
import { BoardView } from '../../src/minigame/views/board-view.js';
import { BoardState, NodeLevel, Polarity, WuXing } from '../../src/core/types/domain.js';

/** 造一个五行盘快照；未指定的元素默认 (0, 0) 虚空。 */
function makeBoard(
  levels: Partial<Record<WuXing, { yin: NodeLevel; yang: NodeLevel }>>,
): BoardState {
  return {
    [WuXing.WOOD]: { yin: 0, yang: 0 },
    [WuXing.FIRE]: { yin: 0, yang: 0 },
    [WuXing.EARTH]: { yin: 0, yang: 0 },
    [WuXing.METAL]: { yin: 0, yang: 0 },
    [WuXing.WATER]: { yin: 0, yang: 0 },
    ...levels,
  };
}

describe('Minigame BoardView: 五行法盘环形布局', () => {
  it('按相生顺序（木火土金水）等分环布五行，木居正上方', () => {
    const view = new BoardView();

    expect(view.elements.map((entry) => entry.element)).toEqual([
      WuXing.WOOD,
      WuXing.FIRE,
      WuXing.EARTH,
      WuXing.METAL,
      WuXing.WATER,
    ]);

    // 默认布局：圆心 (0, 0)，主印环半径 120，木起于 -90°，每 72° 一个方位。
    // 下列坐标由几何公式手算（独立于实现），保留 6 位小数。
    const expected: [number, number][] = [
      [0, -120],
      [114.126782, -37.082039],
      [70.53423, 97.082039],
      [-70.53423, 97.082039],
      [-114.126782, -37.082039],
    ];
    view.elements.forEach((entry, index) => {
      expect(entry.x).toBeCloseTo(expected[index][0], 5);
      expect(entry.y).toBeCloseTo(expected[index][1], 5);
    });

    // 相邻方位夹角恒为 2π/5，五个主印等距落在同一圆上。
    const angles = view.elements.map((entry) => entry.angle);
    for (let index = 0; index < angles.length; index += 1) {
      const next = angles[(index + 1) % angles.length];
      const gap = (((next - angles[index]) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      expect(gap).toBeCloseTo((Math.PI * 2) / 5, 9);
    }
    for (const entry of view.elements) {
      expect(Math.hypot(entry.x, entry.y)).toBeCloseTo(120, 5);
    }
  });
});

describe('Minigame BoardView: 生克连线', () => {
  it('外环五条相生线、内星五条相克线，均由五行生克常量推导', () => {
    const view = new BoardView();

    const generation = view.connections.filter((line) => line.kind === 'generation');
    const overcoming = view.connections.filter((line) => line.kind === 'overcoming');

    // 相生：木生火、火生土、土生金、金生水、水生木；
    // 相克：木克土、火克金、土克水、金克木、水克火（均按主印环顺序列出）。
    expect(generation.map((line) => [line.from, line.to])).toEqual([
      [WuXing.WOOD, WuXing.FIRE],
      [WuXing.FIRE, WuXing.EARTH],
      [WuXing.EARTH, WuXing.METAL],
      [WuXing.METAL, WuXing.WATER],
      [WuXing.WATER, WuXing.WOOD],
    ]);
    expect(overcoming.map((line) => [line.from, line.to])).toEqual([
      [WuXing.WOOD, WuXing.EARTH],
      [WuXing.FIRE, WuXing.METAL],
      [WuXing.EARTH, WuXing.WATER],
      [WuXing.METAL, WuXing.WOOD],
      [WuXing.WATER, WuXing.FIRE],
    ]);
  });

  it('连线端点落在两端主印的投影坐标上', () => {
    const view = new BoardView();
    const woodToFire = view.connections.find(
      (line) => line.from === WuXing.WOOD && line.to === WuXing.FIRE,
    );
    const metalToWood = view.connections.find(
      (line) => line.from === WuXing.METAL && line.to === WuXing.WOOD,
    );

    // 木 (0, -120) → 火 (114.126782, -37.082039)；金 (-70.53423, 97.082039) → 木 (0, -120)。
    expect(woodToFire?.x1).toBeCloseTo(0, 5);
    expect(woodToFire?.y1).toBeCloseTo(-120, 5);
    expect(woodToFire?.x2).toBeCloseTo(114.126782, 5);
    expect(woodToFire?.y2).toBeCloseTo(-37.082039, 5);
    expect(metalToWood?.x1).toBeCloseTo(-70.53423, 5);
    expect(metalToWood?.y1).toBeCloseTo(97.082039, 5);
    expect(metalToWood?.x2).toBeCloseTo(0, 5);
    expect(metalToWood?.y2).toBeCloseTo(-120, 5);
  });

  it('源主印任一侧点亮（≥1）时，由它出发的连线处于活动态', () => {
    const view = new BoardView();
    expect(view.connections.every((line) => !line.active)).toBe(true);

    // 仅木点亮：木生火与木克土转为活动，其余八条保持静默。
    view.update(makeBoard({ [WuXing.WOOD]: { yin: 1, yang: 0 } }));
    const active = view.connections.filter((line) => line.active);
    expect(active.map((line) => [line.kind, line.from, line.to])).toEqual([
      ['generation', WuXing.WOOD, WuXing.FIRE],
      ['overcoming', WuXing.WOOD, WuXing.EARTH],
    ]);

    // 水亢极：以水为源的两条线转为活动。
    view.update(makeBoard({ [WuXing.WATER]: { yin: 2, yang: 2 } }));
    expect(
      view.connections.filter((line) => line.active).map((line) => [line.kind, line.from, line.to]),
    ).toEqual([
      ['generation', WuXing.WATER, WuXing.WOOD],
      ['overcoming', WuXing.WATER, WuXing.FIRE],
    ]);
  });
});

describe('Minigame BoardView: 归一与亢极高亮', () => {
  it('双侧均≥1 投影为归一；双侧均达 2 才投影为亢极', () => {
    const view = new BoardView();
    view.update(
      makeBoard({
        [WuXing.WOOD]: { yin: 1, yang: 1 },
        [WuXing.FIRE]: { yin: 2, yang: 2 },
        [WuXing.EARTH]: { yin: 2, yang: 1 },
        [WuXing.METAL]: { yin: 1, yang: 0 },
        [WuXing.WATER]: { yin: -1, yang: 2 },
      }),
    );

    // 木(1,1) 火(2,2) 土(2,1) 金(1,0) 水(-1,2)，术语定义见 GLOSSARY.md。
    expect(view.elements.map((entry) => [entry.yin, entry.yang])).toEqual([
      [1, 1],
      [2, 2],
      [2, 1],
      [1, 0],
      [-1, 2],
    ]);
    expect(view.elements.map((entry) => entry.isGuiYi)).toEqual([true, true, true, false, false]);
    expect(view.elements.map((entry) => entry.isKangJi)).toEqual([
      false,
      true,
      false,
      false,
      false,
    ]);

    // 归一/亢极是节点级高亮，同一主印的两个槽位共享。
    expect(view.getSlot(WuXing.FIRE, Polarity.YIN).isKangJi).toBe(true);
    expect(view.getSlot(WuXing.FIRE, Polarity.YANG).isKangJi).toBe(true);
    expect(view.getSlot(WuXing.METAL, Polarity.YIN).isGuiYi).toBe(false);
    expect(view.getSlot(WuXing.EARTH, Polarity.YANG).isGuiYi).toBe(true);
  });

  it('重新投影新快照时丢弃旧的归一/亢极高亮', () => {
    const view = new BoardView();
    view.update(makeBoard({ [WuXing.WOOD]: { yin: 2, yang: 2 } }));
    expect(view.elements[0].isKangJi).toBe(true);

    view.update(makeBoard({ [WuXing.WOOD]: { yin: 0, yang: 0 } }));

    expect(view.elements[0].isGuiYi).toBe(false);
    expect(view.elements[0].isKangJi).toBe(false);
  });
});

describe('Minigame BoardView: 十阴阳槽位状态投影', () => {
  it('未投影快照前，十个槽位按虚空 (0) 呈现', () => {
    const view = new BoardView();

    expect(view.slots).toHaveLength(10);
    expect(view.slots.map((slot) => [slot.element, slot.polarity])).toEqual([
      [WuXing.WOOD, Polarity.YIN],
      [WuXing.WOOD, Polarity.YANG],
      [WuXing.FIRE, Polarity.YIN],
      [WuXing.FIRE, Polarity.YANG],
      [WuXing.EARTH, Polarity.YIN],
      [WuXing.EARTH, Polarity.YANG],
      [WuXing.METAL, Polarity.YIN],
      [WuXing.METAL, Polarity.YANG],
      [WuXing.WATER, Polarity.YIN],
      [WuXing.WATER, Polarity.YANG],
    ]);
    expect(view.slots.map((slot) => slot.level)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('把快照里每一侧的等级投影到对应槽位（含 -1 道损与 2 加持）', () => {
    const view = new BoardView();
    view.update(
      makeBoard({
        [WuXing.WOOD]: { yin: 2, yang: 1 },
        [WuXing.FIRE]: { yin: -1, yang: 0 },
        [WuXing.EARTH]: { yin: 0, yang: 2 },
        [WuXing.METAL]: { yin: 1, yang: -1 },
        [WuXing.WATER]: { yin: 2, yang: 2 },
      }),
    );

    // 手抄快照：木(2,1) 火(-1,0) 土(0,2) 金(1,-1) 水(2,2)
    expect(view.slots.map((slot) => slot.level)).toEqual([2, 1, -1, 0, 0, 2, 1, -1, 2, 2]);
    expect(view.getSlot(WuXing.FIRE, Polarity.YIN).level).toBe(-1);
    expect(view.getSlot(WuXing.EARTH, Polarity.YANG).level).toBe(2);
    expect(view.getSlot(WuXing.METAL, Polarity.YANG).level).toBe(-1);
  });

  it('阴侧槽位落在主印逆时针一侧、阳侧落在顺时针一侧，同在外环上', () => {
    const view = new BoardView();
    const wood = view.elements[0];
    const yin = view.getSlot(WuXing.WOOD, Polarity.YIN);
    const yang = view.getSlot(WuXing.WOOD, Polarity.YANG);

    // 木在 -90°；槽位环半径 170，槽位偏移 0.45 rad。坐标由几何公式手算。
    expect(yin.x).toBeCloseTo(-73.944141, 5);
    expect(yin.y).toBeCloseTo(-153.076007, 5);
    expect(yang.x).toBeCloseTo(73.944141, 5);
    expect(yang.y).toBeCloseTo(-153.076007, 5);
    expect(Math.hypot(yin.x, yin.y)).toBeCloseTo(170, 5);
    expect(Math.hypot(yang.x, yang.y)).toBeCloseTo(170, 5);
    expect(yin.angle).toBeLessThan(wood.angle);
    expect(yang.angle).toBeGreaterThan(wood.angle);
  });
});

describe('Minigame BoardView: 自适应视口布局', () => {
  it('构造时可覆盖圆心与半径', () => {
    const view = new BoardView({ centerX: 100, centerY: 50, sealRadius: 60 });

    // 木在 -90°：x = 100 + 60*cos(-90°) = 100，y = 50 + 60*sin(-90°) = -10。
    expect(view.elements[0].x).toBeCloseTo(100, 5);
    expect(view.elements[0].y).toBeCloseTo(-10, 5);
    expect(view.layout.centerX).toBe(100);
    expect(view.layout.sealRadius).toBe(60);
  });

  it('resize 后法盘居中，五个主印与十个槽位全部落在视口内', () => {
    const view = new BoardView();
    view.resize(400, 800);

    expect(view.layout.centerX).toBe(200);
    expect(view.layout.centerY).toBe(400);
    expect(view.layout.slotRadius).toBeGreaterThan(view.layout.sealRadius);
    for (const point of [...view.elements, ...view.slots]) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(400);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(800);
    }
    // 五个主印绕视口中心对称：相对圆心的位移和为零。
    const sumX = view.elements.reduce((acc, entry) => acc + (entry.x - 200), 0);
    const sumY = view.elements.reduce((acc, entry) => acc + (entry.y - 400), 0);
    expect(sumX).toBeCloseTo(0, 6);
    expect(sumY).toBeCloseTo(0, 6);
  });

  it('窄视口按短边缩放，法盘不溢出', () => {
    const view = new BoardView();
    view.resize(300, 900);

    expect(view.layout.centerX).toBe(150);
    expect(view.layout.centerY).toBe(450);
    expect(view.layout.slotRadius).toBeLessThan(150);
    for (const point of [...view.elements, ...view.slots]) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(300);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(900);
    }
  });
});

describe('Minigame BoardView: 只读快照投影', () => {
  it('投影深冻结的快照不会写入（严格模式下写入会抛错）', () => {
    const board = makeBoard({ [WuXing.WOOD]: { yin: 2, yang: 1 } });
    for (const node of Object.values(board)) {
      Object.freeze(node);
    }
    Object.freeze(board);
    const view = new BoardView();

    expect(() => view.update(board)).not.toThrow();

    expect(view.getSlot(WuXing.WOOD, Polarity.YIN).level).toBe(2);
    expect(view.getSlot(WuXing.WOOD, Polarity.YANG).level).toBe(1);
  });
});

/** 记录绘制调用的伪 Canvas 2D 上下文：只关心「有没有画东西」，不关心具体坐标。 */
class RecordingContext {
  public globalAlpha = 1;
  public fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  public strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  public lineWidth = 1;
  public lineCap: CanvasLineCap = 'butt';
  public font = '';
  public textAlign: CanvasTextAlign = 'start';
  public textBaseline: CanvasTextBaseline = 'alphabetic';
  public readonly calls: string[] = [];

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

  public beginPath(): void {
    this.calls.push('beginPath');
  }

  public closePath(): void {
    this.calls.push('closePath');
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

  public fillText(_text: string, _x: number, _y: number): void {
    this.calls.push('fillText');
  }

  public setLineDash(_segments: number[]): void {
    this.calls.push('setLineDash');
  }

  public asContext(): CanvasRenderingContext2D {
    return this as unknown as CanvasRenderingContext2D;
  }

  /** 真正落笔的绘制指令数（排除 save/translate 之类的状态指令）。 */
  public drawCallCount(): number {
    return this.calls.filter(
      (call) => call === 'fill' || call === 'stroke' || call === 'fillRect' || call === 'fillText',
    ).length;
  }
}

describe('Minigame BoardView: 渲染', () => {
  it('render 在 Canvas 2D 上下文上输出绘制指令（未投影快照也不崩）', () => {
    const empty = new RecordingContext();
    const view = new BoardView();
    expect(() => view.render(empty.asContext())).not.toThrow();
    expect(empty.drawCallCount()).toBeGreaterThan(0);

    const populated = new RecordingContext();
    view.update(makeBoard({ [WuXing.WATER]: { yin: 2, yang: 2 } }));
    expect(() => view.render(populated.asContext())).not.toThrow();
    expect(populated.drawCallCount()).toBeGreaterThan(0);
  });
});
