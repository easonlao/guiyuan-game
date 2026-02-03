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
import { supabase } from './supabaseClient.js';
import GameCommand, { ActionType, CommandType } from './GameCommand.js';
import StateManager from '../state/StateManager.js';
import GameEngine from '../logic/GameEngine.js';

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
    console.log('[AuthorityExecutor] 初始化权威命令执行器...');
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
    console.log('[AuthorityExecutor] 设置会话:', { sessionId, playerId, role });

    this.cleanup();

    this.currentSessionId = sessionId;
    this.myPlayerId = playerId;
    this.myRole = role;

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

    console.log('[AuthorityExecutor] 订阅对手命令...');

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

    // 只处理已确认的命令
    if (newRecord.status !== 'confirmed') {
      return;
    }

    const commandId = newRecord.command_id;
    const playerId = newRecord.player_id;
    const commandType = newRecord.command_type;

    // ⚠️ 特殊处理：INITIATIVE 命令需要执行者（P1）也处理，用于更新数据库和发出完成事件
    const isOwnInitiativeCommand = (playerId === this.myPlayerId && commandType === 'INITIATIVE');

    // 跳过自己的命令（除了 INITIATIVE）
    if (!isOwnInitiativeCommand && playerId === this.myPlayerId) {
      return;
    }

    if (isOwnInitiativeCommand) {
      console.log('[AuthorityExecutor] ====== 处理自己的 INITIATIVE 命令 (INSERT) ======');
    } else {
      console.log('[AuthorityExecutor] ====== 收到对手命令 (INSERT) ======');
    }
    console.log('[AuthorityExecutor] commandId:', commandId);
    console.log('[AuthorityExecutor] playerId:', playerId);
    console.log('[AuthorityExecutor] type:', commandType);

    // 防止重复执行
    if (this.executedCommands.has(commandId)) {
      console.log('[AuthorityExecutor] 命令已执行，跳过');
      return;
    }

    // 添加到执行队列
    this.executionQueue.push({
      commandId,
      playerId,
      commandType: newRecord.command_type,
      turnNumber: newRecord.turn_number,
      payload: newRecord.payload
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

    console.log('[AuthorityExecutor] ====== 收到对手命令 ======');
    console.log('[AuthorityExecutor] commandId:', commandId);
    console.log('[AuthorityExecutor] playerId:', playerId);
    console.log('[AuthorityExecutor] type:', newRecord.command_type);

    // 防止重复执行
    if (this.executedCommands.has(commandId)) {
      console.log('[AuthorityExecutor] 命令已执行，跳过');
      return;
    }

    // 添加到执行队列
    this.executionQueue.push({
      commandId,
      playerId,
      commandType: newRecord.command_type,
      turnNumber: newRecord.turn_number,
      payload: newRecord.payload
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

    console.log('[AuthorityExecutor] ====== 执行自己的命令 ======');
    console.log('[AuthorityExecutor] 摘要:', GameCommand.getSummary(command));

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
        console.log(`[AuthorityExecutor] 回合不匹配，等待当前回合完成。当前: ${currentTurn}, 需要: ${task.turnNumber}`);
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

    console.log('[AuthorityExecutor] 执行命令:', commandType, 'by', playerId);

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

    console.log('[AuthorityExecutor] ✓ 命令执行完成');
  },

  /**
   * 执行操作命令
   * @private
   */
  async _executeActionMove(playerId, payload) {
    const { action, stem } = payload;

    console.log('[AuthorityExecutor] 执行操作:', action.type, 'by', playerId);

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

    console.log('[AuthorityExecutor] 执行回合切换 by', playerId);
    console.log('[AuthorityExecutor] 新回合:', finalState.turnCount);
    console.log('[AuthorityExecutor] 当前玩家:', finalState.currentPlayer);

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

    console.log('[AuthorityExecutor] ✓ 回合切换完成');
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
    const { firstPlayer, firstStem } = payload;

    console.log('[AuthorityExecutor] 先手判定:', firstPlayer, 'by', playerId);
    if (firstStem) {
      console.log('[AuthorityExecutor] 初始天干:', firstStem.name);
    }

    // ⚠️ 关键修复：先更新数据库，再更新本地状态
    // 只有房主（P1）需要同步更新数据库
    if (this.myRole === 'P1' && this.currentSessionId) {
      const { update } = await import('./supabaseClient.js');
      await update('game_sessions', {
        current_player: firstPlayer,
        status: 'playing'  // 确保游戏状态为 playing
      }, {
        match: { id: this.currentSessionId }
      });
      console.log('[AuthorityExecutor] ✓ 数据库已更新 current_player:', firstPlayer);
    }

    // 数据库更新完成后，再更新本地状态
    StateManager.update({ 
      currentPlayer: firstPlayer,
      currentStem: firstStem || null
    });
    console.log('[AuthorityExecutor] ✓ 本地状态已更新 currentPlayer:', firstPlayer);

    if (this.myRole === 'P1') {
      // P1 发出 game:initiative-completed 事件
      // BoardAnimation 收到后会显示结果，然后发出 anim:initiative-finished
      EventBus.emit('game:initiative-completed', {
        winner: firstPlayer,
        isHost: true
      });
      console.log('[AuthorityExecutor] P1 发出 game:initiative-completed');
    } else {
      // P2 直接触发游戏开始（不经过动画）
      console.log('[AuthorityExecutor] P2 直接触发游戏开始');
      EventBus.emit('anim:initiative-finished');

      // 重置启动标志
      const GameSequence = (await import('../logic/flow/GameSequence.js')).default;
      GameSequence._isStarting = false;
    }

    console.log('[AuthorityExecutor] ✓ 先手判定完成');
  },

  /**
   * 清理资源
   */
  cleanup() {
    console.log('[AuthorityExecutor] 清理资源...');

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
