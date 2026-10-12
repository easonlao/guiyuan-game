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
    autoRetryLoad?: boolean;
  } = {},
) {
  const draws: unknown[][] = [];
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
        if (options.autoRetryLoad && value !== CHARACTER_ATLAS_PATH) image.onload?.();
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

describe('Delivered WeChat image recovery', () => {
  it('does not touch the filesystem when the packaged image loads normally', () => {
    const files = mockFileSystem();
    const host = startWechat(CHARACTER_ATLAS_SIZE, { fs: files.fs, userDataPath: '/wx-data' });
    host.image.onload?.();
    host.renderNext();
    expect(host.draws).toHaveLength(2);
    expect(files.reads).toHaveLength(0);
    expect(files.writes).toHaveLength(0);
  });

  it('asynchronously verifies, writes and decodes the same PNG from one native cache path', () => {
    const files = mockFileSystem();
    const host = startWechat(CHARACTER_ATLAS_SIZE, { fs: files.fs, userDataPath: '/wx-data/' });
    host.image.onerror?.({ type: 'error', detail: { errMsg: 'native decoder failed' } });
    expect(files.reads).toHaveLength(1);
    expect(files.reads[0].filePath).toBe(CHARACTER_ATLAS_PATH);
    host.renderNext();
    expect(host.draws).toHaveLength(0);
    const bytes = pngData();
    files.reads[0].success({ data: bytes });
    expect(
      host.logs.find((log) => log.args[0] === '[Guiyuan] 人物图集文件读取成功')?.args[1],
    ).toEqual({
      path: CHARACTER_ATLAS_PATH,
      bytes: png.byteLength,
      magic: '89504e470d0a1a0a',
    });
    expect(files.writes).toHaveLength(1);
    expect(files.writes[0].filePath).toBe('/wx-data/guiyuan-characters.png');
    expect(files.writes[0].data).toBe(bytes);
    expect(host.images).toHaveLength(1);
    files.writes[0].success();
    expect(host.images).toHaveLength(2);
    host.renderNext();
    expect(host.draws).toHaveLength(0);
    host.images[1].onload?.();
    host.renderNext();
    expect(host.draws).toHaveLength(2);
    expect(host.draws.every((args) => args[0] === host.images[1])).toBe(true);
    expect(host.callbacksBeforeSource).toEqual([true, true]);
    expect(host.image.onload).toBeNull();
    expect(host.images[1].onerror).toBeNull();
  });

  it('reports file-read errors without claiming that the file exists or retrying decoding', () => {
    const files = mockFileSystem();
    const host = startWechat({}, { fs: files.fs, userDataPath: '/wx-data' });
    host.image.onerror?.(undefined);
    files.reads[0].fail({ errMsg: 'readFile:fail no such file' });
    host.renderNext();
    expect(host.draws).toHaveLength(0);
    expect(files.writes).toHaveLength(0);
    expect(host.images).toHaveLength(1);
    expect(
      host.logs.find((log) => log.args[0] === '[Guiyuan] 人物图集文件读取失败')?.args[1],
    ).toEqual({
      path: CHARACTER_ATLAS_PATH,
      reason: 'readFile:fail no such file',
    });
  });

  it('reports cache-write failure and keeps undecoded images off Canvas', () => {
    const files = mockFileSystem();
    const host = startWechat({}, { fs: files.fs, userDataPath: '/wx-data' });
    host.image.onerror?.({ type: 'error' });
    files.reads[0].success({ data: pngData() });
    files.writes[0].fail({ errMsg: 'writeFile:fail quota exceeded' });
    host.renderNext();
    expect(host.draws).toHaveLength(0);
    expect(host.images).toHaveLength(1);
    expect(
      host.logs.find((log) => log.args[0] === '[Guiyuan] 人物图集缓存写入失败')?.args[1],
    ).toEqual({
      path: '/wx-data/guiyuan-characters.png',
      reason: 'writeFile:fail quota exceeded',
    });
  });

  it('stops after a single cache decode failure and ignores stale native callbacks', () => {
    const files = mockFileSystem();
    const host = startWechat({}, { fs: files.fs, userDataPath: '/wx-data' });
    const staleLoad = host.image.onload;
    const staleError = host.image.onerror;
    host.image.onerror?.({ message: 'package decode failed' });
    staleLoad?.();
    staleError?.({ message: 'duplicate callback' });
    files.reads[0].success({ data: pngData() });
    files.writes[0].success();
    files.writes[0].success(); // A duplicated native completion must not start another retry.
    host.images[1].onerror?.({ error: { message: 'cache decode failed' } });
    host.renderNext();
    expect(files.reads).toHaveLength(1);
    expect(files.writes).toHaveLength(1);
    expect(host.images).toHaveLength(2);
    expect(host.draws).toHaveLength(0);
    expect(
      host.logs.find((log) => log.args[0] === '[Guiyuan] 人物图集缓存解码失败')?.args[1],
    ).toEqual({
      path: '/wx-data/guiyuan-characters.png',
      reason: 'cache decode failed',
    });
  });

  it('reports absent filesystem or cache-directory APIs without another user command', () => {
    const host = startWechat();
    host.image.onerror?.(undefined);
    expect(host.logs.some((log) => log.args[0] === '[Guiyuan] 人物图集无法自动读取')).toBe(true);
    const files = mockFileSystem();
    const noDirectory = startWechat({}, { fs: files.fs });
    noDirectory.image.onerror?.(undefined);
    files.reads[0].success({ data: pngData() });
    expect(files.writes).toHaveLength(0);
    expect(noDirectory.logs.some((log) => log.args[0] === '[Guiyuan] 人物图集无法缓存')).toBe(true);
  });

  it('rejects a non-PNG before writing and handles synchronous retry onload safely', () => {
    const files = mockFileSystem();
    const invalid = startWechat({}, { fs: files.fs, userDataPath: '/wx-data' });
    invalid.image.onerror?.(undefined);
    files.reads[0].success({ data: new ArrayBuffer(40) });
    expect(files.writes).toHaveLength(0);
    expect(invalid.images).toHaveLength(1);
    const goodFiles = mockFileSystem();
    const valid = startWechat(
      {},
      { fs: goodFiles.fs, userDataPath: '/wx-data', autoRetryLoad: true },
    );
    valid.image.onerror?.(undefined);
    goodFiles.reads[0].success({ data: pngData() });
    goodFiles.writes[0].success();
    valid.renderNext();
    expect(valid.draws).toHaveLength(2);
    expect(valid.callbacksBeforeSource).toEqual([true, true]);
  });
});
