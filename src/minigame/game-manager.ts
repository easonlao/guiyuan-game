import { TurnManager } from '../core/logic/TurnManager';
import { RuleSwitches } from '../core/logic/ActionCandidates';
import { createPRNG, PRNG } from '../core/utils/prng';
import { ActionPayload, ActionType, GameState, PlayerId, Polarity, TianGanInfo, WuXing } from '../core/types/domain';
import { BALANCED_WEIGHTS, createStrategy } from '../core/ai/Strategy';
import { DecisionStrategy } from '../core/ai/types';
import { AnimationMode, CharacterActionState, FlyingProjectile, ImpactEffect, TouchButton } from './types';
import { formatActionButton, getActionTargetElement } from './action-button-formatter';
import {
  drawCenterTianGanRune,
  drawFlyingEnergy,
  drawImpactEffect,
  drawModeToggleBar,
  drawPixelBox,
  drawPixelCharacter,
  drawPixelRect,
  drawTouchButton,
  drawWuXingSeal,
  WUXING_PALETTE
} from './pixel-art';

const ELEMENTS_ORDER: WuXing[] = [
  WuXing.WOOD,
  WuXing.FIRE,
  WuXing.EARTH,
  WuXing.METAL,
  WuXing.WATER
];

export interface GameManagerOptions {
  readonly seed?: number;
  readonly initialState?: GameState;
  readonly prng?: PRNG;
  /** 通用规则开关；默认恒等，不传即全部关闭 */
  readonly rules?: RuleSwitches;
}

export class GameManager {
  private turnManager!: TurnManager;
  private readonly rules: RuleSwitches;
  private readonly aiStrategy: DecisionStrategy;
  private currentTianGan: TianGanInfo | null = null;
  private availableButtons: TouchButton[] = [];

  // 动效与方案对比
  public animMode: AnimationMode = 'pixel';
  private flyingProjectiles: FlyingProjectile[] = [];
  private impactEffects: ImpactEffect[] = [];
  private isAnimating: boolean = false;

  // 画面尺寸与状态
  public width: number = 375;
  public height: number = 667;
  public pixelRatio: number = 2;
  private animTick: number = 0;
  private screenShake: number = 0;

  // 角色状态
  private p1State: CharacterActionState = 'idle';
  private p2State: CharacterActionState = 'idle';
  private p1ActionTimer: number = 0;
  private p2ActionTimer: number = 0;

  // 战斗播报
  private bannerText: string = '对局开始 · 双方对峙';
  private bannerSubText: string = '追求五行归元，调和阴阳';

  // 天命揭牌事件记录
  private lastShowdownInfo: {
    round: number;
    player: PlayerId;
    tianGan: TianGanInfo;
    success: boolean;
    winner: PlayerId;
  } | null = null;

  // AI 思考调度与 P1 自动吸纳调度
  private aiThinkingTimer: number = 0;
  private p1AutoAbsorbTimer: number = 0;
  public safeTop: number = 44;
  public safeBottom: number = 16;

  constructor(seedOrOptions: number | GameManagerOptions = Date.now()) {
    let prng: PRNG;
    let initialState: GameState | undefined;
    if (typeof seedOrOptions === 'number') {
      prng = createPRNG(seedOrOptions);
      this.rules = {};
    } else {
      prng = seedOrOptions.prng ?? createPRNG(seedOrOptions.seed ?? Date.now());
      initialState = seedOrOptions.initialState;
      this.rules = seedOrOptions.rules ?? {};
    }
    // 规则开关同时绑定到 AI 估值器与回合候选生成器，保证两个消费点读到同一份开关
    this.aiStrategy = createStrategy(BALANCED_WEIGHTS, { rules: this.rules });
    this.initTurnManager(prng, initialState);
    this.startNewTurn();
  }

  private initTurnManager(prng: PRNG, initialState?: GameState): void {
    this.turnManager = new TurnManager({ prng, initialState, rules: this.rules });
    this.lastShowdownInfo = null;
    this.turnManager.getEventBus().on('showdown:draw', (data) => {
      this.lastShowdownInfo = data;
    });
  }

