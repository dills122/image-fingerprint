import {
  fingerprintCropBlockExperiment,
  fingerprintCropBlockV2Experiment,
} from '../../src/core/algorithms/crop-block';
import type { Rgba8PixelSource } from '../../src/core/types';

const createFixture = (): Rgba8PixelSource => {
  const width = 64;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (x < 32) === (y < 32) ? 230 : 25;
      data.set([value, value, 255 - value, (x + y) % 11 === 0 ? 127 : 255], (y * width + x) * 4);
    }
  }
  return { format: 'rgba8', width, height, data };
};

export const runCropBlockExactnessFixture = (): unknown => {
  const source = createFixture();
  return {
    v1: ['bilinear-gaussian', 'area-box'].flatMap((preprocessing) => (
      ['blockhash-v1', 'pdq-v1'].map((regionAlgorithm) => (
        fingerprintCropBlockExperiment(source, {
          preprocessing: preprocessing as 'bilinear-gaussian' | 'area-box',
          gridSize: 32,
          minimumArea: 20,
          maximumSegments: 16,
          fallback: 'empty',
          regionAlgorithm: regionAlgorithm as 'blockhash-v1' | 'pdq-v1',
        })
      ))
    )),
    v2: fingerprintCropBlockV2Experiment(source, {
      preprocessing: 'area-box',
      gridSize: 32,
      minimumArea: 20,
      maximumSegments: 16,
      fallback: 'empty',
      minimumEntropyMilliBits: 1000,
      minimumEdgeDensityPermille: 10,
      minimumLuminanceRange: 32,
      deduplicateChildHashes: true,
    }),
  };
};
