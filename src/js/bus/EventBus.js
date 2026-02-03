// ============================================
// 事件总线 - 核心协调器
// ============================================
// 职责：
// - 核心协调器，连接所有模块
// - 发布-订阅模式实现解耦
// - 事件日志追踪
// ============================================

const EventBus = {
  events: {},
  log: true, // 开发环境开启事件日志

  /**
   * 订阅事件
   * @param {string} event - 事件名称
   * @param {function} callback - 回调函数
   */
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);

    if (this.log) console.log(`[EventBus] 订阅: ${event}`);
  },

  /**
   * 触发事件
   * @param {string} event - 事件名称
   * @param {*} data - 事件数据
   */
  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(cb => cb(data));

      if (this.log) {
        console.log(`[EventBus] 触发: ${event}`, data);
      }
    }
  },

  /**
   * 取消订阅
   * @param {string} event - 事件名称
   * @param {function} callback - 回调函数
   */
  off(event, callback) {
    if (this.events[event]) {
      this.events[event] = this.events[event]
        .filter(cb => cb !== callback);

      if (this.log) console.log(`[EventBus] 取消订阅: ${event}`);
    }
  },

  /**
   * 一次性订阅
   * @param {string} event - 事件名称
   * @param {function} callback - 回调函数
   */
  once(event, callback) {
    const wrapper = (data) => {
      callback(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }
};

export default EventBus;
