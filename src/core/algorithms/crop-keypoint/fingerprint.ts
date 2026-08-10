import { normalizePixelSource, validatePixelSource } from '../../pixels';
import type { Rgba8PixelSource } from '../../types';

export interface CropKeypointExperimentOptions {
  readonly fastThreshold?: number;
  readonly contiguousPixels?: number;
  readonly maximumKeypoints?: number;
  readonly maximumKeypointsPerCell?: number;
  readonly cellSize?: number;
  readonly minimumDescriptorBitBalance?: number;
  readonly maximumDimension?: number;
  readonly verificationGridSize?: number;
}

export interface CropKeypointDescriptor {
  readonly x: number;
  readonly y: number;
  readonly response: number;
  readonly descriptor: string;
  readonly bitBalance: number;
  readonly meanRed: number;
  readonly meanGreen: number;
  readonly meanBlue: number;
}

export interface CropKeypointExperimentFingerprint {
  readonly experimental: true;
  readonly experimentalProfile: 'crop-keypoint-fast-brief-v0';
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly inputWidth: number;
  readonly inputHeight: number;
  readonly descriptorBitLength: 256;
  readonly fastThreshold: number;
  readonly contiguousPixels: number;
  readonly maximumKeypoints: number;
  readonly maximumKeypointsPerCell: number;
  readonly cellSize: number;
  readonly minimumDescriptorBitBalance: number;
  readonly maximumDimension: number;
  readonly verificationGridSize: number;
  readonly verificationGrid: string;
  readonly keypoints: readonly CropKeypointDescriptor[];
}

const PATCH_RADIUS = 15;
const DETECTOR_RADIUS = 3;
const CIRCLE = [
  [0, -3], [1, -3], [2, -2], [3, -1],
  [3, 0], [3, 1], [2, 2], [1, 3],
  [0, 3], [-1, 3], [-2, 2], [-3, 1],
  [-3, 0], [-3, -1], [-2, -2], [-1, -3],
] as const;
const POPCOUNT = Uint8Array.of(0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4);

interface BriefPair {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
}

const createBriefPattern = (): readonly BriefPair[] => {
  let state = 0x6d2b79f5;
  const coordinate = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state % (PATCH_RADIUS * 2 + 1)) - PATCH_RADIUS;
  };
  const pattern: BriefPair[] = [];
  while (pattern.length < 256) {
    const pair = { ax: coordinate(), ay: coordinate(), bx: coordinate(), by: coordinate() };
    if (pair.ax !== pair.bx || pair.ay !== pair.by) pattern.push(pair);
  }
  return pattern;
};

const BRIEF_PATTERN = createBriefPattern();

const validateInteger = (value: number, minimum: number, maximum: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
};

interface ColorPlanes {
  readonly luminance: Uint8Array;
  readonly red: Uint8Array;
  readonly green: Uint8Array;
  readonly blue: Uint8Array;
}

const colorPlanes = (source: Rgba8PixelSource): ColorPlanes => {
  const normalized = normalizePixelSource(source);
  if (normalized.format !== 'rgb8') throw new TypeError('RGBA normalization did not produce rgb8 pixels');
  const luminance = new Uint8Array(source.width * source.height);
  const red = new Uint8Array(luminance.length);
  const green = new Uint8Array(luminance.length);
  const blue = new Uint8Array(luminance.length);
  for (let input = 0, index = 0; input < normalized.data.length; input += 3, index += 1) {
    red[index] = normalized.data[input];
    green[index] = normalized.data[input + 1];
    blue[index] = normalized.data[input + 2];
    luminance[index] = Math.floor((
      normalized.data[input] * 299
      + normalized.data[input + 1] * 587
      + normalized.data[input + 2] * 114
      + 500
    ) / 1000);
  }
  return { luminance, red, green, blue };
};

const blurThreeByThree = (input: Uint8Array, width: number, height: number): Uint8Array => {
  const output = new Uint8Array(input.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const sampleY = Math.max(0, Math.min(height - 1, y + offsetY));
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = Math.max(0, Math.min(width - 1, x + offsetX));
          sum += input[sampleY * width + sampleX];
        }
      }
      output[y * width + x] = Math.floor((sum + 4) / 9);
    }
  }
  return output;
};

