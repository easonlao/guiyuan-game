import { NodeLevel, Polarity, TianGanInfo, WuXing } from '../core/types/domain';
import { AnimationMode, CharacterActionState, FlyingProjectile, ImpactEffect, TouchButton } from './types';

export const WUXING_PALETTE: Record<WuXing, { name: string; main: string; light: string; dark: string }> = {
  [WuXing.WOOD]: { name: '木', main: '#38a169', light: '#68d391', dark: '#22543d' },
  [WuXing.FIRE]: { name: '火', main: '#e53e3e', light: '#fc8181', dark: '#742a2a' },
  [WuXing.EARTH]: { name: '土', main: '#d69e2e', light: '#f6e05e', dark: '#744210' },
  [WuXing.METAL]: { name: '金', main: '#e2e8f0', light: '#ffffff', dark: '#718096' },
  [WuXing.WATER]: { name: '水', main: '#3182ce', light: '#63b3ed', dark: '#2a4365' },
};

/** 绘制像素块 */
export function drawPixelRect(
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
}

/** 绘制复古像素边框矩形 */
export function drawPixelBox(
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  bgColor: string,
  borderColor: string,
  pixelSize: number = 2
): void {
  // 底色
  drawPixelRect(ctx, x, y, w, h, bgColor);
  // 上下边框
  drawPixelRect(ctx, x, y, w, pixelSize, borderColor);
  drawPixelRect(ctx, x, y + h - pixelSize, w, pixelSize, borderColor);
  // 左右边框
  drawPixelRect(ctx, x, y, pixelSize, h, borderColor);
  drawPixelRect(ctx, x + w - pixelSize, y, pixelSize, h, borderColor);
}

/**
 * 绘制 16-bit 像素角色 (程序化网格渲染)
 */
export function drawPixelCharacter(
  ctx: any,
  x: number,
  y: number,
  isPlayer: boolean,
  state: CharacterActionState,
  animTick: number
): void {
  const p = 3; // 每个逻辑像素的屏幕像素大小

  // 呼吸/微动偏移
  let bobY = 0;
  if (state === 'idle') {
    bobY = Math.sin(animTick * 0.08) * 3;
  } else if (state === 'attack') {
    bobY = -2;
  } else if (state === 'hurt') {
    bobY = 4;
  }

  // 角色基础色彩
  const robeColor = isPlayer ? '#3182ce' : '#805ad5';
  const robeTrim = isPlayer ? '#63b3ed' : '#b794f4';
  const skinColor = '#fed7aa';
  const hairColor = isPlayer ? '#1a202c' : '#edf2f7';
  const beltColor = isPlayer ? '#d69e2e' : '#e53e3e';

  ctx.save();
  ctx.translate(x, y + bobY);
  if (!isPlayer) {
    ctx.scale(-1, 1); // 敌方水平镜像朝左
  }

  // 1. 发髻 / 飘发
  drawPixelRect(ctx, -p * 2, -p * 11, p * 4, p * 3, hairColor);
  if (!isPlayer) {
    // 敌方白发披肩
    drawPixelRect(ctx, -p * 4, -p * 8, p * 2, p * 6, hairColor);
  } else {
    // 玩家道士发簪
    drawPixelRect(ctx, 0, -p * 12, p * 2, p * 2, '#d69e2e');
  }

  // 2. 脸部与眼睛
  drawPixelRect(ctx, -p * 3, -p * 8, p * 6, p * 5, skinColor);
  const eyeColor = isPlayer ? '#2d3748' : '#e53e3e';
  drawPixelRect(ctx, p * 1, -p * 7, p * 1.5, p * 1.5, eyeColor);

  // 3. 躯干道袍
  drawPixelRect(ctx, -p * 4, -p * 3, p * 8, p * 7, robeColor);
  drawPixelRect(ctx, -p * 1, -p * 3, p * 2, p * 7, robeTrim);

  // 4. 腰带
  drawPixelRect(ctx, -p * 4, p * 1, p * 8, p * 2, beltColor);

  // 5. 飘拂下摆
  drawPixelRect(ctx, -p * 5, p * 4, p * 10, p * 5, robeColor);
  drawPixelRect(ctx, -p * 3, p * 9, p * 6, p * 2, '#1a202c'); // 鞋履

  // 6. 手臂与动作
  if (state === 'attack') {
    // 出掌推拳向前
    drawPixelRect(ctx, p * 3, -p * 2, p * 6, p * 3, robeColor);
    drawPixelRect(ctx, p * 8, -p * 2, p * 3, p * 3, skinColor);
  } else if (state === 'cast') {
    // 举手结印
    drawPixelRect(ctx, p * 2, -p * 6, p * 3, p * 5, robeColor);
    drawPixelRect(ctx, p * 2, -p * 8, p * 3, p * 2, skinColor);
  } else if (state === 'hurt') {
    // 受击抱头/后退
    drawPixelRect(ctx, -p * 3, -p * 5, p * 3, p * 4, robeColor);
  } else {
    // 待机自然垂放
    drawPixelRect(ctx, p * 2, -p * 1, p * 2.5, p * 4, robeColor);
  }

  ctx.restore();
}

