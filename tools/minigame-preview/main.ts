/**
 * 归元弈 · 现代化全功能策略对弈工作台 (Web Client)
 *
 * 桥接场景树核心与 DOM 仪表盘：提供实时天机战报、演武动作流、模式调谐、音效控制与全套快捷键。
 */

import { GameScene } from '@guiyuan/game/minigame/game-scene.js';
import { CHARACTER_ATLAS_FRAMES } from '@guiyuan/game/minigame/character-sprite.js';
import { Container } from '@guiyuan/game/minigame/scene/container.js';
import { InputManager } from '@guiyuan/game/minigame/scene/input-manager.js';
import { audioSynthesizer } from '@guiyuan/game/minigame/audio/audio-synthesizer.js';
import { GameModeKey } from '@guiyuan/game/minigame/overlays/settings-modal.js';
import { GameState, WuXing } from '@guiyuan/game/core/types/domain.js';
import { isNodeGuiYi } from '@guiyuan/game/core/logic/State.js';

// DOM 元素获取
const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (canvas === null) throw new Error('找不到对局 Canvas');
const context = canvas.getContext('2d');
if (context === null) throw new Error('浏览器不支持 Canvas 2D');

const modeSelect = document.querySelector<HTMLSelectElement>('#mode-select');
const btnRestart = document.querySelector<HTMLButtonElement>('#btn-restart');
const btnAudio = document.querySelector<HTMLButtonElement>('#btn-audio');
const btnRules = document.querySelector<HTMLButtonElement>('#btn-rules');
const btnFullscreen = document.querySelector<HTMLButtonElement>('#btn-fullscreen');
const btnClearLog = document.querySelector<HTMLButtonElement>('#btn-clear-log');
const logContainer = document.querySelector<HTMLDivElement>('#log-container');

// 仪表盘文本元素
const uiRound = document.querySelector<HTMLElement>('#ui-round');
const uiRoundBar = document.querySelector<HTMLElement>('#ui-round-bar');
const uiCurrentPlayer = document.querySelector<HTMLElement>('#ui-current-player');
const uiStem = document.querySelector<HTMLElement>('#ui-stem');
const scoreP1 = document.querySelector<HTMLElement>('#score-p1');
const scoreP2 = document.querySelector<HTMLElement>('#score-p2');
const guiyiP1 = document.querySelector<HTMLElement>('#guiyi-p1');
const guiyiP2 = document.querySelector<HTMLElement>('#guiyi-p2');
const nameP2 = document.querySelector<HTMLElement>('#name-p2');
const uiGap = document.querySelector<HTMLElement>('#ui-gap');
const uiRadar = document.querySelector<HTMLElement>('#ui-radar');
const boxP1 = document.querySelector<HTMLElement>('#box-p1');
const boxP2 = document.querySelector<HTMLElement>('#box-p2');

const querySeed = Number(new URLSearchParams(location.search).get('seed') ?? 42);
const stage = new Container();

let currentModeKey: GameModeKey = 'ai_balanced';

const scene = new GameScene({
  width: canvas.clientWidth,
  height: canvas.clientHeight,
  safeTop: 24,
  safeBottom: 20,
  seed: Number.isFinite(querySeed) ? querySeed : 42,
  mode: 'ai',
  aiStrategyKey: currentModeKey,
  onStateChange: (state: GameState) => updateDashboard(state),
  onLog: (msg: string) => appendLog(msg),
});
stage.addChild(scene);

// 加载角色图集
const characterImage = new Image();
characterImage.onload = () =>
  scene.characters.setSpriteAtlas({
    image: characterImage,
    width: characterImage.naturalWidth,
    height: characterImage.naturalHeight,
    frames: CHARACTER_ATLAS_FRAMES,
  });
characterImage.onerror = () => scene.characters.setSpriteAtlas(null);
characterImage.src = new URL('../../minigame/assets/characters.png', import.meta.url).href;

stage.onTap = (x, y) => {
  audioSynthesizer.unlock();
  scene.handleTap(x, y);
};
const input = new InputManager(stage);

