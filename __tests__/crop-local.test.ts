import { describe, expect, it } from 'vitest';
import {
  compareCropLocalFingerprints,
  fingerprintCropLocalExperiment,
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
      const index = (row * source.width + column) * 4;
      source.data.set([...color, 255], index);
    }
  }
};

const layout = (seed: number, width = 360, height = 280): Rgba8PixelSource => {
  const source: Rgba8PixelSource = {
    format: 'rgba8', width, height, data: new Uint8Array(width * height * 4),
  };
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 24;
  };
  paint(source, 0, 0, width, height, [238, 242, 247]);
  paint(source, 0, 0, width, 34, [32, 48, 72]);
  paint(source, 0, 34, 72, height - 34, [55, 68, 90]);
  for (let card = 0; card < 6; card += 1) {
    const x = 88 + (card % 3) * 88;
    const y = 48 + Math.floor(card / 3) * 108;
    paint(source, x, y, 76, 92, [255, 255, 255]);
    paint(source, x + 7, y + 8, 62, 33, [40 + random() % 190, 40 + random() % 190, 40 + random() % 190]);
    for (let line = 0; line < 4; line += 1) {
      paint(source, x + 7, y + 51 + line * 8, 20 + random() % 48, 3, [70 + random() % 130, 80, 100]);
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

const fingerprint = (source: Rgba8PixelSource) => fingerprintCropLocalExperiment(source, {
  maximumDimension: 256,
  maximumFeatures: 128,
  maximumFeaturesPerCell: 16,
  verificationMaximumDimension: 96,
});

describe('crop-local internal experiment', () => {
  it('creates deterministic bounded multiscale fingerprints', () => {
    const first = fingerprint(layout(1));
    const second = fingerprint(layout(1));
    expect(first).toEqual(second);
    expect(first.experimentalProfile).toBe('crop-local-multiscale-binary-v0');
    expect(first.features.length).toBeGreaterThan(20);
    expect(first.features.length).toBeLessThanOrEqual(128);
    expect(new Set(first.features.map(({ pyramidLevel }) => pyramidLevel)).size).toBeGreaterThan(1);
    expect(first.features.every(({ descriptor }) => /^[0-9a-f]{64}$/.test(descriptor))).toBe(true);
    expect(first.verification.luminance).toHaveLength(
      first.verification.width * first.verification.height * 2,
    );
  });

  it('finds a scale-and-translation consensus for an independently normalized crop', () => {
    const source = layout(2);
    const cropped = crop(source, 72, 34, 260, 220);
    const evidence = compareCropLocalFingerprints(fingerprint(source), fingerprint(cropped), {
      minimumInformativeCoverage: 0,
      denseInformationCutoff: 0,
      denseMinimumAgreement: 0,
      denseMaximumContradiction: 1,
      sparseMinimumAgreement: 1,
      sparseMaximumContradiction: 0,
    });
    expect(evidence.status, JSON.stringify(evidence)).toBe('match');
    expect(evidence.geometricInliers).toBeGreaterThanOrEqual(4);
    expect(evidence.transform?.scale).toBeGreaterThan(0.6);
    expect(evidence.transform?.scale).toBeLessThan(1.1);
  });

  it('rejects a different item built from the same layout', () => {
    const evidence = compareCropLocalFingerprints(fingerprint(layout(3)), fingerprint(layout(300)));
    expect(evidence.status, JSON.stringify(evidence)).not.toBe('match');
  });

  it('validates profile bounds and treats flat content as non-matching', () => {
    const flat = layout(0, 80, 80);
    flat.data.fill(128);
    for (let index = 3; index < flat.data.length; index += 4) flat.data[index] = 255;
    expect(fingerprintCropLocalExperiment(flat).features).toEqual([]);
    expect(() => fingerprintCropLocalExperiment(layout(1), { maximumFeatures: 0 })).toThrow(
      'maximum features',
    );
    expect(() => compareCropLocalFingerprints(fingerprint(layout(1)), fingerprint(layout(2)), {
      sparseMinimumAgreement: 2,
    })).toThrow('sparse minimum agreement');
  });
});
