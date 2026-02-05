import { querySelector } from './js/utils/dom.js';
import { initPVPDebug } from './js/utils/PVPLogger.js';
import EventBus from './js/bus/EventBus.js';
import StateManager from './js/state/StateManager.js';
import UIStateManager from './js/state/ui-state.js';
import { GAME_EVENTS, UI_EVENTS, ANIMATION_EVENTS, INPUT_EVENTS, PLAYER_EVENTS, LEADERBOARD_EVENTS } from './js/types/events.js';
import { DIMENSIONS } from './js/config/game-config.js';
import PerformanceMonitor from './js/utils/PerformanceMonitor.js';

import { supabase, getCurrentUserId } from './js/network/supabaseClient.js';
import RoomManager from './js/network/RoomManager.js';
import SimplifiedPVPManager from './js/network/SimplifiedPVPManager.js';
import ReconnectionManager from './js/network/ReconnectionManager.js';
import LeaderboardManager from './js/network/LeaderboardManager.js';
import GameEngine from './js/logic/GameEngine.js';
import GameSequence from './js/logic/flow/GameSequence.js';
import Renderer from './js/ui/Renderer.js';
import AnimationManager from './js/ui/animation/AnimationManager.js';
import InputHandler from './js/interaction/InputHandler.js';
import ParticleSystem from './js/ui/animation/ParticleSystem.js';
import LeaderboardUI from './js/ui/LeaderboardUI.js';
import ScoreEffects from './js/ui/ScoreEffects.js';
import AchievementOverlay from './js/ui/overlays/AchievementOverlay.js';
import WaitingOverlay from './js/ui/overlays/WaitingOverlay.js';
import ReconnectionOverlay from './js/ui/overlays/ReconnectionOverlay.js';
import TimerManager from './js/utils/TimerManager.js';

function initApp() {
  // 首先初始化 PVP 调试系统
  initPVPDebug();

  // 暴露性能监控工具（始终可用，但只在调试模式下启动）
  window.PerformanceMonitor = PerformanceMonitor;

  // 只在 PVP 调试模式下显示初始化日志和启动监控
  if (window.PVP_DEBUG) {
    console.log('[Main] 初始化归元弈应用...');
    // 启动性能监控
    PerformanceMonitor.start();
  }

  initUtils();
  initNetwork();
  initGameEngine();
  initUI();
  initInput();
  initAnimations();

  // 监听返回主菜单事件
  EventBus.on('game:return-to-menu', () => {
    if (window.PVP_DEBUG) console.log('[Main] 返回主菜单');

    // 清理定时器
    TimerManager.clearAll();

    StateManager.reset();
    AchievementOverlay.reset();
    EventBus.emit('anim:reset-scene');

    const overlay = document.querySelector('.decision-overlay');
    if (overlay) overlay.remove();

    document.querySelectorAll('.energy-projectile, .energy-particle').forEach(el => el.remove());

    const taijiCore = document.getElementById('taiji-core');
    const orbYang = document.getElementById('orb-yang');
    const orbYin = document.getElementById('orb-yin');
    const rippleUp = document.getElementById('ripple-up');
    const rippleDown = document.getElementById('ripple-down');
    const initMessage = document.getElementById('init-message');

    if (taijiCore) taijiCore.style.display = 'none';
    if (orbYang) orbYang.style.display = 'none';
    if (orbYin) orbYin.style.display = 'none';
    if (rippleUp) { rippleUp.style.opacity = '0'; rippleUp.style.transform = 'translate(-50%, -50%) scale(0)'; }
    if (rippleDown) { rippleDown.style.opacity = '0'; rippleDown.style.transform = 'translate(-50%, -50%) scale(0)'; }
    if (initMessage) { initMessage.style.opacity = '0'; initMessage.style.visibility = 'hidden'; }

    const menuLayer = document.getElementById('menu-layer');
    const battleLayer = document.getElementById('battle-layer');
    const victoryPopup = document.getElementById('victory-popup');
    const waitingLayer = document.getElementById('waiting-layer');
    const leaderboardLayer = document.getElementById('leaderboard-layer');
    const menuButtons = document.getElementById('menuButtons');
    const title = document.getElementById('title');
    const turnInfoEl = document.getElementById('turn-info');

    if (menuLayer) {
      menuLayer.style.display = 'flex';
      menuLayer.style.opacity = '1';
      menuLayer.style.pointerEvents = 'auto';
    }
    if (battleLayer) battleLayer.style.display = 'none';
    if (victoryPopup) {
      victoryPopup.style.display = 'none';
      victoryPopup.style.pointerEvents = 'none';
    }
    if (waitingLayer) waitingLayer.style.display = 'none';
    if (leaderboardLayer) leaderboardLayer.style.display = 'none';
    if (title) {
      title.classList.remove('hidden');
      title.style.letterSpacing = '';
      title.style.filter = '';
      title.style.opacity = '0';
      title.style.transform = 'translate(-50%, -50%) scale(0.9)';
      title.style.transition = 'opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          title.style.opacity = '0.8';
          title.style.transform = 'translate(-50%, -50%) scale(1)';
        });
      });
    }
    if (menuButtons) {
      menuButtons.classList.remove('visible');
      menuButtons.style.opacity = '';
      menuButtons.style.visibility = '';
      menuButtons.style.pointerEvents = '';
      menuButtons.style.transform = '';
      menuButtons.querySelectorAll('.menu-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.opacity = '';
        btn.style.pointerEvents = '';
      });
    }
    if (turnInfoEl) turnInfoEl.classList.remove('visible');

    StateManager.update({ phase: 'HOME' });
  });

  EventBus.emit('app:initialized', { timestamp: Date.now() });
}

