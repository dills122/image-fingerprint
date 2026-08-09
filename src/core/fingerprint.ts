import blockHash from '../block-hash';
import type {
  FingerprintOptions,
  ImageFingerprint,
  RgbaImageData,
} from './types';

const validatePositiveInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
};

const validatePixels = (image: RgbaImageData): void => {
  validatePositiveInteger(image.width, 'Image width');
  validatePositiveInteger(image.height, 'Image height');

  const pixelDataType = Object.prototype.toString.call(image.data);
  if (
    pixelDataType !== '[object Uint8Array]'
    && pixelDataType !== '[object Uint8ClampedArray]'
  ) {
    throw new TypeError('Pixel data must be a Uint8Array or Uint8ClampedArray');
  }

  const expectedLength = image.width * image.height * 4;
  if (!Number.isSafeInteger(expectedLength)) {
    throw new RangeError('Image dimensions are too large');
  }

  if (image.data.length !== expectedLength) {
    throw new RangeError(
      `Expected ${expectedLength} RGBA values for a ${image.width}x${image.height} image, received ${image.data.length}`,
    );
  }
};

export const fingerprintPixels = (
  image: RgbaImageData,
  options: FingerprintOptions,
): ImageFingerprint => {
  const algorithm: string = options.algorithm;
  if (algorithm !== 'blockhash-v1') {
    throw new RangeError(`Unsupported fingerprint algorithm: ${algorithm}`);
  }

  validatePixels(image);
  validatePositiveInteger(options.bitsPerSide, 'bitsPerSide');

  if (options.method !== 1 && options.method !== 2) {
    throw new RangeError('method must be 1 or 2');
  }

  if (options.bitsPerSide % 2 !== 0) {
    throw new RangeError('bitsPerSide must be even');
  }

  if (
    options.bitsPerSide > image.width
    || options.bitsPerSide > image.height
  ) {
    throw new RangeError('bitsPerSide must not exceed the image width or height');
  }

  return {
    schemaVersion: 1,
    algorithm: options.algorithm,
    encoding: 'hex',
    hash: blockHash(image, options.bitsPerSide, options.method),
    bitLength: options.bitsPerSide ** 2,
    parameters: {
      bitsPerSide: options.bitsPerSide,
      method: options.method,
    },
  };
};
