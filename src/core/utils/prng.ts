/**
 * 归元弈 (Guiyuan) - 确定性伪随机数生成器 (PRNG)
 * 采用 mulberry32 算法：32位快速、确定性、高统计品质、轻量无依赖
 */

import { TIAN_GAN_LIST, TianGanInfo } from '../types/domain.js';

export interface PRNG {
  /** 生成 [0, 1) 之间的浮点数 */
  next(): number;
  /** 生成 [min, max] 之间的整数 (包含 min 和 max) */
  nextInt(min: number, max: number): number;
  /** 获取当前内部状态 (用于快照或重现) */
  getState(): number;
}

/**
 * 创建基于 mulberry32 算法的 PRNG
 * @param initialSeed 整数种子，如未传或非整数将自动规范化
 */
export function createPRNG(initialSeed: number = Date.now()): PRNG {
  let state = Math.floor(initialSeed) >>> 0;

  return {
    next(): number {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },

    nextInt(min: number, max: number): number {
      const lower = Math.ceil(min);
      const upper = Math.floor(max);
      if (lower > upper) {
        throw new Error(`Invalid range: min (${min}) must be <= max (${max})`);
      }
      const range = upper - lower + 1;
      return lower + Math.floor(this.next() * range);
    },

    getState(): number {
      return state;
    }
  };
}

/**
 * 确定性天干抽取器
 * @param prng 伪随机数发生器实例
 */
export function drawTianGan(prng: PRNG): TianGanInfo {
  const index = prng.nextInt(0, TIAN_GAN_LIST.length - 1);
  return TIAN_GAN_LIST[index];
}
