// ============================================
// 游戏命令定义和管理
// ============================================
// 职责：
// - 定义所有游戏操作命令格式
// - 提供命令序列化/反序列化方法
// - 验证命令合法性
// ============================================

/**
 * 命令类型枚举
 */
export const CommandType = {
  // 玩家操作命令
  ACTION_MOVE: 'ACTION_MOVE',

  // 回合管理命令
  TURN_END: 'TURN_END',

  // 游戏控制命令
  GAME_END: 'GAME_END',

  // 先手判定命令（PvP 专用）
  INITIATIVE: 'INITIATIVE'
};

/**
 * 操作类型枚举（用于 ACTION_MOVE）
 */
export const ActionType = {
  AUTO: 'AUTO',          // 自动吸纳
  CONVERT: 'CONVERT',    // 化
  ATK: 'ATK',           // 破
  TRANS: 'TRANS',       // 转化
  BURST: 'BURST',       // 强化
  BURST_ATK: 'BURST_ATK' // 强破
};

/**
 * 游戏命令类
 */
class GameCommand {
  /**
   * 创建命令对象
   * @param {Object} params - 命令参数
   * @returns {Object} 命令对象
   */
  static create(params) {
    const {
      sessionId,
      commandType,
      playerId,
      turnNumber,
      payload = {}
    } = params;

    // 生成唯一命令ID（用于幂等性）
    const commandId = this.generateCommandId(playerId, commandType, turnNumber, Date.now());

    return {
      commandId,
      sessionId,
      commandType,
      playerId,
      turnNumber,
      payload,
      timestamp: Date.now()
    };
  }

  /**
   * 生成命令ID
   * @param {string} playerId - 玩家ID
   * @param {string} commandType - 命令类型
   * @param {number} turnNumber - 回合数
   * @param {number} timestamp - 时间戳
   * @returns {string} 命令ID
   */
  static generateCommandId(playerId, commandType, turnNumber, timestamp) {
    // 格式: playerId-commandType-turnNumber-timestamp-random
    const random = Math.random().toString(36).substring(2, 8);
    return `${playerId}-${commandType}-${turnNumber}-${timestamp}-${random}`;
  }

  /**
   * 创建操作命令
   * @param {Object} params - 操作参数
   * @returns {Object} 命令对象
   */
  static createActionMove(params) {
    const { sessionId, playerId, turnNumber, action, stem } = params;

    return this.create({
      sessionId,
      commandType: CommandType.ACTION_MOVE,
      playerId,
      turnNumber,
      payload: {
        action,  // { type, target, ... }
        stem     // { name, element, color, ... }
      }
    });
  }

  /**
   * 创建回合结束命令
   * @param {Object} params - 参数
   * @returns {Object} 命令对象
   */
  static createTurnEnd(params) {
    const { sessionId, playerId, turnNumber, finalState } = params;

    return this.create({
      sessionId,
      commandType: CommandType.TURN_END,
      playerId,
      turnNumber,
      payload: {
        finalState  // 完整的游戏状态快照
      }
    });
  }

  /**
   * 创建游戏结束命令
   * @param {Object} params - 参数
   * @returns {Object} 命令对象
   */
  static createGameEnd(params) {
    const { sessionId, playerId, turnNumber, winner, reason } = params;

    return this.create({
      sessionId,
      commandType: CommandType.GAME_END,
      playerId,
      turnNumber,
      payload: {
        winner,
        reason
      }
    });
  }

  /**
   * 序列化命令（用于传输）
   * @param {Object} command - 命令对象
   * @returns {string} JSON字符串
   */
  static serialize(command) {
    return JSON.stringify(command);
  }

