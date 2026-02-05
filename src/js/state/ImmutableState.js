/**
 * 轻量级不可变状态管理
 * 不依赖外部库，实现高效的不可变更新
 */

/**
 * 深度合并对象（不可变）
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @returns {Object} 新对象
 */
export function deepMerge(target, source) {
  if (source === null || typeof source !== 'object') {
    return source;
  }

  if (Array.isArray(source)) {
    return [...source];
  }

  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (sourceValue === null || typeof sourceValue !== 'object') {
        result[key] = sourceValue;
      } else if (Array.isArray(sourceValue)) {
        result[key] = [...sourceValue];
      } else if (targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        result[key] = deepMerge({}, sourceValue);
      }
    }
  }

  return result;
}

/**
 * 更新嵌套对象的指定路径
 * @param {Object} obj - 原对象
 * @param {string} path - 点分隔的路径（如 'player.health'）
 * @param {*} value - 新值
 * @returns {Object} 新对象
 */
export function updatePath(obj, path, value) {
  const keys = path.split('.');
  const result = { ...obj };
  let current = result;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    } else {
      current[key] = { ...current[key] };
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
  return result;
}

/**
 * 批量更新（减少中间对象创建）
 * @param {Object} obj - 原对象
 * @param {Array} updates - 更新数组 [{path, value}, ...]
 * @returns {Object} 新对象
 */
export function batchUpdate(obj, updates) {
  let result = { ...obj };

  for (const { path, value } of updates) {
    result = updatePath(result, path, value);
  }

  return result;
}

/**
 * 浅拷贝对象（用于简单更新）
 * @param {Object} obj - 原对象
 * @returns {Object} 新对象
 */
export function shallowCopy(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return [...obj];
  }
  return { ...obj };
}
