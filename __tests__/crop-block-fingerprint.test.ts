import { describe, expect, it } from 'vitest';
import { fingerprintCropBlockExperiment } from '../src/core/algorithms/crop-block';
import type { Rgba8PixelSource } from '../src/core/types';

const createQuadrants = (width = 64, height = 64): Rgba8PixelSource => {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (x < width / 2) === (y < height / 2) ? 230 : 25;
      const index = (y * width + x) * 4;
      data.set([value, value, value, 255], index);
    }
  }
  return { format: 'rgba8', width, height, data };
};

describe('crop-block internal fingerprint experiment', () => {
  it.each(['bilinear-gaussian', 'area-box'] as const)(
    'creates deterministic BlockHash region fingerprints with %s',
    (preprocessing) => {
      const options = {
        preprocessing,
        gridSize: 32,
        minimumArea: 20,
        maximumSegments: 16,
        fallback: 'empty',
      } as const;
      const first = fingerprintCropBlockExperiment(createQuadrants(), options);
      const second = fingerprintCropBlockExperiment(createQuadrants(), options);

      expect(first).toEqual(second);
      expect(first.experimental).toBe(true);
      expect(first.regionAlgorithm).toBe('blockhash-v1');
      expect(first.segments.length).toBeGreaterThanOrEqual(2);
      expect(first.segments.every((segment) => /^[0-9a-f]{64}$/.test(segment.hash))).toBe(true);
    },
  );

  it('supports explicit empty and full-image fallback candidates', () => {
    const flat = createQuadrants();
    flat.data.fill(128);
    for (let index = 3; index < flat.data.length; index += 4) flat.data[index] = 255;
    const base = {
      preprocessing: 'area-box',
      gridSize: 32,
      minimumArea: 1024,
      maximumSegments: 16,
    } as const;

    expect(fingerprintCropBlockExperiment(flat, { ...base, fallback: 'empty' }).segments).toEqual([]);
    expect(fingerprintCropBlockExperiment(flat, {
      ...base,
      fallback: 'full-image',
    }).segments).toMatchObject([{ kind: 'fallback', box: [0, 0, 32, 32] }]);
  });

  it('applies a deterministic segment cap and can remove exact duplicates', () => {
    const uncapped = fingerprintCropBlockExperiment(createQuadrants(), {
      preprocessing: 'bilinear-gaussian',
      gridSize: 32,
      minimumArea: 1,
      maximumSegments: null,
      fallback: 'empty',
    });
    const capped = fingerprintCropBlockExperiment(createQuadrants(), {
      preprocessing: 'bilinear-gaussian',
      gridSize: 32,
      minimumArea: 1,
      maximumSegments: 2,
      fallback: 'empty',
      deduplicate: true,
    });

    expect(uncapped.segments.length).toBeGreaterThanOrEqual(capped.segments.length);
    expect(capped.segments).toHaveLength(2);
  });

  it('skips mapped regions too small for the 16-by-16 child hash', () => {
    const source = createQuadrants(16, 16);
    const fingerprint = fingerprintCropBlockExperiment(source, {
      preprocessing: 'area-box',
      gridSize: 32,
      minimumArea: 0,
      maximumSegments: null,
      fallback: 'empty',
    });
    expect(fingerprint.segments.every(
      (segment) => segment.sourceBox.width >= 16 && segment.sourceBox.height >= 16,
    )).toBe(true);
  });

  it('rejects inputs smaller than the frozen child hash', () => {
    const source = createQuadrants(15, 16);
    expect(() => fingerprintCropBlockExperiment(source, {
      preprocessing: 'area-box',
    })).toThrow('dimensions of at least 16 pixels');
  });

  it('can hash identical experimental regions with PDQ while retaining quality', () => {
    const base = {
      preprocessing: 'area-box',
      gridSize: 32,
      minimumArea: 20,
      maximumSegments: 16,
      fallback: 'empty',
    } as const;
    const block = fingerprintCropBlockExperiment(createQuadrants(), base);
    const pdq = fingerprintCropBlockExperiment(createQuadrants(), {
      ...base,
      regionAlgorithm: 'pdq-v1',
    });

    expect(pdq.regionAlgorithm).toBe('pdq-v1');
    expect(pdq.segments.map((segment) => segment.box)).toEqual(
      block.segments.map((segment) => segment.box),
    );
    expect(pdq.segments.every(
      (segment) => Number.isInteger(segment.quality) && segment.quality >= 0 && segment.quality <= 100,
    )).toBe(true);
  });
});
