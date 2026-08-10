import { describe, expect, it } from 'vitest';
import {
  mapGridBoxToSource,
  medianThreeByThree,
  preprocessCropBlock,
  segmentBinaryRegions,
} from '../src/core/algorithms/crop-block';
import type { Rgba8PixelSource } from '../src/core/types';

const rgba = (width: number, height: number, values: readonly number[]): Rgba8PixelSource => ({
  format: 'rgba8',
  width,
  height,
  data: new Uint8Array(values.flatMap((value) => [value, value, value, 255])),
});

describe('crop-block experimental segmentation', () => {
  it('classifies threshold equality as dark and 129 as bright', () => {
    expect(segmentBinaryRegions(Uint8Array.of(128, 129), 2, 1, 0)).toEqual([
      { kind: 'dark', area: 1, box: [0, 0, 1, 1] },
      { kind: 'bright', area: 1, box: [1, 0, 2, 1] },
    ]);
  });

  it('uses four-connectivity so diagonal bright pixels remain separate', () => {
    const regions = segmentBinaryRegions(Uint8Array.of(
      255, 0,
      0, 255,
    ), 2, 2, 0);

    expect(regions.filter((region) => region.kind === 'bright')).toHaveLength(2);
    expect(regions.filter((region) => region.kind === 'dark')).toHaveLength(2);
  });

  it('rejects area 500 and accepts area 501 with strict minimum behavior', () => {
    const luminance = new Uint8Array(1002);
    luminance.fill(255, 0, 501);

    expect(segmentBinaryRegions(luminance, 1002, 1, 500)).toEqual([
      { kind: 'bright', area: 501, box: [0, 0, 501, 1] },
      { kind: 'dark', area: 501, box: [501, 0, 1002, 1] },
    ]);
    expect(segmentBinaryRegions(luminance.subarray(0, 500), 500, 1, 500)).toEqual([]);
  });

  it('tracks edge boxes and orders equal areas by position then polarity', () => {
    expect(segmentBinaryRegions(Uint8Array.of(
      255, 0, 255,
      255, 0, 255,
    ), 3, 2, 0)).toEqual([
      { kind: 'bright', area: 2, box: [0, 0, 1, 2] },
      { kind: 'dark', area: 2, box: [1, 0, 2, 2] },
      { kind: 'bright', area: 2, box: [2, 0, 3, 2] },
    ]);
  });

  it('maps half-open grid boxes to odd source dimensions', () => {
    expect(mapGridBoxToSource([1, 2, 4, 5], 7, 101, 53)).toEqual({
      x: 14,
      y: 15,
      width: 44,
      height: 23,
    });
    expect(mapGridBoxToSource([0, 0, 1, 1], 300, 17, 19)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });

  it('uses clamped median-filter boundaries', () => {
    const filtered = medianThreeByThree(Uint8Array.of(
      0, 255, 255,
      255, 255, 255,
      255, 255, 255,
    ), 3);
    expect(Array.from(filtered)).toEqual(new Array(9).fill(255));
  });

  it('preprocesses both candidates deterministically with white alpha compositing', () => {
    const source = rgba(16, 16, new Array(256).fill(0));
    source.data[3] = 0;
    for (const candidate of ['bilinear-gaussian', 'area-box'] as const) {
      const first = preprocessCropBlock(source, candidate, 16);
      const second = preprocessCropBlock(source, candidate, 16);
      expect(first).toEqual(second);
      expect(first[0]).toBeGreaterThan(0);
    }
  });
});
