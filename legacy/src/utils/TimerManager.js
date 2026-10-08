/**
 * 定时器管理工具
 * 用于统一管理所有定时器，防止内存泄漏
 */
class TimerManager {
  constructor() {
    this.timers = new Map();
    this.intervals = new Map();
  }

  /**
   * 设置超时定时器
   * @param {string} id - 定时器唯一标识
   * @param {Function} callback - 回调函数
   * @param {number} delay - 延迟时间(ms)
   */
  setTimeout(id, callback, delay) {
    this.clearTimeout(id);
    const timerId = window.setTimeout(() => {
      callback();
      this.timers.delete(id);
    }, delay);
    this.timers.set(id, timerId);
    return timerId;
  }

  /**
   * 设置间隔定时器
   * @param {string} id - 定时器唯一标识
   * @param {Function} callback - 回调函数
   * @param {number} interval - 间隔时间(ms)
   */
  setInterval(id, callback, interval) {
    this.clearInterval(id);
    const intervalId = window.setInterval(callback, interval);
    this.intervals.set(id, intervalId);
    return intervalId;
  }

  /**
   * 清除超时定时器
   */
  clearTimeout(id) {
    const timerId = this.timers.get(id);
    if (timerId) {
      window.clearTimeout(timerId);
      this.timers.delete(id);
    }
  }

  /**
   * 清除间隔定时器
   */
  clearInterval(id) {
    const intervalId = this.intervals.get(id);
    if (intervalId) {
      window.clearInterval(intervalId);
      this.intervals.delete(id);
    }
  }

  /**
   * 清除所有定时器
   */
  clearAll() {
    this.timers.forEach(timerId => window.clearTimeout(timerId));
    this.intervals.forEach(intervalId => window.clearInterval(intervalId));
    this.timers.clear();
    this.intervals.clear();
  }

  /**
   * 获取活跃定时器数量
   */
  getActiveCount() {
    return this.timers.size + this.intervals.size;
  }

  /**
   * 获取所有活跃定时器ID列表（调试用）
   */
  getActiveIds() {
    return {
      timeouts: Array.from(this.timers.keys()),
      intervals: Array.from(this.intervals.keys())
    };
  }
}

// 导出单例
export default new TimerManager();