  public resize(
    width: number,
    height: number,
    pixelRatio: number,
    safeTop: number = 44,
    safeBottom: number = 16
  ): void {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.safeTop = Math.max(safeTop, 24);
    this.safeBottom = Math.max(safeBottom, 12);
    this.updateButtons();
  }

  /** 开始新回合 */
  private startNewTurn(): void {
    this.turnManager.startTurn();
    this.currentTianGan = this.turnManager.getCurrentTianGan();
    const state = this.turnManager.getState();

    if (state.isGameOver) {
      this.availableButtons = [];
      this.p1AutoAbsorbTimer = 0;
      this.aiThinkingTimer = 0;

      if (this.lastShowdownInfo) {
        const info = this.lastShowdownInfo;
        const elemName = WUXING_PALETTE[info.tianGan.element]?.name ?? '';
        const tgLabel = `${info.tianGan.name}${elemName}`;
        this.bannerText = '【终轮绝杀·天命抽牌】';
        if (info.success) {
          this.bannerSubText = `【天命逆转】五行归元·后发制人！(抽中【${tgLabel}】)`;
          // 视觉定格与冲击动效
          const elemCfg = WUXING_PALETTE[info.tianGan.element] ?? WUXING_PALETTE[WuXing.WOOD];
          const sealPos = this.getSealPosition(false, info.tianGan.element);
          this.impactEffects.push({
            x: sealPos.x,
            y: sealPos.y,
            radius: 8,
            maxRadius: 36,
            color: elemCfg.main,
            lightColor: elemCfg.light,
            alpha: 1,
            life: 24,
            maxLife: 24,
            mode: this.animMode
          });
          this.screenShake = 6;
        } else {
          this.bannerSubText = `【天命难违】差之一线·先手锁定胜局！(抽中【${tgLabel}】)`;
          const centerPos = this.getCenterPosition();
          this.impactEffects.push({
            x: centerPos.x,
            y: centerPos.y,
            radius: 4,
            maxRadius: 20,
            color: '#718096',
            lightColor: '#a0aec0',
            alpha: 0.8,
            life: 18,
            maxLife: 18,
            mode: this.animMode
          });
        }
      } else {
        this.bannerText = state.winner === 'P1' ? '★ 五行归元 ★ 玩家大胜！' : '天道通玄 · 遗憾惜败！';
        this.bannerSubText = state.endReason ?? '对局结束';
      }
      return;
    }

    const currentPlayer = state.currentPlayer;
    const tg = this.currentTianGan;
    const isExtra = this.turnManager.isExtraTurnActive();

    if (currentPlayer === 'P1') {
      const actions = this.turnManager.getAvailableActions();
      if (actions.length === 1) {
        this.p1AutoAbsorbTimer = 45; // 约 0.75 秒倒计时
        this.bannerText = isExtra ? '【连动回合】玩家额外行动！' : `玩家回合 · 天干【${tg?.name ?? ''}】降临`;
        const actType = actions[0].actionType;
        switch (actType) {
          case ActionType.AUTO:
            this.bannerSubText = '自动吸纳中';
            break;
          case ActionType.DISSIPATE:
            this.bannerSubText = '亢极满溢·散气回落中';
            break;
          case ActionType.PASS:
            this.bannerSubText = '道法受阻·消散过牌中';
            break;
          case ActionType.ATK:
            this.bannerSubText = '唯一机缘·破';
            break;
          case ActionType.TRANS:
            this.bannerSubText = '唯一机缘·化';
            break;
          case ActionType.CONVERT:
            this.bannerSubText = '势在必行·调息';
            break;
          case ActionType.BURST:
            this.bannerSubText = '势在必行·强化';
            break;
          case ActionType.BURST_ATK:
            this.bannerSubText = '势在必行·强破';
            break;
        }
      } else {
        this.p1AutoAbsorbTimer = 0;
        this.bannerText = isExtra ? '【连动回合】玩家额外行动！' : `玩家回合 · 天干【${tg?.name ?? ''}】降临`;
        this.bannerSubText = `属性: ${tg?.element ?? ''} (${tg?.polarity === Polarity.YANG ? '阳' : '阴'})`;
      }
      this.updateButtons();
    } else {
      this.p1AutoAbsorbTimer = 0;
      this.bannerText = isExtra ? '【连动回合】天道施展额外行动！' : `天道回合 · 天干【${tg?.name ?? ''}】降临`;
      this.bannerSubText = '天道推演生克中...';
      this.availableButtons = [];
      this.aiThinkingTimer = 55; // 约 0.9 秒思考
    }
  }

