import { normalizePixelSource, validatePixelSource } from '../../pixels';
import type { Rgba8PixelSource } from '../../types';

export interface CropLocalFeature {
  readonly x: number;
  readonly y: number;
  readonly pyramidLevel: number;
  readonly scalePermille: number;
  readonly orientationBin: number;
  readonly response: number;
  readonly descriptor: string;
}

export interface CropLocalVerificationSketch {
  readonly width: number;
  readonly height: number;
  readonly luminance: string;
}

export interface CropLocalExperimentFingerprint {
  readonly experimental: true;
  readonly experimentalProfile: 'crop-local-multiscale-binary-v0';
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly inputWidth: number;
  readonly inputHeight: number;
  readonly descriptorBitLength: 256;
  readonly maximumFeatures: number;
  readonly pyramidScalePermille: readonly number[];
  readonly features: readonly CropLocalFeature[];
  readonly verification: CropLocalVerificationSketch;
}

export interface CropLocalExperimentOptions {
  readonly maximumDimension?: number;
  readonly maximumFeatures?: number;
  readonly fastThreshold?: number;
  readonly maximumFeaturesPerCell?: number;
  readonly verificationMaximumDimension?: number;
}

const PATCH_RADIUS = 15;
const DESCRIPTOR_BORDER = 22;
const PYRAMID_SCALES = [1000, 1250, 1563, 1953, 2441, 3052] as const;
const MAXIMUM_SOURCE_DIMENSION = 2048;
const MAXIMUM_FEATURES = 1024;
const MAXIMUM_VERIFICATION_DIMENSION = 256;
const DESCRIPTOR_PATTERN = /^[0-9a-f]{64}$/;
const HEX_PATTERN = /^[0-9a-f]*$/;
const CIRCLE = [
  [0, -3], [1, -3], [2, -2], [3, -1],
  [3, 0], [3, 1], [2, 2], [1, 3],
  [0, 3], [-1, 3], [-2, 2], [-3, 1],
  [-3, 0], [-3, -1], [-2, -2], [-1, -3],
] as const;
const ORIENTATIONS = [
  [1024, 0], [946, 392], [724, 724], [392, 946],
  [0, 1024], [-392, 946], [-724, 724], [-946, 392],
  [-1024, 0], [-946, -392], [-724, -724], [-392, -946],
  [0, -1024], [392, -946], [724, -724], [946, -392],
] as const;
const POPCOUNT = Uint8Array.of(0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

type AssertInteger = (
  value: unknown,
  minimum: number,
  maximum: number,
  name: string,
) => asserts value is number;

const assertInteger: AssertInteger = (
  value: unknown,
  minimum: number,
  maximum: number,
  name: string,
): asserts value is number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
};

