import { normalizePixelSource, validatePixelSource } from '../../pixels';
import type { Rgba8PixelSource } from '../../types';
import {
  fingerprintCropLocalExperiment,
  resizeCropLocalPlane,
  validateCropLocalExperimentFingerprint,
} from './fingerprint';
import type {
  CropLocalExperimentFingerprint,
  CropLocalExperimentOptions,
} from './fingerprint';

export interface CropLocalItemColorSketch {
  readonly width: number;
  readonly height: number;
  readonly blueDifference: string;
  readonly redDifference: string;
}

export interface CropLocalItemExperimentFingerprint {
  readonly experimental: true;
  readonly experimentalProfile: 'crop-local-item-color-v0';
  readonly local: CropLocalExperimentFingerprint;
  readonly colorVerificationMaximumDimension: number;
  readonly colorVerification: CropLocalItemColorSketch;
}

export interface CropLocalItemExperimentOptions extends CropLocalExperimentOptions {
  readonly colorVerificationMaximumDimension?: number;
}

const MAXIMUM_COLOR_DIMENSION = 128;
const HEX_PATTERN = /^[0-9a-f]*$/;

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

const assertHexPlane = (value: unknown, pixels: number, name: string): void => {
  if (typeof value !== 'string' || value.length !== pixels * 2 || !HEX_PATTERN.test(value)) {
    throw new RangeError(`${name} must be bounded lowercase hex`);
  }
};

/** @internal Validate the bounded color-extension shape before comparison work. */
export function validateCropLocalItemExperimentFingerprint(
  value: unknown,
): asserts value is CropLocalItemExperimentFingerprint {
  if (!isRecord(value)) throw new TypeError('crop-local item fingerprint must be an object');
  if (value.experimental !== true) {
    throw new RangeError('crop-local item fingerprint must be marked experimental');
  }
  if (value.experimentalProfile !== 'crop-local-item-color-v0') {
    throw new RangeError('unsupported crop-local item experimental profile');
  }
  validateCropLocalExperimentFingerprint(value.local);
  assertInteger(
    value.colorVerificationMaximumDimension,
    16,
    MAXIMUM_COLOR_DIMENSION,
    'crop-local color verification maximum dimension',
  );
  if (!isRecord(value.colorVerification)) {
    throw new TypeError('crop-local color verification sketch must be an object');
  }
  assertInteger(
    value.colorVerification.width,
    16,
    value.colorVerificationMaximumDimension,
    'crop-local color verification width',
  );
  assertInteger(
    value.colorVerification.height,
    16,
    value.colorVerificationMaximumDimension,
    'crop-local color verification height',
  );
  if (
    value.colorVerification.width !== value.colorVerificationMaximumDimension
    && value.colorVerification.height !== value.colorVerificationMaximumDimension
  ) {
    throw new RangeError('crop-local color verification must reach its maximum dimension');
  }
  const pixels = value.colorVerification.width * value.colorVerification.height;
  assertHexPlane(
    value.colorVerification.blueDifference,
    pixels,
    'crop-local blue-difference verification',
  );
  assertHexPlane(
    value.colorVerification.redDifference,
    pixels,
    'crop-local red-difference verification',
  );
}

const clampByte = (value: number): number => Math.max(0, Math.min(255, value));

const colorPlanes = (source: Rgba8PixelSource): {
  readonly blueDifference: Uint8Array;
  readonly redDifference: Uint8Array;
} => {
  const normalized = normalizePixelSource(source);
  if (normalized.format !== 'rgb8') throw new TypeError('RGBA normalization did not produce rgb8');
  const pixels = source.width * source.height;
  const blueDifference = new Uint8Array(pixels);
  const redDifference = new Uint8Array(pixels);
  for (let input = 0, index = 0; index < pixels; input += 3, index += 1) {
    const red = normalized.data[input];
    const green = normalized.data[input + 1];
    const blue = normalized.data[input + 2];
    blueDifference[index] = clampByte(Math.floor((
      128_000 - 169 * red - 331 * green + 500 * blue + 500
    ) / 1000));
    redDifference[index] = clampByte(Math.floor((
      128_000 + 500 * red - 419 * green - 81 * blue + 500
    ) / 1000));
  }
  return { blueDifference, redDifference };
};

const bytesToHex = (values: Uint8Array): string => {
  let output = '';
  for (const value of values) output += value.toString(16).padStart(2, '0');
  return output;
};

/** @internal Crop-local geometry plus a compact item-color verification signal. */
export const fingerprintCropLocalItemExperiment = (
  source: Rgba8PixelSource,
  options: CropLocalItemExperimentOptions = {},
): CropLocalItemExperimentFingerprint => {
  validatePixelSource(source);
  if (source.format !== 'rgba8') {
    throw new RangeError('crop-local item experiment requires rgba8 pixels');
  }
  const colorMaximumDimension = options.colorVerificationMaximumDimension ?? 64;
  assertInteger(
    colorMaximumDimension,
    16,
    MAXIMUM_COLOR_DIMENSION,
    'crop-local color verification maximum dimension',
  );
  const local = fingerprintCropLocalExperiment(source, options);
  const scale = colorMaximumDimension / Math.max(local.sourceWidth, local.sourceHeight);
  const width = Math.max(16, Math.round(local.sourceWidth * scale));
  const height = Math.max(16, Math.round(local.sourceHeight * scale));
  const input = colorPlanes(source);
  const blueDifference = resizeCropLocalPlane(
    input.blueDifference,
    source.width,
    source.height,
    width,
    height,
  );
  const redDifference = resizeCropLocalPlane(
    input.redDifference,
    source.width,
    source.height,
    width,
    height,
  );
  return {
    experimental: true,
    experimentalProfile: 'crop-local-item-color-v0',
    local,
    colorVerificationMaximumDimension: colorMaximumDimension,
    colorVerification: {
      width,
      height,
      blueDifference: bytesToHex(blueDifference),
      redDifference: bytesToHex(redDifference),
    },
  };
};
