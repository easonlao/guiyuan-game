import { ActionPayload, WuXing } from '../core/types/domain';

export type CharacterActionState = 'idle' | 'attack' | 'hurt' | 'cast';
export type AnimationMode = 'pixel' | 'flow';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface FlyingProjectile {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  progress: number; // 0 ~ 1
  duration: number; // in frames
  frame: number;
  color: string;
  lightColor: string;
  mode: AnimationMode;
  trail: { x: number; y: number; alpha: number; size?: number }[];
  onComplete?: () => void;
}

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

export interface TouchButton {
  id: string;
  label: string;
  subLabel: string;
  action: ActionPayload;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  isBurst: boolean;
}

export interface VisualSealPosition {
  element: WuXing;
  x: number;
  y: number;
  radius: number;
}