/**
 * 绘制五行灵核 (含阴/阳两仪状态)
 */
export function drawWuXingSeal(
  ctx: any,
  x: number,
  y: number,
  radius: number,
  element: WuXing,
  yinLevel: NodeLevel,
  yangLevel: NodeLevel,
  isGuiYi: boolean,
  animTick: number
): void {
  const cfg = WUXING_PALETTE[element];

  // 1. 底盘背景
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // 2. 阴侧 (左半环) 与 阳侧 (右半环) 状态渲染
  const drawHalfArc = (isLeft: boolean, level: NodeLevel) => {
    ctx.save();
    ctx.beginPath();
    const startAngle = isLeft ? Math.PI * 0.5 : -Math.PI * 0.5;
    const endAngle = isLeft ? Math.PI * 1.5 : Math.PI * 0.5;
    ctx.arc(x, y, radius - 2, startAngle, endAngle);

    if (level === -1) {
      // 道损: 暗红裂纹
      ctx.strokeStyle = '#742a2a';
      ctx.lineWidth = 4;
      ctx.stroke();
    } else if (level === 0) {
      // 虚空: 暗灰虚线
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (level === 1) {
      // 点亮: 五行本色
      ctx.strokeStyle = cfg.main;
      ctx.lineWidth = 4;
      ctx.stroke();
    } else if (level === 2) {
      // 加持: 高光流金
      ctx.strokeStyle = '#f6e05e';
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    ctx.restore();
  };

  drawHalfArc(true, yinLevel);   // 左: 阴
  drawHalfArc(false, yangLevel); // 右: 阳

  // 3. 归一状态：中央旋转灵光光核
  if (isGuiYi) {
    ctx.save();
    const rot = animTick * 0.05;
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = '#ecc94b';
    ctx.lineWidth = 2;
    ctx.strokeRect(-radius * 0.4, -radius * 0.4, radius * 0.8, radius * 0.8);
    ctx.restore();
  }

  // 4. 五行文字 (木/火/土/金/水)
  ctx.fillStyle = cfg.light;
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cfg.name, x, y);

  // 5. 阴/阳指示微标
  ctx.font = '8px monospace';
  ctx.fillStyle = yinLevel > 0 ? '#9ae6b4' : (yinLevel === -1 ? '#feb2b2' : '#6b7280');
  ctx.fillText('阴', x - radius - 5, y);
  ctx.fillStyle = yangLevel > 0 ? '#9ae6b4' : (yangLevel === -1 ? '#feb2b2' : '#6b7280');
  ctx.fillText('阳', x + radius + 5, y);
}

/**
 * 绘制复古像素动作按钮
 */
export function drawTouchButton(
  ctx: any,
  btn: TouchButton,
  isSelected: boolean
): void {
  const borderColor = btn.isBurst ? '#f6e05e' : (isSelected ? '#63b3ed' : '#4b5563');
  const bgColor = isSelected ? '#2d3748' : '#1a202c';

  drawPixelBox(ctx, btn.x, btn.y, btn.width, btn.height, bgColor, borderColor, 2);

  // 按钮标题
  ctx.fillStyle = btn.color;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(btn.label, btn.x + btn.width / 2, btn.y + 20);

  // 按钮说明
  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px monospace';
  ctx.fillText(btn.subLabel, btn.x + btn.width / 2, btn.y + 36);
}

/** 绘制中央天元区天干符文 (支持方案A像素与方案B流光) */
export function drawCenterTianGanRune(
  ctx: any,
  centerX: number,
  centerY: number,
  tg: TianGanInfo,
  mode: AnimationMode,
  animTick: number
): void {
  const elemCfg = WUXING_PALETTE[tg.element] ?? WUXING_PALETTE[WuXing.WOOD];
  const polarityName = tg.polarity === Polarity.YANG ? '阳' : '阴';
  const floatY = Math.sin(animTick * 0.08) * 3;
  const boxY = centerY + floatY;

  ctx.save();

  if (mode === 'pixel') {
    // 方案 A: 16-bit 像素风格
    // 1. 八角像素法阵轮廓
    const ringRadius = 38;
    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 2;
    ctx.strokeRect(centerX - ringRadius, boxY - ringRadius, ringRadius * 2, ringRadius * 2);

    // 2. 悬浮像素灵气微粒 (4 颗环绕转动)
    for (let i = 0; i < 4; i++) {
      const angle = animTick * 0.06 + (i * Math.PI) / 2;
      const px = centerX + Math.cos(angle) * 32;
      const py = boxY + Math.sin(angle) * 32;
      drawPixelRect(ctx, px - 2, py - 2, 4, 4, elemCfg.light);
    }

    // 3. 符石像素双层框
    const boxSize = 50;
    drawPixelBox(ctx, centerX - boxSize / 2, boxY - boxSize / 2, boxSize, boxSize, '#171e2e', elemCfg.main, 2);
    // 内衬高光边框
    drawPixelRect(ctx, centerX - boxSize / 2 + 4, boxY - boxSize / 2 + 4, boxSize - 8, 2, elemCfg.light);

    // 4. 天干文字 (像素粗体与硬阴影)
    ctx.fillStyle = '#0a0d14';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tg.name, centerX + 1, boxY + 1);

    ctx.fillStyle = elemCfg.light;
    ctx.fillText(tg.name, centerX, boxY);

    // 5. 底部像素属性微标
    const tagW = 46;
    const tagH = 16;
    const tagY = boxY + boxSize / 2 + 4;
    drawPixelBox(ctx, centerX - tagW / 2, tagY, tagW, tagH, '#111827', elemCfg.dark, 1);
    ctx.fillStyle = elemCfg.light;
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`${elemCfg.name}·${polarityName}`, centerX, tagY + tagH / 2);
  } else {
    // 方案 B: 柔和流光气劲风格
    // 1. 径向发光光晕 (柔和呼吸)
    const glowRadius = 46 + Math.sin(animTick * 0.08) * 5;
    const grad = ctx.createRadialGradient(centerX, boxY, 8, centerX, boxY, glowRadius);
    grad.addColorStop(0, elemCfg.light + '66');
    grad.addColorStop(0.6, elemCfg.main + '22');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(centerX, boxY, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // 2. 旋转太极两仪外环
    ctx.save();
    ctx.translate(centerX, boxY);
    ctx.rotate(animTick * 0.02);
    ctx.strokeStyle = elemCfg.main + '99';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = elemCfg.light + 'cc';
    ctx.beginPath();
    ctx.arc(0, 0, 30, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 3. 灵玉法印主体 (圆盘玉牌)
    ctx.fillStyle = '#162032';
    ctx.beginPath();
    ctx.arc(centerX, boxY, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = elemCfg.light;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. 文字光芒
    ctx.save();
    ctx.shadowColor = elemCfg.light;
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tg.name, centerX, boxY);
    ctx.restore();

    // 5. 底部微标胶囊
    const tagW = 48;
    const tagH = 18;
    const tagY = boxY + 28;
    ctx.fillStyle = '#111827dd';
    ctx.strokeStyle = elemCfg.main;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(centerX - tagW / 2, tagY, tagW, tagH, 9);
    } else {
      ctx.rect(centerX - tagW / 2, tagY, tagW, tagH);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = elemCfg.light;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${elemCfg.name}·${polarityName}`, centerX, tagY + tagH / 2);
  }

  ctx.restore();
}

/** 绘制飞行的吸收能量 */
export function drawFlyingEnergy(
  ctx: any,
  flyer: FlyingProjectile
): void {
  ctx.save();
  const { currentX, currentY, color, lightColor, mode, trail } = flyer;

  if (mode === 'pixel') {
    // 方案 A: 16-bit 像素颗粒尾迹与核心
    trail.forEach((t) => {
      ctx.globalAlpha = Math.max(0, t.alpha);
      const s = t.size || 3;
      drawPixelRect(ctx, t.x - s / 2, t.y - s / 2, s, s, color);
    });
    ctx.globalAlpha = 1;

    // 核心像素菱形星斑
    const cx = Math.floor(currentX);
    const cy = Math.floor(currentY);
    drawPixelRect(ctx, cx - 4, cy - 2, 8, 4, color);
    drawPixelRect(ctx, cx - 2, cy - 4, 4, 8, color);
    drawPixelRect(ctx, cx - 2, cy - 2, 4, 4, lightColor);
    drawPixelRect(ctx, cx - 1, cy - 1, 2, 2, '#ffffff');
  } else {
    // 方案 B: 流光气劲游龙尾迹
    if (trail.length > 1) {
      for (let i = 0; i < trail.length - 1; i++) {
        const p1 = trail[i];
        const p2 = trail[i + 1];
        const progressRatio = i / trail.length;
        const lineWidth = 2 + progressRatio * 7;
        ctx.strokeStyle = color;
        ctx.globalAlpha = p1.alpha * 0.7;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    // 核心柔和光球
    ctx.globalAlpha = 1;
    const grad = ctx.createRadialGradient(currentX, currentY, 2, currentX, currentY, 14);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, lightColor);
    grad.addColorStop(0.8, color + '88');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(currentX, currentY, 14, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** 绘制受击/吸收到达冲击效果 */
export function drawImpactEffect(
  ctx: any,
  impact: ImpactEffect
): void {
  ctx.save();
  const { x, y, radius, maxRadius, color, lightColor, alpha, mode } = impact;
  ctx.globalAlpha = Math.max(0, alpha);

  if (mode === 'pixel') {
    // 方案 A: 八方向像素爆裂火花
    const sparkCount = 8;
    const sparkDist = radius;
    for (let i = 0; i < sparkCount; i++) {
      const angle = (i * Math.PI * 2) / sparkCount;
      const sx = x + Math.cos(angle) * sparkDist;
      const sy = y + Math.sin(angle) * sparkDist;
      drawPixelRect(ctx, sx - 2, sy - 2, 4, 4, i % 2 === 0 ? lightColor : color);
    }
    if (radius < maxRadius * 0.4) {
      drawPixelRect(ctx, x - 5, y - 5, 10, 10, '#ffffff');
    }
  } else {
    // 方案 B: 柔和冲击波涟漪扩散
    ctx.strokeStyle = lightColor;
    ctx.lineWidth = 3 * (1 - radius / maxRadius) + 1;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, lightColor + '44');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** 绘制动效方案切换控制栏 */
export function drawModeToggleBar(
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  mode: AnimationMode
): void {
  const isPixel = mode === 'pixel';
  const borderColor = isPixel ? '#f6e05e' : '#4fd1c5';
  const activeColor = isPixel ? '#f6e05e' : '#38b2ac';
  drawPixelBox(ctx, x, y, w, h, '#1a202c', borderColor, 2);

  ctx.fillStyle = '#a0aec0';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('动效对比: ', x + 12, y + h / 2);

  ctx.fillStyle = activeColor;
  ctx.font = 'bold 12px monospace';
  const label = isPixel ? '【 方案 A: 16-bit 像素粒子轨 】' : '【 方案 B: 柔光气劲流线轨 】';
  ctx.fillText(label, x + 72, y + h / 2);

  ctx.fillStyle = '#63b3ed';
  ctx.textAlign = 'right';
  ctx.font = '10px monospace';
  ctx.fillText('⇄ 点此切换', x + w - 12, y + h / 2);
}

