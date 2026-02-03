// ============================================
// 渲染控制器（主控制器）
// ============================================
// 职责：
// - 协调各渲染模块
// - 管理渲染状态
// - 分发渲染事件
// ============================================

import EventBus from '../bus/EventBus.js';
import StateManager from '../state/StateManager.js';
import { GAME_EVENTS } from '../types/events.js';

import BoardRenderer from './board/BoardRenderer.js';
import NodeRenderer from './board/NodeRenderer.js';
import BoardAnimation from './board/BoardAnimation.js';
import StemAnimation from './effects/StemAnimation.js';
import FlyAnimation from './effects/FlyAnimation.js';
import ImpactEffects from './effects/ImpactEffects.js';
import VictoryOverlay from './overlays/VictoryOverlay.js';
import WaitingOverlay from './overlays/WaitingOverlay.js';
import DecisionPanel from './decisions/DecisionPanel.js';

const Renderer = {
  animatingNodes: {},

  init() {
    console.log('[Renderer] 初始化...');
    this._bindEvents();
    this._initUIButtons();
  },

  _bindEvents() {
    console.log('[Renderer] 绑定事件监听器...');
    EventBus.on('game:state-changed', this.render.bind(this));
    EventBus.on('game:node-changed', this.handleNodeChange.bind(this));
    EventBus.on('game:lock-nodes', this.handleLockNodes.bind(this));
    EventBus.on('ui:show-decision', this.showDecision.bind(this));
    EventBus.on('ui:hide-decision', DecisionPanel.hideDecision.bind(DecisionPanel));
    EventBus.on('game:stem-generated', this.showStem.bind(this));
    EventBus.on('anim:transition-update', (data) => {
      console.log('[Renderer] 收到 anim:transition-update 事件:', data);
      BoardRenderer.handleTransitionUpdate(data.progress || data);
    });
    EventBus.on('game:initiative-start', BoardAnimation.playInitiativeAnimation.bind(BoardAnimation));
    EventBus.on('game:perform-fly-action', this.handleFlyAction.bind(this));
    EventBus.on(GAME_EVENTS.VICTORY, VictoryOverlay.showVictory.bind(VictoryOverlay));

    EventBus.on('game:show-waiting', WaitingOverlay.showWaiting.bind(WaitingOverlay));
    EventBus.on('game:waiting-info', WaitingOverlay.updateWaitingInfo.bind(WaitingOverlay));
    EventBus.on('game:room-error', WaitingOverlay.showRoomError.bind(WaitingOverlay));
    EventBus.on('game:player-joined', WaitingOverlay.onPlayerJoined.bind(WaitingOverlay));

    EventBus.on('game:return-to-menu', () => {
      this.animatingNodes = {};
      console.log('[Renderer] 清理所有 animatingNodes');
    });
  },

  _initUIButtons() {
    const backBtn = document.getElementById('victory-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        console.log('[Renderer] 胜利弹窗返回按钮被点击');
        VictoryOverlay.hideVictory();
        console.log('[Renderer] 发送 game:return-to-menu 事件');
        EventBus.emit('game:return-to-menu');
      });
    } else {
      console.warn('[Renderer] victory-back-btn 未找到!');
    }

    const cancelBtn = document.getElementById('waiting-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        WaitingOverlay.hideWaiting();
        EventBus.emit('game:return-to-menu');
      });
    }

    const copyBtn = document.getElementById('waiting-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', WaitingOverlay.copyShareLink.bind(WaitingOverlay));
    }
  },

  handleLockNodes(data) {
    NodeRenderer.lockNode(data, this.animatingNodes);
  },

  render(data) {
    const state = data?.new || data;
    if (!state || !state.phase) return;
    if (state.phase === 'RIPPLE') return;

    this.renderPhase(state.phase);
    this.renderScores(state.players);
    this.renderTurnCount(state.turnCount, state.maxTurns, state.phase);
    BoardRenderer.renderBoard(state.nodeStates, this.animatingNodes);
  },

  renderPhase(phase) {
    const menuLayer = document.getElementById('menu-layer');
    const battleLayer = document.getElementById('battle-layer');
    if (!menuLayer || !battleLayer) return;

    if (phase === 'HOME') {
      menuLayer.style.display = 'flex';
      battleLayer.style.display = 'none';
    } else {
      menuLayer.style.display = 'none';
      battleLayer.style.display = 'flex';
    }
  },

  renderScores(players) {
    if (!players) return;
    document.getElementById('score-p1').textContent = players.P1.score;
    document.getElementById('score-p2').textContent = players.P2.score;
  },

  renderTurnCount(turnCount, maxTurns, phase) {
    const turnCountEl = document.getElementById('turn-count');
    const turnInfoEl = document.getElementById('turn-info');

    if (turnCountEl) {
      turnCountEl.textContent = turnCount;
    }

    if (turnInfoEl) {
      if (phase === 'PLAYING') {
        turnInfoEl.classList.add('visible');
      } else {
        turnInfoEl.classList.remove('visible');
      }
    }
  },

  handleNodeChange(data) {
    NodeRenderer.handleNodeChange(data, this.animatingNodes, BoardRenderer.updateNodeStyle.bind(BoardRenderer));
  },

  showStem(data) {
    const { stem } = data;
    const currentPlayerId = StateManager.getState().currentPlayer;
    console.log('[Renderer] showStem 被调用', { stem: stem.name, currentPlayerId });
    StemAnimation.playStemGenerationAnimation(currentPlayerId, stem, this.animatingNodes);
  },

  handleFlyAction(data) {
    console.log('[Renderer] ========== handleFlyAction ==========');
    console.log('[Renderer] data:', data);
    FlyAnimation.handleFlyAction(data, (playerId, elementIndex) => {
      console.log('[Renderer] 飞行动画回调:', playerId, elementIndex);
      NodeRenderer.flushPendingState(playerId, elementIndex, this.animatingNodes, BoardRenderer.updateNodeStyle.bind(BoardRenderer));
    }, this.animatingNodes, BoardRenderer.updateNodeStyle.bind(BoardRenderer));
  },

  showDecision(data) {
    DecisionPanel.showDecision(data, this.animatingNodes);
  },

  getCurrentDecisionActions() {
    return DecisionPanel.getCurrentActions();
  }
};

export default Renderer;