function initUtils() {
  if (window.PVP_DEBUG) console.log('[Main] 初始化工具模块');
}

function initNetwork() {
  if (window.PVP_DEBUG) console.log('[Main] 初始化网络层');

  const playerId = getCurrentUserId();

  RoomManager.init();
  LeaderboardManager.init();
  SimplifiedPVPManager.init();
  ReconnectionManager.init();

  if (window.PVP_DEBUG) console.log('[Main] ✓ 网络层已初始化');
}

function initGameEngine() {
  if (window.PVP_DEBUG) console.log('[Main] 初始化游戏引擎');
  GameEngine.init();
  GameSequence.init();

  // 暴露到 window 用于调试
  window.GameEngine = GameEngine;
  window.StateManager = StateManager;
  window.EventBus = EventBus;
  window.TimerManager = TimerManager;
  if (window.PVP_DEBUG) console.log('[Main] ✓ 调试工具已暴露到 window');
}

function initUI() {
  if (window.PVP_DEBUG) console.log('[Main] 初始化UI层');

  const vh = window.innerHeight;
  const size = Math.floor(
    Math.min(
      vh * DIMENSIONS.VIEWPORT.STEM_SIZE_RATIO,
      DIMENSIONS.VIEWPORT.STEM_SIZE_MAX
    )
  );
  document.documentElement.style.setProperty('--stem-size', `${size}px`);

  Renderer.init();
  AnimationManager.init();
  LeaderboardUI.init();
  ScoreEffects.init();
  AchievementOverlay.init();
  WaitingOverlay.init();
  ReconnectionOverlay.init();
}

function initInput() {
  if (window.PVP_DEBUG) console.log('[Main] 初始化交互层');
  InputHandler.init();
}

function initAnimations() {
  if (window.PVP_DEBUG) console.log('[Main] 初始化动画系统');
  ParticleSystem.init();
}

// 添加清理函数
function cleanup() {
  if (window.PVP_DEBUG) console.log('[Main] 清理应用资源');
  TimerManager.clearAll();
}

// 监听页面卸载
window.addEventListener('beforeunload', cleanup);

// 检查 URL 参数中的房间码
function checkURLParams() {
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get('room');

  if (roomCode) {
    if (window.PVP_DEBUG) console.log('[Main] 检测到房间码:', roomCode);
    setTimeout(() => {
      EventBus.emit('game:start', {
        mode: 0,
        joinAs: 'P2',
        roomCodeToJoin: roomCode
      });
    }, 500);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initApp();
    checkURLParams();
  });
} else {
  initApp();
  checkURLParams();
}
