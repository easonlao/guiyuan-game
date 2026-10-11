import { Polarity, TianGanInfo, WuXing } from '../core/types/domain.js';
import { CharacterActionState, ImpactEffect } from './types.js';

export const WUXING_PALETTE: Record<
  WuXing,
  { name: string; main: string; light: string; dark: string }
> = {
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
  color: string,
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
  pixelSize: number = 2,
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
  animTick: number,
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

/** 绘制中央天元区天干符文（柔和流光气劲风格） */
export function drawCenterTianGanRune(
  ctx: any,
  centerX: number,
  centerY: number,
  tg: TianGanInfo,
  animTick: number,
): void {
  const elemCfg = WUXING_PALETTE[tg.element] ?? WUXING_PALETTE[WuXing.WOOD];
  const polarityName = tg.polarity === Polarity.YANG ? '阳' : '阴';
  const floatY = Math.sin(animTick * 0.08) * 3;
  const boxY = centerY + floatY;

  ctx.save();

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

  ctx.restore();
}

/** 绘制受击/吸收到达冲击效果（柔和冲击波涟漪扩散） */
export function drawImpactEffect(ctx: any, impact: ImpactEffect): void {
  ctx.save();
  const { x, y, radius, maxRadius, lightColor, alpha } = impact;
  ctx.globalAlpha = Math.max(0, alpha);

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

  ctx.restore();
}
