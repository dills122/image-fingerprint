import { describe, expect, it } from 'vitest';
import { compareCropBlockSegments } from '../src/core/algorithms/crop-block';

const zero = '0'.repeat(64);
const atDistance = (distance: number): string => {
  const complete = Math.floor(distance / 4);
  const partial = ['', '8', 'c', 'e'][distance % 4];
  return `${'f'.repeat(complete)}${partial}`.padEnd(64, '0');
};

describe('crop-block experimental comparison', () => {
  it('keeps directed target reuse visible in coverage evidence', () => {
    const evidence = compareCropBlockSegments(
      [{ hash: zero }, { hash: atDistance(1) }],
      [{ hash: zero }],
      'directed',
      1,
    );
    expect(evidence).toMatchObject({
      matchedRegions: 2,
      queryCoverage: 1,
      candidateCoverage: 1,
      totalDistance: 1,
    });
    expect(evidence.pairs.map((pair) => pair.candidateIndex)).toEqual([0, 0]);
  });

  it('requires reciprocal nearest neighbors in mutual mode', () => {
    const evidence = compareCropBlockSegments(
      [{ hash: zero }, { hash: atDistance(1) }],
      [{ hash: zero }],
      'mutual',
      1,
    );
    expect(evidence.matchedRegions).toBe(1);
    expect(evidence.pairs[0]).toMatchObject({ queryIndex: 0, candidateIndex: 0, distance: 0 });
  });

  it('maximizes one-to-one cardinality before minimizing distance', () => {
    const evidence = compareCropBlockSegments(
      [{ hash: zero }, { hash: atDistance(4) }],
      [{ hash: zero }, { hash: atDistance(8) }],
      'one-to-one',
      8,
    );
    expect(evidence.matchedRegions).toBe(2);
    expect(new Set(evidence.pairs.map((pair) => pair.candidateIndex)).size).toBe(2);
    expect(evidence.totalDistance).toBe(4);
  });

  it('uses an inclusive cutoff and reports empty evidence without NaN', () => {
    expect(compareCropBlockSegments(
      [{ hash: zero }],
      [{ hash: atDistance(31) }],
      'one-to-one',
      31,
    ).matchedRegions).toBe(1);
    expect(compareCropBlockSegments([], [], 'mutual', 31)).toEqual({
      strategy: 'mutual',
      querySegments: 0,
      candidateSegments: 0,
      matchedRegions: 0,
      pairs: [],
      queryCoverage: 0,
      candidateCoverage: 0,
      totalDistance: 0,
      meanMatchedDistance: null,
    });
  });

  it('rejects invalid cutoffs, strategies, and region hashes', () => {
    expect(() => compareCropBlockSegments([], [], 'directed', 257)).toThrow();
    expect(() => compareCropBlockSegments(
      [{ hash: 'F'.repeat(64) }],
      [{ hash: zero }],
      'directed',
      31,
    )).toThrow('lowercase hexadecimal');
    expect(() => compareCropBlockSegments(
      [],
      [],
      'future' as 'directed',
      31,
    )).toThrow('Unsupported crop-block strategy');
  });

  it('can reject low-information hashes and require region polarity', () => {
    expect(compareCropBlockSegments(
      [{ hash: zero, kind: 'dark' }],
      [{ hash: zero, kind: 'dark' }],
      'one-to-one',
      0,
      { minimumBitBalance: 1 },
    ).matchedRegions).toBe(0);
    expect(compareCropBlockSegments(
      [{ hash: atDistance(64), kind: 'dark' }],
      [{ hash: atDistance(64), kind: 'bright' }],
      'one-to-one',
      0,
      { minimumBitBalance: 32, requirePolarity: true },
    ).matchedRegions).toBe(0);
    expect(compareCropBlockSegments(
      [{ hash: atDistance(64), kind: 'dark' }],
      [{ hash: atDistance(64), kind: 'dark' }],
      'one-to-one',
      0,
      { minimumBitBalance: 32, requirePolarity: true },
    ).matchedRegions).toBe(1);
  });

  it('rejects invalid region-quality controls', () => {
    expect(() => compareCropBlockSegments(
      [],
      [],
      'one-to-one',
      31,
      { minimumBitBalance: 129 },
    )).toThrow('minimum bit balance');
    expect(() => compareCropBlockSegments(
      [],
      [],
      'one-to-one',
      31,
      { minimumQuality: 101 },
    )).toThrow('minimum quality');
  });

  it('can reject low-quality PDQ child regions without affecting unscored BlockHash regions', () => {
    expect(compareCropBlockSegments(
      [{ hash: atDistance(64), quality: 49 }],
      [{ hash: atDistance(64), quality: 100 }],
      'one-to-one',
      0,
      { minimumQuality: 50 },
    ).matchedRegions).toBe(0);
    expect(compareCropBlockSegments(
      [{ hash: atDistance(64) }],
      [{ hash: atDistance(64) }],
      'one-to-one',
      0,
      { minimumQuality: 50 },
    ).matchedRegions).toBe(1);
  });
});