  /** 将合法动作映射为触摸按钮 */
  private updateButtons(): void {
    const actions = this.turnManager.getAvailableActions();
    const state = this.turnManager.getState();
    if (state.isGameOver || state.currentPlayer !== 'P1') {
      this.availableButtons = [];
      return;
    }

    if (actions.length !== 1) {
      this.p1AutoAbsorbTimer = 0;
    }

    const isAutoAbsorb = this.p1AutoAbsorbTimer > 0;
    const effectiveTop = this.safeTop + 8;
    const effectiveBottom = this.height - this.safeBottom;
    const playableHeight = effectiveBottom - effectiveTop;
    const topBarH = 38;
    const consoleY = effectiveTop + topBarH + Math.floor((playableHeight - topBarH) * 0.58);
    const startY = consoleY + 36;
    const count = actions.length;
    const buttons: TouchButton[] = [];
    const containerW = this.width - 56;

    actions.forEach((act, idx) => {
      const formatted = formatActionButton(act, isAutoAbsorb);

      let btnX = 0;
      let btnY = 0;
      let btnW = 0;
      let btnH = 50;

      if (count <= 2) {
        btnW = Math.floor((containerW - (count - 1) * 12) / count);
        btnX = 28 + idx * (btnW + 12);
        btnY = startY + 10;
        btnH = 56;
      } else if (count === 3) {
        btnW = Math.floor((containerW - 16) / 3);
        btnX = 28 + idx * (btnW + 8);
        btnY = startY + 10;
        btnH = 54;
      } else {
        const cols = 2;
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        btnW = Math.floor((containerW - 12) / cols);
        btnX = 28 + col * (btnW + 12);
        btnY = startY + row * (btnH + 10);
      }

      buttons.push({
        id: `btn_${idx}`,
        label: formatted.label,
        subLabel: formatted.subLabel,
        action: act,
        x: btnX,
        y: btnY,
        width: btnW,
        height: btnH,
        color: formatted.color,
        isBurst: formatted.isBurst
      });
    });

    this.availableButtons = buttons;
  }

  /** 获取道场中心高度 */
  private getArenaY(): number {
    const effectiveTop = this.safeTop + 8;
    const effectiveBottom = this.height - this.safeBottom;
    const playableHeight = effectiveBottom - effectiveTop;
    const topBarH = 38;
    return effectiveTop + topBarH + Math.floor((playableHeight - topBarH) * 0.26);
  }

  /** 获取五行节点的屏幕坐标 */
  public getSealPosition(isP1: boolean, elem: WuXing): { x: number; y: number } {
    const arenaY = this.getArenaY();
    const p1X = 55;
    const p2X = this.width - 55;
    const baseX = isP1 ? p1X + 48 : p2X - 48;
    const arcOffsets = [
      { dy: -56, dx: 0 },
      { dy: -28, dx: isP1 ? 16 : -16 },
      { dy: 0,   dx: isP1 ? 24 : -24 },
      { dy: 28,  dx: isP1 ? 16 : -16 },
      { dy: 56,  dx: 0 }
    ];
    const idx = ELEMENTS_ORDER.indexOf(elem);
    const pos = idx >= 0 ? arcOffsets[idx] : { dx: 0, dy: 0 };
    return { x: baseX + pos.dx, y: arenaY + pos.dy };
  }

