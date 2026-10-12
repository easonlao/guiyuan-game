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

/** Try the packaged path, then one verified binary copy in WeChat's native writable directory. */
export function loadWechatCharacterAtlas(
  host: WechatCharacterImageHost,
  setAtlas: (atlas: CharacterSpriteAtlas | null) => void,
): void {
  let retryStarted = false;
  const diagnostic = (stage: string, path: string, error: unknown): void => {
    console.error(`[Guiyuan] 人物图集${stage}`, {
      path,
      reason: errorReason(error) || '宿主未提供错误详情',
    });
  };
  const probeAndRetry = (): void => {
    if (typeof host.getFileSystemManager !== 'function') {
      diagnostic('无法自动读取', CHARACTER_ATLAS_PATH, '宿主未提供 wx.getFileSystemManager');
      return;
    }
    try {
      const fs = host.getFileSystemManager();
      fs.readFile({
        filePath: CHARACTER_ATLAS_PATH,
        fail: (error) => diagnostic('文件读取失败', CHARACTER_ATLAS_PATH, error),
        success: ({ data }) => {
          try {
            if (typeof data === 'string' || !data || typeof data.byteLength !== 'number') {
              diagnostic('文件格式无效', CHARACTER_ATLAS_PATH, '读取结果不是二进制 ArrayBuffer');
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
              diagnostic('文件格式无效', CHARACTER_ATLAS_PATH, '文件不是完整的 PNG 图集');
              return;
            }
            const directory = host.env?.USER_DATA_PATH;
            if (!directory) {
              diagnostic('无法缓存', CHARACTER_ATLAS_PATH, '宿主未提供 wx.env.USER_DATA_PATH');
              return;
            }
            const cachedPath = `${directory.replace(/\/$/, '')}/guiyuan-characters.png`;
            fs.writeFile({
              filePath: cachedPath,
              data,
              fail: (error) => diagnostic('缓存写入失败', cachedPath, error),
              success: () => {
                console.log('[Guiyuan] 人物图集缓存写入成功', { path: cachedPath });
                loadImage(cachedPath, true);
              },
            });
          } catch (error) {
            diagnostic('文件恢复失败', CHARACTER_ATLAS_PATH, error);
          }
        },
      });
    } catch (error) {
      diagnostic('文件读取失败', CHARACTER_ATLAS_PATH, error);
    }
  };
  const loadImage = (path: string, isRetry: boolean): void => {
    if (isRetry) {
      if (retryStarted) return;
      retryStarted = true;
    }
    let image: WechatCharacterImage;
    try {
      image = host.createImage();
    } catch (error) {
      diagnostic('加载失败', path, error);
      if (!isRetry) probeAndRetry();
      return;
    }
    let settled = false;
    const finish = (): boolean => {
      if (settled) return false;
      settled = true;
      pendingImages.delete(image);
      image.onload = null;
      image.onerror = null;
      return true;
    };
    const fail = (error: unknown): void => {
      if (!finish()) return;
      setAtlas(null);
      diagnostic(isRetry ? '缓存解码失败' : '加载失败', path, error);
      if (!isRetry) probeAndRetry();
    };
    pendingImages.add(image);
    image.onload = () => {
      if (!finish()) return;
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
  loadImage(CHARACTER_ATLAS_PATH, false);
}
