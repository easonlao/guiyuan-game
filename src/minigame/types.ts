export type CharacterActionState = 'idle' | 'attack' | 'hurt' | 'cast';

export interface ImpactEffect {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  lightColor: string;
  alpha: number;
}
