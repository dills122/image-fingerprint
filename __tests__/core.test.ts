import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  fingerprintPixels,
  type RgbaImageData,
} from '../src/core';
import { fingerprintPixels as fingerprintPixelsInBrowser } from '../src/browser';

const createQuadrantImage = (): RgbaImageData => {
  const values = [
    0, 0, 255, 255,
    0, 0, 255, 255,
    64, 64, 192, 192,
    64, 64, 192, 192,
  ];
  const data = new Uint8ClampedArray(values.flatMap((value) => [
    value,
    value,
    value,
    255,
  ]));

  return {
    width: 4,
    height: 4,
    data,
  };
};

describe('fingerprintPixels', () => {
  it('returns a versioned blockhash fingerprint from portable RGBA pixels', () => {
    const fingerprint = fingerprintPixels(createQuadrantImage(), {
      algorithm: 'blockhash-v1',
      bitsPerSide: 2,
      method: 2,
    });

    expect(fingerprint).toEqual({
      schemaVersion: 1,
      algorithm: 'blockhash-v1',
      encoding: 'hex',
      hash: '5',
      bitLength: 4,
      parameters: {
        bitsPerSide: 2,
        method: 2,
      },
    });
  });

  it('exposes the same portable API from the browser entrypoint', () => {
    const fingerprint = fingerprintPixelsInBrowser(createQuadrantImage(), {
      algorithm: 'blockhash-v1',
      bitsPerSide: 2,
      method: 2,
    });

    expect(fingerprint).toEqual({
      schemaVersion: 1,
      algorithm: 'blockhash-v1',
      encoding: 'hex',
      hash: '5',
      bitLength: 4,
      parameters: {
        bitsPerSide: 2,
        method: 2,
      },
    });
  });

  it('rejects pixel buffers that do not match the declared dimensions', () => {
    expect(() => fingerprintPixels({
      width: 2,
      height: 2,
      data: new Uint8Array(15),
    }, {
      algorithm: 'blockhash-v1',
      bitsPerSide: 2,
      method: 2,
    })).toThrow('Expected 16 RGBA values for a 2x2 image, received 15');
  });

  it('rejects non-RGBA8 pixel containers at the runtime boundary', () => {
    expect(() => fingerprintPixels({
      width: 1,
      height: 1,
      data: new Uint16Array(4) as unknown as Uint8Array,
    }, {
      algorithm: 'blockhash-v1',
      bitsPerSide: 2,
      method: 2,
    })).toThrow('Pixel data must be a Uint8Array or Uint8ClampedArray');
  });

  it('rejects block dimensions larger than the image', () => {
    expect(() => fingerprintPixels(createQuadrantImage(), {
      algorithm: 'blockhash-v1',
      bitsPerSide: 6,
      method: 2,
    })).toThrow('bitsPerSide must not exceed the image width or height');
  });

  it('rejects block dimensions that cannot produce complete hex nibbles', () => {
    expect(() => fingerprintPixels(createQuadrantImage(), {
      algorithm: 'blockhash-v1',
      bitsPerSide: 3,
      method: 2,
    })).toThrow('bitsPerSide must be even');
  });

  it('rejects algorithms that are not registered', () => {
    expect(() => fingerprintPixels(createQuadrantImage(), {
      algorithm: 'pdq-v1',
      bitsPerSide: 2,
      method: 2,
    } as unknown as Parameters<typeof fingerprintPixels>[1])).toThrow(
      'Unsupported fingerprint algorithm: pdq-v1',
    );
  });

  it('rejects unsupported blockhash methods at the runtime boundary', () => {
    expect(() => fingerprintPixels(createQuadrantImage(), {
      algorithm: 'blockhash-v1',
      bitsPerSide: 2,
      method: 3,
    } as unknown as Parameters<typeof fingerprintPixels>[1])).toThrow(
      'method must be 1 or 2',
    );
  });
});
