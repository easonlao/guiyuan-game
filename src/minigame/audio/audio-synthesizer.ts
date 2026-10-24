/**
 * 归元弈 · 纯代码程序化国风音效合成器 (Web Audio API)
 *
 * 零外部音频文件依赖，利用振荡器与动态包络直接合成修仙国风音效（玉磬、木鱼、雷鸣、龙吟）。
 * 在无音频支持或单测环境（Node.js / Vitest）自动静默降级，绝不抛出异常。
 */

export type SoundEffect =
  | 'tap'
  | 'deal'
  | 'trans'
  | 'atk'
  | 'burst'
  | 'guiyi'
  | 'victory'
  | 'defeat';

declare const wx:
  | {
      createWebAudioContext?: () => AudioContext;
    }
  | undefined;

export class AudioSynthesizer {
  private ctx: AudioContext | null = null;
  private _enabled = true;
  private _volume = 0.8;
  private initialized = false;

  public constructor() {
    // 延迟初始化：现代浏览器与微信小游戏需要用户交互才允许音频上下文解锁
  }

  public get enabled(): boolean {
    return this._enabled;
  }

  public set enabled(val: boolean) {
    this._enabled = val;
  }

  public get volume(): number {
    return this._volume;
  }

  public set volume(val: number) {
    this._volume = Math.max(0, Math.min(1, val));
  }

  /** 在首次用户交互时激活 AudioContext */
  public unlock(): void {
    if (this.ctx === null) {
      this.initContext();
    }
    if (this.ctx !== null && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
  }

  private initContext(): void {
    if (this.initialized) return;
    this.initialized = true;
    try {
      if (typeof window !== 'undefined') {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      } else if (typeof wx !== 'undefined' && typeof wx.createWebAudioContext === 'function') {
        this.ctx = wx.createWebAudioContext();
      }
    } catch {
      this.ctx = null;
    }
  }

  public play(effect: SoundEffect): void {
    if (!this._enabled || this._volume <= 0) return;
    this.unlock();
    if (this.ctx === null) return;

    try {
      const now = this.ctx.currentTime;
      switch (effect) {
        case 'tap':
          this.playWoodBlock(now);
          break;
        case 'deal':
          this.playWindChime(now);
          break;
        case 'trans':
          this.playWaterFlow(now);
          break;
        case 'atk':
          this.playThunderStrike(now);
          break;
        case 'burst':
          this.playDragonRoar(now);
          break;
        case 'guiyi':
          this.playJadeBell(now);
          break;
        case 'victory':
          this.playVictoryFanfare(now);
          break;
        case 'defeat':
          this.playDefeatGong(now);
          break;
      }
    } catch {
      // 音频异常静默兜底
    }
  }

  /** 木鱼点落音 (轻快短促) */
  private playWoodBlock(now: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.05);

    gain.gain.setValueAtTime(this._volume * 0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  /** 天干流光风铃音 (清越天籁) */
  private playWindChime(now: number): void {
    if (!this.ctx) return;
    const notes = [1046.5, 1318.5, 1567.98]; // C6, E6, G6
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const t = now + idx * 0.04;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(this._volume * 0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.23);
    });
  }

  /** 五行相生水流音 (温润滑音) */
  private playWaterFlow(now: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.16);

    gain.gain.setValueAtTime(this._volume * 0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.23);
  }

  /** 五行克破雷击音 (金石冰裂) */
  private playThunderStrike(now: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.14);

    gain.gain.setValueAtTime(this._volume * 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  /** 爆发强化龙吟音 (低频共鸣震颤) */
  private playDragonRoar(now: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.35);

    gain.gain.setValueAtTime(this._volume * 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  /** 五行节点归一玉磬音 (空灵悠远古钟) */
  private playJadeBell(now: number): void {
    if (!this.ctx) return;
    const harmonics = [587.33, 1174.66, 1760.0]; // D5, D6, A6
    harmonics.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      const amp = this._volume * (0.35 / (idx + 1));
      gain.gain.setValueAtTime(amp, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now);
      osc.stop(now + 0.7);
    });
  }

  /** 终局获胜仙音合奏 */
  private playVictoryFanfare(now: number): void {
    if (!this.ctx) return;
    const chord = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    chord.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const t = now + idx * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(this._volume * 0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.85);
    });
  }

  /** 终局惜败低沉铜锣 */
  private playDefeatGong(now: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.5);

    gain.gain.setValueAtTime(this._volume * 0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.65);
  }
}

/** 全局单例合成器 */
export const audioSynthesizer = new AudioSynthesizer();
