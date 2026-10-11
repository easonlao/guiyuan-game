/**
 * 角色的动作姿势（表现态，由 `CharacterView.setExpression` 驱动）：
 * 待机 / 攻击 / 受击 / 结印，以及里程碑与终局的归一庆祝 / 胜 / 负。
 */
export type CharacterActionState =
  | 'idle'
  | 'attack'
  | 'hurt'
  | 'cast'
  | 'celebrate'
  | 'win'
  | 'lose';

export interface ImpactEffect {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  lightColor: string;
  alpha: number;
}
