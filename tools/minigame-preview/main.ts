/** 仅开发使用的浏览器宿主，直接运行微信小游戏的真实场景与输入分发。 */
import { GameScene } from '@guiyuan/game/minigame/game-scene.js';
import { CHARACTER_ATLAS_FRAMES } from '@guiyuan/game/minigame/character-sprite.js';
import { Container } from '@guiyuan/game/minigame/scene/container.js';
import { InputManager } from '@guiyuan/game/minigame/scene/input-manager.js';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (canvas === null) throw new Error('找不到对局 Canvas');
const context = canvas.getContext('2d');
if (context === null) throw new Error('浏览器不支持 Canvas 2D');

const querySeed = Number(new URLSearchParams(location.search).get('seed') ?? 42);
const stage = new Container();
const scene = new GameScene({
  width: canvas.clientWidth,
  height: canvas.clientHeight,
  safeTop: 24,
  safeBottom: 20,
  seed: Number.isFinite(querySeed) ? querySeed : 42,
});
stage.addChild(scene);
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
stage.onTap = () => scene.handleTap();
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
canvas.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    scene.handleTap();
  } else if (event.key.toLowerCase() === 'r') {
    scene.restart(Number.isFinite(querySeed) ? querySeed : 42);
  }
});
window.addEventListener('resize', resize);
window.addEventListener('pagehide', () => scene.dispose(), { once: true });

// 预览测试接缝；不进入微信构建产物。
Object.assign(window, { __guiyuanPreview: { scene, stage, input } });
resize();
scene.start();
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
