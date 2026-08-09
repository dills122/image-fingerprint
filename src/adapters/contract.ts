import {
  DEFAULT_IMAGE_DECODE_LIMITS,
  ImagePreparationError,
} from '../core/image-decoder';
import { fingerprintPixels } from '../core/fingerprint';
import type {
  AbortSignalLike,
  DecodeImageFunction,
  DecodeImageOptions,
  FingerprintImageFunction,
} from '../core/image-decoder';

export interface ResolvedImageDecodeLimits {
  readonly maxEncodedBytes: number;
  readonly maxPixels: number;
}

const validateLimit = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ImagePreparationError(
      'invalid-input',
      `${name} must be a positive integer`,
    );
  }
};

export const resolveDecodeLimits = (
  options?: DecodeImageOptions,
): ResolvedImageDecodeLimits => {
  const maxEncodedBytes = (
    options?.limits?.maxEncodedBytes
    ?? DEFAULT_IMAGE_DECODE_LIMITS.maxEncodedBytes
  );
  const maxPixels = (
    options?.limits?.maxPixels
    ?? DEFAULT_IMAGE_DECODE_LIMITS.maxPixels
  );

  validateLimit(maxEncodedBytes, 'maxEncodedBytes');
  validateLimit(maxPixels, 'maxPixels');

  return { maxEncodedBytes, maxPixels };
};

export const createAbortError = (
  signal?: AbortSignalLike,
): ImagePreparationError => new ImagePreparationError(
  'aborted',
  'Image preparation was aborted',
  signal?.reason === undefined ? undefined : { cause: signal.reason },
);

export const throwIfAborted = (signal?: AbortSignalLike): void => {
  if (signal?.aborted === true) {
    throw createAbortError(signal);
  }
};

export const raceWithAbort = async <Value>(
  operation: Promise<Value>,
  signal?: AbortSignalLike,
  onAbort?: () => void,
): Promise<Value> => {
  throwIfAborted(signal);
  if (signal === undefined) {
    return operation;
  }

  return new Promise<Value>((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', handleAbort);
      callback();
    };
    const handleAbort = (): void => {
      settle(() => {
        try {
          onAbort?.();
        } finally {
          reject(createAbortError(signal));
        }
      });
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    operation.then(
      (value) => settle(() => resolve(value)),
      (error: unknown) => settle(() => reject(error)),
    );
    if (signal.aborted) handleAbort();
  });
};

export const assertEncodedByteLimit = (
  byteLength: number,
  limits: ResolvedImageDecodeLimits,
): void => {
  if (byteLength > limits.maxEncodedBytes) {
    throw new ImagePreparationError(
      'limit-exceeded',
      `Encoded image contains ${byteLength} bytes; maximum is ${limits.maxEncodedBytes}`,
    );
  }
};

export const assertPixelLimit = (
  width: number,
  height: number,
  limits: ResolvedImageDecodeLimits,
): void => {
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > limits.maxPixels) {
    throw new ImagePreparationError(
      'limit-exceeded',
      `Image contains ${pixels} pixels; maximum is ${limits.maxPixels}`,
    );
  }
};

export const createFingerprintImage = <Source>(
  decodeImage: DecodeImageFunction<Source>,
): FingerprintImageFunction<Source> => async (source, options) => {
  const pixels = await decodeImage(source, {
    signal: options.signal,
    limits: options.limits,
  });
  throwIfAborted(options.signal);
  return fingerprintPixels(pixels, { algorithm: options.algorithm });
};

export const translatePreparationError = (
  error: unknown,
  code: 'input-read-failed' | 'decode-failed',
  message: string,
): ImagePreparationError => {
  if (error instanceof ImagePreparationError) return error;
  return new ImagePreparationError(code, message, { cause: error });
};
