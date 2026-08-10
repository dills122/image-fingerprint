import { describe, expect, it } from 'vitest';
import {
  compareCropBlockSpatial,
  fingerprintCropBlockV2Experiment,
  measureCropBlockRegionInformation,
} from '../src/core/algorithms/crop-block';
import type { Rgba8PixelSource } from '../src/core/types';

const pixels = (
  width: number,
  height: number,
  valueAt: (x: number, y: number) => number,
): Rgba8PixelSource => {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = valueAt(x, y);
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  }
  return { format: 'rgba8', width, height, data };
};

const atDistance = (distance: number): string => {
  const complete = Math.floor(distance / 4);
  const partial = ['', '8', 'c', 'e'][distance % 4];
  return `${'f'.repeat(complete)}${partial}`.padEnd(64, '0');
};

describe('crop-block v2 distinctive-region experiment', () => {
  it('distinguishes uniform and edge-rich source crops with deterministic integer scores', () => {
    expect(measureCropBlockRegionInformation(pixels(16, 16, () => 128))).toEqual({
      entropyMilliBits: 0,
      edgeDensityPermille: 0,
      luminanceRange: 0,
      occupiedLuminanceBins: 1,
    });
    const checker = measureCropBlockRegionInformation(pixels(
      16,
      16,
      (x, y) => (x + y) % 2 === 0 ? 0 : 255,
    ));
    expect(checker).toEqual({
      entropyMilliBits: 1000,
      edgeDensityPermille: 1000,
      luminanceRange: 255,
      occupiedLuminanceBins: 2,
    });
  });

  it('filters generic regions and records the complete experimental profile', () => {
    const source = pixels(64, 64, () => 128);
    const fingerprint = fingerprintCropBlockV2Experiment(source, {
      preprocessing: 'area-box',
      gridSize: 32,
      minimumArea: 20,
      maximumSegments: 16,
      fallback: 'empty',
      minimumEntropyMilliBits: 1,
      minimumEdgeDensityPermille: 1,
      minimumLuminanceRange: 1,
    });
    expect(fingerprint).toMatchObject({
      experimentalProfile: 'crop-block-v2-distinctive-regions',
      sourceWidth: 64,
      sourceHeight: 64,
      minimumEntropyMilliBits: 1,
      minimumEdgeDensityPermille: 1,
      minimumLuminanceRange: 1,
      deduplicateChildHashes: true,
      segments: [],
    });
  });

  it('rejects invalid information thresholds', () => {
    expect(() => fingerprintCropBlockV2Experiment(pixels(16, 16, () => 0), {
      preprocessing: 'area-box',
      minimumEntropyMilliBits: 8001,
    })).toThrow('minimum entropy millibits');
  });

  it('keeps only the largest transform-consistent cluster of matched regions', () => {
    const hashes = [atDistance(0), atDistance(32), atDistance(64)];
    const query = {
      sourceWidth: 1000,
      sourceHeight: 1000,
      segments: [
        { hash: hashes[0], kind: 'bright' as const, sourceBox: { x: 100, y: 200, width: 100, height: 100 } },
        { hash: hashes[1], kind: 'bright' as const, sourceBox: { x: 300, y: 200, width: 100, height: 100 } },
        { hash: hashes[2], kind: 'bright' as const, sourceBox: { x: 700, y: 700, width: 100, height: 100 } },
      ],
    };
    const candidate = {
      sourceWidth: 1000,
      sourceHeight: 1000,
      segments: [
        { hash: hashes[0], kind: 'bright' as const, sourceBox: { x: 100, y: 200, width: 200, height: 200 } },
        { hash: hashes[1], kind: 'bright' as const, sourceBox: { x: 500, y: 200, width: 200, height: 200 } },
        { hash: hashes[2], kind: 'bright' as const, sourceBox: { x: 50, y: 50, width: 400, height: 400 } },
      ],
    };
    const evidence = compareCropBlockSpatial(query, candidate, 0, {
      maximumScaleDeviationPermille: 10,
      maximumTranslationDeviationPermille: 10,
      minimumMatchedRegions: 2,
      minimumQueryCoverage: 0.5,
      minimumCandidateCoverage: 0.5,
    });
    expect(evidence).toMatchObject({
      matchedRegions: 3,
      spatiallyConsistentRegions: 2,
      spatialQueryCoverage: 2 / 3,
      spatialCandidateCoverage: 2 / 3,
      matches: true,
      transform: {
        scaleXPermille: 500,
        scaleYPermille: 500,
        translationXPermille: 50,
        translationYPermille: 100,
      },
    });
  });
});
