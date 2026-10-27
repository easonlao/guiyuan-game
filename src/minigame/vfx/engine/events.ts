/**
 * 动作特效事件 schema（V1）——后续所有配方卡的类型契约。
 * 时间线引擎（timeline.ts）按 `t` 触发事件；原语绘制（02/03 票）消费这些载荷。
 */

/** V1 事件类型集合。配方校验用它判「引用的 do 类型存在」。 */
export const V1_EVENT_KINDS = ['move', 'slash', 'cast', 'bolt', 'hit'] as const;
export type VfxEventKind = (typeof V1_EVENT_KINDS)[number];

export type EaseKind = 'in' | 'out' | 'inout';

interface VfxEventBase {
  /** 触发时刻（秒），从时间线起点计；必须非负且全表递增。 */
  readonly t: number;
  readonly do: VfxEventKind;
}

/** 攻击者位移（进步/收步）。 */
export interface MoveEvent extends VfxEventBase {
  readonly do: 'move';
  readonly dx: number;
  readonly duration: number;
  readonly ease?: EaseKind;
}

/** 近战命中：hit-stop + 击退 + 震屏。 */
export interface SlashEvent extends VfxEventBase {
  readonly do: 'slash';
  /** hit-stop 冻结时长（秒），0 表示不冻结。 */
  readonly stop: number;
  /** 击退冲量（像素/秒，加到目标速度上）。 */
  readonly push: number;
  /** 震屏振幅（像素）。 */
  readonly shake: number;
  /** 刀光角度（弧度）。 */
  readonly angle: number;
  readonly heavy?: boolean;
}

/** 起手蓄力。 */
export interface CastEvent extends VfxEventBase {
  readonly do: 'cast';
  readonly hold: number;
}

/** 弹道飞行。 */
export interface BoltEvent extends VfxEventBase {
  readonly do: 'bolt';
  readonly travel: number;
  readonly ease?: EaseKind;
}

/** 弹道命中（效果同 slash，无 angle）。 */
export interface HitEvent extends VfxEventBase {
  readonly do: 'hit';
  readonly stop: number;
  readonly push: number;
  readonly shake: number;
  readonly heavy?: boolean;
}

export type VfxEvent = MoveEvent | SlashEvent | CastEvent | BoltEvent | HitEvent;

/** 材质配方（V1 只管 ramp 完整性；形状/运动参数在 04 票扩展）。 */
export interface MaterialRecipe {
  /** 四色渐层（亮→暗）。 */
  readonly ramp: readonly string[];
}

/** 一张配方卡 = 事件表 + 材质。纯数据，不含函数。 */
export interface ActionRecipe {
  readonly name: string;
  readonly material: MaterialRecipe;
  readonly events: readonly VfxEvent[];
}