/** @internal Validate the bounded in-memory experiment shape before comparison work. */
export function validateCropLocalExperimentFingerprint(
  value: unknown,
): asserts value is CropLocalExperimentFingerprint {
  if (!isRecord(value)) throw new TypeError('crop-local fingerprint must be an object');
  if (value.experimental !== true) {
    throw new RangeError('crop-local fingerprint must be marked experimental');
  }
  if (value.experimentalProfile !== 'crop-local-multiscale-binary-v0') {
    throw new RangeError('unsupported crop-local experimental profile');
  }
  assertInteger(value.sourceWidth, 40, MAXIMUM_SOURCE_DIMENSION, 'crop-local source width');
  assertInteger(value.sourceHeight, 40, MAXIMUM_SOURCE_DIMENSION, 'crop-local source height');
  const sourceWidth = value.sourceWidth;
  const sourceHeight = value.sourceHeight;
  assertInteger(value.inputWidth, 40, Number.MAX_SAFE_INTEGER, 'crop-local input width');
  assertInteger(value.inputHeight, 40, Number.MAX_SAFE_INTEGER, 'crop-local input height');
  if (!Number.isSafeInteger(value.inputWidth * value.inputHeight)) {
    throw new RangeError('crop-local input dimensions are too large');
  }
  if (value.descriptorBitLength !== 256) {
    throw new RangeError('crop-local descriptor bit length must be 256');
  }
  assertInteger(value.maximumFeatures, 16, MAXIMUM_FEATURES, 'crop-local maximum features');
  if (
    !Array.isArray(value.pyramidScalePermille)
    || value.pyramidScalePermille.length !== PYRAMID_SCALES.length
    || value.pyramidScalePermille.some((scale, index) => scale !== PYRAMID_SCALES[index])
  ) {
    throw new RangeError('crop-local pyramid scales do not match the experimental profile');
  }
  if (!Array.isArray(value.features)) {
    throw new TypeError('crop-local features must be an array');
  }
  if (value.features.length > value.maximumFeatures) {
    throw new RangeError('crop-local feature count exceeds maximum features');
  }
  value.features.forEach((feature, index) => {
    if (!isRecord(feature)) throw new TypeError(`crop-local feature ${index} must be an object`);
    assertInteger(feature.x, 0, sourceWidth - 1, `crop-local feature ${index} x`);
    assertInteger(feature.y, 0, sourceHeight - 1, `crop-local feature ${index} y`);
    assertInteger(
      feature.pyramidLevel,
      0,
      PYRAMID_SCALES.length - 1,
      `crop-local feature ${index} pyramid level`,
    );
    if (feature.scalePermille !== PYRAMID_SCALES[feature.pyramidLevel]) {
      throw new RangeError(`crop-local feature ${index} scale does not match its pyramid level`);
    }
    assertInteger(feature.orientationBin, 0, 15, `crop-local feature ${index} orientation bin`);
    assertInteger(feature.response, 1, 255, `crop-local feature ${index} response`);
    if (typeof feature.descriptor !== 'string' || !DESCRIPTOR_PATTERN.test(feature.descriptor)) {
      throw new RangeError(`crop-local feature ${index} descriptor must be 256-bit lowercase hex`);
    }
  });
  if (!isRecord(value.verification)) {
    throw new TypeError('crop-local verification sketch must be an object');
  }
  assertInteger(
    value.verification.width,
    16,
    MAXIMUM_VERIFICATION_DIMENSION,
    'crop-local verification width',
  );
  assertInteger(
    value.verification.height,
    16,
    MAXIMUM_VERIFICATION_DIMENSION,
    'crop-local verification height',
  );
  const verificationPixels = value.verification.width * value.verification.height;
  if (
    typeof value.verification.luminance !== 'string'
    || value.verification.luminance.length !== verificationPixels * 2
    || !HEX_PATTERN.test(value.verification.luminance)
  ) {
    throw new RangeError('crop-local verification luminance must be bounded lowercase hex');
  }
}

interface BriefPair {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
}

interface Planes {
  readonly luminance: Uint8Array;
}

const validateInteger = (value: number, minimum: number, maximum: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
};

const createBriefPattern = (): readonly BriefPair[] => {
  let state = 0x85ebca6b;
  const coordinate = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state % (PATCH_RADIUS * 2 + 1)) - PATCH_RADIUS;
  };
  const output: BriefPair[] = [];
  while (output.length < 256) {
    const pair = { ax: coordinate(), ay: coordinate(), bx: coordinate(), by: coordinate() };
    if (pair.ax !== pair.bx || pair.ay !== pair.by) output.push(pair);
  }
  return output;
};

const BRIEF_PATTERN = createBriefPattern();
const ROTATED_BRIEF_PATTERNS: readonly (readonly BriefPair[])[] = ORIENTATIONS.map(
  ([cosine, sine]) => BRIEF_PATTERN.map(({ ax, ay, bx, by }) => ({
    ax: Math.round((ax * cosine - ay * sine) / 1024),
    ay: Math.round((ax * sine + ay * cosine) / 1024),
    bx: Math.round((bx * cosine - by * sine) / 1024),
    by: Math.round((bx * sine + by * cosine) / 1024),
  })),
);

const planes = (source: Rgba8PixelSource): Planes => {
  const normalized = normalizePixelSource(source);
  if (normalized.format !== 'rgb8') throw new TypeError('RGBA normalization did not produce rgb8');
  const count = source.width * source.height;
  const luminance = new Uint8Array(count);
  for (let input = 0, index = 0; index < count; input += 3, index += 1) {
    luminance[index] = Math.floor((
      normalized.data[input] * 299
      + normalized.data[input + 1] * 587
      + normalized.data[input + 2] * 114
      + 500
    ) / 1000);
  }
  return { luminance };
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
  const xAxis = Array.from({ length: targetWidth }, (_, x) => axis(x, sourceWidth, targetWidth));
  const yAxis = Array.from({ length: targetHeight }, (_, y) => axis(y, sourceHeight, targetHeight));
  const output = new Uint8Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const [y0, y1, fy] = yAxis[y];
    for (let x = 0; x < targetWidth; x += 1) {
      const [x0, x1, fx] = xAxis[x];
      const top = Math.floor((
        input[y0 * sourceWidth + x0] * (fixedOne - fx)
        + input[y0 * sourceWidth + x1] * fx + fixedOne / 2
      ) / fixedOne);
      const bottom = Math.floor((
        input[y1 * sourceWidth + x0] * (fixedOne - fx)
        + input[y1 * sourceWidth + x1] * fx + fixedOne / 2
      ) / fixedOne);
      output[y * targetWidth + x] = Math.floor((
        top * (fixedOne - fy) + bottom * fy + fixedOne / 2
      ) / fixedOne);
    }
  }
  return output;
};