const resizeBilinearFixed = (
  input: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Uint8Array => {
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) return input;
  const fixedOne = 65_536;
  const axis = (targetIndex: number, sourceLength: number, targetLength: number) => {
    const denominator = 2 * targetLength;
    const numerator = (2 * targetIndex + 1) * sourceLength - targetLength;
    if (numerator <= 0) return [0, 0, 0] as const;
    if (numerator >= (sourceLength - 1) * denominator) {
      return [sourceLength - 1, sourceLength - 1, 0] as const;
    }
    const lower = Math.floor(numerator / denominator);
    const remainder = numerator - lower * denominator;
    return [lower, lower + 1, Math.floor((remainder * fixedOne + targetLength) / denominator)] as const;
  };
  const output = new Uint8Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const [y0, y1, fy] = axis(y, sourceHeight, targetHeight);
    for (let x = 0; x < targetWidth; x += 1) {
      const [x0, x1, fx] = axis(x, sourceWidth, targetWidth);
      const top = Math.floor((
        input[y0 * sourceWidth + x0] * (fixedOne - fx)
        + input[y0 * sourceWidth + x1] * fx
        + fixedOne / 2
      ) / fixedOne);
      const bottom = Math.floor((
        input[y1 * sourceWidth + x0] * (fixedOne - fx)
        + input[y1 * sourceWidth + x1] * fx
        + fixedOne / 2
      ) / fixedOne);
      output[y * targetWidth + x] = Math.floor((
        top * (fixedOne - fy) + bottom * fy + fixedOne / 2
      ) / fixedOne);
    }
  }
  return output;
};

const fastScore = (
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
  threshold: number,
  contiguousPixels: number,
): number => {
  const center = pixels[y * width + x];
  const differences = new Int16Array(16);
  for (let index = 0; index < CIRCLE.length; index += 1) {
    const [offsetX, offsetY] = CIRCLE[index];
    differences[index] = pixels[(y + offsetY) * width + x + offsetX] - center;
  }
  let brightRun = 0;
  let darkRun = 0;
  let brightMinimum = 255;
  let darkMinimum = 255;
  let score = 0;
  for (let index = 0; index < 16 + contiguousPixels - 1; index += 1) {
    const difference = differences[index % 16];
    if (difference > threshold) {
      brightRun += 1;
      brightMinimum = Math.min(brightMinimum, difference);
    } else {
      brightRun = 0;
      brightMinimum = 255;
    }
    if (difference < -threshold) {
      darkRun += 1;
      darkMinimum = Math.min(darkMinimum, -difference);
    } else {
      darkRun = 0;
      darkMinimum = 255;
    }
    if (brightRun >= contiguousPixels) score = Math.max(score, brightMinimum);
    if (darkRun >= contiguousPixels) score = Math.max(score, darkMinimum);
  }
  return score;
};

const descriptor = (pixels: Uint8Array, width: number, x: number, y: number): string => {
  let output = '';
  for (let nibble = 0; nibble < 64; nibble += 1) {
    let value = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      const pair = BRIEF_PATTERN[nibble * 4 + bit];
      value <<= 1;
      if (
        pixels[(y + pair.ay) * width + x + pair.ax]
        < pixels[(y + pair.by) * width + x + pair.bx]
      ) value |= 1;
    }
    output += value.toString(16);
  }
  return output;
};

const bitBalance = (value: string): number => {
  let ones = 0;
  for (const character of value) ones += POPCOUNT[Number.parseInt(character, 16)];
  return Math.min(ones, 256 - ones);
};

const patchMean = (
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
): number => {
  let sum = 0;
  const radius = 4;
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      sum += pixels[(y + offsetY) * width + x + offsetX];
    }
  }
  return Math.floor((sum + 40) / 81);
};

const verificationGrid = (
  red: Uint8Array,
  green: Uint8Array,
  blue: Uint8Array,
  width: number,
  height: number,
  size: number,
): string => {
  let output = '';
  const quantize = (sum: number, count: number): string => (
    Math.floor((sum + count / 2) / count).toString(16).padStart(2, '0')
  );
  for (let gridY = 0; gridY < size; gridY += 1) {
    const y0 = Math.floor((gridY * height) / size);
    const y1 = Math.max(y0 + 1, Math.floor(((gridY + 1) * height) / size));
    for (let gridX = 0; gridX < size; gridX += 1) {
      const x0 = Math.floor((gridX * width) / size);
      const x1 = Math.max(x0 + 1, Math.floor(((gridX + 1) * width) / size));
      let redSum = 0;
      let greenSum = 0;
      let blueSum = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const index = y * width + x;
          redSum += red[index];
          greenSum += green[index];
          blueSum += blue[index];
        }
      }
      const count = (x1 - x0) * (y1 - y0);
      output += quantize(redSum, count);
      output += quantize(greenSum, count);
      output += quantize(blueSum, count);
    }
  }
  return output;
};

