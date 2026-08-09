import { describe, expect, it } from 'vitest';
import {
  evaluateMatchingPolicy,
  sweepMatchingPolicies,
} from '../benchmarks/pdq/matching-quality-metrics.mjs';

const pairs = [
  {
    id: 'full-positive',
    scope: 'full-image',
    expected: 'match',
    distance: 20,
    leftQuality: 90,
    rightQuality: 80,
  },
  {
    id: 'crop-positive-low-quality',
    scope: 'crop-region',
    expected: 'match',
    distance: 10,
    leftQuality: 49,
    rightQuality: 75,
  },
  {
    id: 'full-negative-near',
    scope: 'full-image',
    expected: 'non-match',
    distance: 30,
    leftQuality: 95,
    rightQuality: 95,
  },
  {
    id: 'crop-negative-far',
    scope: 'crop-region',
    expected: 'non-match',
    distance: 80,
    leftQuality: 70,
    rightQuality: 70,
  },
] as const;

describe('PDQ matching-quality metrics', () => {
  it('counts quality-ineligible positives as false negatives', () => {
    expect(evaluateMatchingPolicy(pairs, {
      maxDistance: 31,
      minQuality: 50,
    })).toEqual({
      policy: { maxDistance: 31, minQuality: 50 },
      pairCount: 4,
      eligibleCount: 3,
      ineligibleCount: 1,
      qualityFilteredMatches: 1,
      qualityFilteredNonMatches: 0,
      truePositives: 1,
      falsePositives: 1,
      trueNegatives: 1,
      falseNegatives: 1,
      precision: 0.5,
      recall: 0.5,
      falsePositiveRate: 0.5,
      falseNegativeRate: 0.5,
      accuracy: 0.5,
    });
  });

  it('reports null rates when a denominator is absent', () => {
    expect(evaluateMatchingPolicy([
      {
        id: 'only-positive',
        scope: 'full-image',
        expected: 'match',
        distance: 0,
        leftQuality: 100,
        rightQuality: 100,
      },
    ], { maxDistance: 0, minQuality: 0 })).toMatchObject({
      precision: 1,
      recall: 1,
      falsePositiveRate: null,
      falseNegativeRate: 0,
      accuracy: 1,
    });
  });

  it('produces a deterministic distance-major threshold sweep', () => {
    const sweep = sweepMatchingPolicies(pairs, {
      maxDistances: [31, 20],
      minQualities: [50, 0],
    });

    expect(sweep.map(({ policy }) => policy)).toEqual([
      { maxDistance: 20, minQuality: 0 },
      { maxDistance: 20, minQuality: 50 },
      { maxDistance: 31, minQuality: 0 },
      { maxDistance: 31, minQuality: 50 },
    ]);
  });

  it.each([
    [{ maxDistance: -1, minQuality: 0 }],
    [{ maxDistance: 257, minQuality: 0 }],
    [{ maxDistance: 31.5, minQuality: 0 }],
    [{ maxDistance: 31, minQuality: -1 }],
    [{ maxDistance: 31, minQuality: 101 }],
  ])('rejects invalid policy %#', (policy) => {
    expect(() => evaluateMatchingPolicy(pairs, policy)).toThrow();
  });

  it('rejects malformed measured pairs', () => {
    expect(() => evaluateMatchingPolicy([
      {
        id: 'bad-distance',
        scope: 'full-image',
        expected: 'match',
        distance: 257,
        leftQuality: 100,
        rightQuality: 100,
      },
    ], { maxDistance: 31, minQuality: 50 })).toThrow('distance');
  });

  it('rejects duplicate or empty sweep axes', () => {
    expect(() => sweepMatchingPolicies(pairs, {
      maxDistances: [],
      minQualities: [50],
    })).toThrow();
    expect(() => sweepMatchingPolicies(pairs, {
      maxDistances: [31, 31],
      minQualities: [50],
    })).toThrow();
  });
});
