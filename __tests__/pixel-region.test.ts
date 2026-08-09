import {
  describe,
  expect,
  it,
} from 'vitest';
import { extractPixelRegion } from '../src/core';
import type { PixelSource } from '../src/core';

const createPixels = (
  format: PixelSource['format'],
  clamped = false,
): PixelSource => {
  const channels = format === 'gray8' ? 1 : format === 'rgb8' ? 3 : 4;
  const values = Array.from(
    { length: 8 * 7 * channels },
    (_, index) => index % 256,
  );
  const data = clamped
    ? new Uint8ClampedArray(values)
    : new Uint8Array(values);

  return {
    format,
    width: 8,
    height: 7,
    data,
  } as PixelSource;
};

describe('extractPixelRegion', () => {
  it.each(['gray8', 'rgb8', 'rgba8'] as const)(
    'copies a tightly packed %s region without mutating its source',
    (format) => {
      const source = createPixels(format);
      const before = source.data.slice();
      const channels = format === 'gray8' ? 1 : format === 'rgb8' ? 3 : 4;

      const result = extractPixelRegion(source, {
        x: 2,
        y: 1,
        width: 5,
        height: 5,
      });

      expect(result).toEqual({
        format,
        width: 5,
        height: 5,
        data: expect.any(Uint8Array),
      });
      expect(result.data).not.toBe(source.data);
      expect(source.data).toEqual(before);

      for (let row = 0; row < 5; row += 1) {
        const sourceStart = ((row + 1) * 8 + 2) * channels;
        const outputStart = row * 5 * channels;
        expect(Array.from(result.data.slice(
          outputStart,
          outputStart + 5 * channels,
        ))).toEqual(Array.from(source.data.slice(
          sourceStart,
          sourceStart + 5 * channels,
        )));
      }
    },
  );

  it('preserves Uint8ClampedArray output for browser-originated RGBA pixels', () => {
    const source = createPixels('rgba8', true);
    const result = extractPixelRegion(source, {
      x: 0,
      y: 0,
      width: 5,
      height: 5,
    });

    expect(result.data).toBeInstanceOf(Uint8ClampedArray);
  });

  it.each([
    [{ x: -1, y: 0, width: 5, height: 5 }, 'Region x must be a non-negative integer'],
    [{ x: 0.5, y: 0, width: 5, height: 5 }, 'Region x must be a non-negative integer'],
    [{ x: 0, y: -1, width: 5, height: 5 }, 'Region y must be a non-negative integer'],
    [{ x: 0, y: 0, width: 4, height: 5 }, 'Region width must be an integer of at least 5 pixels'],
    [{ x: 0, y: 0, width: 5, height: 4 }, 'Region height must be an integer of at least 5 pixels'],
  ] as const)('rejects the invalid region %o', (region, message) => {
    expect(() => extractPixelRegion(
      createPixels('gray8'),
      region,
    )).toThrow(message);
  });

  it('rejects regions that extend beyond either source boundary', () => {
    const source = createPixels('rgba8');

    expect(() => extractPixelRegion(source, {
      x: 4,
      y: 0,
      width: 5,
      height: 5,
    })).toThrow('Pixel region must be fully contained within the source image');

    expect(() => extractPixelRegion(source, {
      x: 0,
      y: 3,
      width: 5,
      height: 5,
    })).toThrow('Pixel region must be fully contained within the source image');
  });

  it('validates the source before copying', () => {
    expect(() => extractPixelRegion({
      format: 'rgb8',
      width: 8,
      height: 7,
      data: new Uint8Array(8 * 7 * 3 - 1),
    }, {
      x: 0,
      y: 0,
      width: 5,
      height: 5,
    })).toThrow('Expected 168 rgb8 values for a 8x7 image, received 167');
  });
});
