import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CHARACTER_ATLAS_PATH, CHARACTER_ATLAS_SIZE } from '../../src/minigame/character-sprite.js';
import { CharacterImageDimensions } from '../../src/minigame/character-atlas-loader.js';

const packagedEntry = readFileSync(new URL('../../minigame/game.js', import.meta.url), 'utf8');

/** Execute the actual delivered entry; image decoding stays pending until the test triggers onload. */
function startWechat(dimensions: CharacterImageDimensions = {}) {
  const draws: unknown[][] = [];
  const logs: { level: string; args: unknown[] }[] = [];
  const schedule = { frame: undefined as ((timestamp: number) => void) | undefined };
  let source = '';
  const image = {
    ...dimensions,
    onload: null as (() => void) | null,
    onerror: null as ((error: { errMsg: string }) => void) | null,
    set src(value: string) {
      source = value;
    },
  };
  const canvasContext = new Proxy<Record<PropertyKey, unknown>>(
    {},
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'drawImage') return (...args: unknown[]) => draws.push(args);
        if (key === 'createRadialGradient' || key === 'createLinearGradient') {
          return () => ({ addColorStop() {} });
        }
        if (key === 'measureText') return () => ({ width: 12 });
        return () => {};
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    },
  );
  runInNewContext(packagedEntry, {
    wx: {
      createCanvas: () => ({ getContext: () => canvasContext }),
      createImage: () => image,
      getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 2 }),
      onTouchStart() {},
      onTouchEnd() {},
    },
    console: Object.fromEntries(
      ['log', 'warn', 'error'].map((level) => [
        level,
        (...args: unknown[]) => logs.push({ level, args }),
      ]),
    ),
    requestAnimationFrame(callback: (timestamp: number) => void) {
      schedule.frame = callback;
    },
    Date,
  });
  return { image, draws, logs, source, renderNext: () => schedule.frame?.(16) };
}

describe('Delivered WeChat character loading', () => {
  it('keeps procedural characters until asynchronous decoding succeeds', () => {
    const host = startWechat({ width: 1254, height: 1254 });
    expect(host.source).toBe(CHARACTER_ATLAS_PATH);
    expect(host.draws).toHaveLength(0);
    host.renderNext();
    expect(host.draws).toHaveLength(0);
    host.image.onload?.();
    host.renderNext();
    expect(host.draws).toHaveLength(2);
    expect(host.draws.every((args) => args[0] === host.image)).toBe(true);
  });

  it.each([
    { dimensions: { width: 1254, height: 1254 }, source: 'reported' },
    {
      dimensions: { width: 96, height: 96, naturalWidth: 1254, naturalHeight: 1254 },
      source: 'natural',
    },
    {
      dimensions: { width: 1254, height: 1254, naturalWidth: 0, naturalHeight: 0 },
      source: 'reported',
    },
    {
      dimensions: { width: 0, height: 0, naturalWidth: 1254, naturalHeight: 1254 },
      source: 'natural',
    },
    { dimensions: { width: 0, height: 0 }, source: 'packaged' },
    { dimensions: {}, source: 'packaged' },
  ])('uses $source dimensions after successful decoding: $dimensions', ({ dimensions, source }) => {
    const host = startWechat(dimensions);
    expect(host.draws).toHaveLength(0);
    host.image.onload?.();
    host.renderNext();
    expect(host.draws).toHaveLength(2);
    const success = host.logs.find((log) => log.args[0] === '[Guiyuan] 人物图集加载成功');
    expect(success?.args[1]).toEqual({
      path: CHARACTER_ATLAS_PATH,
      ...CHARACTER_ATLAS_SIZE,
      source,
    });
    expect(host.logs.filter((log) => log.level === 'warn')).toHaveLength(
      source === 'packaged' ? 1 : 0,
    );
  });

  it('reports the host error and path without drawing the undecoded image', () => {
    const host = startWechat({ width: 1254, height: 1254 });
    host.image.onerror?.({ errMsg: 'load image fail: file not found' });
    host.renderNext();
    expect(host.draws).toHaveLength(0);
    expect(host.logs.find((log) => log.level === 'error')?.args).toEqual([
      '[Guiyuan] 人物图集加载失败',
      { path: CHARACTER_ATLAS_PATH, reason: 'load image fail: file not found' },
    ]);
    expect(host.logs.some((log) => log.args[0] === '[Guiyuan] 人物图集加载成功')).toBe(false);
  });

  it('explicitly includes the real RGBA PNG and keeps fallback dimensions consistent with its header', () => {
    const project = JSON.parse(
      readFileSync(new URL('../../minigame/project.config.json', import.meta.url), 'utf8'),
    );
    expect(project.packOptions.include).toContainEqual({
      type: 'file',
      value: CHARACTER_ATLAS_PATH,
    });
    const png = readFileSync(new URL(`../../minigame/${CHARACTER_ATLAS_PATH}`, import.meta.url));
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(CHARACTER_ATLAS_SIZE.width);
    expect(png.readUInt32BE(20)).toBe(CHARACTER_ATLAS_SIZE.height);
    expect(png[25]).toBe(6); // PNG color type 6: RGBA.
  });
});