  /** 获取中央天元区坐标 */
  public getCenterPosition(): { x: number; y: number } {
    return { x: this.width / 2, y: this.getArenaY() };
  }

  /** 随时触发测试天干吸收动效（供对比体验） */
  public triggerPreviewAbsorption(): void {
    if (!this.currentTianGan || this.isAnimating) return;
    const tg = this.currentTianGan;
    const elemCfg = WUXING_PALETTE[tg.element] ?? WUXING_PALETTE[WuXing.WOOD];
    const start = this.getCenterPosition();
    const target = this.getSealPosition(true, tg.element);

    this.isAnimating = true;
    this.flyingProjectiles.push({
      startX: start.x,
      startY: start.y,
      currentX: start.x,
      currentY: start.y,
      targetX: target.x,
      targetY: target.y,
      progress: 0,
      duration: 22,
      frame: 0,
      color: elemCfg.main,
      lightColor: elemCfg.light,
      mode: this.animMode,
      trail: [],
      onComplete: () => {
        this.impactEffects.push({
          x: target.x,
          y: target.y,
          radius: 4,
          maxRadius: 28,
          color: elemCfg.main,
          lightColor: elemCfg.light,
          alpha: 1,
          life: 16,
          maxLife: 16,
          mode: this.animMode
        });
        this.isAnimating = false;
      }
    });
  }

  /** 执行触摸输入 */
  public handleTouch(touchX: number, touchY: number): void {
    const state = this.turnManager.getState();
    if (state.isGameOver) {
      // 游戏结束点击任意位置重新开局
      const prng = createPRNG(Date.now());
      this.initTurnManager(prng);
      this.startNewTurn();
      return;
    }

    const effectiveTop = this.safeTop + 8;
    const topBarH = 38;
    const toggleY = effectiveTop + topBarH + 6;
    const toggleH = 26;

    // 1. 检查是否点击了方案切换条
    if (
      touchX >= 16 &&
      touchX <= this.width - 16 &&
      touchY >= toggleY &&
      touchY <= toggleY + toggleH
    ) {
      this.animMode = this.animMode === 'pixel' ? 'flow' : 'pixel';
      return;
    }

    // 若正处于 P1 单动作缓冲倒计时，点击屏幕任意区域或按钮立即加速执行该动作
    if (this.p1AutoAbsorbTimer > 0) {
      this.p1AutoAbsorbTimer = 0;
      if (this.availableButtons.length > 0) {
        this.executePlayerAction(this.availableButtons[0].action);
      }
      return;
    }

    // 2. 检查是否点击了中央天干（允许直接点击预览吸收效果）
    const centerPos = this.getCenterPosition();
    const distSq = (touchX - centerPos.x) ** 2 + (touchY - centerPos.y) ** 2;
    if (distSq <= 30 * 30 && !this.isAnimating) {
      this.triggerPreviewAbsorption();
      return;
    }

    if (this.isAnimating) return;
    if (state.currentPlayer !== 'P1') return;

    for (const btn of this.availableButtons) {
      if (
        touchX >= btn.x &&
        touchX <= btn.x + btn.width &&
        touchY >= btn.y &&
        touchY <= btn.y + btn.height
      ) {
        this.executePlayerAction(btn.action);
        break;
      }
    }
  }

  private executePlayerAction(action: ActionPayload): void {
    this.p1AutoAbsorbTimer = 0;
    this.dispatchAction(action, true);
  }