  /**
   * 反序列化命令
   * @param {string} jsonStr - JSON字符串
   * @returns {Object} 命令对象
   */
  static deserialize(jsonStr) {
    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('[GameCommand] 反序列化失败:', error);
      return null;
    }
  }

  /**
   * 验证命令格式合法性（客户端基本验证）
   * @param {Object} command - 命令对象
   * @returns {Object} { valid: boolean, error: string }
   */
  static validate(command) {
    // 必填字段检查（修复：允许 turnNumber = 0）
    const requiredFields = ['commandId', 'sessionId', 'commandType', 'playerId', 'turnNumber'];
    for (const field of requiredFields) {
      if (command[field] === undefined || command[field] === null) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    // 命令类型检查
    if (!Object.values(CommandType).includes(command.commandType)) {
      return { valid: false, error: `Invalid command type: ${command.commandType}` };
    }

    // 回合数检查（允许 0）
    if (typeof command.turnNumber !== 'number' || command.turnNumber < 0) {
      return { valid: false, error: `Invalid turn number: ${command.turnNumber}` };
    }

    // payload 检查
    if (!command.payload || typeof command.payload !== 'object') {
      return { valid: false, error: 'Invalid payload' };
    }

    // 命令类型特定验证
    switch (command.commandType) {
      case CommandType.ACTION_MOVE:
        return this._validateActionMove(command);
      case CommandType.TURN_END:
        return this._validateTurnEnd(command);
      case CommandType.GAME_END:
        return this._validateGameEnd(command);
      case CommandType.INITIATIVE:
        return this._validateInitiative(command);
    }

    return { valid: true };
  }

  /**
   * 验证操作命令
   * @private
   */
  static _validateActionMove(command) {
    const { action, stem } = command.payload;

    if (!action || !action.type) {
      return { valid: false, error: 'ACTION_MOVE missing action type' };
    }

    if (!Object.values(ActionType).includes(action.type)) {
      return { valid: false, error: `Invalid action type: ${action.type}` };
    }

    if (!stem || typeof stem.element !== 'number') {
      return { valid: false, error: 'ACTION_MOVE has invalid stem' };
    }

    return { valid: true };
  }

  /**
   * 验证回合结束命令
   * @private
   */
  static _validateTurnEnd(command) {
    const { finalState } = command.payload;

    if (!finalState || typeof finalState !== 'object') {
      return { valid: false, error: 'TURN_END missing final state' };
    }

    // ⚠️ 只验证必要的回合信息字段
    const requiredStateFields = ['turnCount', 'currentPlayer', 'currentStem'];
    for (const field of requiredStateFields) {
      if (!(field in finalState)) {
        return { valid: false, error: `TURN_END missing state field: ${field}` };
      }
    }

    return { valid: true };
  }

  /**
   * 验证游戏结束命令
   * @private
   */
  static _validateGameEnd(command) {
    const { winner, reason } = command.payload;

    if (!winner || !['P1', 'P2', 'DRAW'].includes(winner)) {
      return { valid: false, error: `Invalid winner: ${winner}` };
    }

    if (!reason) {
      return { valid: false, error: 'GAME_END missing reason' };
    }

    return { valid: true };
  }

  /**
   * 验证先手判定命令
   * @private
   */
  static _validateInitiative(command) {
    const { firstPlayer } = command.payload;

    if (!firstPlayer || !['P1', 'P2'].includes(firstPlayer)) {
      return { valid: false, error: `Invalid firstPlayer: ${firstPlayer}` };
    }

    return { valid: true };
  }

  /**
   * 克隆命令（用于重试）
   * @param {Object} command - 原命令
   * @returns {Object} 新命令
   */
  static clone(command) {
    return JSON.parse(JSON.stringify(command));
  }

  /**
   * 获取命令摘要（用于日志）
   * @param {Object} command - 命令对象
   * @returns {string} 命令摘要
   */
  static getSummary(command) {
    const { commandType, playerId, turnNumber } = command;

    switch (commandType) {
      case CommandType.ACTION_MOVE:
        const actionType = command.payload.action?.type || 'UNKNOWN';
        return `${playerId} T${turnNumber} ${actionType}`;

      case CommandType.TURN_END:
        return `${playerId} T${turnNumber} TURN_END`;

      case CommandType.GAME_END:
        const winner = command.payload.winner;
        return `${playerId} GAME_END (${winner})`;

      case CommandType.INITIATIVE:
        const firstPlayer = command.payload.firstPlayer;
        return `${playerId} INITIATIVE (${firstPlayer})`;

      default:
        return `${playerId} T${turnNumber} ${commandType}`;
    }
  }
}

export default GameCommand;
