// ============================================
// 游戏引擎核心控制器（权威服务器架构）
// ============================================
// 职责：
// - 协调各模块协作
// - 管理游戏会话状态
// - 处理动画与逻辑的时序同步
// - 驱动游戏主流程
// - 发送操作命令到服务器
// ============================================

import EventBus from '../bus/EventBus.js';
import StateManager from '../state/StateManager.js';
import SyncManager from '../network/SyncManager.js';
import CommandSender from '../network/CommandSender.js';
import AuthorityExecutor from '../network/AuthorityExecutor.js';
import GameCommand, { ActionType, CommandType } from '../network/GameCommand.js';
import { getCurrentUserId } from '../network/supabaseClient.js';
import { GAME_EVENTS } from '../types/events.js';
import { STEMS_LIST, STEMS_MAP } from '../config/game-config.js';

import GameSequence from './flow/GameSequence.js';
import TurnManager from './flow/TurnManager.js';
import ActionCandidates from './actions/ActionCandidates.js';
import ActionResolver from './actions/ActionResolver.js';
import AIController from './ai/AIController.js';

const GameEngine = {
  activeSession: null,
  _initialized: false,

  init() {
    if (this._initialized) {
      return;
    }
    this._bindEvents();
    this._initialized = true;
  },

  _bindEvents() {
    EventBus.on('game:start', this.startNewGame.bind(this));
    EventBus.on('game:action-selected', this.handleActionSelection.bind(this));
    EventBus.on('game:next-turn', this.startTurn.bind(this));
    EventBus.on('game:generate-stem', this.generateStem.bind(this));
    EventBus.on('anim:initiative-finished', this.onInitiativeFinished.bind(this));
    EventBus.on('ui:request-stem-check', this.checkStemLogic.bind(this));
    EventBus.on('ui:impact-stage1', this.resolveStage1.bind(this));
    EventBus.on('ui:impact-final', this.resolveFinal.bind(this));

    // 权威服务器事件
    EventBus.on('COMMAND:execute', this.executeCommand.bind(this));

    // 保留旧的同步事件（兼容过渡期）
    EventBus.on('sync:opponent-action', this.handleOpponentAction.bind(this));
    EventBus.on('sync:stem', this.handleSyncedStem.bind(this));
  },

  startNewGame(data) {
    GameSequence.startNewGame(data);
  },

  onInitiativeFinished() {
    StateManager.update({ phase: 'PLAYING' });
    setTimeout(() => this.startTurn(), 500);
  },

  startTurn() {
    TurnManager.startTurn();
  },

  generateStem() {
    // 检查是否已经有同步过来的天干
    const state = StateManager.getState();
    if (state.currentStem) {
      EventBus.emit('game:stem-generated', { stem: state.currentStem });
      return;
    }

    // PvP 模式下，如果启用了旧同步，只有当前回合玩家生成天干
    if (SyncManager.isEnabled) {
      const isMyTurn = (state.currentPlayer === SyncManager.myRole);
      
      if (!isMyTurn) {
        return;
      }
    }

    const stem = STEMS_LIST[Math.floor(Math.random() * 10)];
    StateManager.update({ currentStem: stem });
    EventBus.emit('game:stem-generated', { stem });

    // 旧同步逻辑（如果仍在使用）
    if (SyncManager.isEnabled) {
      SyncManager.syncStem(stem);
    }
  },

  handleSyncedStem(stem) {
    StateManager.update({ currentStem: stem });
    EventBus.emit('game:stem-generated', { stem });
  },

  /**
   * 检查天干逻辑，决定是自动吸纳还是玩家决策
   */
  checkStemLogic(data) {
    const { stem, playerId } = data;
    const nodeState = StateManager.getNodeState(playerId, stem.element);
    const isYang = (STEMS_MAP[stem.element].yang === stem.name);
    const currentState = isYang ? nodeState.yang : nodeState.yin;

    // PvP 同步逻辑：非当前回合玩家不执行任何逻辑，等待网络同步
    if (SyncManager.isEnabled && playerId !== SyncManager.myPlayerId) {
      return;
    }

    if (currentState < 1) {
      if (SyncManager.isEnabled) {
        // PvP模式下，自动吸纳也视为一种"动作"，需要广播
        EventBus.emit('game:action-selected', {
          type: 'AUTO',
          stem,
          playerId,
          isYang
        });
      } else {
        this._handleAutoAbsorb(stem, playerId, isYang);
      }
    } else {
      this._handlePlayerDecision(playerId, stem.element, isYang, stem);
    }
  },

  /**
   * 处理自动吸纳路径
   * @private
   */
  _handleAutoAbsorb(stem, playerId, isYang) {
    this.activeSession = {
      type: 'AUTO_ABSORB',
      stem, playerId, isYang,
      step: 1
    };
    EventBus.emit('game:perform-fly-action', { stem, playerId, actionType: 'AUTO' });
  },

  /**
   * 处理玩家决策路径
   * @private
   */
  _handlePlayerDecision(playerId, elementIndex, isYang, stem) {
    const decision = ActionCandidates.getAvailableActions(playerId, elementIndex, isYang);

    if (decision.actions.length === 0) {
      this._playSkipAnimation(stem, playerId);
      return;
    }

    if (StateManager.getState().players[playerId].type === 'AI') {
      AIController.execute(decision.actions, stem, playerId, this.handleActionExecution.bind(this));
    } else {
      EventBus.emit('ui:show-decision', { actions: decision.actions, stem });
    }
  },

  /**
   * 播放跳过回合动画
   * @private
   */
  async _playSkipAnimation(stem, playerId) {
    EventBus.emit('game:skip-turn', { stem, playerId });
    setTimeout(() => TurnManager.requestTurnEnd(), 1200);
  },

  /**
   * 处理玩家操作选择（权威服务器架构）
   * @param {Object} action - 操作对象
   */
  async handleActionSelection(action) {
    const state = StateManager.getState();
    const isPvP = (state.gameMode === 0);

    // PvP 模式：发送命令给服务器
    if (isPvP) {
      await this._sendActionCommand(action);
    } else {
      // 单机模式：直接执行
      this.executeAction(action);
    }
  },

  /**
   * 发送操作命令给服务器
   * @private
   */
  async _sendActionCommand(action) {
    const state = StateManager.getState();
    const currentPlayer = state.currentPlayer;
    const stem = state.currentStem;
    const myPlayerId = getCurrentUserId();

    // 创建操作命令
    const command = GameCommand.createActionMove({
      sessionId: TurnManager.currentSessionId,
      playerId: myPlayerId,
      turnNumber: state.turnCount,
      action: action,
      stem: stem
    });

    // 发送命令
    const result = await CommandSender.sendCommand(command);

    if (!result.success) {
      console.error('[GameEngine] 操作命令发送失败:', result.error);
      // TODO: 显示错误提示
    }
  },

  /**
   * 执行操作（服务器确认后或单机模式）
   * @param {Object} action - 操作对象
   */
  executeAction(action) {
    const state = StateManager.getState();
    const currentPlayer = state.currentPlayer;
    const stem = state.currentStem;
    const opponentId = currentPlayer === 'P1' ? 'P2' : 'P1';


    // 处理自动吸纳的特殊情况
    if (action.type === 'AUTO') {
      this.activeSession = {
        type: 'AUTO_ABSORB',
        stem: action.stem || stem,
        playerId: action.playerId || currentPlayer,
        isYang: action.isYang,
        step: 1
      };
      EventBus.emit('game:perform-fly-action', {
        stem: this.activeSession.stem,
        playerId: this.activeSession.playerId,
        actionType: 'AUTO'
      });
      return;
    }

    const secondTarget = this._determineSecondTarget(action, currentPlayer, opponentId);

    this.activeSession = {
      type: 'DECISION_ACTION',
      action, stem, playerId: currentPlayer, secondTarget,
      step: 1
    };

    if (secondTarget) {
      EventBus.emit('game:lock-nodes', {
        playerId: secondTarget.playerId,
        elementIndex: secondTarget.elementIndex
      });
    }

    EventBus.emit('game:perform-fly-action', {
      stem, playerId: currentPlayer,
      actionType: action.type,
      secondaryTarget: secondTarget
    });
  },

  /**
   * 执行命令（权威服务器确认后）
   * @param {Object} data - 命令数据
   */
  executeCommand(data) {
    const { commandId, command, payload } = data;

    switch (command.commandType) {
      case CommandType.ACTION_MOVE:
        // 执行操作
        this.executeAction(payload.action);
        break;

      case CommandType.TURN_END:
        // 回合切换已由 AuthorityExecutor 处理
        break;

      case CommandType.GAME_END:
        // 游戏结束已由 AuthorityExecutor 处理
        break;
    }
  },

  /**
   * 确定次要目标
   * @private
   */
  _determineSecondTarget(action, currentPlayer, opponentId) {
    if (action.type === 'ATK' || action.type === 'BURST_ATK') {
      return {
        playerId: opponentId,
        elementIndex: action.type === 'ATK' ? action.target.elementIndex : action.targetEl
      };
    }
    if (action.type === 'TRANS' || action.type === 'CONVERT') {
      return {
        playerId: currentPlayer,
        elementIndex: action.target.elementIndex
      };
    }
    if (action.type === 'BURST') {
      return {
        playerId: currentPlayer,
        elementIndex: action.targetEl
      };
    }
    return null;
  },

  async resolveStage1() {
    if (!this.activeSession) return;
    const { type, action, stem, playerId, isYang } = this.activeSession;

    if (type === 'AUTO_ABSORB') {
      ActionResolver.applyPlus(playerId, stem.element, isYang, 'AUTO', false);
      this.activeSession = null;

      // ⚠️ 检查：确保是当前回合的玩家才能结束回合
      setTimeout(() => {
        const state = StateManager.getState();
        const myRole = StateManager.getMyRole() || AuthorityExecutor.myRole;

        console.log('[GameEngine] AUTO_ABSORB 完成，检查回合结束:', {
          currentPlayer: state.currentPlayer,
          myRole: myRole,
          stateManagerMyRole: StateManager.getMyRole(),
          authorityExecutorMyRole: AuthorityExecutor.myRole,
          isMyTurn: state.currentPlayer === myRole,
          gameMode: state.gameMode
        });

        // 在PVP模式下，只有当前回合的玩家才能结束回合
        if (state.gameMode === 0 && myRole && state.currentPlayer !== myRole) {
          console.warn('[GameEngine] 不是当前回合，跳过回合结束。当前:', state.currentPlayer, '我的角色:', myRole);
          return;
        }

        console.log('[GameEngine] 当前回合玩家，尝试结束回合');
        TurnManager.requestTurnEnd();
      }, 800);
    } else if (type === 'DECISION_ACTION' && (action.type === 'BURST_ATK' || action.type === 'BURST')) {
      ActionResolver.applyMinus(playerId, stem.element, action.type === 'BURST_ATK', action.type, false);
    }
  },

  /**
   * 处理最终撞击（飞到终点）
   */
  resolveFinal() {
    if (!this.activeSession) {
      return;
    }

    const { action, playerId, secondTarget } = this.activeSession;
    const opponentId = playerId === 'P1' ? 'P2' : 'P1';

    this._executeActionLogic(action, playerId, opponentId);

    const savedActionType = action.type;
    this.activeSession = null;

    this._handlePostAction(playerId, savedActionType);
  },

  /**
   * 执行动作的具体逻辑
   * @private
   */
  _executeActionLogic(action, playerId, opponentId) {
    switch (action.type) {
      case 'CONVERT':
        ActionResolver.applyPlus(action.target.playerId, action.target.elementIndex, action.target.isYang, 'CONVERT', false);
        break;

      case 'ATK':
        ActionResolver.applyMinus(action.target.playerId, action.target.elementIndex, action.target.isYang, 'ATK', true);
        break;

      case 'TRANS':
        ActionResolver.applyPlus(action.target.playerId, action.target.elementIndex, action.target.isYang, 'TRANS', false);
        break;

      case 'BURST_ATK':
        const tElAtk = action.targetEl;
        for (let i = 0; i < 2; i++) {
          const cands = ActionCandidates.getMinusCandidates(opponentId, tElAtk);
          if (cands.length > 0) {
            ActionResolver.applyMinus(cands[0].playerId, cands[0].elementIndex, cands[0].isYang, 'BURST_ATK', true);
          }
        }
        break;

      case 'BURST':
        const tElBst = action.targetEl;
        for (let i = 0; i < 2; i++) {
          const cands = ActionCandidates.getPlusCandidates(playerId, tElBst);
          if (cands.length > 0) {
            ActionResolver.applyPlus(cands[0].playerId, cands[0].elementIndex, cands[0].isYang, 'BURST', false);
          }
        }
        break;
    }
  },

  /**
   * 处理动作后的回合逻辑
   * @private
   */
  async _handlePostAction(playerId, actionType) {
    const isBurstAction = (actionType === 'BURST' || actionType === 'BURST_ATK');
    const currentState = StateManager.getState();
    const hasBurstBonus = currentState.players[playerId].burstBonus;

    if (isBurstAction && hasBurstBonus) {
      StateManager.update({
        players: {
          ...currentState.players,
          [playerId]: {
            ...currentState.players[playerId],
            burstBonus: false
          }
        }
      });
      setTimeout(() => this.startTurn(), 1000);
    } else {
      setTimeout(() => TurnManager.requestTurnEnd(), 1000);
    }
  },

  /**
   * 处理对手的同步操作（PvP 模式）
   * @param {Object} action - 对手的动作数据
   */
  handleOpponentAction(action) {
    const state = StateManager.getState();
    const opponentId = state.currentPlayer === 'P1' ? 'P2' : 'P1';
    const stem = action.stem || state.currentStem;

    // 确定次要目标
    const myPlayerId = state.currentPlayer === 'P1' ? 'P1' : 'P2';
    const secondTarget = this._determineSecondTarget(action, opponentId, myPlayerId);

    // 锁定节点（如果有次要目标）
    if (secondTarget) {
      EventBus.emit('game:lock-nodes', {
        playerId: secondTarget.playerId,
        elementIndex: secondTarget.elementIndex
      });
    }

    // 触发对手的动作动画
    EventBus.emit('game:perform-fly-action', {
      stem,
      playerId: opponentId,
      actionType: action.type,
      secondaryTarget: secondTarget,
      isOpponent: true
    });

    // 保存会话信息用于后续处理
    this.activeSession = {
      type: 'OPPONENT_ACTION',
      action, stem, playerId: opponentId, secondTarget,
      step: 1
    };

    // 延迟后执行逻辑更新（等动画完成后）
    setTimeout(() => {
      this._executeActionLogic(action, opponentId, myPlayerId);

      // 清理会话
      this.activeSession = null;
    }, 1200);
  }
};

export default GameEngine;
