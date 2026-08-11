import { validatePixelSource } from '../../pixels';
import type { Rgba8PixelSource } from '../../types';
import {
  CROP_LOCAL_PYRAMID_SCALES,
  createCropLocalPlanes,
  cropLocalBytesToHex,
  cropLocalHexToBytes,
  fingerprintCropLocalExperimentFromLuminance,
  resizeCropLocalColorPlanes,
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

/**
 * Separate compact transport experiment. Its identifier deliberately differs from the frozen
 * in-memory item-color profile because the byte representation has no compatibility promise.
 */
export interface CropLocalItemPackedExperimentFingerprint {
  readonly experimental: true;
  readonly experimentalProfile: 'crop-local-item-color-packed-v0';
  readonly encoding: 'base64url';
  readonly payload: string;
}

export interface CropLocalItemExperimentOptions extends CropLocalExperimentOptions {
  readonly colorVerificationMaximumDimension?: number;
}

const MAXIMUM_COLOR_DIMENSION = 128;
const PACKED_VERSION = 0;
const PACKED_HEADER_BYTES = 27;
const PACKED_FEATURE_BYTES = 39;
const MAXIMUM_PACKED_BYTES = PACKED_HEADER_BYTES
  + 1024 * PACKED_FEATURE_BYTES
  + 256 * 256
  + 2 * MAXIMUM_COLOR_DIMENSION * MAXIMUM_COLOR_DIMENSION;
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const HEX_PATTERN = /^[0-9a-f]*$/;
const PACKED_CACHE = new WeakMap<
  CropLocalItemPackedExperimentFingerprint,
  CropLocalItemExperimentFingerprint
>();

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

const encodeBase64Url = (input: Uint8Array): string => {
  let output = '';
  for (let index = 0; index < input.length; index += 3) {
    const remaining = input.length - index;
    const value = (input[index] << 16)
      | ((remaining > 1 ? input[index + 1] : 0) << 8)
      | (remaining > 2 ? input[index + 2] : 0);
    output += BASE64URL_ALPHABET[(value >>> 18) & 63];
    output += BASE64URL_ALPHABET[(value >>> 12) & 63];
    if (remaining > 1) output += BASE64URL_ALPHABET[(value >>> 6) & 63];
    if (remaining > 2) output += BASE64URL_ALPHABET[value & 63];
  }
  return output;
};

const decodeBase64Url = (input: string): Uint8Array => {
  if (
    input.length === 0
    || input.length % 4 === 1
    || !BASE64URL_PATTERN.test(input)
  ) {
    throw new RangeError('packed crop-local payload must be canonical base64url');
  }
  const output = new Uint8Array(Math.floor(input.length * 3 / 4));
  let outputIndex = 0;
  for (let index = 0; index < input.length; index += 4) {
    let value = 0;
    const count = Math.min(4, input.length - index);
    for (let offset = 0; offset < 4; offset += 1) {
      const digit = offset < count ? BASE64URL_ALPHABET.indexOf(input[index + offset]) : 0;
      value = (value << 6) | digit;
    }
    output[outputIndex] = (value >>> 16) & 255;
    outputIndex += 1;
    if (count > 2) {
      output[outputIndex] = (value >>> 8) & 255;
      outputIndex += 1;
    }
    if (count > 3) {
      output[outputIndex] = value & 255;
      outputIndex += 1;
    }
  }
  if (encodeBase64Url(output) !== input) {
    throw new RangeError('packed crop-local payload must be canonical base64url');
  }
  return output;
};

type AssertPackedHeader = (
  value: unknown,
) => asserts value is CropLocalItemPackedExperimentFingerprint;

const assertPackedHeader: AssertPackedHeader = (
  value: unknown,
): asserts value is CropLocalItemPackedExperimentFingerprint => {
  if (!isRecord(value)) throw new TypeError('packed crop-local item fingerprint must be an object');
  if (value.experimental !== true) {
    throw new RangeError('packed crop-local item fingerprint must be marked experimental');
  }
  if (value.experimentalProfile !== 'crop-local-item-color-packed-v0') {
    throw new RangeError('unsupported packed crop-local item experimental profile');
  }
  if (value.encoding !== 'base64url') {
    throw new RangeError('packed crop-local item encoding must be base64url');
  }
  if (typeof value.payload !== 'string') {
    throw new TypeError('packed crop-local item payload must be a string');
  }
  if (value.payload.length > Math.ceil(MAXIMUM_PACKED_BYTES * 4 / 3)) {
    throw new RangeError('packed crop-local item payload exceeds the experimental bound');
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

/** @internal Pack the frozen item-color values behind a distinct experimental identifier. */
export const packCropLocalItemExperimentFingerprint = (
  fingerprint: CropLocalItemExperimentFingerprint,
): CropLocalItemPackedExperimentFingerprint => {
  validateCropLocalItemExperimentFingerprint(fingerprint);
  if (fingerprint.local.inputWidth > 0xffff_ffff || fingerprint.local.inputHeight > 0xffff_ffff) {
    throw new RangeError('packed crop-local input dimensions must fit unsigned 32-bit integers');
  }
  const verification = cropLocalHexToBytes(fingerprint.local.verification.luminance);
  const blue = cropLocalHexToBytes(fingerprint.colorVerification.blueDifference);
  const red = cropLocalHexToBytes(fingerprint.colorVerification.redDifference);
  const bytes = new Uint8Array(
    PACKED_HEADER_BYTES
    + fingerprint.local.features.length * PACKED_FEATURE_BYTES
    + verification.length
    + blue.length
    + red.length,
  );
  const view = new DataView(bytes.buffer);
  let offset = 0;
  const byte = (value: number) => { bytes[offset] = value; offset += 1; };
  const uint16 = (value: number) => { view.setUint16(offset, value); offset += 2; };
  const uint32 = (value: number) => { view.setUint32(offset, value); offset += 4; };
  byte(PACKED_VERSION);
  uint16(fingerprint.local.sourceWidth);
  uint16(fingerprint.local.sourceHeight);
  uint32(fingerprint.local.inputWidth);
  uint32(fingerprint.local.inputHeight);
  uint16(fingerprint.local.maximumFeatures);
  uint16(fingerprint.local.features.length);
  uint16(fingerprint.local.verification.width);
  uint16(fingerprint.local.verification.height);
  uint16(fingerprint.colorVerificationMaximumDimension);
  uint16(fingerprint.colorVerification.width);
  uint16(fingerprint.colorVerification.height);
  for (const feature of fingerprint.local.features) {
    uint16(feature.x);
    uint16(feature.y);
    byte(feature.pyramidLevel);
    byte(feature.orientationBin);
    byte(feature.response);
    const descriptor = cropLocalHexToBytes(feature.descriptor);
    bytes.set(descriptor, offset);
    offset += descriptor.length;
  }
  for (const plane of [verification, blue, red]) {
    bytes.set(plane, offset);
    offset += plane.length;
  }
  const packed: CropLocalItemPackedExperimentFingerprint = Object.freeze({
    experimental: true,
    experimentalProfile: 'crop-local-item-color-packed-v0',
    encoding: 'base64url',
    payload: encodeBase64Url(bytes),
  });
  PACKED_CACHE.set(packed, fingerprint);
  return packed;
};

/** @internal Decode and fully validate the distinct packed transport experiment. */
export const unpackCropLocalItemExperimentFingerprint = (
  packed: CropLocalItemPackedExperimentFingerprint,
): CropLocalItemExperimentFingerprint => {
  assertPackedHeader(packed);
  const cached = PACKED_CACHE.get(packed);
  if (cached !== undefined) return cached;
  const bytes = decodeBase64Url(packed.payload);
  if (bytes.length < PACKED_HEADER_BYTES) {
    throw new RangeError('packed crop-local item payload is truncated');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const byte = () => { const value = bytes[offset]; offset += 1; return value; };
  const uint16 = () => { const value = view.getUint16(offset); offset += 2; return value; };
  const uint32 = () => { const value = view.getUint32(offset); offset += 4; return value; };
  const version = byte();
  if (version !== PACKED_VERSION) throw new RangeError('unsupported packed crop-local item version');
  const sourceWidth = uint16();
  const sourceHeight = uint16();
  const inputWidth = uint32();
  const inputHeight = uint32();
  const maximumFeatures = uint16();
  const featureCount = uint16();
  const verificationWidth = uint16();
  const verificationHeight = uint16();
  const colorVerificationMaximumDimension = uint16();
  const colorWidth = uint16();
  const colorHeight = uint16();
  const verificationBytes = verificationWidth * verificationHeight;
  const colorBytes = colorWidth * colorHeight;
  const expectedLength = PACKED_HEADER_BYTES
    + featureCount * PACKED_FEATURE_BYTES
    + verificationBytes
    + colorBytes * 2;
  if (!Number.isSafeInteger(expectedLength) || bytes.length !== expectedLength) {
    throw new RangeError('packed crop-local item payload length does not match its dimensions');
  }
  const features = Array.from({ length: featureCount }, () => {
    const x = uint16();
    const y = uint16();
    const pyramidLevel = byte();
    const orientationBin = byte();
    const response = byte();
    const descriptor = cropLocalBytesToHex(bytes.subarray(offset, offset + 32));
    offset += 32;
    return {
      x,
      y,
      pyramidLevel,
      scalePermille: CROP_LOCAL_PYRAMID_SCALES[pyramidLevel] as number,
      orientationBin,
      response,
      descriptor,
    };
  });
  const plane = (length: number): string => {
    const output = cropLocalBytesToHex(bytes.subarray(offset, offset + length));
    offset += length;
    return output;
  };
  const fingerprint: CropLocalItemExperimentFingerprint = {
    experimental: true,
    experimentalProfile: 'crop-local-item-color-v0',
    local: {
      experimental: true,
      experimentalProfile: 'crop-local-multiscale-binary-v0',
      sourceWidth,
      sourceHeight,
      inputWidth,
      inputHeight,
      descriptorBitLength: 256,
      maximumFeatures,
      pyramidScalePermille: CROP_LOCAL_PYRAMID_SCALES,
      features,
      verification: {
        width: verificationWidth,
        height: verificationHeight,
        luminance: plane(verificationBytes),
      },
    },
    colorVerificationMaximumDimension,
    colorVerification: {
      width: colorWidth,
      height: colorHeight,
      blueDifference: plane(colorBytes),
      redDifference: plane(colorBytes),
    },
  };
  validateCropLocalItemExperimentFingerprint(fingerprint);
  PACKED_CACHE.set(packed, fingerprint);
  return fingerprint;
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
  const input = createCropLocalPlanes(source);
  const local = fingerprintCropLocalExperimentFromLuminance(source, input.luminance, options);
  const scale = colorMaximumDimension / Math.max(local.sourceWidth, local.sourceHeight);
  const width = Math.max(16, Math.round(local.sourceWidth * scale));
  const height = Math.max(16, Math.round(local.sourceHeight * scale));
  const { blueDifference, redDifference } = resizeCropLocalColorPlanes(source, width, height);
  return {
    experimental: true,
    experimentalProfile: 'crop-local-item-color-v0',
    local,
    colorVerificationMaximumDimension: colorMaximumDimension,
    colorVerification: {
      width,
      height,
      blueDifference: cropLocalBytesToHex(blueDifference),
      redDifference: cropLocalBytesToHex(redDifference),
    },
  };
};

/** @internal Generate the distinct compact transport experiment without changing v0 decisions. */
export const fingerprintCropLocalItemPackedExperiment = (
  source: Rgba8PixelSource,
  options: CropLocalItemExperimentOptions = {},
): CropLocalItemPackedExperimentFingerprint => (
  packCropLocalItemExperimentFingerprint(fingerprintCropLocalItemExperiment(source, options))
);
