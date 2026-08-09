import blockHash from '../block-hash';
import { validateBlockHashPixelSource } from './pixels';
import type {
  BlockHashPixelSource,
  FingerprintOptions,
  ImageFingerprint,
} from './types';

const validatePositiveInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
};

export const fingerprintPixels = (
  image: BlockHashPixelSource,
  options: FingerprintOptions,
): ImageFingerprint => {
  const algorithm: string = options.algorithm;
  if (algorithm !== 'blockhash-v1') {
    throw new RangeError(`Unsupported fingerprint algorithm: ${algorithm}`);
  }

  validateBlockHashPixelSource(image);
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
