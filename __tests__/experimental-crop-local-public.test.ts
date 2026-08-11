import { describe, expect, it } from 'vitest';
import * as browserEntry from '../src/browser';
import * as coreEntry from '../src/core';
import {
  compareCropLocalSourceToCrop,
  comparePackedCropLocalSourceToCrop,
  fingerprintCropLocalItem,
  fingerprintCropLocalItemPacked,
  packCropLocalItemFingerprint,
  unpackCropLocalItemFingerprint,
  validateCropLocalItemFingerprint,
} from '../src/experimental/crop-local';
import * as nodeEntry from '../src/node';
import * as rootEntry from '../src';
import type { Rgba8PixelSource } from '../src/core';

const proceduralPixels = (): Rgba8PixelSource => {
  const width = 96;
  const height = 80;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = (x * 17 + y * 3) & 255;
      data[offset + 1] = (x * 5 + y * 19) & 255;
      data[offset + 2] = ((x ^ y) * 23) & 255;
      data[offset + 3] = 255;
    }
  }
  return { format: 'rgba8', width, height, data };
};

describe('experimental Crop-Local public subpath', () => {
  it('creates, validates, packs, and compares the explicitly experimental profile', () => {
    const verbose = fingerprintCropLocalItem(proceduralPixels());
    expect(verbose).toMatchObject({
      experimental: true,
      experimentalProfile: 'crop-local-item-color-v0',
    });
    expect(() => validateCropLocalItemFingerprint(verbose)).not.toThrow();

    const packed = packCropLocalItemFingerprint(verbose);
    const generatedPacked = fingerprintCropLocalItemPacked(proceduralPixels());
    expect(packed).toEqual(generatedPacked);
    expect(unpackCropLocalItemFingerprint(JSON.parse(JSON.stringify(packed)))).toEqual(verbose);

    const verboseEvidence = compareCropLocalSourceToCrop(verbose, verbose);
    const packedEvidence = comparePackedCropLocalSourceToCrop(packed, packed);
    expect(packedEvidence).toEqual(verboseEvidence);
    expect(verboseEvidence.direction).toBe('source-to-crop');
    expect(['match', 'no-match', 'insufficient-evidence']).toContain(verboseEvidence.status);
  });

  it('does not add Crop-Local to stable package entrypoints', () => {
    for (const entrypoint of [rootEntry, nodeEntry, coreEntry, browserEntry]) {
      expect(entrypoint).not.toHaveProperty('fingerprintCropLocalItem');
      expect(entrypoint).not.toHaveProperty('compareCropLocalSourceToCrop');
    }
  });
});
