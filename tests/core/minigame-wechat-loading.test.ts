import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CHARACTER_ATLAS_PATH, CHARACTER_ATLAS_SIZE } from '../../src/minigame/character-sprite.js';
import {
  CharacterImageDimensions,
  WechatCharacterFileSystem,
  WechatCharacterImage,
} from '../../src/minigame/character-atlas-loader.js';

const packagedEntry = readFileSync(new URL('../../minigame/game.js', import.meta.url), 'utf8');

/** Execute the actual delivered entry; image decoding stays pending until the test triggers onload. */
function startWechat(
  dimensions: CharacterImageDimensions = {},
  options: {
    fs?: WechatCharacterFileSystem;
    userDataPath?: string;
    autoCacheLoad?: boolean;
    throwAfterCacheLoad?: boolean;
    menuBottom?: number;
    menuThrows?: boolean;
  } = {},
) {
  const draws: unknown[][] = [];
  const texts: { text: string; y: number }[] = [];
  const logs: { level: string; args: unknown[] }[] = [];
  const schedule = { frame: undefined as ((timestamp: number) => void) | undefined };
  let source = '';
  const images: WechatCharacterImage[] = [];
  const callbacksBeforeSource: boolean[] = [];
  const makeImage = (): WechatCharacterImage => {
    let requestedSource = '';
    const image = {
      ...dimensions,
      onload: null as (() => void) | null,
      onerror: null as ((error: unknown) => void) | null,
      get src(): string {
        return requestedSource;
      },
      set src(value: string) {
        requestedSource = value;
        source = value;
        callbacksBeforeSource.push(
          typeof image.onload === 'function' && typeof image.onerror === 'function',
        );
        if (options.autoCacheLoad && value !== CHARACTER_ATLAS_PATH) {
          image.onload?.();
          if (options.throwAfterCacheLoad)
            throw new Error('source setter threw after successful decoding');
        }
      },
    };
    images.push(image);
    return image;
  };
  const canvasContext = new Proxy<Record<PropertyKey, unknown>>(
    {},
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'fillText')
          return (text: string, _x: number, y: number) => texts.push({ text, y });
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
      createImage: makeImage,
      ...(options.fs ? { getFileSystemManager: () => options.fs } : {}),
      ...(options.userDataPath ? { env: { USER_DATA_PATH: options.userDataPath } } : {}),
      getMenuButtonBoundingClientRect: () => {
        if (options.menuThrows) throw new Error('unsupported');
        return { bottom: options.menuBottom };
      },
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
  return {
    image: images[0],
    images,
    callbacksBeforeSource,
    draws,
    texts,
    logs,
    source,
    renderNext: () => schedule.frame?.(16),
  };
}

function mockFileSystem() {
  const reads: Parameters<WechatCharacterFileSystem['readFile']>[0][] = [];
  const writes: Parameters<WechatCharacterFileSystem['writeFile']>[0][] = [];
  const fs: WechatCharacterFileSystem = {
    readFile: (options) => {
      reads.push(options);
    },
    writeFile: (options) => {
      writes.push(options);
    },
  };
  return { fs, reads, writes };
}
const png = readFileSync(new URL(`../../minigame/${CHARACTER_ATLAS_PATH}`, import.meta.url));
const pngData = (): ArrayBuffer => Uint8Array.from(png).buffer;

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

