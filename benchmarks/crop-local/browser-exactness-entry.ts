import {
  fingerprintCropLocalExperiment,
  fingerprintCropLocalItemExperiment,
} from '../../src/core/algorithms/crop-local';
import type { Rgba8PixelSource } from '../../src/core/types';

const createFixture = (): Rgba8PixelSource => {
  const width = 144;
  const height = 112;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const checker = ((x >> 3) ^ (y >> 3)) & 1;
      const ring = Math.abs((x - 72) ** 2 + (y - 56) ** 2 - 35 ** 2) < 180;
      const index = (y * width + x) * 4;
      data[index] = (x * 11 + y * 3 + checker * 71) & 255;
      data[index + 1] = (x * 2 + y * 13 + (ring ? 89 : 0)) & 255;
      data[index + 2] = (x * y + checker * 43 + (ring ? 127 : 0)) & 255;
      data[index + 3] = (x + y) % 17 === 0 ? 143 : 255;
    }
  }
  return { format: 'rgba8', width, height, data };
};

export const runCropLocalExactnessFixture = (): unknown => {
  const fixture = createFixture();
  const options = {
    maximumDimension: 256,
    maximumFeatures: 128,
    verificationMaximumDimension: 96,
    colorVerificationMaximumDimension: 64,
  } as const;
  return {
    local: fingerprintCropLocalExperiment(fixture, options),
    itemColor: fingerprintCropLocalItemExperiment(fixture, options),
  };
};
