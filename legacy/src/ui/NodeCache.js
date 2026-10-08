/**
 * 节点缓存系统
 * 避免重复创建相同结构的DOM元素
 */
class NodeCache {
  constructor() {
    this.cache = new Map();
  }

  /**
   * 获取或创建节点
   * @param {string} key - 缓存键
   * @param {Function} factory - 创建函数
   * @returns {HTMLElement}
   */
  getOrCreate(key, factory) {
    if (!this.cache.has(key)) {
      const node = factory();
      this.cache.set(key, node);
    }
    return this.cache.get(key);
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   */
  get size() {
    return this.cache.size;
  }

  /**
   * 检查是否存在缓存
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * 删除特定缓存
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * 获取缓存键列表
   */
  keys() {
    return Array.from(this.cache.keys());
  }
}

export default new NodeCache();
