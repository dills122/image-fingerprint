import type {
  PdqFingerprint,
  PdqFingerprintOptions,
  Rgba8PixelSource,
} from './types';

export const DEFAULT_IMAGE_DECODE_LIMITS: Readonly<{
  maxEncodedBytes: number;
  maxPixels: number;
}> = Object.freeze({
  maxEncodedBytes: 32 * 1024 * 1024,
  maxPixels: 40_000_000,
});

export interface ImageDecodeLimits {
  readonly maxEncodedBytes?: number;
  readonly maxPixels?: number;
}

/**
 * Runtime-neutral subset of the Web AbortSignal contract used by adapters.
 * Native AbortSignal objects in supported Node.js and browser runtimes satisfy
 * this interface without exposing Node.js or DOM declarations from core.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener(
    type: 'abort',
    listener: () => void,
    options?: { readonly once?: boolean },
  ): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

export interface DecodeImageOptions {
  readonly signal?: AbortSignalLike;
  readonly limits?: ImageDecodeLimits;
}

export interface FingerprintImageOptions
  extends PdqFingerprintOptions, DecodeImageOptions {}

export type ImagePreparationErrorCode =
  | 'invalid-input'
  | 'input-read-failed'
  | 'unsupported-format'
  | 'animated-image'
  | 'limit-exceeded'
  | 'decode-failed'
  | 'aborted'
  | 'unsupported-runtime';

export class ImagePreparationError extends Error {
  public readonly code: ImagePreparationErrorCode;

  public constructor(
    code: ImagePreparationErrorCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : {
      cause: options.cause,
    });
    this.name = 'ImagePreparationError';
    this.code = code;
  }
}

export type DecodeImageFunction<Source> = (
  source: Source,
  options?: DecodeImageOptions,
) => Promise<Rgba8PixelSource>;

export type FingerprintImageFunction<Source> = (
  source: Source,
  options: FingerprintImageOptions,
) => Promise<PdqFingerprint>;

export interface ImageDecoder<Source> {
  readonly decodeImage: DecodeImageFunction<Source>;
  readonly fingerprintImage: FingerprintImageFunction<Source>;
}
