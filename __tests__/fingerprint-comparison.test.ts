import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  compareFingerprints,
  evaluatePdqMatch,
  PDQ_STARTING_POLICY,
} from '../src/core';
import type {
  BlockHashFingerprint,
  PdqFingerprint,
} from '../src/core';

const hexAtDistance = (distance: number): string => {
  const completeNibbles = Math.floor(distance / 4);
  const partialBits = distance % 4;
  const partialNibble = ['', '8', 'c', 'e'][partialBits];
  return `${'f'.repeat(completeNibbles)}${partialNibble}`.padEnd(64, '0');
};

const pdqFingerprint = (hash: string, quality = 100): PdqFingerprint => ({
  schemaVersion: 1,
  algorithm: 'pdq-v1',
  encoding: 'hex',
  hash,
  bitLength: 256,
  quality,
});

const blockHashFingerprint = (
  hash: string,
  bitsPerSide = 2,
  method: 1 | 2 = 2,
): BlockHashFingerprint => ({
  schemaVersion: 1,
  algorithm: 'blockhash-v1',
  encoding: 'hex',
  hash,
  bitLength: bitsPerSide ** 2,
  parameters: { bitsPerSide, method },
});

describe('compareFingerprints', () => {
  it.each([0, 31, 32, 256])('returns exact PDQ Hamming distance %i', (distance) => {
    const comparison = compareFingerprints(
      pdqFingerprint('0'.repeat(64)),
      pdqFingerprint(hexAtDistance(distance)),
    );

    expect(comparison).toEqual({
      comparable: true,
      algorithm: 'pdq-v1',
      distance,
      bitLength: 256,
      normalizedDistance: distance / 256,
    });
  });

  it('compares compatible BlockHash fingerprints', () => {
    expect(compareFingerprints(
      blockHashFingerprint('5'),
      blockHashFingerprint('a'),
    )).toEqual({
      comparable: true,
      algorithm: 'blockhash-v1',
      distance: 4,
      bitLength: 4,
      normalizedDistance: 1,
    });
  });

  it('returns algorithm-mismatch for different algorithms', () => {
    expect(compareFingerprints(
      pdqFingerprint('0'.repeat(64)),
      blockHashFingerprint('0'),
    )).toEqual({
      comparable: false,
      reason: 'algorithm-mismatch',
    });
  });

  it.each([
    [blockHashFingerprint('0', 2, 1), blockHashFingerprint('0', 2, 2)],
    [blockHashFingerprint('0', 2), blockHashFingerprint('0000', 4)],
  ])('returns parameter-mismatch for different BlockHash parameters', (left, right) => {
    expect(compareFingerprints(left, right)).toEqual({
      comparable: false,
      reason: 'parameter-mismatch',
    });
  });

  it('returns bit-length-mismatch for equal algorithms and parameters', () => {
    const right = {
      ...pdqFingerprint('0'.repeat(32)),
      bitLength: 128,
    } as unknown as PdqFingerprint;

    expect(compareFingerprints(pdqFingerprint('0'.repeat(64)), right)).toEqual({
      comparable: false,
      reason: 'bit-length-mismatch',
    });
  });

  it('rejects malformed comparable hash text', () => {
    expect(() => compareFingerprints(
      pdqFingerprint('0'.repeat(64)),
      pdqFingerprint(`${'0'.repeat(63)}z`),
    )).toThrow();
    expect(() => compareFingerprints(
      pdqFingerprint('0'.repeat(64)),
      pdqFingerprint('0'.repeat(62)),
    )).toThrow();
  });

  it('rejects unsupported algorithms supplied by JavaScript callers', () => {
    const unsupported = {
      ...pdqFingerprint('0'.repeat(64)),
      algorithm: 'pdq-v2',
    } as unknown as PdqFingerprint;

    expect(() => compareFingerprints(unsupported, unsupported)).toThrow();
  });

  it.each([
    { ...pdqFingerprint('0'.repeat(64)), schemaVersion: 2 },
    { ...pdqFingerprint('0'.repeat(64)), encoding: 'base64' },
  ])('rejects an invalid schema header supplied by JavaScript', (record) => {
    expect(() => compareFingerprints(
      record as unknown as PdqFingerprint,
      record as unknown as PdqFingerprint,
    )).toThrow();
  });

  it('rejects equal but internally invalid bit lengths', () => {
    const invalidPdq = {
      ...pdqFingerprint('0'.repeat(32)),
      bitLength: 128,
    } as unknown as PdqFingerprint;
    const invalidBlockHash = {
      ...blockHashFingerprint('00'),
      bitLength: 8,
    };

    expect(() => compareFingerprints(invalidPdq, invalidPdq)).toThrow();
    expect(() => compareFingerprints(invalidBlockHash, invalidBlockHash)).toThrow();
  });

  it('rejects non-object fingerprints supplied by JavaScript callers', () => {
    expect(() => compareFingerprints(
      null as unknown as PdqFingerprint,
      pdqFingerprint('0'.repeat(64)),
    )).toThrow();
  });

  it.each([
    { bitsPerSide: 0, method: 2 },
    { bitsPerSide: 3, method: 2 },
    { bitsPerSide: 2.5, method: 2 },
    { bitsPerSide: 2, method: 3 },
  ])('rejects invalid BlockHash parameters: $bitsPerSide/$method', (parameters) => {
    const invalid = {
      ...blockHashFingerprint('0'),
      parameters,
    } as unknown as BlockHashFingerprint;

    expect(() => compareFingerprints(invalid, invalid)).toThrow();
  });

  it('is symmetric and has identity distance zero across seeded hashes', () => {
    let state = 0x5eed1234;
    const nextHex = (): string => {
      let hash = '';
      for (let index = 0; index < 64; index += 1) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        hash += (state & 0xf).toString(16);
      }
      return hash;
    };

    for (let iteration = 0; iteration < 100; iteration += 1) {
      const left = pdqFingerprint(nextHex());
      const right = pdqFingerprint(nextHex());
      const forward = compareFingerprints(left, right);
      const reverse = compareFingerprints(right, left);
      const identity = compareFingerprints(left, left);

      expect(forward).toEqual(reverse);
      expect(identity).toMatchObject({ comparable: true, distance: 0 });
      expect(forward.comparable).toBe(true);
      if (forward.comparable) {
        expect(forward.distance).toBeGreaterThanOrEqual(0);
        expect(forward.distance).toBeLessThanOrEqual(forward.bitLength);
      }
    }
  });
});

