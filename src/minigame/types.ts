export type CharacterActionState = 'idle' | 'attack' | 'hurt' | 'cast';
export type AnimationMode = 'pixel' | 'flow';

export interface ImpactEffect {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  lightColor: string;
  alpha: number;
  life: number;
  maxLife: number;
  mode: AnimationMode;
}
