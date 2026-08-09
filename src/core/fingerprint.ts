import blockHash from '../block-hash';
import { fingerprintPdq } from './algorithms/pdq';
import { validateBlockHashPixelSource } from './pixels';
import type {
  BlockHashFingerprint,
  BlockHashFingerprintOptions,
  BlockHashPixelSource,
  FingerprintOptions,
  ImageFingerprint,
  PdqFingerprint,
  PdqFingerprintOptions,
  PixelSource,
} from './types';

const validatePositiveInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
};

const fingerprintBlockHash = (
  image: BlockHashPixelSource,
  options: BlockHashFingerprintOptions,
): BlockHashFingerprint => {
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

export function fingerprintPixels(
  image: BlockHashPixelSource,
  options: BlockHashFingerprintOptions,
): BlockHashFingerprint;
export function fingerprintPixels(
  image: PixelSource,
  options: PdqFingerprintOptions,
): PdqFingerprint;
export function fingerprintPixels(
  image: BlockHashPixelSource | PixelSource,
  options: FingerprintOptions,
): ImageFingerprint {
  const algorithm = (options as { readonly algorithm: string }).algorithm;
  if (algorithm === 'pdq-v1') {
    return fingerprintPdq(image as PixelSource);
  }
  if (algorithm === 'blockhash-v1') {
    return fingerprintBlockHash(
      image as BlockHashPixelSource,
      options as BlockHashFingerprintOptions,
    );
  }
  throw new RangeError(`Unsupported fingerprint algorithm: ${algorithm}`);
}
