/**
 * 文本宽度估算（Layer 3 表现层共用）：按钮自动尺寸与横幅折行必须用同一口径，
 * 否则同一句文案会「在按钮里放得下、在横幅里溢出」。
 *
 * 口径：等宽字体下 CJK 实际约 1em、ASCII 约 0.6em（典型 duo-space 字体）。
 * 这里统一按**上界**估算——全角取 1.2 倍字号、其余取 0.6 倍——宁可早折行、按钮略宽，
 * 也不让文字溢出容器。
 */

/** 全角字符的宽度系数（含留白余量，CJK 实际约 1em）。 */
const FULL_WIDTH_RATIO = 1.2;
/** 半角字符的宽度系数（等宽字体 ASCII 常见 advance 约 0.6em）。 */
const HALF_WIDTH_RATIO = 0.6;

/**
 * 粗略判定全角字符：码点 ≥ U+2E80（CJK 部首补充区起点）的字符按全角计，
 * 覆盖 CJK 标点（【】、（））、汉字、假名与 emoji；ASCII 与 `·` 等按半角处理。
 */
function isFullWidth(char: string): boolean {
  return (char.codePointAt(0) ?? 0) >= 0x2e80;
}

/**
 * 估算文本宽度的上界：全角按 1.2 倍字号、其余按 0.6 倍累加。
 *
 * 先数个数再乘，不做逐字累加：逐字累加会让「10 个半角字 × 0.6 × 14」浮点误差积成
 * 84.00000000000001，`Math.ceil` 后凭空多出一个像素。
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let fullWidthCount = 0;
  let totalCount = 0;
  for (const char of text) {
    totalCount += 1;
    if (isFullWidth(char)) {
      fullWidthCount += 1;
    }
  }
  const halfWidthCount = totalCount - fullWidthCount;
  return (fullWidthCount * FULL_WIDTH_RATIO + halfWidthCount * HALF_WIDTH_RATIO) * fontSize;
}
