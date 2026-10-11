import { describe, it, expect } from 'vitest';
import { Button } from '../../src/minigame/scene/button.js';
import { Container } from '../../src/minigame/scene/container.js';
import { InputManager } from '../../src/minigame/scene/input-manager.js';

/** 把按钮挂在 (100, 100) 的舞台节点上，方便用屏幕坐标驱动触摸。 */
function mountAt(stageX: number, stageY: number, button: Button): Container {
  const stage = new Container();
  button.x = stageX;
  button.y = stageY;
  stage.addChild(button);
  return stage;
}

describe('Button: 自动尺寸计算', () => {
  it('按标题与副标题自动计算尺寸，命中区居中在原点', () => {
    // 工作示例：全角按 1.2 倍字号计宽（14 × 1.2 = 16.8，口径见 `text-metrics.ts`），
    // 左右各留 12 内边距，上下各 8。
    // 【吸纳】= 4 字 × 16.8 = 67.2 → 向上取整 68 → 宽 68 + 24 = 92；
    // 高 = 8*2 + 标题行 20 + 副标题行 14 = 50
    const button = new Button({ label: '【吸纳】', subLabel: '吸纳' });

    expect(button.width).toBe(92);
    expect(button.height).toBe(50);
    expect(button.hitArea).toEqual({ x: -46, y: -25, width: 92, height: 50 });
  });

  it('半角字符按 0.6 倍字号计宽', () => {
    // ABCDEFGHIJ = 10 个半角字 × (14 × 0.6) = 84 → 宽 84 + 24 = 108
    const button = new Button({ label: 'ABCDEFGHIJ' });

    expect(button.width).toBe(108);
  });

  it('短标签时宽度不小于最小可点宽度', () => {
    // 破 = 1 字 × 16.8 = 16.8 → 向上取整 17 → 17 + 24 = 41，小于最小宽度 72，取 72
    const button = new Button({ label: '破' });

    expect(button.width).toBe(72);
  });

  it('无副标题时高度只算标题一行', () => {
    // 高 = 8*2 + 20 = 36
    const button = new Button({ label: '【吸纳】' });

    expect(button.height).toBe(36);
  });

  it('显式宽高覆盖自动尺寸并同步命中区', () => {
    const button = new Button({ label: '【吸纳】', subLabel: '吸纳', width: 120, height: 40 });

    expect(button.getSize()).toEqual({ width: 120, height: 40 });
    expect(button.hitArea).toEqual({ x: -60, y: -20, width: 120, height: 40 });
  });
});

describe('Button: 按压缩放反馈', () => {
  it('按下时缩小、抬起时复原，并在同一节点上抬起时触发 onTap', () => {
    const taps: string[] = [];
    const button = new Button({ label: '【吸纳】', onTap: () => taps.push('tap') });
    const input = new InputManager(mountAt(100, 100, button));

    input.handleTouchStart(100, 100);
    expect(button.scaleX).toBe(0.92);
    expect(button.scaleY).toBe(0.92);

    input.handleTouchEnd(100, 100);
    expect(button.scaleX).toBe(1);
    expect(button.scaleY).toBe(1);
    expect(taps).toEqual(['tap']);
  });

  it('触摸落在按钮之外时不缩放也不触发点击', () => {
    const taps: string[] = [];
    const button = new Button({ label: '【吸纳】', onTap: () => taps.push('tap') });
    const input = new InputManager(mountAt(100, 100, button));

    input.handleTouchStart(0, 0);
    input.handleTouchEnd(0, 0);

    expect(button.scaleX).toBe(1);
    expect(taps).toEqual([]);
  });
});

describe('Button: 禁用态', () => {
  it('禁用时按下不缩放、抬起不触发 onTap', () => {
    const taps: string[] = [];
    const button = new Button({ label: '【破】', disabled: true, onTap: () => taps.push('tap') });
    const input = new InputManager(mountAt(100, 100, button));

    input.handleTouchStart(100, 100);
    input.handleTouchEnd(100, 100);

    expect(button.disabled).toBe(true);
    expect(button.scaleX).toBe(1);
    expect(taps).toEqual([]);
  });

  it('解除禁用后恢复按压缩放与 onTap', () => {
    const taps: string[] = [];
    const button = new Button({ label: '【破】', disabled: true, onTap: () => taps.push('tap') });
    const input = new InputManager(mountAt(100, 100, button));

    button.disabled = false;
    input.handleTouchStart(100, 100);
    expect(button.scaleX).toBe(0.92);
    input.handleTouchEnd(100, 100);

    expect(taps).toEqual(['tap']);
  });

  it('按下期间被禁用会立即释放按压态', () => {
    const button = new Button({ label: '【破】' });
    const input = new InputManager(mountAt(100, 100, button));

    input.handleTouchStart(100, 100);
    button.disabled = true;

    expect(button.scaleX).toBe(1);
  });
});
