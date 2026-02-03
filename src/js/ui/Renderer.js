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
    this._bindEvents();
    this._initUIButtons();
  },

  _bindEvents() {
    EventBus.on('game:state-changed', this.render.bind(this));
    EventBus.on('game:node-changed', this.handleNodeChange.bind(this));
    EventBus.on('game:lock-nodes', this.handleLockNodes.bind(this));
    EventBus.on('ui:show-decision', this.showDecision.bind(this));
    EventBus.on('ui:hide-decision', DecisionPanel.hideDecision.bind(DecisionPanel));
    EventBus.on('game:stem-generated', this.showStem.bind(this));
    EventBus.on('anim:transition-update', (data) => {
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
    });
  },

  _initUIButtons() {
    const backBtn = document.getElementById('victory-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        VictoryOverlay.hideVictory();
        EventBus.emit('game:return-to-menu');
      });
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
    this.renderMirrorMode(state.myRole);
    this.renderScores(state.players);
    this.renderTurnCount(state.turnCount, state.maxTurns, state.phase);
    BoardRenderer.renderBoard(state.nodeStates, this.animatingNodes);
  },

  /**
   * 根据 myRole 设置镜像模式
   * @param {string} myRole - 'P1' | 'P2' | null
   */
  renderMirrorMode(myRole) {
    const battleLayer = document.getElementById('battle-layer');
    if (!battleLayer) return;

    if (myRole === 'P2') {
      battleLayer.classList.add('mirrored');
    } else {
      battleLayer.classList.remove('mirrored');
    }
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
    StemAnimation.playStemGenerationAnimation(currentPlayerId, stem, this.animatingNodes);
  },

  handleFlyAction(data) {
    FlyAnimation.handleFlyAction(data, (playerId, elementIndex) => {
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
