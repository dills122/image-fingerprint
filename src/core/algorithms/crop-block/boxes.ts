import type { CropBlockBox } from './segment';

export interface SourceCropBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const mapGridBoxToSource = (
  box: CropBlockBox,
  gridSize: number,
  sourceWidth: number,
  sourceHeight: number,
): SourceCropBox => {
  const x0 = Math.max(0, Math.floor((box[0] * sourceWidth) / gridSize));
  const y0 = Math.max(0, Math.floor((box[1] * sourceHeight) / gridSize));
  const x1 = Math.min(sourceWidth, Math.ceil((box[2] * sourceWidth) / gridSize));
  const y1 = Math.min(sourceHeight, Math.ceil((box[3] * sourceHeight) / gridSize));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};
