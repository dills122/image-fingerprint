import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifestPath = join(
  process.cwd(),
  'benchmarks',
  'pdq',
  'fixtures',
  'manifest.json',
);
const reportPath = join(
  process.cwd(),
  'benchmarks',
  'pdq',
  'results',
  'darwin-arm64-node24.json',
);

interface ManifestFixture {
  readonly id: string;
  readonly file: string;
}

interface Manifest {
  readonly fixtures: readonly ManifestFixture[];
}

interface RuntimeSummary {
  readonly runtime: string;
  readonly engine: string;
  readonly category: string;
  readonly count: number;
  readonly eligibleCount: number;
  readonly exceptionCount: number;
  readonly distance: {
    readonly p50: number | null;
    readonly p95: number | null;
    readonly maximum: number | null;
  };
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256')
  .update(bytes)
  .digest('hex');

describe('captured PDQ adapter conformance report', () => {
  it('is bound to the current encoded corpus', () => {
    const manifestBytes = readFileSync(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as Manifest;
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
      readonly manifestSha256: string;
      readonly fixtureBytesSha256: string;
    };
    const fixtureHash = createHash('sha256');
    for (const fixture of manifest.fixtures) {
      fixtureHash
        .update(fixture.id)
        .update(Buffer.from([0]))
        .update(readFileSync(join(dirname(manifestPath), fixture.file)));
    }

    expect(report.manifestSha256).toBe(sha256(manifestBytes));
    expect(report.fixtureBytesSha256).toBe(fixtureHash.digest('hex'));
  });

  it('preserves exact repeats and the bounded ICC exception', () => {
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
      readonly results: {
        readonly node: readonly {
          readonly repeatedExactly: boolean;
          readonly oracleRepeatedExactly: boolean;
          readonly typescriptExact: boolean;
        }[];
        readonly browsers: readonly {
          readonly fixtures: readonly { readonly repeatedExactly: boolean }[];
        }[];
        readonly observations: readonly {
          readonly referenceQuality: number;
          readonly candidateQuality: number;
        }[];
      };
      readonly summary: {
        readonly groups: readonly RuntimeSummary[];
        readonly exceptions: readonly Record<string, unknown>[];
        readonly unacceptedExceptions: readonly unknown[];
      };
      readonly checks: Record<string, boolean>;
    };

    expect(report.results.node).toHaveLength(8);
    expect(report.results.node.every((result) => (
      result.repeatedExactly
      && result.oracleRepeatedExactly
      && result.typescriptExact
    ))).toBe(true);
    expect(report.results.browsers).toHaveLength(3);
    expect(report.results.browsers.every((browser) => (
      browser.fixtures.length === 8
      && browser.fixtures.every((fixture) => fixture.repeatedExactly)
    ))).toBe(true);
    expect(report.results.observations).toHaveLength(32);
    expect(report.results.observations.every((observation) => (
      observation.referenceQuality === 100
      && observation.candidateQuality === 100
    ))).toBe(true);

    const allGroups = report.summary.groups.filter((group) => group.category === 'all');
    expect(allGroups).toEqual([
      {
        runtime: 'node',
        engine: 'sharp',
        category: 'all',
        count: 8,
        eligibleCount: 8,
        belowQualityCount: 0,
        passCount: 8,
        exceptionCount: 0,
        distance: { p50: 0, p95: 0, maximum: 0 },
      },
      {
        runtime: 'browser',
        engine: 'chromium',
        category: 'all',
        count: 8,
        eligibleCount: 8,
        belowQualityCount: 0,
        passCount: 8,
        exceptionCount: 0,
        distance: { p50: 0, p95: 0, maximum: 0 },
      },
      {
        runtime: 'browser',
        engine: 'firefox',
        category: 'all',
        count: 8,
        eligibleCount: 8,
        belowQualityCount: 0,
        passCount: 7,
        exceptionCount: 1,
        distance: { p50: 0, p95: 12, maximum: 12 },
      },
      {
        runtime: 'browser',
        engine: 'webkit',
        category: 'all',
        count: 8,
        eligibleCount: 8,
        belowQualityCount: 0,
        passCount: 8,
        exceptionCount: 0,
        distance: { p50: 0, p95: 2, maximum: 2 },
      },
    ]);
    expect(report.summary.exceptions).toEqual([expect.objectContaining({
      fixture: 'opaque-p3-png',
      runtime: 'browser',
      engine: 'firefox',
      distance: 12,
      documented: true,
      exceptionCategory: 'icc-color-management',
      acceptedMaximumDistance: 12,
    })]);
    expect(report.summary.unacceptedExceptions).toEqual([]);
    expect(report.checks).toEqual({
      exactNodeConformance: true,
      exactBrowserRepeatability: true,
      initialToleranceGate: false,
      documentedExceptionGate: true,
      passed: true,
    });
  });
});