/** @internal Clean-room FAST/BRIEF-inspired crop-keypoint experiment. */
export const fingerprintCropKeypointExperiment = (
  source: Rgba8PixelSource,
  options: CropKeypointExperimentOptions = {},
): CropKeypointExperimentFingerprint => {
  validatePixelSource(source);
  if (source.format !== 'rgba8') throw new RangeError('crop-keypoint experiment requires rgba8 pixels');
  if (source.width < 40 || source.height < 40) {
    throw new RangeError('crop-keypoint experiment requires dimensions of at least 40 pixels');
  }
  const fastThreshold = options.fastThreshold ?? 20;
  const contiguousPixels = options.contiguousPixels ?? 9;
  const maximumKeypoints = options.maximumKeypoints ?? 256;
  const maximumKeypointsPerCell = options.maximumKeypointsPerCell ?? 8;
  const cellSize = options.cellSize ?? 32;
  const minimumDescriptorBitBalance = options.minimumDescriptorBitBalance ?? 32;
  const maximumDimension = options.maximumDimension ?? 512;
  const verificationGridSize = options.verificationGridSize ?? 32;
  validateInteger(fastThreshold, 1, 255, 'FAST threshold');
  validateInteger(contiguousPixels, 9, 12, 'FAST contiguous pixels');
  validateInteger(maximumKeypoints, 1, 2048, 'maximum keypoints');
  validateInteger(maximumKeypointsPerCell, 1, 128, 'maximum keypoints per cell');
  validateInteger(cellSize, 8, 256, 'keypoint cell size');
  validateInteger(minimumDescriptorBitBalance, 0, 128, 'minimum descriptor bit balance');
  validateInteger(maximumDimension, 64, 2048, 'maximum keypoint dimension');
  validateInteger(verificationGridSize, 8, 64, 'verification grid size');
  const inputMaximum = Math.max(source.width, source.height);
  const sourceWidth = inputMaximum <= maximumDimension
    ? source.width : Math.max(40, Math.round((source.width * maximumDimension) / inputMaximum));
  const sourceHeight = inputMaximum <= maximumDimension
    ? source.height : Math.max(40, Math.round((source.height * maximumDimension) / inputMaximum));
  const planes = colorPlanes(source);
  const red = resizeBilinearFixed(planes.red, source.width, source.height, sourceWidth, sourceHeight);
  const green = resizeBilinearFixed(planes.green, source.width, source.height, sourceWidth, sourceHeight);
  const blue = resizeBilinearFixed(planes.blue, source.width, source.height, sourceWidth, sourceHeight);
  const pixels = blurThreeByThree(
    resizeBilinearFixed(planes.luminance, source.width, source.height, sourceWidth, sourceHeight),
    sourceWidth,
    sourceHeight,
  );
  const scores = new Uint8Array(sourceWidth * sourceHeight);
  const border = Math.max(PATCH_RADIUS, DETECTOR_RADIUS);
  for (let y = border; y < sourceHeight - border; y += 1) {
    for (let x = border; x < sourceWidth - border; x += 1) {
      scores[y * sourceWidth + x] = fastScore(
        pixels, sourceWidth, x, y, fastThreshold, contiguousPixels,
      );
    }
  }
  const candidates: Array<{ x: number; y: number; response: number }> = [];
  for (let y = border; y < sourceHeight - border; y += 1) {
    for (let x = border; x < sourceWidth - border; x += 1) {
      const index = y * sourceWidth + x;
      const response = scores[index];
      if (response === 0) continue;
      let maximum = true;
      for (let offsetY = -1; offsetY <= 1 && maximum; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const neighborIndex = (y + offsetY) * sourceWidth + x + offsetX;
          if (scores[neighborIndex] > response || (scores[neighborIndex] === response && neighborIndex < index)) {
            maximum = false;
            break;
          }
        }
      }
      if (maximum) candidates.push({ x, y, response });
    }
  }
  candidates.sort((left, right) => (
    right.response - left.response || left.y - right.y || left.x - right.x
  ));
  const cells = new Map<string, number>();
  const keypoints: CropKeypointDescriptor[] = [];
  for (const candidate of candidates) {
    if (keypoints.length >= maximumKeypoints) break;
    const key = `${Math.floor(candidate.x / cellSize)}:${Math.floor(candidate.y / cellSize)}`;
    const count = cells.get(key) ?? 0;
    if (count >= maximumKeypointsPerCell) continue;
    const value = descriptor(pixels, sourceWidth, candidate.x, candidate.y);
    const balance = bitBalance(value);
    if (balance < minimumDescriptorBitBalance) continue;
    cells.set(key, count + 1);
    keypoints.push({
      ...candidate,
      descriptor: value,
      bitBalance: balance,
      meanRed: patchMean(red, sourceWidth, candidate.x, candidate.y),
      meanGreen: patchMean(green, sourceWidth, candidate.x, candidate.y),
      meanBlue: patchMean(blue, sourceWidth, candidate.x, candidate.y),
    });
  }
  keypoints.sort((left, right) => left.y - right.y || left.x - right.x || right.response - left.response);
  return {
    experimental: true,
    experimentalProfile: 'crop-keypoint-fast-brief-v0',
    sourceWidth,
    sourceHeight,
    inputWidth: source.width,
    inputHeight: source.height,
    descriptorBitLength: 256,
    fastThreshold,
    contiguousPixels,
    maximumKeypoints,
    maximumKeypointsPerCell,
    cellSize,
    minimumDescriptorBitBalance,
    maximumDimension,
    verificationGridSize,
    verificationGrid: verificationGrid(red, green, blue, sourceWidth, sourceHeight, verificationGridSize),
    keypoints,
  };
};