const blurThreeByThree = (input: Uint8Array, width: number, height: number): Uint8Array => {
  const horizontal = new Uint16Array(input.length);
  const output = new Uint8Array(input.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = input[row + Math.max(0, x - 1)]
        + input[row + x]
        + input[row + Math.min(width - 1, x + 1)];
    }
  }
  for (let y = 0; y < height; y += 1) {
    const previous = Math.max(0, y - 1) * width;
    const row = y * width;
    const next = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x += 1) {
      output[row + x] = Math.floor((
        horizontal[previous + x] + horizontal[row + x] + horizontal[next + x] + 4
      ) / 9);
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
): number => {
  const center = pixels[y * width + x];
  let brightRun = 0;
  let darkRun = 0;
  let brightMinimum = 255;
  let darkMinimum = 255;
  let score = 0;
  for (let index = 0; index < 24; index += 1) {
    const [offsetX, offsetY] = CIRCLE[index % 16];
    const difference = pixels[(y + offsetY) * width + x + offsetX] - center;
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
    if (brightRun >= 9) score = Math.max(score, brightMinimum);
    if (darkRun >= 9) score = Math.max(score, darkMinimum);
  }
  return score;
};

const orientationBin = (pixels: Uint8Array, width: number, x: number, y: number): number => {
  let momentX = 0;
  let momentY = 0;
  for (let offsetY = -PATCH_RADIUS; offsetY <= PATCH_RADIUS; offsetY += 1) {
    const extent = Math.floor(Math.sqrt(PATCH_RADIUS ** 2 - offsetY ** 2));
    for (let offsetX = -extent; offsetX <= extent; offsetX += 1) {
      const value = pixels[(y + offsetY) * width + x + offsetX];
      momentX += offsetX * value;
      momentY += offsetY * value;
    }
  }
  let selected = 0;
  let best = Number.NEGATIVE_INFINITY;
  ORIENTATIONS.forEach(([directionX, directionY], index) => {
    const score = momentX * directionX + momentY * directionY;
    if (score > best) {
      best = score;
      selected = index;
    }
  });
  return selected;
};

