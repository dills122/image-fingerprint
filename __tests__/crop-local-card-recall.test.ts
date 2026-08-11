import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  compareCropLocalCardRecallExperiment,
  fingerprintCropLocalItemExperiment,
} from '../src/core/algorithms/crop-local';
import type { Rgba8PixelSource } from '../src/core/types';
import { transformCropLocalCalibration } from '../benchmarks/crop-local/calibration-corpus.mjs';
import { createCropLocalSyntheticFixture } from '../benchmarks/crop-local/synthetic-fixtures.mjs';

const FINGERPRINT_PROFILE = {
  maximumDimension: 768,
  maximumFeatures: 128,
  maximumFeaturesPerCell: 12,
  fastThreshold: 20,
  verificationMaximumDimension: 96,
  colorVerificationMaximumDimension: 64,
};

const generatedCard = (seed: number): Rgba8PixelSource => {
  const decoded = PNG.sync.read(createCropLocalSyntheticFixture('card-layout', seed, 4));
  return {
    format: 'rgba8',
    width: decoded.width,
    height: decoded.height,
    data: Uint8Array.from(decoded.data),
  };
};

const fingerprint = (source: Rgba8PixelSource) => fingerprintCropLocalItemExperiment(
  source,
  FINGERPRINT_PROFILE,
);

describe('crop-local card-recall development experiment', () => {
  it('promotes a retained post-hoc geometry miss through stronger aligned verification', () => {
    const source = generatedCard(200_001);
    const result = compareCropLocalCardRecallExperiment(
      fingerprint(source),
      fingerprint(transformCropLocalCalibration(source, 'center')),
    );
    expect(result.primary.status).toBe('no-match');
    expect(result.primary.local.reasons).toEqual(['no-consistent-crop-transform']);
    expect(result).toMatchObject({
      status: 'match',
      fallbackPromoted: true,
      reasons: ['card-fallback-promoted'],
      fallback: {
        status: 'match',
        local: { status: 'match' },
        itemSignal: 'supporting',
      },
    });
  });

  it('does not promote a different item from the same generated card family', () => {
    const result = compareCropLocalCardRecallExperiment(
      fingerprint(generatedCard(200_001)),
      fingerprint(generatedCard(200_002)),
    );
    expect(result.status, JSON.stringify(result)).toBe('no-match');
    expect(result.fallbackPromoted).toBe(false);
  });
});
