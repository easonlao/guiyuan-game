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
import { STEMS_MAP, ELEMENTS_DATA } from '../config/game-config.js';

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
    // myRole 是单独存储的，不是 state 的一部分
    this.renderMirrorMode(StateManager.getMyRole());
    this.renderScores(state.players);
    this.renderTurnCount(state.turnCount, state.maxTurns, state.phase);
    BoardRenderer.renderBoard(state.nodeStates, this.animatingNodes);
  },

  /**
   * 根据 myRole 设置镜像模式
   * @param {string} myRole - 'P1' | 'P2' | null
   * @description
   * PVP 模式下，每个玩家从自己的视角观看：
   * - P1 玩时：P1 在下方（本尊），P2 在上方（对家）- 正常视角
   * - P2 玩时：P2 在下方（本尊），P1 在上方（对家）- 镜像视角
   */
  renderMirrorMode(myRole) {
    const battleLayer = document.getElementById('battle-layer');
    if (!battleLayer) return;

    const isMirrored = (myRole === 'P2');
    const wasMirrored = battleLayer.classList.contains('mirrored');

    // 检测镜像模式是否变化
    if (isMirrored !== wasMirrored) {
      if (isMirrored) {
        battleLayer.classList.add('mirrored');
        // P2 视角：重新初始化双方节点
        // - P2（下方）：木火土金水，顺时针
        this._reinitP2NodesForBottomView();
        // - P1（上方）：金水木火土，逆时针
        this._reinitP1NodesForTopView();
      } else {
        battleLayer.classList.remove('mirrored');
        // P1 视角：恢复双方节点为默认
        // - P2（上方）：金水木火土，逆时针
        this._reinitP2NodesForTopView();
        // - P1（下方）：木火土金水，顺时针
        this._reinitP1NodesForBottomView();
      }
    }
  },

  /**
   * 重新初始化 P2 节点为下方视角
   * @private
   */
  _reinitP1NodesForBottomView() {
    const p1Star = document.getElementById('p1-star');
    if (!p1Star) return;
    const container = p1Star.querySelector('.pentagram-container');
    if (!container) return;

    // 清空现有节点
    container.innerHTML = '';

    // 使用 P1 的索引和角度（木火土金水，顺时针）
    const p1Indices = [0, 1, 2, 3, 4];
    p1Indices.forEach((elementIndex, i) => {
      const nodeEl = this._createP1NodeForBottomView(elementIndex, i);
      container.appendChild(nodeEl);
    });
  },

  /**
   * 重新初始化 P1 节点为上方视角
   * @private
   */
  _reinitP1NodesForTopView() {
    const p1Star = document.getElementById('p1-star');
    if (!p1Star) return;
    const container = p1Star.querySelector('.pentagram-container');
    if (!container) return;

    // 清空现有节点
    container.innerHTML = '';

    // 使用 P2 的索引和角度（金水木火土，逆时针）
    const p2Indices = [3, 2, 1, 0, 4];
    p2Indices.forEach((elementIndex, i) => {
      const nodeEl = this._createP1NodeForTopView(elementIndex, i);
      container.appendChild(nodeEl);
    });
  },

  /**
   * 重新初始化 P2 节点为下方视角
   * @private
   */
  _reinitP2NodesForBottomView() {
    const p2Star = document.getElementById('p2-star');
    if (!p2Star) return;
    const container = p2Star.querySelector('.pentagram-container');
    if (!container) return;

    // 清空现有节点
    container.innerHTML = '';

    // 使用 P1 的索引和角度（木火土金水，顺时针）
    const p1Indices = [0, 1, 2, 3, 4];
    p1Indices.forEach((elementIndex, i) => {
      const nodeEl = this._createP2NodeForBottomView(elementIndex, i);
      container.appendChild(nodeEl);
    });
  },

  /**
   * 重新初始化 P2 节点为上方视角
   * @private
   */
  _reinitP2NodesForTopView() {
    const p2Star = document.getElementById('p2-star');
    if (!p2Star) return;
    const container = p2Star.querySelector('.pentagram-container');
    if (!container) return;

    // 清空现有节点
    container.innerHTML = '';

    // 使用 P2 原始的索引和角度（金水木火土，逆时针）
    const p2Indices = [3, 2, 1, 0, 4];
    p2Indices.forEach((elementIndex, i) => {
      const nodeEl = this._createP2NodeForTopView(elementIndex, i);
      container.appendChild(nodeEl);
    });
  },

  /**
   * 创建 P1 下方视角的节点元素（木火土金水，顺时针）
   * @private
   */
  _createP1NodeForBottomView(elementIndex, positionIndex) {
    const el = document.createElement('div');
    el.className = 'node taiji-card';
    el.dataset.index = elementIndex;

    // P1 视角的角度：从 -90°（木）开始，顺时针
    const angleDeg = positionIndex * 72 - 90;
    el.dataset.angle = angleDeg * (Math.PI / 180);

    const angleRad = angleDeg * (Math.PI / 180);
    const radius = 35;
    const x = 50 + radius * Math.cos(angleRad);
    const y = 50 + radius * Math.sin(angleRad);

    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.transform = 'translate(-50%, -50%)';

    el.innerHTML = this._getNodeHTML();
    this._applyNodeStyles(el, elementIndex);

    return el;
  },

  /**
   * 创建 P1 上方视角的节点元素（金水木火土，逆时针）
   * @private
   */
  _createP1NodeForTopView(elementIndex, positionIndex) {
    const el = document.createElement('div');
    el.className = 'node taiji-card';
    el.dataset.index = elementIndex;

    // P1 上方视角的角度：从 +90°（金）开始，顺时针（视觉上逆时针）
    const angleDeg = positionIndex * 72 - 90 + 180;
    el.dataset.angle = angleDeg * (Math.PI / 180);

    const angleRad = angleDeg * (Math.PI / 180);
    const radius = 35;
    const x = 50 + radius * Math.cos(angleRad);
    const y = 50 + radius * Math.sin(angleRad);

    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.transform = 'translate(-50%, -50%)';

    el.innerHTML = this._getNodeHTML();
    this._applyNodeStyles(el, elementIndex);

    return el;
  },

  /**
   * 创建 P2 下方视角的节点元素（木火土金水，顺时针）
   * @private
   */
  _createP2NodeForBottomView(elementIndex, positionIndex) {
    const el = document.createElement('div');
    el.className = 'node taiji-card';
    el.dataset.index = elementIndex;

    // P1 视角的角度：从 -90°（木）开始，顺时针
    const angleDeg = positionIndex * 72 - 90;
    el.dataset.angle = angleDeg * (Math.PI / 180);

    const angleRad = angleDeg * (Math.PI / 180);
    const radius = 35;
    const x = 50 + radius * Math.cos(angleRad);
    const y = 50 + radius * Math.sin(angleRad);

    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.transform = 'translate(-50%, -50%)';

    el.innerHTML = this._getNodeHTML();
    this._applyNodeStyles(el, elementIndex);

    return el;
  },

  /**
   * 创建 P2 上方视角的节点元素（金水木火土，逆时针）
   * @private
   */
  _createP2NodeForTopView(elementIndex, positionIndex) {
    const el = document.createElement('div');
    el.className = 'node taiji-card';
    el.dataset.index = elementIndex;

    // P2 视角的角度：从 +90°（金）开始，顺时针（视觉上逆时针）
    const angleDeg = positionIndex * 72 - 90 + 180;
    el.dataset.angle = angleDeg * (Math.PI / 180);

    const angleRad = angleDeg * (Math.PI / 180);
    const radius = 35;
    const x = 50 + radius * Math.cos(angleRad);
    const y = 50 + radius * Math.sin(angleRad);

    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.transform = 'translate(-50%, -50%)';

    el.innerHTML = this._getNodeHTML();
    this._applyNodeStyles(el, elementIndex);

    return el;
  },

  /**
   * 获取节点 HTML
   * @private
   */
  _getNodeHTML() {
    return `
      <div class="yang-body"></div>
      <div class="yang-head"></div>
      <div class="yin-head"></div>
      <svg class="line-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path class="arc-seg arc-left" d="M 50 0 A 50 50 0 0 0 50 100"></path>
        <path class="arc-seg arc-right" d="M 50 0 A 50 50 0 0 1 50 100"></path>
        <path class="arc-seg arc-top" d="M 50 0 A 25 25 0 0 1 50 50"></path>
        <path class="arc-seg arc-bottom" d="M 50 50 A 25 25 0 0 0 50 100"></path>
      </svg>
      <div class="stem-name name-yang"></div>
      <div class="stem-name name-yin"></div>
    `;
  },

  /**
   * 应用节点样式
   * @private
   */
  _applyNodeStyles(el, elementIndex) {
    const yangText = STEMS_MAP[elementIndex].yang;
    const yinText = STEMS_MAP[elementIndex].yin;
    const colorData = ELEMENTS_DATA[elementIndex];

    el.querySelector('.name-yang').textContent = yangText;
    el.querySelector('.name-yin').textContent = yinText;
    el.style.setProperty('--real-c-yang', colorData.cy);
    el.style.setProperty('--real-c-yin', colorData.ci);
    el.style.setProperty('--head-top-color', colorData.cy);
    el.style.setProperty('--head-bottom-color', colorData.ci);
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
