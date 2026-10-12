import {
  CHARACTER_ATLAS_SIZE,
  CHARACTER_ATLAS_FRAMES,
  CHARACTER_ATLAS_PATH,
  CharacterSpriteAtlas,
} from './character-sprite.js';

/** Host image dimensions are inconsistent between browser and WeChat implementations. */
export interface CharacterImageDimensions {
  readonly width?: number;
  readonly height?: number;
  readonly naturalWidth?: number;
  readonly naturalHeight?: number;
}

/** Call only after the image's successful onload; known dimensions never bypass decoding. */
export function resolveLoadedCharacterDimensions(image: CharacterImageDimensions): {
  width: number;
  height: number;
  source: 'natural' | 'reported' | 'packaged';
} {
  const valid = (value: number | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (valid(image.naturalWidth) && valid(image.naturalHeight)) {
    return { width: image.naturalWidth, height: image.naturalHeight, source: 'natural' };
  }
  if (valid(image.width) && valid(image.height)) {
    return { width: image.width, height: image.height, source: 'reported' };
  }
  return { ...CHARACTER_ATLAS_SIZE, source: 'packaged' };
}

export interface WechatCharacterImage extends CharacterImageDimensions {
  src: string;
  onload: (() => void) | null;
  onerror: ((error: unknown) => void) | null;
}

export interface WechatCharacterFileSystem {
  readFile(options: {
    filePath: string;
    success: (result: { data: ArrayBuffer | string }) => void;
    fail: (error: unknown) => void;
  }): void;
  writeFile(options: {
    filePath: string;
    data: ArrayBuffer;
    success: () => void;
    fail: (error: unknown) => void;
  }): void;
}

export interface WechatCharacterImageHost {
  createImage(): WechatCharacterImage;
  getFileSystemManager?: () => WechatCharacterFileSystem;
  env?: { USER_DATA_PATH?: string };
}

/** Native image loading may not retain the JavaScript wrapper; keep it until load or error. */
const pendingImages = new Set<WechatCharacterImage>();

/** Extract bounded error details without printing arbitrary host objects or file contents. */
function errorReason(error: unknown, depth = 0): string {
  if (typeof error === 'string' && error.length > 0) return error;
  if (error === null || typeof error !== 'object' || depth > 2) return '';
  const fields = error as Record<string, unknown>;
  const details = [fields.errMsg, fields.message, fields.type].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  for (const nested of [fields.error, fields.detail, fields.cause]) {
    const reason = errorReason(nested, depth + 1);
    if (reason) details.push(reason);
  }
  return [...new Set(details)].join('；');
}

/** Prefer the native cache path verified by WeChat; keep direct loading for other hosts. */
export function loadWechatCharacterAtlas(
  host: WechatCharacterImageHost,
  setAtlas: (atlas: CharacterSpriteAtlas | null) => void,
): void {
  type Phase = 'reading' | 'writing' | 'cache-loading' | 'direct-loading' | 'done';
  let phase: Phase = 'reading';
  const diagnostic = (
    level: 'warn' | 'error',
    stage: string,
    path: string,
    error: unknown,
  ): void => {
    console[level](`[Guiyuan] 人物图集${stage}`, {
      path,
      reason: errorReason(error) || '宿主未提供错误详情',
    });
  };
  const useDirect = (stage?: string, path = CHARACTER_ATLAS_PATH, error?: unknown): void => {
    if (phase === 'direct-loading' || phase === 'done') return;
    if (stage) diagnostic('warn', stage, path, error);
    phase = 'direct-loading';
    loadImage(CHARACTER_ATLAS_PATH, 'direct-loading');
  };
  const loadImage = (path: string, expectedPhase: 'cache-loading' | 'direct-loading'): void => {
    const failed = (error: unknown): void => {
      if (phase !== expectedPhase) return;
      if (expectedPhase === 'cache-loading') {
        useDirect('缓存解码失败，尝试包内路径', path, error);
      } else {
        phase = 'done';
        setAtlas(null);
        diagnostic('error', '加载失败', path, error);
      }
    };
    let image: WechatCharacterImage;
    try {
      image = host.createImage();
    } catch (error) {
      failed(error);
      return;
    }
    let settled = false;
    const finish = (): boolean => {
      if (settled) return false;
      settled = true;
      pendingImages.delete(image);
      image.onload = null;
      image.onerror = null;
      return phase === expectedPhase;
    };
    const fail = (error: unknown): void => {
      if (finish()) failed(error);
    };
    pendingImages.add(image);
    image.onload = () => {
      if (!finish()) return;
      phase = 'done';
      const dimensions = resolveLoadedCharacterDimensions(image);
      if (dimensions.source === 'packaged') {
        console.warn('[Guiyuan] 人物图集 onload 未提供有效尺寸，采用已打包资源尺寸', {
          path,
          width: image.width,
          height: image.height,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        });
      }
      setAtlas({
        image: image as unknown as CanvasImageSource,
        width: dimensions.width,
        height: dimensions.height,
        frames: CHARACTER_ATLAS_FRAMES,
      });
      console.log('[Guiyuan] 人物图集加载成功', { path, ...dimensions });
    };
    image.onerror = fail;
    console.log('[Guiyuan] 开始加载人物图集', path);
    try {
      image.src = path;
    } catch (error) {
      fail(error);
    }
  };

  const directory = host.env?.USER_DATA_PATH;
  if (typeof host.getFileSystemManager !== 'function' || !directory) {
    useDirect();
    return;
  }
  const cachedPath = `${directory.replace(/\/$/, '')}/guiyuan-characters.png`;
  try {
    const fs = host.getFileSystemManager();
    console.log('[Guiyuan] 开始准备人物图集缓存', CHARACTER_ATLAS_PATH);
    fs.readFile({
      filePath: CHARACTER_ATLAS_PATH,
      fail: (error) => {
        if (phase === 'reading')
          useDirect('文件读取失败，尝试包内路径', CHARACTER_ATLAS_PATH, error);
      },
      success: ({ data }) => {
        if (phase !== 'reading') return;
        try {
          if (typeof data === 'string' || !data || typeof data.byteLength !== 'number') {
            useDirect(
              '文件格式无效，尝试包内路径',
              CHARACTER_ATLAS_PATH,
              '读取结果不是二进制 ArrayBuffer',
            );
            return;
          }
          const bytes = new Uint8Array(data);
          const magic = Array.from(bytes.subarray(0, 8))
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
          console.log('[Guiyuan] 人物图集文件读取成功', {
            path: CHARACTER_ATLAS_PATH,
            bytes: bytes.byteLength,
            magic,
          });
          if (bytes.byteLength < 33 || magic !== '89504e470d0a1a0a') {
            useDirect(
              '文件格式无效，尝试包内路径',
              CHARACTER_ATLAS_PATH,
              'PNG 签名或最小长度检查未通过',
            );
            return;
          }
          phase = 'writing';
          fs.writeFile({
            filePath: cachedPath,
            data,
            fail: (error) => {
              if (phase === 'writing') useDirect('缓存写入失败，尝试包内路径', cachedPath, error);
            },
            success: () => {
              if (phase !== 'writing') return;
              phase = 'cache-loading';
              console.log('[Guiyuan] 人物图集缓存写入成功', { path: cachedPath });
              loadImage(cachedPath, 'cache-loading');
            },
          });
        } catch (error) {
          if (phase === 'reading' || phase === 'writing')
            useDirect('缓存准备失败，尝试包内路径', CHARACTER_ATLAS_PATH, error);
        }
      },
    });
  } catch (error) {
    if (phase === 'reading') useDirect('文件读取失败，尝试包内路径', CHARACTER_ATLAS_PATH, error);
  }
}
