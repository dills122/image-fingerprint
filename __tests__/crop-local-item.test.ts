import { describe, expect, it } from 'vitest';
import {
  compareCropLocalItemSourceToCrop,
  compareCropLocalSourceToCrop,
  fingerprintCropLocalItemExperiment,
} from '../src/core/algorithms/crop-local';
import type { Rgba8PixelSource } from '../src/core/types';

const paint = (
  source: Rgba8PixelSource,
  x: number,
  y: number,
  width: number,
  height: number,
  color: readonly [number, number, number],
): void => {
  for (let row = y; row < Math.min(source.height, y + height); row += 1) {
    for (let column = x; column < Math.min(source.width, x + width); column += 1) {
      source.data.set([...color, 255], (row * source.width + column) * 4);
    }
  }
};

const sameLuminanceLayout = (
  itemColor: readonly [number, number, number],
): Rgba8PixelSource => {
  const width = 360;
  const height = 280;
  const source: Rgba8PixelSource = {
    format: 'rgba8', width, height, data: new Uint8Array(width * height * 4),
  };
  paint(source, 0, 0, width, height, [238, 242, 247]);
  paint(source, 0, 0, width, 34, [32, 48, 72]);
  paint(source, 0, 34, 72, height - 34, [55, 68, 90]);
  for (let card = 0; card < 6; card += 1) {
    const x = 88 + (card % 3) * 88;
    const y = 48 + Math.floor(card / 3) * 108;
    paint(source, x, y, 76, 92, [255, 255, 255]);
    paint(source, x + 7, y + 8, 62, 33, itemColor);
    for (let line = 0; line < 4; line += 1) {
      paint(source, x + 7, y + 51 + line * 8, 34 + card * 3 + line * 4, 3, [70, 80, 100]);
    }
  }
  return source;
};

const crop = (
  source: Rgba8PixelSource,
  x: number,
  y: number,
  width: number,
  height: number,
): Rgba8PixelSource => {
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * source.width + x) * 4;
    data.set(source.data.subarray(start, start + width * 4), row * width * 4);
  }
  return { format: 'rgba8', width, height, data };
};

const fingerprint = (source: Rgba8PixelSource) => fingerprintCropLocalItemExperiment(source, {
  maximumDimension: 256,
  maximumFeatures: 128,
  maximumFeaturesPerCell: 16,
  verificationMaximumDimension: 96,
  colorVerificationMaximumDimension: 64,
});

describe('crop-local item-color internal experiment', () => {
  it('creates a deterministic bounded color extension without changing the local profile', () => {
    const first = fingerprint(sameLuminanceLayout([255, 0, 0]));
    const second = fingerprint(sameLuminanceLayout([255, 0, 0]));
    expect(first).toEqual(second);
    expect(first.experimentalProfile).toBe('crop-local-item-color-v0');
    expect(first.local.experimentalProfile).toBe('crop-local-multiscale-binary-v0');
    expect(first.colorVerification.blueDifference).toHaveLength(
      first.colorVerification.width * first.colorVerification.height * 2,
    );
    expect(first.colorVerification.redDifference).toHaveLength(
      first.colorVerification.width * first.colorVerification.height * 2,
    );
  });

  it('supports a crop of the same colored item', () => {
    const source = sameLuminanceLayout([255, 0, 0]);
    const evidence = compareCropLocalItemSourceToCrop(
      fingerprint(source),
      fingerprint(crop(source, 0, 0, 300, 250)),
      { sparseMaximumContradiction: 0.03 },
    );
    expect(evidence.status, JSON.stringify(evidence)).toBe('match');
    expect(evidence.itemSignal).toBe('supporting');
    expect(evidence.color.agreementScore).toBeGreaterThan(0.8);
    expect(evidence.color.informativeZones).toBeGreaterThanOrEqual(2);
  });

  it('rejects same-layout items whose grayscale pixels are intentionally identical', () => {
    const red = fingerprint(sameLuminanceLayout([255, 0, 0]));
    const green = fingerprint(sameLuminanceLayout([0, 130, 0]));
    const local = compareCropLocalSourceToCrop(red.local, green.local);
    expect(local.status, JSON.stringify(local)).toBe('match');
    const item = compareCropLocalItemSourceToCrop(red, green);
    expect(item.status, JSON.stringify(item)).toBe('no-match');
    expect(item.itemSignal).toBe('contradicting');
    expect(['item-color-disagrees', 'item-color-contradictions']).toContain(item.reasons[0]);
  });

  it('validates bounded color planes and comparison policy', () => {
    const valid = fingerprint(sameLuminanceLayout([255, 0, 0]));
    const truncated = {
      ...valid,
      colorVerification: {
        ...valid.colorVerification,
        redDifference: valid.colorVerification.redDifference.slice(2),
      },
    };
    expect(() => compareCropLocalItemSourceToCrop(truncated, valid)).toThrow(
      'red-difference verification must be bounded lowercase hex',
    );
    expect(() => compareCropLocalItemSourceToCrop(valid, valid, {
      colorAgreementDistance: 100,
      colorContradictionDistance: 50,
    })).toThrow('agreement distance must not exceed');
  });
});