describe('evaluatePdqMatch', () => {
  it('exports the explicit starting policy without applying it automatically', () => {
    expect(PDQ_STARTING_POLICY).toEqual({
      maxDistance: 31,
      minQuality: 50,
    });

    expect(compareFingerprints(
      pdqFingerprint('0'.repeat(64), 0),
      pdqFingerprint(hexAtDistance(31), 0),
    )).toMatchObject({
      comparable: true,
      distance: 31,
    });
  });

  it('matches an eligible pair at the inclusive distance boundary', () => {
    expect(evaluatePdqMatch(
      pdqFingerprint('0'.repeat(64), 50),
      pdqFingerprint(hexAtDistance(31), 50),
      PDQ_STARTING_POLICY,
    )).toEqual({
      eligible: true,
      matches: true,
      comparison: {
        comparable: true,
        algorithm: 'pdq-v1',
        distance: 31,
        bitLength: 256,
        normalizedDistance: 31 / 256,
      },
    });
  });

  it('returns an eligible non-match above the selected distance', () => {
    expect(evaluatePdqMatch(
      pdqFingerprint('0'.repeat(64), 100),
      pdqFingerprint(hexAtDistance(32), 100),
      PDQ_STARTING_POLICY,
    )).toMatchObject({
      eligible: true,
      matches: false,
      comparison: { distance: 32 },
    });
  });

  it('preserves distance while making a low-quality pair ineligible', () => {
    expect(evaluatePdqMatch(
      pdqFingerprint('0'.repeat(64), 49),
      pdqFingerprint('0'.repeat(64), 100),
      PDQ_STARTING_POLICY,
    )).toEqual({
      eligible: false,
      matches: false,
      reason: 'quality-below-minimum',
      comparison: {
        comparable: true,
        algorithm: 'pdq-v1',
        distance: 0,
        bitLength: 256,
        normalizedDistance: 0,
      },
    });
  });

  it('uses a caller-selected policy', () => {
    expect(evaluatePdqMatch(
      pdqFingerprint('0'.repeat(64), 40),
      pdqFingerprint(hexAtDistance(32), 40),
      { maxDistance: 32, minQuality: 40 },
    )).toMatchObject({
      eligible: true,
      matches: true,
      comparison: { distance: 32 },
    });
  });

  it.each([
    { maxDistance: -1, minQuality: 50 },
    { maxDistance: 257, minQuality: 50 },
    { maxDistance: 31.5, minQuality: 50 },
    { maxDistance: 31, minQuality: -1 },
    { maxDistance: 31, minQuality: 101 },
    { maxDistance: 31, minQuality: 49.5 },
  ])('rejects an invalid policy: $maxDistance/$minQuality', (policy) => {
    expect(() => evaluatePdqMatch(
      pdqFingerprint('0'.repeat(64)),
      pdqFingerprint('0'.repeat(64)),
      policy,
    )).toThrow();
  });

  it('rejects non-object policy input from JavaScript', () => {
    expect(() => evaluatePdqMatch(
      pdqFingerprint('0'.repeat(64)),
      pdqFingerprint('0'.repeat(64)),
      null as unknown as { maxDistance: number; minQuality: number },
    )).toThrow();
  });

  it.each([-1, 100.5, 101])('rejects invalid PDQ quality %s', (quality) => {
    expect(() => evaluatePdqMatch(
      pdqFingerprint('0'.repeat(64), quality),
      pdqFingerprint('0'.repeat(64)),
      PDQ_STARTING_POLICY,
    )).toThrow();
  });

  it('rejects non-PDQ and incompatible fingerprints supplied by JavaScript', () => {
    expect(() => evaluatePdqMatch(
      blockHashFingerprint('0') as unknown as PdqFingerprint,
      pdqFingerprint('0'.repeat(64)),
      PDQ_STARTING_POLICY,
    )).toThrow();

    const incompatible = {
      ...pdqFingerprint('0'.repeat(32)),
      bitLength: 128,
    } as unknown as PdqFingerprint;
    expect(() => evaluatePdqMatch(
      pdqFingerprint('0'.repeat(64)),
      incompatible,
      PDQ_STARTING_POLICY,
    )).toThrow();
  });
});
