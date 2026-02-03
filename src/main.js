import { querySelector } from './js/utils/dom.js';
import EventBus from './js/bus/EventBus.js';
import StateManager from './js/state/StateManager.js';
import UIStateManager from './js/state/ui-state.js';
import { GAME_EVENTS, UI_EVENTS, ANIMATION_EVENTS, INPUT_EVENTS, PLAYER_EVENTS, LEADERBOARD_EVENTS } from './js/types/events.js';

import { supabase, getCurrentUserId } from './js/network/supabaseClient.js';
import RoomManager from './js/network/RoomManager.js';
import CommandSender from './js/network/CommandSender.js';
import AuthorityExecutor from './js/network/AuthorityExecutor.js';
import StateSnapshotManager from './js/network/StateSnapshotManager.js';
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

function initApp() {
  console.log('[Main] 初始化归元弈应用...');

  initUtils();
  initNetwork();
  initGameEngine();
  initUI();
  initInput();
  initAnimations();

  // 监听返回主菜单事件
  EventBus.on('game:return-to-menu', () => {
    console.log('[Main] ========== 返回主菜单事件触发 ==========');
    StateManager.reset();
    AchievementOverlay.reset();
    console.log('[Main] StateManager 已重置');

    // 发送事件重置 SceneTransition 状态
    EventBus.emit('anim:reset-scene');
    console.log('[Main] 已发送 anim:reset-scene 事件');

    // 清理所有可能存在的遮罩层
    const overlay = document.querySelector('.decision-overlay');
    if (overlay) {
      overlay.remove();
      console.log('[Main] 已清理 decision-overlay');
    }

    // 清理所有动态生成的粒子元素
    document.querySelectorAll('.energy-projectile, .energy-particle').forEach(el => el.remove());
    console.log('[Main] 已清理所有粒子元素');

    // 清理转场动画元素
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
    console.log('[Main] 已清理转场动画元素');

    // 直接操作 DOM 确保显示主菜单
    const menuLayer = document.getElementById('menu-layer');
    const battleLayer = document.getElementById('battle-layer');
    const victoryPopup = document.getElementById('victory-popup');
    const waitingLayer = document.getElementById('waiting-layer');
    const leaderboardLayer = document.getElementById('leaderboard-layer');
    const menuButtons = document.getElementById('menuButtons');
    const title = document.getElementById('title');
    const turnInfoEl = document.getElementById('turn-info');

    console.log('[Main] 元素状态:', {
      menuLayer: menuLayer ? 'found' : 'NOT FOUND',
      menuButtons: menuButtons ? 'found' : 'NOT FOUND',
      title: title ? 'found' : 'NOT FOUND'
    });

    if (menuLayer) {
      menuLayer.style.display = 'flex';
      menuLayer.style.opacity = '1';  // 重置透明度
      menuLayer.style.pointerEvents = 'auto';  // 确保可交互
      console.log('[Main] menuLayer display 设置为 flex, opacity 重置为 1');
    }
    if (battleLayer) battleLayer.style.display = 'none';
    if (victoryPopup) {
      victoryPopup.style.display = 'none';
      victoryPopup.style.pointerEvents = 'none';  // 确保不阻挡鼠标
    }
    if (waitingLayer) waitingLayer.style.display = 'none';
    if (leaderboardLayer) leaderboardLayer.style.display = 'none';
    if (title) {
      title.classList.remove('hidden');
      // 重置转场动画中修改的样式
      title.style.letterSpacing = '';
      title.style.filter = '';

      // 添加淡入动画效果
      title.style.opacity = '0';
      title.style.transform = 'translate(-50%, -50%) scale(0.9)';
      title.style.transition = 'opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';

      // 延迟一帧后触发动画
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          title.style.opacity = '0.8';
          title.style.transform = 'translate(-50%, -50%) scale(1)';
        });
      });

      console.log('[Main] title 移除 hidden 类并添加淡入动画');
    }
    if (menuButtons) {
      menuButtons.classList.remove('visible');  // 移除 visible 类，隐藏按钮
      // 重置所有可能影响交互的样式
      menuButtons.style.opacity = '';
      menuButtons.style.visibility = '';
      menuButtons.style.pointerEvents = '';
      menuButtons.style.transform = '';

      // 清理所有按钮的激活状态
      menuButtons.querySelectorAll('.menu-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.opacity = '';
        btn.style.pointerEvents = '';
      });

      console.log('[Main] menuButtons 移除 visible 类并重置样式（按钮隐藏，需要点击标题才能看到）');
    }
    if (turnInfoEl) turnInfoEl.classList.remove('visible');

    // 触发状态更新
    StateManager.update({ phase: 'HOME' });
    console.log('[Main] phase 设置为 HOME');
    console.log('[Main] ========== 返回主菜单完成 ==========');
  });

  EventBus.emit('app:initialized', { timestamp: Date.now() });
}

function initUtils() {
  console.log('[Main] 初始化工具模块...');
}

function initNetwork() {
  console.log('[Main] 初始化网络层（权威服务器架构）...');

  const playerId = getCurrentUserId();
  if (!playerId) {
    console.warn('[Main] 未生成玩家 ID，将生成临时 ID');
  }

  // 初始化原有模块
  RoomManager.init();
  LeaderboardManager.init();

  // 初始化权威服务器架构模块
  CommandSender.init();
  AuthorityExecutor.init();
  StateSnapshotManager.init();
  ReconnectionManager.init();

  console.log('[Main] ✓ 权威服务器架构模块已初始化');
}

function initGameEngine() {
  console.log('[Main] 初始化游戏引擎...');
  GameEngine.init();
  GameSequence.init();
}

function initUI() {
  console.log('[Main] 初始化UI层...');

  // 计算一次字体大小并写入 CSS 变量
  const vh = window.innerHeight;
  const size = Math.floor(Math.min(vh * 0.06, 60));
  document.documentElement.style.setProperty('--stem-size', `${size}px`);

  Renderer.init();
  AnimationManager.init();
  LeaderboardUI.init();
  ScoreEffects.init();
  AchievementOverlay.init();
  WaitingOverlay.init();
}

function initInput() {
  console.log('[Main] 初始化交互层...');
  InputHandler.init();
}

function initAnimations() {
  console.log('[Main] 初始化动画系统...');
  ParticleSystem.init();
}

// 检查 URL 参数中的房间码
function checkURLParams() {
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get('room');

  if (roomCode) {
    console.log('[Main] 检测到房间码:', roomCode);
    // 自动触发加入房间
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
