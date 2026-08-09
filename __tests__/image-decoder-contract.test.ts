import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  DEFAULT_IMAGE_DECODE_LIMITS,
  ImagePreparationError,
} from '../src/core';
import {
  assertEncodedByteLimit,
  assertPixelLimit,
  raceWithAbort,
  resolveDecodeLimits,
} from '../src/adapters/contract';

describe('portable image-decoder contract', () => {
  it('publishes conservative immutable default limits', () => {
    expect(DEFAULT_IMAGE_DECODE_LIMITS).toEqual({
      maxEncodedBytes: 32 * 1024 * 1024,
      maxPixels: 40_000_000,
    });
    expect(Object.isFrozen(DEFAULT_IMAGE_DECODE_LIMITS)).toBe(true);
  });

  it('exposes a stable error code and preserves its cause', () => {
    const cause = new Error('native failure');
    const error = new ImagePreparationError(
      'decode-failed',
      'Could not decode image',
      { cause },
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ImagePreparationError');
    expect(error.code).toBe('decode-failed');
    expect(error.cause).toBe(cause);
  });

  it('resolves partial limits against the shared defaults', () => {
    expect(resolveDecodeLimits({
      limits: { maxPixels: 25 },
    })).toEqual({
      maxEncodedBytes: 32 * 1024 * 1024,
      maxPixels: 25,
    });
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])(
    'rejects the invalid limit %s',
    (limit) => {
      expect(() => resolveDecodeLimits({
        limits: { maxEncodedBytes: limit },
      })).toThrow(expect.objectContaining<ImagePreparationError>({
        code: 'invalid-input',
      }));
    },
  );

  it('uses one stable category for encoded-byte and pixel limit failures', () => {
    const limits = resolveDecodeLimits({
      limits: { maxEncodedBytes: 10, maxPixels: 25 },
    });

    expect(() => assertEncodedByteLimit(11, limits)).toThrow(
      expect.objectContaining<ImagePreparationError>({ code: 'limit-exceeded' }),
    );
    expect(() => assertPixelLimit(6, 5, limits)).toThrow(
      expect.objectContaining<ImagePreparationError>({ code: 'limit-exceeded' }),
    );
  });

  it('rejects promptly with the shared aborted category', async () => {
    const controller = new AbortController();
    controller.abort(new Error('stop'));

    await expect(raceWithAbort(Promise.resolve('unused'), controller.signal))
      .rejects.toMatchObject({
        code: 'aborted',
        cause: controller.signal.reason,
      });
  });
});
