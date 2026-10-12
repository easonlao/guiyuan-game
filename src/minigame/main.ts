import { GameScene } from './game-scene.js';
import { loadWechatCharacterAtlas, WechatCharacterImageHost } from './character-atlas-loader.js';
import { Container } from './scene/container.js';
import { InputManager, TouchEventLike } from './scene/input-manager.js';

// 声明微信小游戏全局对象
declare const wx: WechatCharacterImageHost & {
  createCanvas: () => any;
  getSystemInfoSync: () => {
    windowWidth: number;
    windowHeight: number;
    pixelRatio: number;
    statusBarHeight?: number;
    safeArea?: {
      top: number;
      bottom: number;
      left: number;
      right: number;
      width: number;
      height: number;
    };
  };
  getMenuButtonBoundingClientRect?: () => { bottom: number };
  onTouchStart: (callback: (e: TouchEventLike) => void) => void;
  onTouchEnd: (callback: (e: TouchEventLike) => void) => void;
};

/**
 * 单帧最大步长（秒）：掉帧或切后台回来时钳制 dt，
 * 避免一帧跨过整段动效与倒计时（`Tween` 的进度不会因此跳变）。
 */
const MAX_FRAME_DELTA = 1 / 20;

/**
 * 小游戏入口：搭好根舞台 -> 挂载 `GameScene` -> 绑定微信触摸 -> 用 delta-time 驱动帧循环。
 *
 * 帧循环的时钟只在这里：`Tween` 与 `GameScene` 都按调用方给的 `dt` 步进，
 * 因此表现层动效完全确定性、可在测试里用模拟时钟复现（ADR 0005）。
 */
export function initMiniGame(): void {
  if (typeof wx === 'undefined') {
    console.log('[Guiyuan] 非微信小游戏环境，跳过 Canvas 初始化');
    return;
  }

  const sysInfo = wx.getSystemInfoSync();
  const { windowWidth, windowHeight, pixelRatio } = sysInfo;
  let safeTop = sysInfo.safeArea ? sysInfo.safeArea.top : sysInfo.statusBarHeight || 20;
  try {
    const menu = wx.getMenuButtonBoundingClientRect?.();
    if (
      menu !== undefined &&
      Number.isFinite(menu.bottom) &&
      menu.bottom > 0 &&
      menu.bottom < windowHeight / 2
    )
      safeTop = Math.max(safeTop, menu.bottom + 8);
  } catch {
    /* Older hosts may expose this API without implementing it. */
  }
  const safeBottom = sysInfo.safeArea ? Math.max(0, windowHeight - sysInfo.safeArea.bottom) : 10;

  const canvas = wx.createCanvas();
  canvas.width = windowWidth * pixelRatio;
  canvas.height = windowHeight * pixelRatio;

  const ctx = canvas.getContext('2d');
  ctx.scale(pixelRatio, pixelRatio);

  // 根舞台：场景是它唯一的子树；舞台自身铺满视口，承接「点击空白处」的加速与重开。
  const stage = new Container();
  stage.hitArea = { x: 0, y: 0, width: windowWidth, height: windowHeight };

  const scene = new GameScene({
    width: windowWidth,
    height: windowHeight,
    safeTop,
    safeBottom,
  });
  stage.onTap = () => scene.handleTap();
  stage.addChild(scene);

  loadWechatCharacterAtlas(wx, (atlas) => scene.characters.setSpriteAtlas(atlas));

  const input = new InputManager(stage);
  input.bindTouchEvents(wx);

  scene.start();

  let lastTimestamp: number | null = null;
  function loop(timestamp?: number): void {
    const now = typeof timestamp === 'number' ? timestamp : Date.now();
    const dt =
      lastTimestamp === null
        ? 0
        : Math.min(MAX_FRAME_DELTA, Math.max(0, (now - lastTimestamp) / 1000));
    lastTimestamp = now;

    scene.update(dt);
    scene.render(ctx);

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(loop);
    }
  }

  loop();
  console.log('[Guiyuan] 场景树对局初始化成功！');
}

// 自动执行启动
initMiniGame();