function resize(): void {
  if (canvas === null || context === null) return;
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(bounds.width * ratio);
  canvas.height = Math.round(bounds.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  stage.hitArea = { x: 0, y: 0, width: bounds.width, height: bounds.height };
  scene.resize(bounds.width, bounds.height);
}

function localPoint(event: PointerEvent): { x: number; y: number } {
  const bounds = canvas!.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

let activePointer: number | null = null;
canvas.addEventListener('pointerdown', (event) => {
  audioSynthesizer.unlock();
  if (activePointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
  activePointer = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  const point = localPoint(event);
  input.handleTouchStart(point.x, point.y);
});

canvas.addEventListener('pointerup', (event) => {
  if (event.pointerId !== activePointer) return;
  const point = localPoint(event);
  input.handleTouchEnd(point.x, point.y);
  for (const button of scene.actionBar.getButtons()) button.release();
  activePointer = null;
});

canvas.addEventListener('pointercancel', () => {
  input.handleTouchEnd(-1, -1);
  for (const button of scene.actionBar.getButtons()) button.release();
  activePointer = null;
});

// 仪表盘刷新函数
function countGuiYi(board: GameState['players']['P1']['board']): number {
  let count = 0;
  for (const elem of [WuXing.WOOD, WuXing.FIRE, WuXing.EARTH, WuXing.METAL, WuXing.WATER]) {
    if (isNodeGuiYi(board[elem])) count += 1;
  }
  return count;
}

function countUnlitSides(board: GameState['players']['P2']['board']): number {
  let unlit = 0;
  for (const elem of [WuXing.WOOD, WuXing.FIRE, WuXing.EARTH, WuXing.METAL, WuXing.WATER]) {
    if (board[elem].yin < 1) unlit += 1;
    if (board[elem].yang < 1) unlit += 1;
  }
  return unlit;
}

function updateDashboard(state: GameState): void {
  if (!uiRound) return;

  const roundNum = Math.min(30, state.round || 1);
  uiRound.textContent = `第 ${roundNum} / 30 轮`;
  if (uiRoundBar) {
    uiRoundBar.style.width = `${Math.min(100, (roundNum / 30) * 100)}%`;
  }

  const isP1 = state.currentPlayer === 'P1';
  if (uiCurrentPlayer) {
    uiCurrentPlayer.textContent = isP1
      ? '先手 (阳)'
      : scene.mode === 'pvp'
        ? '后手 (阴)'
        : '天道 (阴)';
    uiCurrentPlayer.style.color = isP1 ? 'var(--text-gold)' : 'var(--accent-damage)';
  }

  if (boxP1 && boxP2) {
    boxP1.classList.toggle('active', isP1);
    boxP2.classList.toggle('active', !isP1);
  }

  const p1Pts = state.players.P1.score;
  const p2Pts = state.players.P2.score;
  if (scoreP1) scoreP1.textContent = String(p1Pts);
  if (scoreP2) scoreP2.textContent = String(p2Pts);

  const gy1 = countGuiYi(state.players.P1.board);
  const gy2 = countGuiYi(state.players.P2.board);
  if (guiyiP1) guiyiP1.textContent = `归一: ${gy1}/5`;
  if (guiyiP2) guiyiP2.textContent = `归一: ${gy2}/5`;

  if (uiGap) {
    const diff = p1Pts - p2Pts;
    if (diff > 0) {
      uiGap.textContent = `先手领先 +${diff} 分`;
      uiGap.style.color = 'var(--accent-jade)';
    } else if (diff < 0) {
      uiGap.textContent = `后手领先 +${Math.abs(diff)} 分`;
      uiGap.style.color = 'var(--accent-damage)';
    } else {
      uiGap.textContent = '双方战意势均力敌';
      uiGap.style.color = 'var(--text-muted)';
    }
  }

  // 天命雷达预警
  if (uiRadar) {
    const unlitP2 = countUnlitSides(state.players.P2.board);
    if (unlitP2 === 1) {
      uiRadar.textContent = '⚠️ 绝杀预警：后手已听牌（仅差1侧）！先手若归元将触发终轮天命揭牌！';
      uiRadar.style.color = '#ffb74d';
    } else if (unlitP2 === 0) {
      uiRadar.textContent = '★ 后手已达成五行归元，势不可挡！';
      uiRadar.style.color = 'var(--accent-damage)';
    } else if (gy1 >= 4) {
      uiRadar.textContent = `先手归一已达 ${gy1} 处，距五行归元仅一步之遥！`;
      uiRadar.style.color = 'var(--accent-jade)';
    } else {
      uiRadar.textContent = `战局平稳推进。先手后手正在各自构建生克阵列 (后手差 ${unlitP2} 侧达成归元)。`;
      uiRadar.style.color = 'var(--text-muted)';
    }
  }

  const stem = scene.visualTurn.stem;
  if (uiStem) {
    uiStem.textContent = stem ? `${stem.name} (${stem.element}${stem.polarity})` : '待抽符令';
  }
}

function appendLog(message: string): void {
  if (!logContainer) return;
  const item = document.createElement('div');
  item.className = 'log-item';
  if (message.includes('先手')) item.classList.add('p1');
  if (message.includes('天道') || message.includes('后手')) item.classList.add('p2');
  item.textContent = message;
  logContainer.appendChild(item);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// 控件事件绑定
modeSelect?.addEventListener('change', () => {
  audioSynthesizer.unlock();
  const val = modeSelect.value as GameModeKey;
  currentModeKey = val;
  const isPvp = val === 'pvp';
  if (nameP2) {
    nameP2.textContent = isPvp ? '后手 · 玩家(阴)' : '后手 · 天道(阴)';
  }
  scene.restart(undefined, {
    mode: isPvp ? 'pvp' : 'ai',
    aiStrategyKey: val,
  });
  appendLog(`已切换阵营：${modeSelect.options[modeSelect.selectedIndex].text}`);
});

btnRestart?.addEventListener('click', () => {
  audioSynthesizer.unlock();
  audioSynthesizer.play('tap');
  scene.restart();
  appendLog('重新开局，乾坤重置。');
});

btnAudio?.addEventListener('click', () => {
  audioSynthesizer.unlock();
  audioSynthesizer.enabled = !audioSynthesizer.enabled;
  btnAudio.textContent = audioSynthesizer.enabled ? '🔊 仙乐' : '🔇 寂灭';
  btnAudio.classList.toggle('active', audioSynthesizer.enabled);
  if (audioSynthesizer.enabled) audioSynthesizer.play('tap');
});

btnRules?.addEventListener('click', () => {
  audioSynthesizer.unlock();
  audioSynthesizer.play('tap');
  scene.ruleModal.open();
});

btnFullscreen?.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    void document.documentElement.requestFullscreen().catch(() => {});
  } else {
    void document.exitFullscreen().catch(() => {});
  }
});

btnClearLog?.addEventListener('click', () => {
  if (logContainer) logContainer.innerHTML = '';
});

// 全局按键监听
window.addEventListener('keydown', (event) => {
  audioSynthesizer.unlock();
  if (event.code === 'Space') {
    event.preventDefault();
    scene.handleTap();
  } else if (event.key.toLowerCase() === 'r') {
    scene.restart(Number.isFinite(querySeed) ? querySeed : 42);
    appendLog('快捷键触发：重新开局。');
  } else if (event.key.toLowerCase() === 'm') {
    btnAudio?.click();
  } else if (event.key.toLowerCase() === 'h') {
    scene.ruleModal.open();
  } else if (['1', '2', '3', '4'].includes(event.key)) {
    const idx = parseInt(event.key, 10) - 1;
    const buttons = scene.actionBar.getButtons();
    if (buttons[idx] && !buttons[idx].disabled) {
      buttons[idx].onTouchStart?.(0, 0);
      buttons[idx].onTap?.(0, 0);
      buttons[idx].onTouchEnd?.(0, 0);
    }
  }
});

window.addEventListener('resize', resize);
window.addEventListener('pagehide', () => scene.dispose(), { once: true });

// 暴露全局对象供测试与控制台调试
Object.assign(window, {
  __guiyuanPreview: { scene, stage, input, audioSynthesizer },
});

resize();
scene.start();
updateDashboard(scene.turnManager.getState());

let previousTimestamp: number | null = null;
function frame(timestamp: number): void {
  const dt =
    previousTimestamp === null
      ? 0
      : Math.min(0.05, Math.max(0, (timestamp - previousTimestamp) / 1000));
  previousTimestamp = timestamp;
  scene.update(dt);
  scene.render(context!);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
