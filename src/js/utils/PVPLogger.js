/**
 * PVP 专用日志系统
 *
 * 使用方法：
 * 1. 在代码中导入: import { pvpLog, pvpError, pvpWarn } from './utils/PVPLogger.js';
 * 2. 在浏览器控制台输入: window.PVP_DEBUG = true 开启 PVP 专用模式
 * 3. 在浏览器控制台输入: window.PVP_DEBUG = false 恢复正常模式
 *
 * PVP 专用模式下，只会显示 PVP 相关的日志
 */

// PVP 相关的日志前缀
const PVP_PREFIXES = [
  '[RoomManager]',
  '[SyncManager]',
  '[Supabase]',
  '[CommandSender]',
  '[AuthorityExecutor]',
  '[GameSequence]',
  '[StateSnapshot]',
  '[Reconnection]',
  '[WaitingOverlay]'
];

// 保存原始的 console 方法
const originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console)
};

// 是否启用 PVP 专用模式
let isPVPMode = false;

// 初始化 PVP 调试模式
export function initPVPDebug() {
  // 全局开关
  Object.defineProperty(window, 'PVP_DEBUG', {
    get() {
      return isPVPMode;
    },
    set(value) {
      isPVPMode = value;
      if (value) {
        originalConsole.log('%c🎮 PVP 调试模式已开启 - 只显示 PVP 相关日志', 'color: #00ff00; font-weight: bold; font-size: 14px;');
        originalConsole.log('%c提示: 设置 window.PVP_DEBUG = false 可恢复正常模式', 'color: #888;');
      } else {
        originalConsole.log('%c🎮 PVP 调试模式已关闭 - 恢复所有日志', 'color: #ff9900; font-weight: bold;');
      }
    },
    enumerable: true,
    configurable: true
  });

  // 拦截 console.log
  console.log = function(...args) {
    const message = args[0];

    // 在 PVP 模式下，只显示 PVP 相关的日志
    if (isPVPMode) {
      if (typeof message === 'string') {
        const isPVPRelated = PVP_PREFIXES.some(prefix => message.includes(prefix));
        if (isPVPRelated) {
          originalConsole.log(...args);
        }
      } else {
        // 非字符串消息在 PVP 模式下不显示（除非是错误）
        return;
      }
    } else {
      // 正常模式显示所有日志
      originalConsole.log(...args);
    }
  };

  // 拦截 console.error（总是显示）
  console.error = function(...args) {
    originalConsole.error(...args);
  };

  // 拦截 console.warn
  console.warn = function(...args) {
    const message = args[0];

    if (isPVPMode) {
      if (typeof message === 'string') {
        const isPVPRelated = PVP_PREFIXES.some(prefix => message.includes(prefix));
        if (isPVPRelated) {
          originalConsole.warn(...args);
        }
      }
    } else {
      originalConsole.warn(...args);
    }
  };

  // 拦截 console.info
  console.info = function(...args) {
    const message = args[0];

    if (isPVPMode) {
      if (typeof message === 'string') {
        const isPVPRelated = PVP_PREFIXES.some(prefix => message.includes(prefix));
        if (isPVPRelated) {
          originalConsole.info(...args);
        }
      }
    } else {
      originalConsole.info(...args);
    }
  };

}

/**
 * PVP 专用日志方法 - 总是显示，不受模式影响
 */
export function pvpLog(...args) {
  originalConsole.log(...args);
}

export function pvpError(...args) {
  originalConsole.error(...args);
}

export function pvpWarn(...args) {
  originalConsole.warn(...args);
}

/**
 * 清除控制台
 */
export function clearConsole() {
  originalConsole.clear();
}

/**
 * 获取当前 PVP 调试状态
 */
export function isPVPDebug() {
  return isPVPMode;
}

export default {
  initPVPDebug,
  pvpLog,
  pvpError,
  pvpWarn,
  clearConsole,
  isPVPDebug
};