  /** 帧更新 (逻辑时钟) */
  public update(): void {
    this.animTick++;
    if (this.screenShake > 0) this.screenShake--;

    if (this.p1ActionTimer > 0) {
      this.p1ActionTimer--;
      if (this.p1ActionTimer === 0) this.p1State = 'idle';
    }
    if (this.p2ActionTimer > 0) {
      this.p2ActionTimer--;
      if (this.p2ActionTimer === 0) this.p2State = 'idle';
    }

    // 更新飞行投射物
    for (let i = this.flyingProjectiles.length - 1; i >= 0; i--) {
      const p = this.flyingProjectiles[i];
      p.frame++;
      const t = Math.min(1, p.frame / p.duration);
      // 三次平滑缓动
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      p.progress = ease;

      const heightOffset = -Math.sin(t * Math.PI) * 35;
      p.currentX = p.startX + (p.targetX - p.startX) * ease;
      p.currentY = p.startY + (p.targetY - p.startY) * ease + heightOffset;

      p.trail.unshift({
        x: p.currentX,
        y: p.currentY,
        alpha: 0.9,
        size: p.mode === 'pixel' ? (Math.random() > 0.5 ? 4 : 2) : 6
      });
      if (p.trail.length > 8) p.trail.pop();
      p.trail.forEach((tr) => (tr.alpha *= 0.8));

      if (p.frame >= p.duration) {
        const onComplete = p.onComplete;
        this.flyingProjectiles.splice(i, 1);
        if (onComplete) onComplete();
      }
    }

    // 更新冲击动效
    for (let i = this.impactEffects.length - 1; i >= 0; i--) {
      const eff = this.impactEffects[i];
      eff.life--;
      const progress = 1 - eff.life / eff.maxLife;
      eff.radius = 4 + progress * (eff.maxRadius - 4);
      eff.alpha = 1 - progress;
      if (eff.life <= 0) {
        this.impactEffects.splice(i, 1);
      }
    }

    // AI 决策计时 (仅在没有播放动画时推进)
    const state = this.turnManager.getState();
    if (!state.isGameOver && state.currentPlayer === 'P2' && !this.isAnimating) {
      if (this.aiThinkingTimer > 0) {
        this.aiThinkingTimer--;
        if (this.aiThinkingTimer === 0) {
          this.executeAIAction();
        }
      }
    }

    // P1 自动吸纳倒计时推进 (仅在没有播放动画且玩家回合时推进)
    if (!state.isGameOver && state.currentPlayer === 'P1' && !this.isAnimating) {
      if (this.p1AutoAbsorbTimer > 0) {
        this.p1AutoAbsorbTimer--;
        if (this.p1AutoAbsorbTimer === 0) {
          if (this.availableButtons.length > 0) {
            this.executePlayerAction(this.availableButtons[0].action);
          }
        }
      }
    }
  }

  private executeAIAction(): void {
    const state = this.turnManager.getState();
    const tg = this.turnManager.getCurrentTianGan()!;
    const available = this.turnManager.getAvailableActions();
    const action = this.aiStrategy(state, tg, available);
    this.dispatchAction(action, false);
  }

  private dispatchAction(action: ActionPayload, isP1: boolean): void {
    const targetElem = getActionTargetElement(action, this.currentTianGan?.element);
    const elemCfg = WUXING_PALETTE[targetElem] ?? WUXING_PALETTE[WuXing.WOOD];
    const isAttack = action.actionType === ActionType.ATK || action.actionType === ActionType.BURST_ATK;

    if (isP1) {
      this.p1State = isAttack ? 'attack' : 'cast';
      this.p1ActionTimer = 30;
    } else {
      this.p2State = isAttack ? 'attack' : 'cast';
      this.p2ActionTimer = 30;
    }

    let startPos = this.getCenterPosition();
    let targetPos = this.getSealPosition(isP1, targetElem);

    if (isAttack) {
      if (isP1) {
        this.p2State = 'hurt';
        this.p2ActionTimer = 25;
      } else {
        this.p1State = 'hurt';
        this.p1ActionTimer = 25;
      }
      this.screenShake = action.actionType === ActionType.BURST_ATK ? 8 : 4;
      const srcElem = action.sourceElement ?? targetElem;
      startPos = this.getSealPosition(isP1, srcElem);
      targetPos = this.getSealPosition(!isP1, targetElem);
    }

    this.isAnimating = true;
    this.flyingProjectiles.push({
      startX: startPos.x,
      startY: startPos.y,
      currentX: startPos.x,
      currentY: startPos.y,
      targetX: targetPos.x,
      targetY: targetPos.y,
      progress: 0,
      duration: 22,
      frame: 0,
      color: elemCfg.main,
      lightColor: elemCfg.light,
      mode: this.animMode,
      trail: [],
      onComplete: () => {
        this.impactEffects.push({
          x: targetPos.x,
          y: targetPos.y,
          radius: 4,
          maxRadius: 28,
          color: elemCfg.main,
          lightColor: elemCfg.light,
          alpha: 1,
          life: 16,
          maxLife: 16,
          mode: this.animMode
        });
        this.turnManager.executeAction(action);
        this.isAnimating = false;
        this.startNewTurn();
      }
    });
  }

