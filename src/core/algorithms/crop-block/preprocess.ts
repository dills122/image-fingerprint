import { normalizePixelSource, validatePixelSource } from '../../pixels';
import type { Rgba8PixelSource } from '../../types';

export type CropBlockPreprocessCandidate = 'bilinear-gaussian' | 'area-box';

const FIXED_ONE = 65_536;
const GAUSSIAN_WEIGHTS = Uint8Array.of(1, 4, 6, 4, 1);
const BOX_WEIGHTS = Uint8Array.of(1, 1, 1, 1, 1);

const toIntegerLuminance = (source: Rgba8PixelSource): Uint8Array => {
  validatePixelSource(source);
  if (source.format !== 'rgba8') {
    throw new RangeError('crop-block experiment requires rgba8 pixels');
  }
  const normalized = normalizePixelSource(source);
  if (normalized.format !== 'rgb8') {
    throw new TypeError('RGBA normalization did not produce rgb8 pixels');
  }

  const luminance = new Uint8Array(source.width * source.height);
  for (let input = 0, output = 0; input < normalized.data.length; input += 3, output += 1) {
    luminance[output] = Math.floor((
      normalized.data[input] * 299
      + normalized.data[input + 1] * 587
      + normalized.data[input + 2] * 114
      + 500
    ) / 1000);
  }
  return luminance;
};

const bilinearAxis = (
  targetIndex: number,
  sourceLength: number,
  targetLength: number,
): readonly [number, number, number] => {
  const denominator = 2 * targetLength;
  const numerator = (2 * targetIndex + 1) * sourceLength - targetLength;
  if (numerator <= 0) {
    return [0, 0, 0];
  }
  if (numerator >= (sourceLength - 1) * denominator) {
    const last = sourceLength - 1;
    return [last, last, 0];
  }
  const lower = Math.floor(numerator / denominator);
  const remainder = numerator - lower * denominator;
  const fraction = Math.floor((remainder * FIXED_ONE + targetLength) / denominator);
  return [lower, lower + 1, fraction];
};

export const resizeBilinearFixed = (
  input: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetSize: number,
): Uint8Array => {
  const output = new Uint8Array(targetSize * targetSize);
  for (let y = 0; y < targetSize; y += 1) {
    const [y0, y1, fy] = bilinearAxis(y, sourceHeight, targetSize);
    for (let x = 0; x < targetSize; x += 1) {
      const [x0, x1, fx] = bilinearAxis(x, sourceWidth, targetSize);
      const top = Math.floor((
        input[y0 * sourceWidth + x0] * (FIXED_ONE - fx)
        + input[y0 * sourceWidth + x1] * fx
        + FIXED_ONE / 2
      ) / FIXED_ONE);
      const bottom = Math.floor((
        input[y1 * sourceWidth + x0] * (FIXED_ONE - fx)
        + input[y1 * sourceWidth + x1] * fx
        + FIXED_ONE / 2
      ) / FIXED_ONE);
      output[y * targetSize + x] = Math.floor((
        top * (FIXED_ONE - fy) + bottom * fy + FIXED_ONE / 2
      ) / FIXED_ONE);
    }
  }
  return output;
};

export const resizeAreaExact = (
  input: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetSize: number,
): Uint8Array => {
  const output = new Uint8Array(targetSize * targetSize);
  const totalWeight = sourceWidth * sourceHeight;
  for (let y = 0; y < targetSize; y += 1) {
    const targetY0 = y * sourceHeight;
    const targetY1 = (y + 1) * sourceHeight;
    const sourceY0 = Math.floor(targetY0 / targetSize);
    const sourceY1 = Math.ceil(targetY1 / targetSize);
    for (let x = 0; x < targetSize; x += 1) {
      const targetX0 = x * sourceWidth;
      const targetX1 = (x + 1) * sourceWidth;
      const sourceX0 = Math.floor(targetX0 / targetSize);
      const sourceX1 = Math.ceil(targetX1 / targetSize);
      let weighted = 0;
      for (let sourceY = sourceY0; sourceY < sourceY1; sourceY += 1) {
        const overlapY = Math.min(targetY1, (sourceY + 1) * targetSize)
          - Math.max(targetY0, sourceY * targetSize);
        for (let sourceX = sourceX0; sourceX < sourceX1; sourceX += 1) {
          const overlapX = Math.min(targetX1, (sourceX + 1) * targetSize)
            - Math.max(targetX0, sourceX * targetSize);
          weighted += input[sourceY * sourceWidth + sourceX] * overlapX * overlapY;
        }
      }
      output[y * targetSize + x] = Math.floor((weighted + totalWeight / 2) / totalWeight);
    }
  }
  return output;
};

const clamp = (value: number, maximum: number): number => (
  Math.max(0, Math.min(maximum, value))
);

const separableFiveTap = (
  input: Uint8Array,
  size: number,
  weights: Uint8Array,
): Uint8Array => {
  const divisor = weights.reduce((sum, weight) => sum + weight, 0);
  const horizontal = new Uint8Array(input.length);
  const output = new Uint8Array(input.length);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let offset = -2; offset <= 2; offset += 1) {
        sum += input[y * size + clamp(x + offset, size - 1)] * weights[offset + 2];
      }
      horizontal[y * size + x] = Math.floor((sum + divisor / 2) / divisor);
    }
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let offset = -2; offset <= 2; offset += 1) {
        sum += horizontal[clamp(y + offset, size - 1) * size + x] * weights[offset + 2];
      }
      output[y * size + x] = Math.floor((sum + divisor / 2) / divisor);
    }
  }
  return output;
};

export const medianThreeByThree = (input: Uint8Array, size: number): Uint8Array => {
  const output = new Uint8Array(input.length);
  const values = new Uint8Array(9);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let index = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          values[index] = input[
            clamp(y + offsetY, size - 1) * size + clamp(x + offsetX, size - 1)
          ];
          index += 1;
        }
      }
      values.sort();
      output[y * size + x] = values[4];
    }
  }
  return output;
};

export const preprocessCropBlock = (
  source: Rgba8PixelSource,
  candidate: CropBlockPreprocessCandidate,
  gridSize: number,
): Uint8Array => {
  if (!Number.isSafeInteger(gridSize) || gridSize < 16) {
    throw new RangeError('crop-block grid size must be an integer of at least 16');
  }
  const luminance = toIntegerLuminance(source);
  if (candidate === 'bilinear-gaussian') {
    return medianThreeByThree(
      separableFiveTap(
        resizeBilinearFixed(luminance, source.width, source.height, gridSize),
        gridSize,
        GAUSSIAN_WEIGHTS,
      ),
      gridSize,
    );
  }
  if (candidate === 'area-box') {
    return medianThreeByThree(
      separableFiveTap(
        resizeAreaExact(luminance, source.width, source.height, gridSize),
        gridSize,
        BOX_WEIGHTS,
      ),
      gridSize,
    );
  }
  throw new RangeError(`Unsupported crop-block preprocessing candidate: ${candidate}`);
};
