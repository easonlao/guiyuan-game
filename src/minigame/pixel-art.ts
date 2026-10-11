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

/** 角色精灵的逻辑像素尺寸（屏幕像素 / 逻辑像素）：放大靠提高逻辑分辨率重画，不再由视图缩放。 */
export const CHARACTER_PIXEL_SIZE = 4;

/**
 * 角色精灵的包围盒（相对绘制原点的逻辑像素，取全部姿势与呼吸 / 跳跃浮动的并集）。
 * 屏幕尺寸 = 逻辑尺寸 × `CHARACTER_PIXEL_SIZE`；视图据此把角色在头像框内居中。
 */
export const CHARACTER_SPRITE_BOUNDS = {
  left: -10.5,
  right: 10.5,
  top: -15,
  bottom: 12,
} as const;

/**
 * 绘制全身像素角色：原点在腰腹，以 `CHARACTER_PIXEL_SIZE` 为逻辑像素、约 26 逻辑像素高
 * （屏幕上约 100–120px）。七个姿势各自摆姿：待机垂手呼吸、攻击出掌、结印合掌、受击护头，
 * 以及归一庆祝举臂跳跃、终局胜单臂振臂、终局负垂首垂臂。己方朝右、对方朝左（不靠 `ctx.scale` 镜像）。
 */
