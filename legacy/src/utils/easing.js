// ============================================
// 缓动函数库
// ============================================
// 职责：
// - 提供常用的缓动函数
// - 用于动画和过渡效果
// ============================================

/**
 * 缓动函数映射表
 */
const EasingFunctions = {
  linear: t => t,
  easeIn: t => t * t,
  easeOut: t => t * (2 - t),
  easeInOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  easeInCubic: t => t * t * t,
  easeOutCubic: t => --t * t * t + 1,
  easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInQuart: t => t * t * t * t,
  easeOutQuart: t => 1 - --t * t * t * t,
  easeInOutQuart: t => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t,
  easeInQuint: t => t * t * t * t * t,
  easeOutQuint: t => 1 + --t * t * t * t * t * t,
  easeInOutQuint: t => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t * t
};

/**
 * 获取缓动函数
 * @param {string} name - 缓动函数名称
 * @returns {function} 缓动函数
 */
export function getEasing(name) {
  return EasingFunctions[name] || EasingFunctions.linear;
}

/**
 * 导出所有缓动函数
 */
export const easing = {
  linear: EasingFunctions.linear,
  easeIn: EasingFunctions.easeIn,
  easeOut: EasingFunctions.easeOut,
  easeInOut: EasingFunctions.easeInOut,
  easeInCubic: EasingFunctions.easeInCubic,
  easeOutCubic: EasingFunctions.easeOutCubic,
  easeInOutCubic: EasingFunctions.easeInOutCubic
};

export default EasingFunctions;
