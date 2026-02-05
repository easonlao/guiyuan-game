/**
 * 统一日志系统
 * 支持日志级别和条件输出
 */
class Logger {
  constructor() {
    // 从环境变量或URL参数获取日志级别
    this.level = this._getLogLevel();
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3,
      TRACE: 4
    };
  }

  /**
   * 获取日志级别
   */
  _getLogLevel() {
    // 检查URL参数
    const params = new URLSearchParams(window.location.search);
    const logLevel = params.get('log');

    if (logLevel) {
      return this.levels[logLevel.toUpperCase()] || this.levels.INFO;
    }

    // 检查PVP_DEBUG标志
    if (window.PVP_DEBUG) {
      return this.levels.DEBUG;
    }

    // 生产环境默认只显示错误和警告
    return this.levels.WARN;
  }

  /**
   * 判断是否应该输出日志
   */
  _shouldLog(level) {
    return this.level >= this.levels[level];
  }

  /**
   * 格式化日志前缀
   */
  _formatPrefix(module, level) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    return `[${timestamp}] [${level}] [${module}]`;
  }

  /**
   * 输出日志
   */
  _log(module, level, args) {
    if (!this._shouldLog(level)) return;

    const prefix = this._formatPrefix(module, level);
    const method = level === 'ERROR' ? 'error' :
                   level === 'WARN' ? 'warn' : 'log';

    console[method](prefix, ...args);
  }

  error(module, ...args) {
    this._log(module, 'ERROR', args);
  }

  warn(module, ...args) {
    this._log(module, 'WARN', args);
  }

  info(module, ...args) {
    this._log(module, 'INFO', args);
  }

  debug(module, ...args) {
    this._log(module, 'DEBUG', args);
  }

  trace(module, ...args) {
    this._log(module, 'TRACE', args);
  }

  /**
   * 创建模块专属的logger
   */
  createModuleLogger(moduleName) {
    return {
      error: (...args) => this.error(moduleName, ...args),
      warn: (...args) => this.warn(moduleName, ...args),
      info: (...args) => this.info(moduleName, ...args),
      debug: (...args) => this.debug(moduleName, ...args),
      trace: (...args) => this.trace(moduleName, ...args)
    };
  }

  /**
   * 设置日志级别
   */
  setLevel(level) {
    if (typeof level === 'string') {
      this.level = this.levels[level.toUpperCase()] || this.levels.INFO;
    } else {
      this.level = level;
    }
  }

  /**
   * 获取当前日志级别
   */
  getLevel() {
    return this.level;
  }
}

export default new Logger();
