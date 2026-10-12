import { CHARACTER_ATLAS_SIZE } from './character-sprite.js';

/** Host image dimensions are inconsistent between browser and WeChat implementations. */
export interface CharacterImageDimensions {
  readonly width?: number;
  readonly height?: number;
  readonly naturalWidth?: number;
  readonly naturalHeight?: number;
}

/** Call only after the image's successful onload; known dimensions never bypass decoding. */
export function resolveLoadedCharacterDimensions(image: CharacterImageDimensions): {
  width: number;
  height: number;
  source: 'natural' | 'reported' | 'packaged';
} {
  const valid = (value: number | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (valid(image.naturalWidth) && valid(image.naturalHeight)) {
    return { width: image.naturalWidth, height: image.naturalHeight, source: 'natural' };
  }
  if (valid(image.width) && valid(image.height)) {
    return { width: image.width, height: image.height, source: 'reported' };
  }
  return { ...CHARACTER_ATLAS_SIZE, source: 'packaged' };
}
