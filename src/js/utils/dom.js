// ============================================
// DOM 操作工具函数
// ============================================
// 职责：
// - 提供常用的 DOM 操作辅助函数
// - 简化 DOM 查询和操作逻辑
// ============================================

/**
 * 查询选择器
 * @param {string} selector - CSS 选择器
 * @returns {Element|null} DOM 元素
 */
export function querySelector(selector) {
  return document.querySelector(selector);
}

/**
 * 查询所有选择器
 * @param {string} selector - CSS 选择器
 * @returns {NodeList} DOM 元素列表
 */
export function querySelectorAll(selector) {
  return document.querySelectorAll(selector);
}

/**
 * 创建元素
 * @param {string} tag - 标签名
 * @param {Object} attrs - 属性对象
 * @param {string} text - 文本内容
 * @returns {Element} 创建的元素
 */
export function createElement(tag, attrs = {}, text = '') {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') {
      el.classList.add(...value.split(' '));
    } else if (key.startsWith('on')) {
      el.addEventListener(key.substring(2).toLowerCase(), value);
    } else {
      el[key] = value;
    }
  });
  if (text) el.textContent = text;
  return el;
}

/**
 * 设置 CSS 变量
 * @param {string} name - 变量名
 * @param {string} value - 变量值
 * @param {Element} target - 目标元素（默认为 document.documentElement）
 */
export function setCSSVar(name, value, target = document.documentElement) {
  target.style.setProperty(name, value);
}

/**
 * 获取 CSS 变量
 * @param {string} name - 变量名
 * @param {Element} target - 目标元素（默认为 document.documentElement）
 * @returns {string} 变量值
 */
export function getCSSVar(name, target = document.documentElement) {
  return getComputedStyle(target).getPropertyValue(name);
}
