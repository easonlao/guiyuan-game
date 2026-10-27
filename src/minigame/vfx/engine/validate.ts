/**
 * 配方校验（开发期断言）：卡片加载即校验，错误一次报全。
 * 上限等数值由调用方传入（引擎零魔法数字）。
 */
import type { ActionRecipe } from './events.js';
import { V1_EVENT_KINDS } from './events.js';

export interface RecipeLimits {
  /** hit-stop 冻结时长上限（秒）。 */
  readonly maxStop: number;
  /** 材质 ramp 要求的色数。 */
  readonly rampLength: number;
}

/** 返回错误列表；空列表 = 合法。 */
export function validateRecipe(recipe: ActionRecipe, limits: RecipeLimits): readonly string[] {
  const errors: string[] = [];

  recipe.events.forEach((event, i) => {
    const at = `事件[${i}](${String(event.do)})`;
    if (!Number.isFinite(event.t) || event.t < 0) {
      errors.push(`${at}：t=${String(event.t)} 不能为负或非数值`);
    }
    if (i > 0 && event.t <= recipe.events[i - 1].t) {
      errors.push(`${at}：t=${String(event.t)} 未递增（前一事件 t=${recipe.events[i - 1].t}）`);
    }
    if (!(V1_EVENT_KINDS as readonly string[]).includes(event.do)) {
      errors.push(`${at}：未知事件类型 "${String(event.do)}"`);
    }
    if ((event.do === 'slash' || event.do === 'hit') && event.stop > limits.maxStop) {
      errors.push(`${at}：stop=${event.stop} 超过上限 ${limits.maxStop}s`);
    }
  });

  const ramp = recipe.material.ramp;
  if (ramp.length !== limits.rampLength || ramp.some((c) => typeof c !== 'string' || c === '')) {
    errors.push(`材质 ramp 需要 ${limits.rampLength} 个非空颜色，实际 ${ramp.length} 个`);
  }

  return errors;
}
