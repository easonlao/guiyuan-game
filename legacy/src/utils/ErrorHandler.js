/**
 * 统一错误处理机制
 * 提供全局错误捕获、分类、记录和用户友好提示
 */
import EventBus from '../bus/EventBus.js';
import Logger from './Logger.js';

const logger = Logger.createModuleLogger('ErrorHandler');

class ErrorHandler {
  constructor() {
    this.errorCallbacks = new Map();
    this.setupGlobalErrorHandlers();
  }

  /**
   * 设置全局错误监听
   */
  setupGlobalErrorHandlers() {
    // 捕获未处理的错误
    window.addEventListener('error', (event) => {
      this.handleError(event.error || new Error(event.message), {
        source: 'global',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    // 捕获未处理的Promise拒绝
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(event.reason || new Error('Unhandled Promise rejection'), {
        source: 'unhandled-promise'
      });
    });
  }

  /**
   * 处理错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 错误上下文
   */
  handleError(error, context = {}) {
    // 记录错误
    this.logError(error, context);

    // 触发注册的回调
    const type = this.getErrorType(error);
    const callbacks = this.errorCallbacks.get(type) || [];
    callbacks.forEach(callback => {
      try {
        callback(error, context);
      } catch (callbackError) {
        logger.error('Error in error callback:', callbackError);
      }
    });

    // 显示用户友好的错误提示
    this.showUserError(error, context);
  }

  /**
   * 获取错误类型
   */
  getErrorType(error) {
    if (error instanceof NetworkError) return 'network';
    if (error instanceof ValidationError) return 'validation';
    if (error instanceof AuthenticationError) return 'auth';
    return 'unknown';
  }

  /**
   * 记录错误
   */
  logError(error, context) {
    const logData = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context
    };

    // 使用 Logger 记录错误（自动根据日志级别输出）
    logger.debug('Error captured:', logData);

    // 可以在这里添加远程日志上报
    // this.reportToRemote(logData);
  }

  /**
   * 显示用户友好的错误提示
   */
  showUserError(error, context) {
    // 根据错误类型显示不同的提示
    const messages = {
      network: '网络连接出现问题，请检查您的网络连接',
      auth: '身份验证失败，请重新登录',
      validation: '输入数据有误，请检查后重试',
      unknown: '发生了未知错误，请稍后重试'
    };

    const type = this.getErrorType(error);
    const message = messages[type] || messages.unknown;

    // 通过EventBus通知UI显示错误
    EventBus.emit('ui:show-error', {
      message,
      type,
      details: window.PVP_DEBUG ? error.message : undefined
    });
  }

  /**
   * 注册错误回调
   */
  onError(type, callback) {
    if (!this.errorCallbacks.has(type)) {
      this.errorCallbacks.set(type, []);
    }
    this.errorCallbacks.get(type).push(callback);
  }

  /**
   * 移除错误回调
   */
  offError(type, callback) {
    if (!this.errorCallbacks.has(type)) return;
    const callbacks = this.errorCallbacks.get(type);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }
}

// 自定义错误类
export class NetworkError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'NetworkError';
    this.details = details;
  }
}

export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

// 导出单例和错误类
export default new ErrorHandler();