export function drawPixelCharacter(
  ctx: any,
  x: number,
  y: number,
  isPlayer: boolean,
  state: CharacterActionState,
  animTick: number,
): void {
  const p = CHARACTER_PIXEL_SIZE;
  /** 面向：己方朝右（+1）、对方朝左（-1）。 */
  const dir = isPlayer ? 1 : -1;

  // 呼吸 / 动作浮动（屏幕像素），幅度计入 `CHARACTER_SPRITE_BOUNDS`。
  let bobY: number;
  switch (state) {
    case 'attack':
      bobY = -2;
      break;
    case 'hurt':
      bobY = 2;
      break;
    case 'cast':
      bobY = Math.sin(animTick * 0.06) * 1.5;
      break;
    case 'celebrate':
      bobY = -Math.abs(Math.sin(animTick * 0.12)) * 3;
      break;
    case 'win':
      bobY = Math.sin(animTick * 0.08) * 1.5;
      break;
    case 'lose':
      bobY = 2;
      break;
    case 'idle':
      bobY = Math.sin(animTick * 0.08) * 2;
      break;
    default: {
      // 类型穷举保护：新增姿势必须显式给浮动，不许静默落回待机（与下方手臂分支同一口径）。
      const unhandled: never = state;
      throw new Error(`未处理的角色姿势：${String(unhandled)}`);
    }
  }

  // 角色基础色彩
  const robeColor = isPlayer ? '#3182ce' : '#805ad5';
  const robeTrim = isPlayer ? '#63b3ed' : '#b794f4';
  const robeShade = isPlayer ? '#2c5282' : '#553c9a';
  const skinColor = '#fed7aa';
  const skinShade = '#f6ad55';
  const hairColor = isPlayer ? '#1a202c' : '#edf2f7';
  const eyeColor = isPlayer ? '#2d3748' : '#e53e3e';
  const mouthColor = '#c05621';
  const beltColor = isPlayer ? '#d69e2e' : '#e53e3e';
  const shoeColor = '#1a202c';
  const glowColor = isPlayer ? '#f6e05e' : '#e9d8fd';

  /** 按逻辑像素落笔。 */
  const px = (lx: number, ly: number, lw: number, lh: number, color: string): void => {
    drawPixelRect(ctx, lx * p, ly * p, lw * p, lh * p, color);
  };
  /** 把横向坐标翻到面向的一侧：己方取原值、对方镜像。 */
  const mx = (lx: number, lw: number): number => (dir > 0 ? lx : -lx - lw);

  ctx.save();
  ctx.translate(x, y + bobY);

  // 1. 下装：道袍下摆 + 滚边 + 中缝 + 鞋履（庆祝时双足分开，跳起来）
  px(-6.5, 3.5, 13, 6, robeColor);
  px(-6.5, 8.5, 13, 1, robeTrim);
  px(-1, 3.5, 2, 5, robeTrim);
  if (state === 'celebrate') {
    px(-5.5, 9.5, 3.5, 2, shoeColor);
    px(2, 9.5, 3.5, 2, shoeColor);
  } else {
    px(-4.5, 9.5, 3.5, 2, shoeColor);
    px(1, 9.5, 3.5, 2, shoeColor);
  }

  // 2. 腰带与绦结
  px(-5.5, 2, 11, 2, beltColor);
  px(-1.5, 2, 3, 2.5, robeShade);

  // 3. 躯干道袍（肩线略宽）与交领
  px(-5.5, -4.5, 11, 2, robeColor);
  px(-5, -4.5, 10, 6.5, robeColor);
  px(-2.5, -5, 5, 1.5, robeTrim);
  px(-1, -4.5, 2, 5, robeTrim);

  // 4. 脖颈与头部（垂首时整个头下沉）
  const headDrop = state === 'lose' ? 1.5 : state === 'hurt' ? 0.5 : 0;
  const headY = -13 + headDrop;
  px(-1.5, -6.5, 3, 2, skinShade);
  px(-4.5, headY, 9, 8, skinColor);

  // 5. 发型：己方道髻发簪，对方白发披肩
  px(-5, headY - 1, 10, 2.5, hairColor);
  px(-5, headY + 1.5, 10, 1, hairColor);
  if (isPlayer) {
    px(mx(3, 3), headY + 0.5, 3, 0.75, '#d69e2e');
  } else {
    px(-6.5, headY + 1.5, 2, 9, hairColor);
    px(4.5, headY + 1.5, 2, 9, hairColor);
  }

  // 6. 表情：笑眼（庆祝 / 胜）、闭目（受击 / 负）、常态圆眼
  const eyeX = mx(1, 2);
  if (state === 'celebrate' || state === 'win') {
    px(eyeX - 0.5, headY + 3.5, 1, 0.75, eyeColor);
    px(eyeX + 0.5, headY + 2.75, 1, 0.75, eyeColor);
    px(eyeX + 1.5, headY + 3.5, 1, 0.75, eyeColor);
  } else if (state === 'hurt' || state === 'lose') {
    px(eyeX - 0.5, headY + 3.25, 3, 0.75, eyeColor);
  } else {
    px(eyeX, headY + 2.75, 2, 2, eyeColor);
    px(eyeX + 0.5, headY + 3.25, 0.75, 0.75, '#ffffff');
  }
  if (state === 'celebrate' || state === 'win') {
    px(mx(0, 2), headY + 5.5, 2, 1, mouthColor);
  } else if (state === 'lose') {
    px(mx(0.5, 1.5), headY + 6, 1.5, 0.5, mouthColor);
  } else {
    px(mx(0, 1.5), headY + 6, 1.5, 0.5, mouthColor);
  }

  // 7. 手臂与姿势
  switch (state) {
    case 'attack': {
      // 出掌：前臂向前推出，后臂后摆
      px(mx(4, 4.5), -2.5, 4.5, 3, robeColor);
      px(mx(8.5, 2), -2.5, 2, 3, skinColor);
      px(mx(-7.5, 3), -3.5, 3, 5, robeShade);
      break;
    }
    case 'cast': {
      // 结印：双手于胸前合拢，掌间透出印光
      px(mx(1.5, 2.5), -5, 2.5, 5, robeColor);
      px(mx(-4, 2.5), -5, 2.5, 5, robeShade);
      px(mx(1.5, 2.5), -6.5, 2.5, 1.5, skinColor);
      px(mx(-4, 2.5), -6.5, 2.5, 1.5, skinColor);
      px(mx(-0.5, 1), -7.5, 1, 1, glowColor);
      break;
    }
    case 'celebrate': {
      // 归一庆祝：双臂高举、周身星光
      px(mx(4, 2.5), -12.5, 2.5, 8.5, robeColor);
      px(mx(-6.5, 2.5), -12.5, 2.5, 8.5, robeShade);
      px(mx(4, 2.5), -14, 2.5, 1.5, skinColor);
      px(mx(-6.5, 2.5), -14, 2.5, 1.5, skinColor);
      px(mx(7, 1), -11, 1, 1, glowColor);
      px(mx(-8, 1), -9, 1, 1, glowColor);
      px(mx(6.5, 1), 0.5, 1, 1, glowColor);
      break;
    }
    case 'win': {
      // 终局胜：单臂高举振臂，另一手叉腰
      px(mx(4, 2.5), -12.5, 2.5, 8.5, robeColor);
      px(mx(4, 2.5), -14, 2.5, 1.5, skinColor);
      px(mx(-6.5, 3), -1.5, 3, 4.5, robeColor);
      px(mx(-6.5, 3), -3, 3, 1.5, skinColor);
      break;
    }
    case 'hurt': {
      // 受击：双手护头、身形下挫
      px(mx(3, 3), -11, 3, 6, robeColor);
      px(mx(-6, 3), -11, 3, 6, robeShade);
      px(mx(3, 3), -12.5, 3, 1.5, skinColor);
      px(mx(-6, 3), -12.5, 3, 1.5, skinColor);
      break;
    }
    case 'lose': {
      // 终局负：双臂垂落
      px(mx(5, 2.5), -2, 2.5, 6.5, robeShade);
      px(mx(-7.5, 2.5), -2, 2.5, 6.5, robeShade);
      px(mx(5, 2.5), 4.5, 2.5, 1.5, skinColor);
      px(mx(-7.5, 2.5), 4.5, 2.5, 1.5, skinColor);
      break;
    }
    case 'idle': {
      // 待机：双臂自然垂放
      px(mx(5, 2.5), -4, 2.5, 7, robeColor);
      px(mx(-7.5, 2.5), -4, 2.5, 7, robeShade);
      px(mx(5, 2.5), 3, 2.5, 1.5, skinColor);
      px(mx(-7.5, 2.5), 3, 2.5, 1.5, skinColor);
      break;
    }
    default: {
      // 类型穷举保护：新增姿势必须显式给画法，不许静默落回待机。
      const unhandled: never = state;
      throw new Error(`未处理的角色姿势：${String(unhandled)}`);
    }
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
