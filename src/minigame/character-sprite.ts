import { PlayerId } from '../core/types/domain.js';
import { CharacterActionState } from './types.js';

/** Both hosts load this packaged asset; rendering modules never construct host images. */
export const CHARACTER_ATLAS_PATH = 'assets/characters.png';

export interface CharacterSpriteFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Absolute source-image foot baseline, separate from effect/transparent margins. */
  readonly footY?: number;
}

export interface CharacterSpriteAtlas {
  readonly image: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  readonly frames?: Partial<
    Record<PlayerId, Partial<Record<CharacterActionState, CharacterSpriteFrame>>>
  >;
}

const POSE_COLUMN = {
  idle: 0,
  attack: 1,
  hurt: 2,
  cast: 3,
  celebrate: 4,
  win: 5,
  lose: 6,
} satisfies Record<CharacterActionState, number>;

/** Four columns keep sleeves and hair separate; last two cells are unused. */
export const CHARACTER_ATLAS_COLUMNS = 4;
export const CHARACTER_ATLAS_ROWS = 4;

/** Measured content crops for the packaged 1254×1254 artwork, including all hands and feet. */
export const CHARACTER_ATLAS_FRAMES = {
  P1: {
    idle: { x: 76, y: 80, width: 174, height: 264, footY: 338 },
    attack: { x: 377, y: 79, width: 214, height: 265, footY: 337 },
    hurt: { x: 683, y: 98, width: 182, height: 247, footY: 337 },
    cast: { x: 981, y: 80, width: 216, height: 264, footY: 338 },
    celebrate: { x: 66, y: 359, width: 217, height: 304, footY: 655 },
    win: { x: 389, y: 399, width: 204, height: 264, footY: 655 },
    lose: { x: 683, y: 419, width: 182, height: 244, footY: 655 },
  },
  P2: {
    idle: { x: 987, y: 392, width: 210, height: 271, footY: 656 },
    attack: { x: 43, y: 692, width: 268, height: 271, footY: 954 },
    hurt: { x: 377, y: 709, width: 219, height: 254, footY: 953 },
    cast: { x: 660, y: 713, width: 229, height: 250, footY: 955 },
    celebrate: { x: 972, y: 672, width: 248, height: 291, footY: 956 },
    win: { x: 48, y: 980, width: 268, height: 241, footY: 1214 },
    lose: { x: 388, y: 988, width: 190, height: 234, footY: 1214 },
  },
} satisfies Record<PlayerId, Record<CharacterActionState, CharacterSpriteFrame>>;

/** Artwork may provide individual crops when its cell margins differ. */
export function drawCharacterSprite(
  ctx: CanvasRenderingContext2D,
  atlas: CharacterSpriteAtlas,
  player: PlayerId,
  state: CharacterActionState,
  tick: number,
  frameX: number,
  frameY: number,
  frameWidth: number,
  frameHeight: number,
  motion?: { readonly x: number; readonly y: number },
): void {
  const cellWidth = atlas.width / CHARACTER_ATLAS_COLUMNS;
  const cellHeight = atlas.height / CHARACTER_ATLAS_ROWS;
  const sourceFrame = (pose: CharacterActionState): CharacterSpriteFrame => {
    const index = POSE_COLUMN[pose] + (player === 'P1' ? 0 : 7);
    return (
      atlas.frames?.[player]?.[pose] ?? {
        x: (index % CHARACTER_ATLAS_COLUMNS) * cellWidth,
        y: Math.floor(index / CHARACTER_ATLAS_COLUMNS) * cellHeight,
        width: cellWidth,
        height: cellHeight,
      }
    );
  };
  const crop = sourceFrame(state);
  const sourceWidth = crop.width;
  const sourceHeight = crop.height;
  // Fit each player's whole pose set once: outstretched sleeves never resize the body.
  const frames = (Object.keys(POSE_COLUMN) as CharacterActionState[]).map(sourceFrame);
  const maxWidth = Math.max(...frames.map((frame) => frame.width));
  const maxHeight = Math.max(...frames.map((frame) => frame.height));
  const scale = Math.min((frameWidth - 6) / maxWidth, (frameHeight - 12) / maxHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const offsets: Record<CharacterActionState, number> = {
    idle: Math.sin(tick * 0.08) * 2,
    attack: -2,
    hurt: 2,
    cast: Math.sin(tick * 0.06) * 1.5,
    celebrate: -Math.abs(Math.sin(tick * 0.12)) * 3,
    win: Math.sin(tick * 0.08) * 1.5,
    lose: 2,
  };
  ctx.drawImage(
    atlas.image,
    crop.x,
    crop.y,
    sourceWidth,
    sourceHeight,
    frameX + (frameWidth - width) / 2 + (motion?.x ?? 0),
    frameY +
      frameHeight -
      8 -
      ((crop.footY ?? crop.y + sourceHeight) - crop.y) * scale +
      (motion?.y ?? offsets[state]),
    width,
    height,
  );
}