  /** 渲染主循环 */
  public render(ctx: any): void {
    ctx.save();
    if (this.screenShake > 0) {
      const shakeX = (Math.random() - 0.5) * this.screenShake * 2;
      const shakeY = (Math.random() - 0.5) * this.screenShake * 2;
      ctx.translate(shakeX, shakeY);
    }

    // 1. 背景暗夜道场
    drawPixelRect(ctx, 0, 0, this.width, this.height, '#0a0d14');

    const effectiveTop = this.safeTop + 8;
    const effectiveBottom = this.height - this.safeBottom;
    const playableHeight = effectiveBottom - effectiveTop;
    const topBarH = 38;

    // 2. 顶栏信息 (回合数与比分) - 严格避开刘海屏/灵动岛
    const state = this.turnManager.getState();
    drawPixelBox(ctx, 16, effectiveTop, this.width - 32, topBarH, '#111827', '#374151', 2);
    ctx.fillStyle = '#f6e05e';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`回合: ${state.round}/60`, 28, effectiveTop + 24);

    ctx.fillStyle = '#63b3ed';
    ctx.fillText(`玩家(P1): ${state.players.P1.score}分`, 130, effectiveTop + 24);

    ctx.fillStyle = '#b794f4';
    ctx.textAlign = 'right';
    ctx.fillText(`天道(P2): ${state.players.P2.score}分`, this.width - 28, effectiveTop + 24);

    // 2.5 动效方案切换栏 (供 A/B 对比)
    drawModeToggleBar(
      ctx,
      16,
      effectiveTop + topBarH + 6,
      this.width - 32,
      26,
      this.animMode
    );

    // 3. 左右角色站位
    const arenaY = effectiveTop + topBarH + Math.floor((playableHeight - topBarH) * 0.26);
    const p1X = 55;
    const p2X = this.width - 55;

    // 地面道场投影
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.ellipse(p1X, arenaY + 45, 36, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p2X, arenaY + 45, 36, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // 绘制像素角色
    drawPixelCharacter(ctx, p1X, arenaY, true, this.p1State, this.animTick);
    drawPixelCharacter(ctx, p2X, arenaY, false, this.p2State, this.animTick);

    // 4. 双方身前弧形五行灵核 (护体灵阵)
    this.renderSeals(ctx, p1X + 48, arenaY, true, state.players.P1.board);
    this.renderSeals(ctx, p2X - 48, arenaY, false, state.players.P2.board);

    // 5. 中央天元区 (天干符文与生克指示 - 支持方案A与方案B对比)
    if (this.currentTianGan) {
      drawCenterTianGanRune(
        ctx,
        this.width / 2,
        arenaY,
        this.currentTianGan,
        this.animMode,
        this.animTick
      );
    }

    // 5.5 绘制飞行吸收能量与冲击特效
    for (const flyer of this.flyingProjectiles) {
      drawFlyingEnergy(ctx, flyer);
    }
    for (const impact of this.impactEffects) {
      drawImpactEffect(ctx, impact);
    }

    // 6. 战斗播报横幅
    const bannerY = effectiveTop + topBarH + Math.floor((playableHeight - topBarH) * 0.44);
    const bannerH = 64;
    drawPixelBox(ctx, 16, bannerY, this.width - 32, bannerH, '#171e2e', '#4b5563', 2);
    ctx.fillStyle = '#f7fafc';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.bannerText, this.width / 2, bannerY + 24);
    ctx.fillStyle = '#a0aec0';
    ctx.font = '11px monospace';
    ctx.fillText(this.bannerSubText, this.width / 2, bannerY + 46);