const descriptor = (
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
  bin: number,
): string => {
  let output = '';
  for (let nibble = 0; nibble < 64; nibble += 1) {
    let value = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      const { ax, ay, bx, by } = ROTATED_BRIEF_PATTERNS[bin][nibble * 4 + bit];
      value <<= 1;
      if (pixels[(y + ay) * width + x + ax] < pixels[(y + by) * width + x + bx]) value |= 1;
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

const bytesToHex = (values: Uint8Array): string => {
  let output = '';
  for (const value of values) output += value.toString(16).padStart(2, '0');
  return output;
};

const verificationSketch = (
  luminance: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  maximumDimension: number,
): CropLocalVerificationSketch => {
  const scale = maximumDimension / Math.max(sourceWidth, sourceHeight);
  const width = Math.max(16, Math.round(sourceWidth * scale));
  const height = Math.max(16, Math.round(sourceHeight * scale));
  const resized = resizeBilinearFixed(luminance, sourceWidth, sourceHeight, width, height);
  return {
    width,
    height,
    luminance: bytesToHex(resized),
  };
};

/** @internal Deterministic multiscale binary-feature crop experiment. */
export const fingerprintCropLocalExperiment = (
  source: Rgba8PixelSource,
  options: CropLocalExperimentOptions = {},
): CropLocalExperimentFingerprint => {
  validatePixelSource(source);
  if (source.format !== 'rgba8') throw new RangeError('crop-local experiment requires rgba8 pixels');
  if (source.width < 40 || source.height < 40) {
    throw new RangeError('crop-local experiment requires dimensions of at least 40 pixels');
  }
  const maximumDimension = options.maximumDimension ?? 768;
  const maximumFeatures = options.maximumFeatures ?? 192;
  const fastThreshold = options.fastThreshold ?? 20;
  const maximumFeaturesPerCell = options.maximumFeaturesPerCell ?? 12;
  const verificationMaximumDimension = options.verificationMaximumDimension ?? 96;
  validateInteger(maximumDimension, 128, 2048, 'maximum dimension');
  validateInteger(maximumFeatures, 16, 1024, 'maximum features');
  validateInteger(fastThreshold, 1, 255, 'FAST threshold');
  validateInteger(maximumFeaturesPerCell, 1, 128, 'maximum features per cell');
  validateInteger(verificationMaximumDimension, 32, 256, 'verification maximum dimension');
  const inputMaximum = Math.max(source.width, source.height);
  const sourceWidth = inputMaximum <= maximumDimension
    ? source.width : Math.max(40, Math.round(source.width * maximumDimension / inputMaximum));
  const sourceHeight = inputMaximum <= maximumDimension
    ? source.height : Math.max(40, Math.round(source.height * maximumDimension / inputMaximum));
  const inputPlanes = planes(source);
  const baseLuminance = resizeBilinearFixed(
    inputPlanes.luminance, source.width, source.height, sourceWidth, sourceHeight,
  );
  const candidates: CropLocalFeature[] = [];
  PYRAMID_SCALES.forEach((scalePermille, pyramidLevel) => {
    const width = Math.max(40, Math.round(sourceWidth * 1000 / scalePermille));
    const height = Math.max(40, Math.round(sourceHeight * 1000 / scalePermille));
    if (width < DESCRIPTOR_BORDER * 2 + 8 || height < DESCRIPTOR_BORDER * 2 + 8) return;
    const pixels = blurThreeByThree(
      resizeBilinearFixed(baseLuminance, sourceWidth, sourceHeight, width, height), width, height,
    );
    const scores = new Uint8Array(width * height);
    for (let y = DESCRIPTOR_BORDER; y < height - DESCRIPTOR_BORDER; y += 1) {
      for (let x = DESCRIPTOR_BORDER; x < width - DESCRIPTOR_BORDER; x += 1) {
        scores[y * width + x] = fastScore(pixels, width, x, y, fastThreshold);
      }
    }
    for (let y = DESCRIPTOR_BORDER; y < height - DESCRIPTOR_BORDER; y += 1) {
      for (let x = DESCRIPTOR_BORDER; x < width - DESCRIPTOR_BORDER; x += 1) {
        const index = y * width + x;
        const response = scores[index];
        if (response === 0) continue;
        let maximum = true;
        for (let offsetY = -1; offsetY <= 1 && maximum; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) continue;
            const neighbor = (y + offsetY) * width + x + offsetX;
            if (scores[neighbor] > response || (scores[neighbor] === response && neighbor < index)) {
              maximum = false;
              break;
            }
          }
        }
        if (!maximum) continue;
        const bin = orientationBin(pixels, width, x, y);
        const value = descriptor(pixels, width, x, y, bin);
        if (bitBalance(value) < 32) continue;
        candidates.push({
          x: Math.round(x * sourceWidth / width),
          y: Math.round(y * sourceHeight / height),
          pyramidLevel,
          scalePermille,
          orientationBin: bin,
          response,
          descriptor: value,
        });
      }
    }
  });
  candidates.sort((left, right) => (
    right.response - left.response
    || left.pyramidLevel - right.pyramidLevel
    || left.y - right.y
    || left.x - right.x
  ));
  const cells = new Map<string, number>();
  const features: CropLocalFeature[] = [];
  for (const candidate of candidates) {
    const cell = `${Math.floor(candidate.x / 64)}:${Math.floor(candidate.y / 64)}`;
    const count = cells.get(cell) ?? 0;
    if (count >= maximumFeaturesPerCell) continue;
    const duplicate = features.some((feature) => (
      Math.abs(feature.x - candidate.x) <= 2
      && Math.abs(feature.y - candidate.y) <= 2
      && Math.abs(feature.pyramidLevel - candidate.pyramidLevel) <= 1
    ));
    if (duplicate) continue;
    cells.set(cell, count + 1);
    features.push(candidate);
    if (features.length >= maximumFeatures) break;
  }
  features.sort((left, right) => (
    left.y - right.y || left.x - right.x || left.pyramidLevel - right.pyramidLevel
  ));
  return {
    experimental: true,
    experimentalProfile: 'crop-local-multiscale-binary-v0',
    sourceWidth,
    sourceHeight,
    inputWidth: source.width,
    inputHeight: source.height,
    descriptorBitLength: 256,
    maximumFeatures,
    pyramidScalePermille: PYRAMID_SCALES,
    features,
    verification: verificationSketch(
      baseLuminance, sourceWidth, sourceHeight, verificationMaximumDimension,
    ),
  };
};
