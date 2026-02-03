// ============================================
// 权威命令执行器
// ============================================
// 职责：
// - 订阅对手命令（通过 Realtime）
// - 执行对手命令
// - 执行自己已确认的命令
// - 确保命令按正确顺序执行
// ============================================

import EventBus from '../bus/EventBus.js';
import { supabase, update } from './supabaseClient.js';
import GameCommand, { ActionType, CommandType } from './GameCommand.js';
import StateManager from '../state/StateManager.js';
import GameEngine from '../logic/GameEngine.js';
import { STEMS_LIST } from '../config/game-config.js';

const AuthorityExecutor = {
  // 当前会话信息
  currentSessionId: null,
  myPlayerId: null,
  myRole: null, // 'P1' or 'P2'

  // 订阅频道
  movesChannel: null,

  // 命令执行队列（确保按回合顺序）
  executionQueue: [],
  isProcessing: false,

  // 已执行的命令ID集合（防止重复执行）
  executedCommands: new Set(),

  /**
   * 初始化
   */
  init() {
    this._bindEvents();
  },

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    // 监听自己的命令执行事件（由 CommandSender 触发）
    EventBus.on('COMMAND:execute', this.handleOwnCommand.bind(this));

    // 监听会话结束
    EventBus.on('game:return-to-menu', this.cleanup.bind(this));
  },

  /**
   * 设置会话信息
   * @param {string} sessionId - 会话ID
   * @param {string} playerId - 玩家ID
   * @param {string} role - 角色 'P1' or 'P2'
   */
  setSession(sessionId, playerId, role) {
    this.cleanup();

    this.currentSessionId = sessionId;
    this.myPlayerId = playerId;
    this.myRole = role;

    console.log('[AuthorityExecutor] 设置会话:', {
      sessionId,
      playerId,
      role,
      myPlayerId: this.myPlayerId,
      myRole: this.myRole
    });

    // 订阅对手命令
    this._subscribeToOpponentCommands();
  },

  /**
   * 订阅对手命令
   * @private
   */
  _subscribeToOpponentCommands() {
    if (!this.currentSessionId) {
      console.warn('[AuthorityExecutor] 无法订阅：未设置会话');
      return;
    }

    // 移除旧订阅
    if (this.movesChannel) {
      supabase.removeChannel(this.movesChannel);
    }

    // 订阅 game_moves 表的状态变化
    this.movesChannel = supabase
      .channel(`opponent_commands:${this.currentSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',  // 监听新命令插入
          schema: 'public',
          table: 'game_moves',
          filter: `session_id=eq.${this.currentSessionId}`
        },
        (payload) => {
          this._handleMoveInsert(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',  // 监听状态变化
          schema: 'public',
          table: 'game_moves',
          filter: `session_id=eq.${this.currentSessionId}`
        },
        (payload) => {
          this._handleMoveUpdate(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',  // 监听会话状态变化（用于 P2 检测游戏开始）
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${this.currentSessionId}`
        },
        (payload) => {
          this._handleSessionUpdate(payload);
        }
      )
      .subscribe((status) => {
        console.log('[AuthorityExecutor] 对手命令订阅状态:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[AuthorityExecutor] ✓ 已订阅对手命令');
        }
      });
  },

  /**
   * 处理会话状态更新（用于 P2 检测游戏开始）
   * @private
   */
  async _handleSessionUpdate(payload) {
    const { new: newRecord, old: oldRecord } = payload;

    // 只处理 phase 变为 PLAYING 的情况
    if (newRecord.current_state?.phase === 'PLAYING' && oldRecord.current_state?.phase !== 'PLAYING') {
      console.log('[AuthorityExecutor] 检测到游戏开始（phase: PLAYING）');

      // 导入 GameEngine 避免循环依赖
      const GameEngine = (await import('../logic/GameEngine.js')).default;

      // 延迟一下，确保状态已更新
      setTimeout(() => GameEngine.onInitiativeFinished(), 500);
    }
  },

  /**
   * 处理命令插入（INSERT 事件）
   * @private
   */
  _handleMoveInsert(payload) {
    const { new: newRecord } = payload;

    const commandId = newRecord.command_id;
    const playerId = newRecord.player_id;
    const commandType = newRecord.command_type;

    // ⚠️ 特殊处理：INITIATIVE 命令在 pending 状态也需要处理（因为可能没有数据库触发器）
    const isInitiativeCommand = (commandType === 'INITIATIVE');
    
    // 只处理已确认的命令，或者 INITIATIVE 命令（pending 状态也处理）
    if (!isInitiativeCommand && newRecord.status !== 'confirmed') {
      return;
    }

    // ⚠️ 特殊处理：INITIATIVE 命令需要执行者（P1）也处理，用于更新数据库和发出完成事件
    const isOwnInitiativeCommand = (playerId === this.myPlayerId && commandType === 'INITIATIVE');

    // 跳过自己的命令（除了 INITIATIVE）
    if (!isOwnInitiativeCommand && playerId === this.myPlayerId) {
      return;
    }

    if (isOwnInitiativeCommand) {
      console.log('[AuthorityExecutor] 处理自己的 INITIATIVE 命令');
    } else {
      console.log('[AuthorityExecutor] 收到对手命令:', commandType, 'by', playerId);
    }

    // 防止重复执行
    if (this.executedCommands.has(commandId)) {
      return;
    }

    // 添加到执行队列
    // ⚠️ 重要：确保payload正确解析（数据库可能返回JSON字符串）
    let parsedPayload = newRecord.payload;
    if (typeof parsedPayload === 'string') {
      try {
        parsedPayload = JSON.parse(parsedPayload);
      } catch (e) {
        console.error('[AuthorityExecutor] payload解析失败:', e);
      }
    }

    this.executionQueue.push({
      commandId,
      playerId,
      commandType: newRecord.command_type,
      turnNumber: newRecord.turn_number,
      payload: parsedPayload
    });

    this.executedCommands.add(commandId);

    // 处理队列
    this._processQueue();
  },

  /**
   * 处理命令状态更新
   * @private
   */
  _handleMoveUpdate(payload) {
    const { new: newRecord, old: oldRecord } = payload;

    // 只处理已执行的命令
    if (newRecord.status !== 'executed' || oldRecord.status === 'executed') {
      return;
    }

    const commandId = newRecord.command_id;
    const playerId = newRecord.player_id;

    // 跳过自己的命令（由 COMMAND:execute 事件处理）
    if (playerId === this.myPlayerId) {
      return;
    }

    console.log('[AuthorityExecutor] 收到对手命令:', newRecord.command_type, 'by', playerId);

    // 防止重复执行
    if (this.executedCommands.has(commandId)) {
      return;
    }

    // 添加到执行队列
    // ⚠️ 重要：确保payload正确解析（数据库可能返回JSON字符串）
    let parsedPayload = newRecord.payload;
    if (typeof parsedPayload === 'string') {
      try {
        parsedPayload = JSON.parse(parsedPayload);
      } catch (e) {
        console.error('[AuthorityExecutor] payload解析失败:', e);
      }
    }

    this.executionQueue.push({
      commandId,
      playerId,
      commandType: newRecord.command_type,
      turnNumber: newRecord.turn_number,
      payload: parsedPayload
    });

    this.executedCommands.add(commandId);

    // 处理队列
    this._processQueue();
  },

  /**
   * 处理自己的命令执行
   */
  handleOwnCommand(data) {
    const { commandId, command, payload } = data;

    // 标记为已执行
    this.executedCommands.add(commandId);

    // 添加到执行队列
    this.executionQueue.push({
      commandId,
      playerId: command.playerId,
      commandType: command.commandType,
      turnNumber: command.turnNumber,
      payload: command.payload
    });

    // 处理队列
    this._processQueue();
  },

  /**
   * 处理执行队列
   * @private
   */
  async _processQueue() {
    if (this.isProcessing || this.executionQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    // 按回合排序执行
    this.executionQueue.sort((a, b) => a.turnNumber - b.turnNumber);

    while (this.executionQueue.length > 0) {
      const task = this.executionQueue.shift();

      // 检查回合是否匹配
      const currentTurn = StateManager.getState().turnCount;
      if (task.turnNumber !== currentTurn) {
        // 放回队列头部
        this.executionQueue.unshift(task);
        break;
      }

      // 执行命令
      await this._executeCommand(task);
    }

    this.isProcessing = false;
  },

  /**
   * 执行单个命令
   * @private
   */
  async _executeCommand(task) {
    const { commandId, playerId, commandType, payload } = task;

    switch (commandType) {
      case CommandType.ACTION_MOVE:
        await this._executeActionMove(playerId, payload);
        break;

      case CommandType.TURN_END:
        await this._executeTurnEnd(playerId, payload);
        break;

      case CommandType.GAME_END:
        await this._executeGameEnd(playerId, payload);
        break;

      case CommandType.INITIATIVE:
        await this._executeInitiative(playerId, payload);
        break;

      default:
        console.warn('[AuthorityExecutor] 未知命令类型:', commandType);
    }
  },

  /**
   * 执行操作命令
   * @private
   */
  async _executeActionMove(playerId, payload) {
    const { action, stem } = payload;

    // 判断是自己还是对手
    const isOpponent = (playerId !== this.myPlayerId);

    if (isOpponent) {
      // 执行对手操作（复用现有逻辑）
      await GameEngine.handleOpponentAction(action);
    } else {
      // 执行自己的操作
      await GameEngine.executeAction(action);
    }
  },

  /**
   * 执行回合结束命令
   * @private
   */
  async _executeTurnEnd(playerId, payload) {
    const { finalState } = payload;

    // 静默应用完整状态（防止触发同步循环）
    StateManager.update({
      turnCount: finalState.turnCount,
      currentPlayer: finalState.currentPlayer,
      nodeStates: finalState.nodeStates,
      players: finalState.players,
      currentStem: finalState.currentStem
    }, true);

    // 触发回合切换事件
    EventBus.emit('game:next-turn', {
      fromServer: true,
      newPlayer: finalState.currentPlayer
    });
  },

  /**
   * 执行游戏结束命令
   * @private
   */
  async _executeGameEnd(playerId, payload) {
    const { winner, reason } = payload;

    console.log('[AuthorityExecutor] 游戏结束:', winner, reason);

    // 触发游戏结束事件
    EventBus.emit('game:victory', {
      winner,
      reason
    });

    // 更新状态
    StateManager.update({
      phase: 'GAME_END'
    });
  },

  /**
   * 执行先手判定命令
   * @private
   */
  async _executeInitiative(playerId, payload) {
    let { firstPlayer, firstStem } = payload;

    // ⚠️ 修复：确保firstStem对象完整（从STEMS_LIST中查找）
    if (firstStem) {
      // 如果firstStem只有name属性，从STEMS_LIST中查找完整对象
      if (typeof firstStem === 'object' && firstStem.name) {
        // 检查是否缺少element属性（说明对象不完整）
        if (firstStem.element === undefined || firstStem.color === undefined) {
          const fullStem = STEMS_LIST.find(s => s.name === firstStem.name);
          if (fullStem) {
            firstStem = fullStem;
            console.log('[AuthorityExecutor] 从STEMS_LIST查找完整天干对象:', firstStem.name);
          } else {
            console.warn('[AuthorityExecutor] 未找到天干:', firstStem.name, '使用原始对象');
          }
        }
      }
      // 如果firstStem是字符串，尝试查找
      else if (typeof firstStem === 'string') {
        const fullStem = STEMS_LIST.find(s => s.name === firstStem);
        if (fullStem) {
          firstStem = fullStem;
          console.log('[AuthorityExecutor] 字符串转换为天干对象:', firstStem.name);
        }
      }
    }

    console.log('[AuthorityExecutor] 先手判定:', firstPlayer, '初始天干:', firstStem?.name, 'payload原始:', JSON.stringify(payload.firstStem));

    // ⚠️ 关键修复：先更新数据库，再更新本地状态
    // 只有房主（P1）需要同步更新数据库
    if (this.myRole === 'P1' && this.currentSessionId) {
      await update('game_sessions', {
        current_player: firstPlayer,
        status: 'playing'  // 确保游戏状态为 playing
      }, {
        match: { id: this.currentSessionId }
      });
    }

    // 数据库更新完成后，再更新本地状态
    StateManager.update({ 
      currentPlayer: firstPlayer,
      currentStem: firstStem || null,
      phase: 'INITIATIVE'  // 确保阶段正确
    });

    console.log('[AuthorityExecutor] ✓ 先手判定完成:', firstPlayer);

    // ⚠️ P2需要先播放动画，所以先发送 initiative-start（如果还没发送）
    // P1已经在 GameSequence 中发送了，但P2没有
    if (this.myRole === 'P2') {
      const currentPhase = StateManager.getState().phase;
      if (currentPhase === 'INITIATIVE') {
        // 延迟一下确保状态已更新，然后发送动画开始事件
        setTimeout(() => {
          EventBus.emit('game:initiative-start');
          // 再延迟一下发送完成事件，让动画有时间开始
          setTimeout(() => {
            EventBus.emit('game:initiative-completed', {
              winner: firstPlayer,
              isHost: false
            });
          }, 100);
        }, 100);
        return;
      }
    }

    // P1直接发送完成事件（动画已经在GameSequence中开始）
    EventBus.emit('game:initiative-completed', {
      winner: firstPlayer,
      isHost: this.myRole === 'P1'
    });
  },

  /**
   * 清理资源
   */
  cleanup() {
    // 移除订阅
    if (this.movesChannel) {
      supabase.removeChannel(this.movesChannel);
      this.movesChannel = null;
    }

    // 清空队列
    this.executionQueue = [];
    this.isProcessing = false;

    // 清空已执行集合
    this.executedCommands.clear();

    // 清空会话信息
    this.currentSessionId = null;
    this.myPlayerId = null;
    this.myRole = null;
  }
};

export default AuthorityExecutor;