    // 7. 底部博弈操作台
    const consoleY = effectiveTop + topBarH + Math.floor((playableHeight - topBarH) * 0.58);
    const consoleH = effectiveBottom - consoleY - 8;
    drawPixelBox(ctx, 14, consoleY, this.width - 28, consoleH, '#111827', '#374151', 2);

    ctx.fillStyle = '#9ca3af';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('【 战术决策 】', 28, consoleY + 22);

    for (const btn of this.availableButtons) {
      drawTouchButton(ctx, btn, false);
    }

    if (state.currentPlayer === 'P2' && !state.isGameOver) {
      ctx.fillStyle = '#b794f4';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('● 天道推演决策中...', this.width / 2, consoleY + 68);
      ctx.fillStyle = '#718096';
      ctx.font = '11px monospace';
      ctx.fillText('正在权衡五行生克与阴阳两仪', this.width / 2, consoleY + 92);
    }

    if (state.isGameOver) {
      ctx.fillStyle = '#f6e05e';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      if (this.lastShowdownInfo) {
        ctx.fillText(
          this.lastShowdownInfo.success
            ? '★【天命逆转】五行归元·后发制人！★'
            : '★【天命难违】差之一线·先手锁定胜局！★',
          this.width / 2,
          consoleY + 68
        );
      } else {
        ctx.fillText(state.winner === 'P1' ? '★ 恭喜！五行圆满大获全胜 ★' : '天道终局 · 比分结算完毕', this.width / 2, consoleY + 68);
      }
      ctx.fillStyle = '#63b3ed';
      ctx.font = '12px monospace';
      ctx.fillText('【 点击屏幕任意区域 重新开局 】', this.width / 2, consoleY + 95);
    }

    ctx.restore();
  }

  /** 绘制一侧角色的五行护体灵核 */
  private renderSeals(
    ctx: any,
    baseX: number,
    baseY: number,
    isLeft: boolean,
    board: any
  ): void {
    const radius = 15;
    const arcOffsets = [
      { dy: -56, dx: 0 },
      { dy: -28, dx: isLeft ? 16 : -16 },
      { dy: 0,   dx: isLeft ? 24 : -24 },
      { dy: 28,  dx: isLeft ? 16 : -16 },
      { dy: 56,  dx: 0 }
    ];

    ELEMENTS_ORDER.forEach((elem, idx) => {
      const node = board[elem];
      const pos = arcOffsets[idx];
      const x = baseX + pos.dx;
      const y = baseY + pos.dy;
      const isGuiYi = node.yin >= 1 && node.yang >= 1;

      drawWuXingSeal(
        ctx,
        x,
        y,
        radius,
        elem,
        node.yin,
        node.yang,
        isGuiYi,
        this.animTick
      );
    });
  }

  // --- 测试与状态观察助手方法 ---

  public getState() {
    return this.turnManager.getState();
  }

  public getTurnManager(): TurnManager {
    return this.turnManager;
  }

  public getAvailableActions(): ActionPayload[] {
    return this.turnManager.getAvailableActions();
  }

  public getAvailableButtons(): TouchButton[] {
    return this.availableButtons;
  }

  public getP1AutoTimer(): number {
    return this.p1AutoAbsorbTimer;
  }

  public isAutoAbsorbing(): boolean {
    return this.p1AutoAbsorbTimer > 0;
  }

  public isAnimatingState(): boolean {
    return this.isAnimating;
  }

  public getBannerText(): string {
    return this.bannerText;
  }

  public getBannerSubText(): string {
    return this.bannerSubText;
  }

  public getLastShowdownInfo() {
    return this.lastShowdownInfo;
  }
}

