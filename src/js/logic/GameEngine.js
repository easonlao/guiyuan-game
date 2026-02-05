// ============================================
// 游戏引擎核心控制器（简化PVP架构）
// ============================================
// 职责：
// - 协调各模块协作
// - 管理游戏会话状态
// - 处理动画与逻辑的时序同步
// - 驱动游戏主流程
// ============================================

import EventBus from '../bus/EventBus.js';
import StateManager from '../state/StateManager.js';
import SimplifiedPVPManager from '../network/SimplifiedPVPManager.js';
import { GAME_EVENTS } from '../types/events.js';
import { STEMS_LIST, STEMS_MAP } from '../config/game-config.js';
import AuthorityExecutor from './AuthorityExecutor.js';
import AIController from './ai/AIController.js';

// 获取 PVP 管理器（在线模式）
function getPVPManager() {
  return SimplifiedPVPManager;
}

import GameSequence from './flow/GameSequence.js';
import TurnManager from './flow/TurnManager.js';
import ActionCandidates from './actions/ActionCandidates.js';
import ActionResolver from './actions/ActionResolver.js';
import PassiveEffects from '../ui/effects/PassiveEffects.js';

const GameEngine = {
  activeSession: null,
  _initialized: false,

  // 调试方法：强制触发跳过动画（测试用）
  debugForceSkip() {
    const state = StateManager.getState();
    if (!state.currentStem) {
      console.error('[GameEngine] 没有当前天干');
      return;
    }
    this._playSkipAnimation(state.currentStem, state.currentPlayer);
  },

  init() {
    if (this._initialized) {
      return;
    }
    AuthorityExecutor.init();
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

    // PVP同步事件
    EventBus.on('sync:opponent-action', this.handleOpponentAction.bind(this));
    EventBus.on('sync:stem', this.handleSyncedStem.bind(this));

    // 主机权威事件
    EventBus.on('authority:action-request', this.handleAuthorityActionRequest.bind(this));
    EventBus.on('authority:skip-turn-request', this.handleSkipTurnRequest.bind(this));
  },

  startNewGame(data) {
    // 初始化 AI 数据收集
    AIController.init(data.mode);
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

    // PvP 模式下，只有主机生成天干
    const pvpManager = getPVPManager();
    if (pvpManager.isEnabled) {
      // 只有主机才能生成天干
      if (!AuthorityExecutor.isHost()) {
        return;
      }

      // 主机使用 AuthorityExecutor 生成天干
      const result = AuthorityExecutor.generateStem();
      if (!result) {
        console.error('[GameEngine] 权威执行器未能生成天干');
        return;
      }

      const { stem, seed } = result;
      StateManager.update({ currentStem: stem });
      EventBus.emit('game:stem-generated', { stem });

      // 广播天干生成（带种子）
      if (pvpManager.sendStemGenerated) {
        pvpManager.sendStemGenerated(stem, seed);
      }
      return;
    }

    // 单机模式：直接生成天干
    const stem = STEMS_LIST[Math.floor(Math.random() * STEMS_LIST.length)];
    StateManager.update({ currentStem: stem });
    EventBus.emit('game:stem-generated', { stem });
  },

  handleSyncedStem(stem) {
    // 只更新状态，不触发事件
    // TurnManager.startTurn() 会检测到 currentStem 并触发 game:stem-generated
    StateManager.update({ currentStem: stem });
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
    const pvpManager = getPVPManager();
    const myRole = pvpManager.getMyRole?.() || pvpManager.myRole;
    if (pvpManager.isEnabled && playerId !== myRole) {
      console.log(`[GameEngine] checkStemLogic: 非当前回合玩家，跳过。当前回合: ${playerId}, 我的角色: ${myRole}`);
      return;
    }

    if (currentState < 1) {
      if (pvpManager.isEnabled) {
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
    const state = StateManager.getState();

    // ⚠️ PvP 模式：只有当前回合玩家才显示决策窗口
    if (state.gameMode === 0) {
      const myRole = StateManager.getMyRole();
      if (myRole !== playerId) {
        console.log(`[GameEngine] 不是${playerId}的回合，跳过决策显示`);
        return;
      }
    }

    const decision = ActionCandidates.getAvailableActions(playerId, elementIndex, isYang);

    if (decision.actions.length === 0) {
      this._playSkipAnimation(stem, playerId);
      return;
    }

    if (state.players[playerId].type === 'AI') {
      AIController.execute(decision.actions, stem, playerId, this.handleActionSelection.bind(this));
    } else {
      EventBus.emit('ui:show-decision', { actions: decision.actions, stem });
    }
  },

  /**
   * 播放跳过回合动画
   * @private
   */
  async _playSkipAnimation(stem, playerId) {
    // 清理 activeSession，避免影响后续操作
    this.activeSession = null;

    // PVP 模式下的主机权威处理
    const state = StateManager.getState();
    if (state.gameMode === 0) {
      const pvpManager = getPVPManager();

      // 客户端：通知主机跳过，等待主机的 turn_sync 消息
      if (!AuthorityExecutor.isHost()) {
        if (pvpManager.requestSkipTurn) {
          pvpManager.requestSkipTurn();
        }
        // 播放跳过动画（视觉效果）
        PassiveEffects.playSkip({ stem, playerId });
        EventBus.emit('game:skip-turn', { stem, playerId });
        return; // 等待主机的 turn_sync 消息
      }

      // 主机：播放跳过动画，延迟后调用 endTurn（会广播 turn_sync）
      PassiveEffects.playSkip({ stem, playerId });
      EventBus.emit('game:skip-turn', { stem, playerId });
      setTimeout(() => TurnManager.endTurn(), 1200);
      return;
    }

    // 单机模式：直接播放动画并结束回合
    PassiveEffects.playSkip({ stem, playerId });
    EventBus.emit('game:skip-turn', { stem, playerId });
    setTimeout(() => TurnManager.endTurn(), 1200);
  },

  /**
   * 处理客户端的跳过回合请求（主机权威）
   */
  handleSkipTurnRequest() {

    // 获取当前状态
    const state = StateManager.getState();
    const stem = state.currentStem;
    const playerId = state.currentPlayer;

    if (!stem) {
      console.error('[GameEngine] 跳过回合时没有天干');
      return;
    }

    // 清理 activeSession
    this.activeSession = null;

    // 播放跳过动画
    PassiveEffects.playSkip({ stem, playerId });
    EventBus.emit('game:skip-turn', { stem, playerId });

    // 延迟后调用 endTurn（主机会广播 turn_sync）
    setTimeout(() => TurnManager.endTurn(), 1200);
  },

  /**
   * 处理玩家的操作请求（主机权威）
   * @param {Object} action - 操作对象
   */
  async handleAuthorityActionRequest(action) {

    // 主机确认操作
    const result = AuthorityExecutor.confirmAction(action);
    if (!result.confirmed) {
      console.error('[GameEngine] 主机拒绝操作:', action.type);
      return;
    }

    // 主机执行操作
    this.executeAction(action);

    // 广播操作确认到双方
    const pvpManager = getPVPManager();
    if (pvpManager.sendActionConfirmed) {
      await pvpManager.sendActionConfirmed(action);
    }
  },

  /**
   * 处理玩家操作选择（主机-客户端架构）
   * @param {Object} action - 操作对象
   */
  async handleActionSelection(action) {
    const state = StateManager.getState();

    // PvP 模式下的请求-确认流程
    if (state.gameMode === 0) {
      const pvpManager = getPVPManager();

      // 客户端：发送操作请求到主机
      if (!AuthorityExecutor.isHost()) {
        if (pvpManager.requestActionConfirmation) {
          await pvpManager.requestActionConfirmation(action);
        }
        return; // 等待主机的确认消息
      }

      // 主机：确认操作并广播
      const result = AuthorityExecutor.confirmAction(action);
      if (!result.confirmed) {
        console.error('[GameEngine] 主机拒绝操作:', action.type);
        return;
      }

      // 主机执行操作
      this.executeAction(action);

      // 广播操作确认到双方
      if (pvpManager.sendActionConfirmed) {
        await pvpManager.sendActionConfirmed(action);
      }
      return;
    }

    // 单机模式：直接执行操作
    this.executeAction(action);
  },

  /**
   * 执行操作（服务器确认后或单机模式）
   * @param {Object} action - 操作对象
   */
  executeAction(action) {
    const state = StateManager.getState();
    const stem = state.currentStem;

    // 使用 executorId 确定执行者，回退到 state.currentPlayer
    const currentPlayer = action.executorId || state.currentPlayer;
    const opponentId = currentPlayer === 'P1' ? 'P2' : 'P1';

      action,
      currentPlayer,
      opponentId,
      actionType: action.type,
      stateCurrentPlayer: state.currentPlayer
    });

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

      type,
      actionType: action?.type,
      playerId,
      turnCount: StateManager.getState().turnCount
    });

    if (type === 'AUTO_ABSORB') {
      ActionResolver.applyPlus(playerId, stem.element, isYang, 'AUTO', false);
      this.activeSession = null;

      // ⚠️ AUTO 动作完成后自动结束回合
      // requestTurnEnd 会处理结算动画和时序
      TurnManager.endTurn();
    } else if (type === 'OPPONENT_ACTION' && action?.type === 'AUTO') {
      // 对手的 AUTO 动作：统一在这里执行逻辑
      const autoYang = (STEMS_MAP[stem.element].yang === stem.name);
      ActionResolver.applyPlus(playerId, stem.element, autoYang, 'AUTO', false);
      this.activeSession = null;

      // ⚠️ 对于对手的 AUTO 动作，需要等待对手的 TURN_END 命令
      // 不要在这里调用 TurnManager.endTurn()
    }
    // 注意：BURST_ATK（强破）和 BURST（强化）的第一阶段不需要执行状态变更
    // 它们的实际效果在 resolveFinal 的 _executeActionLogic 中处理
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
    // 优先使用 activeSession 中保存的 stem，回退到 state.currentStem
    const sessionStem = this.activeSession?.stem;
    const state = StateManager.getState();
    const stem = sessionStem || state.currentStem;
    const isYang = stem && state.players[playerId].burst?.yang;

    switch (action.type) {
      case 'AUTO': {
        // 自动吸纳：天干状态<1时自动飞入
        // 使用本命元素和当前天干的阴阳属性
        const autoYang = (STEMS_MAP[stem.element].yang === stem.name);
        ActionResolver.applyPlus(playerId, stem.element, autoYang, 'AUTO', false);
        break;
      }

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
        // 强破：原子性执行 - 消耗自身阳1点，攻击对方克属性2次
        const tElAtk = action.targetEl;
        ActionResolver.applyBurstAtk(playerId, stem.element, opponentId, tElAtk);
        // 设置标志：下回合保持当前玩家（额外机会）
        // 只有非额外机会回合中的强化/强破才给予额外机会
        const stateForBurstAtk = StateManager.getState();
        AuthorityExecutor.setLastBurstAction(playerId, stateForBurstAtk.isExtraTurn);
        break;

      case 'BURST':
        // 强化：原子性执行 - 消耗自身阴1点，强化自身生属性2次
        const tElBst = action.targetEl;
        ActionResolver.applyBurst(playerId, stem.element, tElBst);
        // 设置标志：下回合保持当前玩家（额外机会）
        // 只有非额外机会回合中的强化/强破才给予额外机会
        const stateForBurst = StateManager.getState();
        AuthorityExecutor.setLastBurstAction(playerId, stateForBurst.isExtraTurn);
        break;
    }
  },

  /**
   * 处理动作后的回合逻辑
   * @private
   */
  async _handlePostAction(playerId, actionType) {
    // 强化/强破后，回合正常结束，通过标志影响下一回合玩家
    TurnManager.endTurn();
  },

  /**
   * 处理对手的同步操作（PvP 模式）
   * @param {Object} action - 对手的动作数据
   * @param {string} actionPlayerId - 执行动作的玩家ID（可选，优先使用 action.executorId）
   */
  handleOpponentAction(action, actionPlayerId = null) {
    const state = StateManager.getState();
    const stem = action.stem || state.currentStem;

    // 优先使用 executorId，回退到 action.target.playerId，action.playerId（AUTO类型），或 actionPlayerId
    let playerId = action.executorId || action.target?.playerId || action.playerId || actionPlayerId;
    if (!playerId) {
      console.error('[GameEngine] handleOpponentAction: 无法确定action的执行者', action);
      console.error('[GameEngine] 请确保 action.executorId、action.target.playerId 或 action.playerId 存在');
      return;
    }

    const opponentId = playerId; // 执行操作的玩家
    const myPlayerId = opponentId === 'P1' ? 'P2' : 'P1'; // 我是另一个玩家

      opponentId,
      myPlayerId,
      actionType: action.type,
      stateCurrentPlayer: state.currentPlayer
    });

    // 确定次要目标
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

    // 保存会话信息用于动画回调处理
    this.activeSession = {
      type: 'OPPONENT_ACTION',
      action, stem, playerId: opponentId, secondTarget,
      step: 1
    };

    // ⚠️ 统一执行路径：不再使用 setTimeout 直接执行
    // 而是通过动画回调 resolveStage1() 和 resolveFinal() 来执行
    // AUTO 动作在 resolveStage1() 中执行
    // 其他动作在 resolveFinal() 中执行
  }
};

export default GameEngine;
