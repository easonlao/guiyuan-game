import { Polarity, TianGanInfo, WuXing } from '../core/types/domain.js';
import { THEME } from './theme.js';
import { CharacterActionState, ImpactEffect } from './types.js';

export const WUXING_PALETTE: Record<
  WuXing,
  { name: string; main: string; light: string; dark: string }
> = {
  [WuXing.WOOD]: { name: '木', main: '#63ba8c', light: '#b4e7be', dark: '#294f42' },
  [WuXing.FIRE]: { name: '火', main: '#e38c70', light: '#ffd0aa', dark: '#653e37' },
  [WuXing.EARTH]: { name: '土', main: '#c3a16a', light: '#ecdbab', dark: '#60543a' },
  [WuXing.METAL]: { name: '金', main: '#cbd5cd', light: '#f5f1de', dark: '#5e7378' },
  [WuXing.WATER]: { name: '水', main: '#75b4cb', light: '#bce4eb', dark: '#315363' },
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

/** 角色绘图的逻辑单位（屏幕像素 / 逻辑单位），曲线直接绘制到最终尺寸。 */
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
 * 全身卡通修士：保留历史绘制入口和逻辑坐标契约，曲线直接落到屏幕尺寸。
 * 己方为束髻玉袍弈者，对方为银发云肩天道；七态共享身体比例，各自改变手势和表情。
 */
export function drawPixelCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isPlayer: boolean,
  state: CharacterActionState,
  animTick: number,
): void {
  const p = CHARACTER_PIXEL_SIZE;
  const dir = isPlayer ? 1 : -1;
  const bob: Record<CharacterActionState, number> = {
    idle: Math.sin(animTick * 0.08) * 2,
    attack: -2,
    cast: Math.sin(animTick * 0.06) * 1.5,
    hurt: 2,
    celebrate: -Math.abs(Math.sin(animTick * 0.12)) * 3,
    win: Math.sin(animTick * 0.08) * 1.5,
    lose: 2,
  };
  const ink = '#203c40';
  const robe = isPlayer ? '#4b9b86' : '#648da0';
  const shade = isPlayer ? '#2c665c' : '#3e6178';
  const light = isPlayer ? '#b5dfc4' : '#c5e1df';
  const hair = isPlayer ? '#263c43' : '#e2ede8';
  const hairShade = isPlayer ? '#45606a' : '#9eb9bc';
  const skin = '#f5d9ba';
  const gold = '#d8b876';
  // Points and quadratic control points are expressed in the existing logical coordinates.
  type Point = readonly [number, number];
  type Curve = readonly [number, number, number, number];
  const shape = (points: readonly (Point | Curve)[], color: string, outline = true): void => {
    ctx.beginPath();
    const first = points[0];
    ctx.moveTo(first[0] * p * dir, first[1] * p);
    for (const point of points.slice(1)) {
      if (point.length === 2) ctx.lineTo(point[0] * p * dir, point[1] * p);
      else ctx.quadraticCurveTo(point[0] * p * dir, point[1] * p, point[2] * p * dir, point[3] * p);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (outline) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  };
  const oval = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: string,
    outline = false,
  ): void => {
    shape(
      [
        [cx - rx, cy],
        [cx - rx, cy - ry, cx, cy - ry],
        [cx + rx, cy - ry, cx + rx, cy],
        [cx + rx, cy + ry, cx, cy + ry],
        [cx - rx, cy + ry, cx - rx, cy],
      ],
      color,
      outline,
    );
  };
  const line = (points: readonly Point[], color: string, width = 1.2): void => {
    ctx.beginPath();
    ctx.moveTo(points[0][0] * p * dir, points[0][1] * p);
    for (const point of points.slice(1)) ctx.lineTo(point[0] * p * dir, point[1] * p);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  ctx.save();
  ctx.translate(x, y + bob[state]);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Long silver hair sits behind the cloud collar; the player has a tied ribbon instead.
  if (!isPlayer) {
    shape(
      [
        [-4.8, -10],
        [-7, -8, -6.1, 4.5],
        [-4.2, 3.8],
        [-3.4, -7],
        [3.4, -7],
        [4.3, 4.7],
        [6.8, 4.1, 5.7, -9],
      ],
      hair,
    );
    line(
      [
        [-5.2, -5],
        [-5.3, 2.7],
      ],
      hairShade,
    );
    line(
      [
        [4.8, -5],
        [5.1, 3],
      ],
      hairShade,
    );
  } else {
    shape(
      [
        [-2.8, -8],
        [-5, -5, -4.3, 2],
        [-3.2, 0.7],
        [-2.3, -5],
      ],
      shade,
    );
  }
  const spread = state === 'celebrate' ? 0.8 : 0;
  oval(-2.9 - spread, 10.2, 1.8, 1.1, ink, true);
  oval(2.9 + spread, 10.2, 1.8, 1.1, ink, true);
  line(
    [
      [-4 - spread, 10.4],
      [-2.1 - spread, 10.4],
    ],
    gold,
  );
  line(
    [
      [2.1 + spread, 10.4],
      [4 + spread, 10.4],
    ],
    gold,
  );
  // Flared hem, overlapping front panel and gently tapered shoulder line.
  shape(
    [
      [-3.6, 1],
      [-5.2, 5, -6.1, 9],
      [-2.2, 10, 0, 9.6],
      [3.8, 10, 6.1, 9],
      [5.1, 5, 3.6, 1],
    ],
    shade,
  );
  shape(
    [
      [-3.4, 1.2],
      [-4.3, 5.5, -4.7, 8.9],
      [0, 9.7, 4.9, 8.9],
      [3.6, 5.3, 2.8, 1.2],
    ],
    robe,
  );
  shape(
    [
      [0, 2],
      [0.2, 6, -0.8, 9.2],
      [1.1, 9.4, 2.3, 9.1],
      [1.8, 5, 1.2, 2],
    ],
    light,
    false,
  );
  line(
    [
      [-4.8, 8.7],
      [-1.1, 9.1],
    ],
    gold,
  );
  line(
    [
      [2.5, 9],
      [4.9, 8.6],
    ],
    gold,
  );
  line(
    [
      [-2.6, 4],
      [-3.3, 7.6],
    ],
    shade,
  );
  shape(
    [
      [-2.3, -4.8],
      [-4.5, -4.7, -4.8, -2.2],
      [-3.9, 2.5],
      [3.9, 2.5],
      [4.8, -2.2],
      [4.2, -4.8, 2.1, -4.8],
    ],
    robe,
  );
  oval(0, -5.1, 1.2, 1.3, skin, true);
  // Cross collar reads as cloth rather than a vertical stripe.
  shape(
    [
      [-2.6, -4.8],
      [-1.5, -3.5, 1.3, -1.4],
      [2.7, -4.8],
      [1.2, -4.2],
      [0, -2.7],
      [-1.4, -4.6],
    ],
    light,
    false,
  );
  line(
    [
      [-2.4, -4.5],
      [1.1, -1.4],
      [0.4, 1.5],
    ],
    shade,
  );
  if (!isPlayer) {
    shape(
      [
        [-4.4, -4.1],
        [-3.7, -5.3, -2.5, -4.5],
        [-1.4, -3.4],
        [-3.3, -2.5],
        [-4.4, -3],
      ],
      light,
    );
    shape(
      [
        [4.4, -4.1],
        [3.7, -5.3, 2.5, -4.5],
        [1.4, -3.4],
        [3.3, -2.5],
        [4.4, -3],
      ],
      light,
    );
  }
  shape(
    [
      [-4, 1.4],
      [4, 1.4],
      [3.9, 2.5],
      [-3.9, 2.5],
    ],
    shade,
  );
  oval(0, 1.9, 0.8, 0.7, gold, true);
  line(
    [
      [1.8, 2.5],
      [2.1, 4.4],
    ],
    gold,
  );
  oval(2.1, 4.8, 0.65, 0.9, light, true);

  // Sleeves are tapered cloth shapes, cuffs follow the wrist instead of square arms.
  const arm = (side: number, wristX: number, wristY: number): void => {
    const shoulderX = side * 3.7;
    const dx = wristX - shoulderX;
    const dy = wristY + 3.2;
    const length = Math.hypot(dx, dy);
    const nx = -dy / length;
    const ny = dx / length;
    shape(
      [
        [shoulderX + nx * 1.2, -3.2 + ny * 1.2],
        [
          shoulderX + dx * 0.55 + nx * 2.1,
          -3.2 + dy * 0.55 + ny * 2.1,
          wristX + nx * 1.25,
          wristY + ny * 1.25,
        ],
        [wristX - nx * 1.25, wristY - ny * 1.25],
        [
          shoulderX + dx * 0.45 - nx * 1.9,
          -3.2 + dy * 0.45 - ny * 1.9,
          shoulderX - nx * 1.2,
          -3.2 - ny * 1.2,
        ],
      ],
      side > 0 ? robe : shade,
    );
    line(
      [
        [wristX + nx * 1.2, wristY + ny * 1.2],
        [wristX - nx * 1.2, wristY - ny * 1.2],
      ],
      gold,
      1.8,
    );
    oval(wristX + (dx / length) * 0.65, wristY + (dy / length) * 0.65, 0.85, 1, skin, true);
  };
  // Head and hair share the lowered head position for defeated / hurt expressions.
  const drop = state === 'lose' ? 1.2 : state === 'hurt' ? 0.4 : 0;
  ctx.save();
  ctx.translate(0, drop * p);
  oval(-4.3, -7.8, 0.8, 1.2, skin, true);
  oval(4.3, -7.8, 0.8, 1.2, skin, true);
  shape(
    [
      [-4.4, -10.5],
      [-3.6, -12.5, 0, -12.5],
      [4, -12.4, 4.5, -10.1],
      [4.8, -6.4, 2.5, -5.2],
      [0, -4.3, -2.4, -5.2],
      [-4.8, -6.4, -4.4, -10.5],
    ],
    skin,
  );
  oval(-2.8, -6.8, 0.8, 0.35, '#e9b8a0');
  oval(2.9, -6.8, 0.8, 0.35, '#e9b8a0');
  if (isPlayer) {
    oval(-1.1, -13.2, 1.9, 0.8, hair, true);
    shape(
      [
        [-4.5, -8.3],
        [-5.2, -12.5, -1.4, -12.6],
        [2.8, -13.3, 4.5, -10.5],
        [4.9, -9.1, 4.3, -8.2],
        [3.4, -8.8, 2.7, -10.4],
        [1.4, -9.1, 0.1, -9.7],
        [-1.2, -10.4],
        [-2.6, -8.9, -3.5, -9.5],
        [-4.5, -8.3],
      ],
      hair,
    );
    line(
      [
        [-2.7, -11.4],
        [-0.7, -11.9],
        [1.1, -11.5],
      ],
      hairShade,
    );
    line(
      [
        [-2.8, -13.1],
        [1.3, -13.1],
      ],
      gold,
      2,
    );
    oval(1.5, -13.1, 0.45, 0.45, light);
  } else {
    shape(
      [
        [-4.5, -7.5],
        [-5.7, -12, -1.1, -12.8],
        [2.9, -13, 4.5, -10.8],
        [5.4, -8.8, 4.6, -7.3],
        [3.8, -8.5, 3.1, -10.5],
        [1.9, -9.3, 0.4, -9.8],
        [-0.7, -10.6],
        [-2.8, -8.8, -3.8, -9.2],
        [-4.5, -7.5],
      ],
      hair,
    );
    line(
      [
        [-3.6, -11.2],
        [-1.5, -11.8],
      ],
      hairShade,
    );
    line(
      [
        [0.8, -11.9],
        [2.8, -11],
      ],
      hairShade,
    );
    shape(
      [
        [-0.6, -11.7],
        [0, -12.5],
        [0.6, -11.7],
        [0, -11],
      ],
      gold,
      false,
    );
  }
  const happy = state === 'celebrate' || state === 'win';
  const closed = state === 'hurt' || state === 'lose' || state === 'cast';
  for (const ex of [-1.9, 2]) {
    const ey = -7.9;
    if (happy)
      line(
        [
          [ex - 0.65, ey + 0.2],
          [ex, ey - 0.35],
          [ex + 0.65, ey + 0.2],
        ],
        ink,
        1.6,
      );
    else if (closed)
      line(
        [
          [ex - 0.65, ey],
          [ex, ey + 0.2],
          [ex + 0.65, ey],
        ],
        ink,
        1.5,
      );
    else {
      oval(ex, ey, 0.62, 0.85, ink);
      oval(ex + 0.16, ey - 0.28, 0.19, 0.25, '#fff8e9');
    }
    line(
      [
        [ex - 0.65, -9],
        [ex + 0.6, state === 'attack' ? -8.7 : -9.1],
      ],
      hairShade,
    );
  }
  line(
    [
      [0.2, -7.1],
      [0.55, -6.9],
    ],
    '#ce9d82',
    1,
  );
  if (happy)
    shape(
      [
        [-0.7, -6.2],
        [0, -5.3, 0.9, -6.2],
      ],
      '#ac6c59',
      false,
    );
  else
    line(
      [
        [-0.5, -6.1],
        [0.7, state === 'lose' ? -6.3 : -6.1],
      ],
      '#ac6c59',
      1.2,
    );
  ctx.restore();

  switch (state) {
    case 'idle':
      arm(-1, -5.8, 2.4);
      arm(1, 5.8, 2.4);
      break;
    case 'attack':
      arm(-1, -6.2, 0.2);
      arm(1, 8.8, -2.8);
      break;
    case 'cast':
      arm(-1, -1.1, -2.6);
      arm(1, 1.1, -2.6);
      oval(0, -3.5, 0.55, 0.55, gold);
      break;
    case 'hurt':
      arm(-1, -4.5, -9.4);
      arm(1, 4.5, -9.4);
      break;
    case 'celebrate':
      arm(-1, -6.4, -11.8);
      arm(1, 6.4, -11.8);
      line(
        [
          [-8, -9.3],
          [-8, -8],
        ],
        gold,
        1.8,
      );
      line(
        [
          [8, -10.3],
          [8, -9],
        ],
        gold,
        1.8,
      );
      break;
    case 'win':
      arm(-1, -5.1, -0.5);
      arm(1, 6.4, -11.8);
      break;
    case 'lose':
      arm(-1, -6, 3.7);
      arm(1, 6, 3.7);
      break;
    default: {
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
  radius = 25,
): void {
  const elemCfg = WUXING_PALETTE[tg.element] ?? WUXING_PALETTE[WuXing.WOOD];
  const polarityName = tg.polarity === Polarity.YANG ? '阳' : '阴';
  ctx.save();
  ctx.fillStyle = THEME.deep;
  ctx.strokeStyle = elemCfg.main;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = THEME.ivory;
  ctx.font = `bold ${Math.min(22, radius)}px ${THEME.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tg.name, centerX, centerY - 5);
  ctx.fillStyle = elemCfg.light;
  ctx.font = `11px ${THEME.font}`;
  if (radius >= 22) ctx.fillText(`${elemCfg.name} · ${polarityName}`, centerX, centerY + 14);
  ctx.restore();
  void animTick;
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
