// ============================================
// 场景转场动画管理器
// ============================================
// 职责：
// - 控制从菜单到战场的过场动画
// - 状态机：HOME -> EXIT -> TAIJI -> PROJECTILE -> RIPPLE -> BATTLE
// ============================================

import EventBus from '../../bus/EventBus.js';
import { ELEMENTS_DATA } from '../../config/game-config.js';

class SceneTransition {
  constructor() {
    this.state = 'HOME'; // 初始状态
    this.progress = 0;
    this.orbitAngle = 0;
    this.selfRotation = 0;
    this.taijiRot = 0;
    this.taijiStartRot = 0;
    this.rafId = null;
    this.homeOrbs = [];

    this.TAIJI_TARGET_ROT = 90;

    // 缓存 DOM 元素（性能优化）
    this.cachedElements = null;

    // 检测移动设备（只检测真实的移动设备，不考虑屏幕宽度）
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // 绑定上下文
    this.animate = this.animate.bind(this);
  }

  init() {
    this.initHomeOrbs();
    this.cacheElements();
    // 监听场景重置事件
    EventBus.on('anim:reset-scene', () => {
      this.state = 'HOME';
      this.progress = 0;
      this.orbitAngle = 0;
      this.selfRotation = 0;
      this.taijiRot = 0;
      this.taijiStartRot = 0;
    });
    // 启动主循环
    this.startLoop();
  }

  // 缓存 DOM 元素，避免每帧查询（性能优化）
  cacheElements() {
    this.cachedElements = {
      menuLayer: document.getElementById('menu-layer'),
      title: document.getElementById('title'),
      taijiCore: document.getElementById('taiji-core'),
      orbYang: document.getElementById('orb-yang'),
      orbYin: document.getElementById('orb-yin'),
      rippleUp: document.getElementById('ripple-up'),
      rippleDown: document.getElementById('ripple-down')
    };
  }
  
  initHomeOrbs() {
      const container = document.getElementById('menu-orbs-container');
      if (!container) return;

      // 始终显示所有 5 个 orb
      this.homeOrbs = ELEMENTS_DATA.map((el, i) => {
          const div = document.createElement('div');
          div.className = 'taiji-orb';
          div.style.setProperty('--cy', el.cy);
          div.style.setProperty('--ci', el.ci);
          div.innerHTML = `<div class="y-body"></div><div class="y-head"></div><div class="i-head"></div>`;
          container.appendChild(div);
          return div;
      });
  }

  startTransition() {
    this.progress = 1; // 触发 EXIT 逻辑 (progress -= ...)
    this.state = 'EXIT';
  }

