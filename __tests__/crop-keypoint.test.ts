import { describe, expect, it } from 'vitest';
import {
  compareCropKeypointFingerprints,
  cropKeypointHammingDistance,
  fingerprintCropKeypointExperiment,
} from '../src/core/algorithms/crop-keypoint';
import type { Rgba8PixelSource } from '../src/core/types';

const texture = (seed: number, width = 192, height = 144): Rgba8PixelSource => {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 24;
  };
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data.set([random(), random(), random(), 255], index);
  }
  return { format: 'rgba8', width, height, data };
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

describe('crop-keypoint internal experiment', () => {
  it('creates deterministic bounded FAST/BRIEF-inspired descriptors', () => {
    const source = texture(1);
    const first = fingerprintCropKeypointExperiment(source, { maximumKeypoints: 96 });
    const second = fingerprintCropKeypointExperiment(source, { maximumKeypoints: 96 });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      experimentalProfile: 'crop-keypoint-fast-brief-v0',
      sourceWidth: 192,
      sourceHeight: 144,
      descriptorBitLength: 256,
      maximumKeypoints: 96,
    });
    expect(first.keypoints.length).toBeGreaterThan(20);
    expect(first.keypoints.length).toBeLessThanOrEqual(96);
    expect(first.keypoints.every(({ descriptor }) => /^[0-9a-f]{64}$/.test(descriptor))).toBe(true);
  });

  it('finds geometric consensus between an image and an unchanged-scale crop', () => {
    const source = texture(2);
    const cropped = crop(source, 29, 22, 134, 100);
    const options = { maximumKeypoints: 192, maximumKeypointsPerCell: 12 } as const;
    const evidence = compareCropKeypointFingerprints(
      fingerprintCropKeypointExperiment(source, options),
      fingerprintCropKeypointExperiment(cropped, options),
      {
        minimumInliers: 6,
        maximumDescriptorDistance: 48,
        maximumResidualPermille: 12,
        maximumVerificationColorDistance: 255,
      },
    );
    expect(evidence.matches).toBe(true);
    expect(evidence.inliers.length).toBeGreaterThanOrEqual(6);
    expect(evidence.transform?.scale).toBeCloseTo(1, 5);
    expect(evidence.transform?.translationX).toBeCloseTo(29, 5);
    expect(evidence.transform?.translationY).toBeCloseTo(22, 5);
  });

  it('does not find consensus between unrelated textures or flat images', () => {
    const options = { maximumKeypoints: 128 } as const;
    const unrelated = compareCropKeypointFingerprints(
      fingerprintCropKeypointExperiment(texture(3), options),
      fingerprintCropKeypointExperiment(texture(4), options),
    );
    expect(unrelated.matches).toBe(false);
    const flat = texture(0, 64, 64);
    flat.data.fill(128);
    for (let index = 3; index < flat.data.length; index += 4) flat.data[index] = 255;
    expect(fingerprintCropKeypointExperiment(flat).keypoints).toEqual([]);
  });

  it('validates descriptor and profile bounds', () => {
    expect(cropKeypointHammingDistance('0'.repeat(64), 'f'.repeat(64))).toBe(256);
    expect(() => cropKeypointHammingDistance('0', 'f'.repeat(64))).toThrow('64 lowercase');
    expect(() => fingerprintCropKeypointExperiment(texture(1), {
      maximumKeypoints: 0,
    })).toThrow('maximum keypoints');
    expect(() => compareCropKeypointFingerprints(
      fingerprintCropKeypointExperiment(texture(1)),
      fingerprintCropKeypointExperiment(texture(2)),
      { ratioPermille: 1001 },
    )).toThrow('ratio permille');
  });
});