describe('Delivered WeChat cache-first loading', () => {
  it('prepares and decodes the cache first without a package image attempt or any errors', () => {
    const files = mockFileSystem();
    const host = startWechat(CHARACTER_ATLAS_SIZE, { fs: files.fs, userDataPath: 'http://usr/' });
    expect(files.reads).toHaveLength(1);
    expect(files.reads[0].filePath).toBe(CHARACTER_ATLAS_PATH);
    expect(host.images).toHaveLength(0);
    host.renderNext();
    expect(host.draws).toHaveLength(0);
    const data = pngData();
    files.reads[0].success({ data });
    files.reads[0].success({ data });
    expect(files.writes).toHaveLength(1);
    expect(files.writes[0].filePath).toBe('http://usr/guiyuan-characters.png');
    expect(files.writes[0].data).toBe(data);
    expect(host.images).toHaveLength(0);
    files.writes[0].success();
    files.writes[0].success();
    expect(host.images.map((image) => image.src)).toEqual(['http://usr/guiyuan-characters.png']);
    host.renderNext();
    expect(host.draws).toHaveLength(0);
    host.images[0].onload?.();
    host.renderNext();
    expect(host.draws).toHaveLength(2);
    expect(host.draws.every((args) => args[0] === host.images[0])).toBe(true);
    expect(host.logs.filter((log) => log.level === 'error')).toEqual([]);
    expect(host.callbacksBeforeSource).toEqual([true]);
    expect(host.images[0].onerror).toBeNull();
    expect(
      host.logs.find((log) => log.args[0] === '[Guiyuan] 人物图集文件读取成功')?.args[1],
    ).toEqual({
      path: CHARACTER_ATLAS_PATH,
      bytes: png.byteLength,
      magic: '89504e470d0a1a0a',
    });
  });

  it('falls back once after a read failure and warns without reporting an error on eventual success', () => {
    const files = mockFileSystem();
    const host = startWechat(CHARACTER_ATLAS_SIZE, { fs: files.fs, userDataPath: '/wx-data' });
    files.reads[0].fail({ errMsg: 'readFile:fail no such file' });
    files.reads[0].success({ data: pngData() }); // Late read callbacks cannot start a cache image.
    expect(files.writes).toHaveLength(0);
    expect(host.images.map((image) => image.src)).toEqual([CHARACTER_ATLAS_PATH]);
    host.images[0].onload?.();
    host.renderNext();
    expect(host.draws).toHaveLength(2);
    expect(host.logs.filter((log) => log.level === 'error')).toHaveLength(0);
    expect(host.logs.find((log) => log.level === 'warn')?.args[1]).toEqual({
      path: CHARACTER_ATLAS_PATH,
      reason: 'readFile:fail no such file',
    });
  });

  it('uses a direct image after cache-write failure with only a recoverable warning', () => {
    const files = mockFileSystem();
    const host = startWechat(CHARACTER_ATLAS_SIZE, { fs: files.fs, userDataPath: '/wx-data' });
    files.reads[0].success({ data: pngData() });
    files.writes[0].fail({ errMsg: 'writeFile:fail quota exceeded' });
    files.writes[0].success();
    expect(host.images.map((image) => image.src)).toEqual([CHARACTER_ATLAS_PATH]);
    host.images[0].onload?.();
    host.renderNext();
    expect(host.draws).toHaveLength(2);
    expect(host.logs.filter((log) => log.level === 'error')).toHaveLength(0);
    expect(host.logs.find((log) => log.level === 'warn')?.args[1]).toEqual({
      path: '/wx-data/guiyuan-characters.png',
      reason: 'writeFile:fail quota exceeded',
    });
  });

  it('uses one direct fallback after cache decoding fails, ignoring stale and duplicated callbacks', () => {
    const files = mockFileSystem();
    const host = startWechat(CHARACTER_ATLAS_SIZE, { fs: files.fs, userDataPath: '/wx-data' });
    files.reads[0].success({ data: pngData() });
    files.writes[0].success();
    const staleLoad = host.images[0].onload;
    const staleError = host.images[0].onerror;
    host.images[0].onerror?.({ error: { message: 'cache decode failed' } });
    files.writes[0].success();
    host.images[1].onload?.();
    staleLoad?.();
    staleError?.({ message: 'duplicate callback' });
    host.renderNext();
    expect(host.images.map((image) => image.src)).toEqual([
      '/wx-data/guiyuan-characters.png',
      CHARACTER_ATLAS_PATH,
    ]);
    expect(host.draws).toHaveLength(2);
    expect(host.draws.every((args) => args[0] === host.images[1])).toBe(true);
    expect(host.logs.filter((log) => log.level === 'error')).toHaveLength(0);
    expect(host.logs.find((log) => log.level === 'warn')?.args[1]).toEqual({
      path: '/wx-data/guiyuan-characters.png',
      reason: 'cache decode failed',
    });
  });

  it('keeps a final decode failure visible after all viable image paths have failed', () => {
    const files = mockFileSystem();
    const host = startWechat(CHARACTER_ATLAS_SIZE, { fs: files.fs, userDataPath: '/wx-data' });
    files.reads[0].success({ data: pngData() });
    files.writes[0].success();
    host.images[0].onerror?.({ type: 'error', detail: { errMsg: 'cache decode failed' } });
    host.images[1].onerror?.({ errMsg: 'package decode failed' });
    host.renderNext();
    expect(host.draws).toHaveLength(0);
    expect(host.images).toHaveLength(2);
    expect(files.reads).toHaveLength(1);
    expect(files.writes).toHaveLength(1);
    expect(host.logs.filter((log) => log.level === 'error')).toEqual([
      {
        level: 'error',
        args: [
          '[Guiyuan] 人物图集加载失败',
          {
            path: CHARACTER_ATLAS_PATH,
            reason: 'package decode failed',
          },
        ],
      },
    ]);
  });

  it('loads directly without warnings on hosts lacking cache APIs or the user directory', () => {
    const files = mockFileSystem();
    const host = startWechat(CHARACTER_ATLAS_SIZE, { fs: files.fs });
    expect(host.images.map((image) => image.src)).toEqual([CHARACTER_ATLAS_PATH]);
    host.image.onload?.();
    host.renderNext();
    expect(files.reads).toHaveLength(0);
    expect(files.writes).toHaveLength(0);
    expect(host.draws).toHaveLength(2);
    expect(host.logs.filter((log) => log.level !== 'log')).toHaveLength(0);
  });

  it('does not cache invalid PNG data and preserves the final direct decode error', () => {
    const files = mockFileSystem();
    const host = startWechat(CHARACTER_ATLAS_SIZE, { fs: files.fs, userDataPath: '/wx-data' });
    files.reads[0].success({ data: new ArrayBuffer(40) });
    expect(files.writes).toHaveLength(0);
    expect(host.images.map((image) => image.src)).toEqual([CHARACTER_ATLAS_PATH]);
    expect(
      host.logs.some((log) => log.level === 'warn' && String(log.args[0]).includes('文件格式无效')),
    ).toBe(true);
    host.images[0].onerror?.({ message: 'invalid image' });
    expect(
      host.logs.some((log) => log.level === 'error' && String(log.args[0]).includes('加载失败')),
    ).toBe(true);
  });

  it('handles synchronous read, write and cached-image load with handlers bound before src', () => {
    const fs: WechatCharacterFileSystem = {
      readFile(options) {
        options.success({ data: pngData() });
      },
      writeFile(options) {
        options.success();
        options.success();
      },
    };
    const host = startWechat(CHARACTER_ATLAS_SIZE, {
      fs,
      userDataPath: '/wx-data',
      autoCacheLoad: true,
    });
    host.renderNext();
    expect(host.images.map((image) => image.src)).toEqual(['/wx-data/guiyuan-characters.png']);
    expect(host.draws).toHaveLength(4); // First init frame and next frame both draw the loaded pair.
    expect(host.callbacksBeforeSource).toEqual([true]);
    expect(host.logs.filter((log) => log.level === 'error')).toHaveLength(0);
  });

  it.each(['read', 'write'] as const)(
    'recovers from a synchronous %s exception through direct loading',
    (stage) => {
      const fs: WechatCharacterFileSystem = {
        readFile(options) {
          if (stage === 'read') throw new Error('read exception');
          options.success({ data: pngData() });
        },
        writeFile() {
          throw new Error('write exception');
        },
      };
      const host = startWechat(CHARACTER_ATLAS_SIZE, { fs, userDataPath: '/wx-data' });
      expect(host.images.map((image) => image.src)).toEqual([CHARACTER_ATLAS_PATH]);
      host.images[0].onload?.();
      host.renderNext();
      expect(host.draws).toHaveLength(2);
      expect(host.logs.filter((log) => log.level === 'error')).toHaveLength(0);
      expect(host.logs.some((log) => log.level === 'warn')).toBe(true);
    },
  );
});

describe('Delivered WeChat capsule safe header', () => {
  it('starts the header below the native capsule while retaining board startup', () => {
    const host = startWechat({}, { menuBottom: 80 });
    host.renderNext();
    const brand = host.texts.find(({ text }) => text === '归元弈');
    expect(brand).toBeDefined();
    expect(brand!.y).toBeGreaterThan(80);
    expect(host.logs.some(({ level }) => level === 'error')).toBe(false);
  });
  it.each([{ menuBottom: NaN }, { menuBottom: 900 }, { menuThrows: true }])(
    'falls back safely for an unavailable or invalid capsule API: %j',
    (options) => {
      const host = startWechat({}, options);
      host.renderNext();
      const brand = host.texts.find(({ text }) => text === '归元弈');
      expect(brand).toBeDefined();
      expect(brand!.y).toBeLessThan(80);
      expect(host.logs.some(({ level }) => level === 'error')).toBe(false);
    },
  );
});