  easing(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  startLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.animate);
  }

  animate() {
    // 公转速度：移动设备上加快，电脑保持原速
    const orbitSpeed = this.isMobile ? 0.002 : 0.0006;  // 手机公转快3倍多
    const rotationSpeed = 1.5;

    this.orbitAngle -= orbitSpeed;
    this.selfRotation += rotationSpeed;

    const vmin = Math.min(window.innerWidth, window.innerHeight);
    const vh = window.innerHeight;

    // 1. HOME & EXIT 阶段
    if (this.state === 'HOME' || this.state === 'EXIT') {
        const menuLayer = this.cachedElements?.menuLayer;
        if (!menuLayer) return;

        // 增加更新步长，减少总帧数
        if (this.state === 'HOME' && this.progress < 1) this.progress += 0.008;
        if (this.state === 'EXIT') this.progress -= 0.016;

        const p = this.easing(Math.max(0, Math.min(1, this.progress)));

        // 菜单整体透明度 (EXIT阶段)
        if (this.state === 'EXIT') {
            menuLayer.style.opacity = p;
        }

        // 小球旋转动画
        const scale = this.state === 'EXIT' ? p : 1;
        const radius = vmin * 0.38 * scale;

        this.homeOrbs.forEach((orb, i) => {
            const angle = (i * Math.PI * 2) / 5 + this.orbitAngle;
            const cosAngle = Math.cos(angle);
            const sinAngle = Math.sin(angle);
            orb.style.transform = `translate(${cosAngle * radius}px, ${sinAngle * radius}px) scale(${scale}) rotate(${this.selfRotation}deg)`;
        });

        // 文字消散特效 (EXIT 阶段)
        if (this.state === 'EXIT') {
            const title = this.cachedElements?.title;
            if (title && !title.classList.contains('hidden')) {
                 title.style.letterSpacing = `${1 + (1 - p) * 2}rem`;
                 title.style.filter = `blur(${(1 - p) * 10}px)`;
            }
        }

        if (this.state === 'EXIT' && this.progress <= 0) {
            this.state = 'TAIJI';
            this.progress = 0;
            this.taijiStartRot = ((this.taijiRot % 360) + 360) % 360;
            menuLayer.style.display = 'none';
        }
    }

    // 2. TAIJI 阶段 (太极球显现)
    else if (this.state === 'TAIJI') {
        const taiji = this.cachedElements?.taijiCore;
        if (!taiji) return;

        taiji.style.display = 'block';

        this.progress += 0.033;
        const p = this.easing(Math.min(1, this.progress));

        this.taijiRot = this.taijiStartRot + (this.TAIJI_TARGET_ROT - this.taijiStartRot) * p;

        taiji.style.opacity = p;
        taiji.style.transform = `translate(-50%, -50%) scale(${p}) rotate(${this.taijiRot}deg)`;

        if (this.progress >= 1) {
            this.state = 'PROJECTILE';
            this.progress = 0;
        }
    }

    // 3. PROJECTILE 阶段 (飞球分裂)
    else if (this.state === 'PROJECTILE') {
        const taiji = this.cachedElements?.taijiCore;
        const yang = this.cachedElements?.orbYang;
        const yin = this.cachedElements?.orbYin;
        if (!taiji || !yang || !yin) return;

        if (this.progress === 0) {
            yang.style.display = yin.style.display = 'block';
            yang.style.opacity = yin.style.opacity = 0;
        }

        this.progress += 0.01;
        this.taijiRot += 1.5;
        const p = this.easing(Math.min(1, this.progress));

        // 太极淡出
        const taijiFade = Math.max(0, 1 - p * 1.5);
        const taijiScale = 1 - p * 0.3;
        taiji.style.opacity = taijiFade;
        taiji.style.transform = `translate(-50%, -50%) scale(${taijiScale}) rotate(${this.taijiRot}deg)`;

        // 黑白球分离
        const dist = vh * 0.32;
        const appearProgress = Math.min(1, p / 0.25);
        const flyProgress = Math.max(0, (p - 0.25) / 0.75);

        const orbOpacity = Math.min(1, appearProgress * 1.3);
        yang.style.opacity = yin.style.opacity = orbOpacity;

        const yangDist = dist * flyProgress;
        const yinDist = -dist * flyProgress;
        const startOffset = (1 - appearProgress) * 12;

        let flightScale = 0.6 + appearProgress * 0.15;
        if (flyProgress > 0) {
            flightScale = 0.75 + flyProgress * 0.35;
        }

        yang.style.transform = `translate(-50%, calc(-50% + ${yangDist + startOffset}px)) scale(${flightScale})`;
        yin.style.transform = `translate(-50%, calc(-50% + ${yinDist - startOffset}px)) scale(${flightScale})`;

        if (this.progress >= 1) {
            this.state = 'RIPPLE';
            this.progress = 0;
        }
    }

    // 4. RIPPLE 阶段 (光圈扩散 + 棋盘显现)
    else if (this.state === 'RIPPLE') {
        this.progress += 0.025;
        const p = Math.min(1, this.progress);
        const pEase = this.easing(p);

        // 光球消失
        const orbFade = Math.max(0, 1 - p * 1.8);
        const yang = this.cachedElements?.orbYang;
        const yin = this.cachedElements?.orbYin;
        if (yang) yang.style.opacity = orbFade;
        if (yin) yin.style.opacity = orbFade;

        // 光圈扩散
        const rippleScale = 1.2 + p * 3;
        const rippleFade = Math.max(0, 1 - p * 1.3);
        const rup = this.cachedElements?.rippleUp;
        const rdown = this.cachedElements?.rippleDown;

        if (rup && rdown) {
            rup.style.opacity = rdown.style.opacity = rippleFade;
            rup.style.transform = `translate(-50%, calc(-50% + ${-vh*0.32}px)) scale(${rippleScale})`;
            rdown.style.transform = `translate(-50%, calc(-50% + ${vh*0.32}px)) scale(${rippleScale})`;
        }

        // 棋盘显现
        EventBus.emit('anim:transition-update', { phase: 'RIPPLE', progress: pEase });

        if (this.progress >= 1) {
            this.state = 'BATTLE';
            this.progress = 0;
            EventBus.emit('anim:transition-complete');
        }
    }

    this.rafId = requestAnimationFrame(this.animate);
  }
}

export default new SceneTransition();