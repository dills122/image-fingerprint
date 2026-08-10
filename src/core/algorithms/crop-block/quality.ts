import { normalizePixelSource, validatePixelSource } from '../../pixels';
import type { Rgba8PixelSource } from '../../types';

export interface CropBlockRegionInformation {
  readonly entropyMilliBits: number;
  readonly edgeDensityPermille: number;
  readonly luminanceRange: number;
  readonly occupiedLuminanceBins: number;
}

const EDGE_DIFFERENCE = 16;

/** @internal Deterministic diagnostic scores for a mapped crop-block child region. */
export const measureCropBlockRegionInformation = (
  source: Rgba8PixelSource,
): CropBlockRegionInformation => {
  validatePixelSource(source);
  if (source.format !== 'rgba8') {
    throw new RangeError('crop-block region information requires rgba8 pixels');
  }
  const normalized = normalizePixelSource(source);
  if (normalized.format !== 'rgb8') {
    throw new TypeError('RGBA normalization did not produce rgb8 pixels');
  }
  const luminance = new Uint8Array(source.width * source.height);
  const histogram = new Uint32Array(256);
  let minimum = 255;
  let maximum = 0;
  for (let input = 0, output = 0; input < normalized.data.length; input += 3, output += 1) {
    const value = Math.floor((
      normalized.data[input] * 299
      + normalized.data[input + 1] * 587
      + normalized.data[input + 2] * 114
      + 500
    ) / 1000);
    luminance[output] = value;
    histogram[value] += 1;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  let occupiedLuminanceBins = 0;
  let entropy = 0;
  for (const count of histogram) {
    if (count === 0) continue;
    occupiedLuminanceBins += 1;
    const probability = count / luminance.length;
    entropy -= probability * Math.log2(probability);
  }
  let edges = 0;
  let comparisons = 0;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const index = y * source.width + x;
      if (x + 1 < source.width) {
        comparisons += 1;
        if (Math.abs(luminance[index] - luminance[index + 1]) >= EDGE_DIFFERENCE) edges += 1;
      }
      if (y + 1 < source.height) {
        comparisons += 1;
        if (Math.abs(luminance[index] - luminance[index + source.width]) >= EDGE_DIFFERENCE) edges += 1;
      }
    }
  }
  return {
    entropyMilliBits: Math.round(entropy * 1000),
    edgeDensityPermille: comparisons === 0 ? 0 : Math.round((edges * 1000) / comparisons),
    luminanceRange: maximum - minimum,
    occupiedLuminanceBins,
  };
};
