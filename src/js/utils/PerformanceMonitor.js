/**
 * 性能监控系统
 * 收集FPS、内存、网络延迟等指标
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      fps: [],
      memory: [],
      networkLatency: []
    };
    this.isMonitoring = false;
    this.frames = 0;
    this.lastFrameTime = performance.now();
  }

  /**
   * 开始监控
   */
  start() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;
    this.frames = 0;
    this.lastFrameTime = performance.now();

    // FPS监控
    this._monitorFPS();

    // 内存监控（仅Chrome支持）
    if (performance.memory) {
      this._monitorMemory();
    }
  }

  /**
   * 监控FPS
   * @private
   */
  _monitorFPS() {
    const measureFPS = (currentTime) => {
      if (!this.isMonitoring) return;

      this.frames++;
      const elapsed = currentTime - this.lastFrameTime;

      if (elapsed >= 1000) {
        const fps = Math.round((this.frames * 1000) / elapsed);
        this.metrics.fps.push({
          value: fps,
          timestamp: currentTime
        });

        // 保持最近60秒的数据
        if (this.metrics.fps.length > 60) {
          this.metrics.fps.shift();
        }

        this.frames = 0;
        this.lastFrameTime = currentTime;
      }

      requestAnimationFrame(measureFPS);
    };

    requestAnimationFrame(measureFPS);
  }

  /**
   * 监控内存
   * @private
   */
  _monitorMemory() {
    const interval = setInterval(() => {
      if (!this.isMonitoring) {
        clearInterval(interval);
        return;
      }

      const memory = performance.memory;
      this.metrics.memory.push({
        used: memory.usedJSHeapSize / 1048576, // MB
        total: memory.totalJSHeapSize / 1048576,
        limit: memory.jsHeapSizeLimit / 1048576,
        timestamp: Date.now()
      });

      if (this.metrics.memory.length > 60) {
        this.metrics.memory.shift();
      }
    }, 1000);
  }

  /**
   * 记录网络延迟
   * @param {number} latency - 延迟（毫秒）
   */
  recordNetworkLatency(latency) {
    this.metrics.networkLatency.push({
      value: latency,
      timestamp: Date.now()
    });

    if (this.metrics.networkLatency.length > 100) {
      this.metrics.networkLatency.shift();
    }
  }

  /**
   * 获取性能报告
   * @returns {Object} 性能报告
   */
  getReport() {
    const avgFPS = this._average(this.metrics.fps.map(m => m.value));
    const avgMemory = this._average(this.metrics.memory.map(m => m.used));
    const avgLatency = this._average(this.metrics.networkLatency.map(m => m.value));

    return {
      fps: {
        average: avgFPS,
        current: this.metrics.fps[this.metrics.fps.length - 1]?.value || 0,
        samples: this.metrics.fps.length
      },
      memory: {
        average: avgMemory,
        current: this.metrics.memory[this.metrics.memory.length - 1]?.used || 0,
        samples: this.metrics.memory.length
      },
      network: {
        average: avgLatency,
        current: this.metrics.networkLatency[this.metrics.networkLatency.length - 1]?.value || 0,
        samples: this.metrics.networkLatency.length
      }
    };
  }

  /**
   * 计算平均值
   * @private
   */
  _average(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * 停止监控
   */
  stop() {
    this.isMonitoring = false;
  }

  /**
   * 清空所有指标
   */
  clear() {
    this.metrics = {
      fps: [],
      memory: [],
      networkLatency: []
    };
    this.frames = 0;
  }
}

export default new PerformanceMonitor();
