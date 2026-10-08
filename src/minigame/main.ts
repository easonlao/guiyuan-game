import { GameManager } from './game-manager';

// 声明微信小游戏全局对象
declare const wx: {
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
  onTouchStart: (callback: (e: any) => void) => void;
};

export function initMiniGame(): void {
  if (typeof wx === 'undefined') {
    console.log('[Guiyuan] 非微信小游戏环境，跳过 Canvas 初始化');
    return;
  }

  const sysInfo = wx.getSystemInfoSync();
  const { windowWidth, windowHeight, pixelRatio } = sysInfo;
  const safeTop = sysInfo.safeArea ? sysInfo.safeArea.top : (sysInfo.statusBarHeight || 20);
  const safeBottom = sysInfo.safeArea ? Math.max(0, windowHeight - sysInfo.safeArea.bottom) : 10;

  const canvas = wx.createCanvas();
  canvas.width = windowWidth * pixelRatio;
  canvas.height = windowHeight * pixelRatio;

  const ctx = canvas.getContext('2d');
  ctx.scale(pixelRatio, pixelRatio);

  const game = new GameManager();
  game.resize(windowWidth, windowHeight, pixelRatio, safeTop, safeBottom);

  console.log('[Guiyuan] 左右对抗像素风对局初始化成功！');

  // 绑定微信触摸输入
  wx.onTouchStart((e: any) => {
    if (e.touches && e.touches.length > 0) {
      const touch = e.touches[0];
      game.handleTouch(touch.clientX, touch.clientY);
    }
  });

  // 主循环
  function loop(): void {
    game.update();
    game.render(ctx);
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(loop);
    }
  }

  loop();
}

// 自动执行启动
initMiniGame();
