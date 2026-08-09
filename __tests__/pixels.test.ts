import {
  describe,
  expect,
  it,
} from 'vitest';
import { normalizePixelSource } from '../src/core/pixels';
import type { PixelSource } from '../src/core';

describe('normalizePixelSource', () => {
  it('preserves tightly packed gray8 bytes', () => {
    const data = new Uint8Array(25).map((_, index) => index);

    expect(normalizePixelSource({
      format: 'gray8',
      width: 5,
      height: 5,
      data,
    })).toEqual({
      format: 'gray8',
      width: 5,
      height: 5,
      data,
    });
  });

  it('preserves tightly packed rgb8 bytes', () => {
    const data = new Uint8Array(5 * 5 * 3).map((_, index) => index);

    expect(normalizePixelSource({
      format: 'rgb8',
      width: 5,
      height: 5,
      data,
    })).toEqual({
      format: 'rgb8',
      width: 5,
      height: 5,
      data,
    });
  });

  it('composites rgba8 over white with the frozen integer rule at alpha boundaries', () => {
    const alphas = [0, 1, 127, 128, 254, 255];
    const source = new Uint8ClampedArray(alphas.flatMap((alpha) => [
      37,
      37,
      37,
      alpha,
    ]));

    const normalized = normalizePixelSource({
      format: 'rgba8',
      width: 6,
      height: 5,
      data: new Uint8ClampedArray(Array.from({ length: 5 }, () => source).flatMap(
        (row) => Array.from(row),
      )),
    });

    expect(normalized.format).toBe('rgb8');
    expect(Array.from(normalized.data.slice(0, 18))).toEqual([
      255, 255, 255,
      254, 254, 254,
      146, 146, 146,
      146, 146, 146,
      38, 38, 38,
      37, 37, 37,
    ]);
  });

  it('does not mutate rgba8 input while normalizing hidden color bytes', () => {
    const data = new Uint8Array(5 * 5 * 4);
    data.set([1, 2, 3, 0]);
    const before = data.slice();

    const normalized = normalizePixelSource({
      format: 'rgba8',
      width: 5,
      height: 5,
      data,
    });

    expect(data).toEqual(before);
    expect(Array.from(normalized.data.slice(0, 3))).toEqual([255, 255, 255]);
  });

  it.each([
    ['gray8', 25, 24],
    ['gray8', 25, 26],
    ['rgb8', 75, 74],
    ['rgb8', 75, 76],
    ['rgba8', 100, 99],
    ['rgba8', 100, 101],
  ] as const)(
    'rejects %s buffers whose length is not exactly %i',
    (format, expectedLength, actualLength) => {
      expect(() => normalizePixelSource({
        format,
        width: 5,
        height: 5,
        data: new Uint8Array(actualLength),
      } as PixelSource)).toThrow(
        `Expected ${expectedLength} ${format} values for a 5x5 image, received ${actualLength}`,
      );
    },
  );

  it('rejects dimensions below the PDQ minimum', () => {
    expect(() => normalizePixelSource({
      format: 'gray8',
      width: 4,
      height: 5,
      data: new Uint8Array(20),
    })).toThrow('Image width must be at least 5 pixels');

    expect(() => normalizePixelSource({
      format: 'gray8',
      width: 5,
      height: 4,
      data: new Uint8Array(20),
    })).toThrow('Image height must be at least 5 pixels');
  });

  it.each([0, 1.5, Number.POSITIVE_INFINITY])(
    'rejects the unsafe width %s',
    (width) => {
      expect(() => normalizePixelSource({
        format: 'gray8',
        width,
        height: 5,
        data: new Uint8Array(),
      })).toThrow('Image width must be a positive integer');
    },
  );

  it('rejects dimensions that cannot produce a safe packed length', () => {
    expect(() => normalizePixelSource({
      format: 'rgba8',
      width: Number.MAX_SAFE_INTEGER,
      height: 5,
      data: new Uint8Array(),
    })).toThrow('Image dimensions are too large');
  });

  it('accepts only the typed-array containers declared for each format', () => {
    expect(() => normalizePixelSource({
      format: 'gray8',
      width: 5,
      height: 5,
      data: new Uint8ClampedArray(25) as Uint8Array,
    })).toThrow('gray8 pixel data must be a Uint8Array');

    expect(() => normalizePixelSource({
      format: 'rgb8',
      width: 5,
      height: 5,
      data: new Uint16Array(75) as unknown as Uint8Array,
    })).toThrow('rgb8 pixel data must be a Uint8Array');

    expect(() => normalizePixelSource({
      format: 'rgba8',
      width: 5,
      height: 5,
      data: new Uint16Array(100) as unknown as Uint8Array,
    })).toThrow('rgba8 pixel data must be a Uint8Array or Uint8ClampedArray');
  });

  it('rejects objects that only spoof a typed-array tag', () => {
    const data = {
      [Symbol.toStringTag]: 'Uint8Array',
      length: 25,
    } as unknown as Uint8Array;

    expect(() => normalizePixelSource({
      format: 'gray8',
      width: 5,
      height: 5,
      data,
    })).toThrow('gray8 pixel data must be a Uint8Array');
  });

  it('rejects unknown tagged formats at the runtime boundary', () => {
    expect(() => normalizePixelSource({
      format: 'bgra8',
      width: 5,
      height: 5,
      data: new Uint8Array(100),
    } as unknown as PixelSource)).toThrow('Unsupported pixel format: bgra8');
  });
});
