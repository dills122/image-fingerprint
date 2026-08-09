import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = 'benchmarks/pdq/adapter-differential.mjs';

const runPlan = (...arguments_: string[]) => spawnSync(
  process.execPath,
  [script, '--plan-only', ...arguments_],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
  },
);

describe('PDQ encoded-image adapter differential script', () => {
  it('plans a pinned, categorized, repeatable comparison', () => {
    const first = runPlan();
    const second = runPlan();

    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toBe(first.stdout);

    const plan = JSON.parse(first.stdout) as {
      readonly fixtures: { readonly count: number };
      readonly categories: readonly string[];
      readonly manifestSha256: string;
      readonly fixtureBytesSha256: string;
    };
    expect(plan).toMatchObject({
      profileVersion: 1,
      mode: 'plan',
      algorithm: 'pdq-v1',
      repeatCount: 2,
      browsers: ['chromium', 'firefox', 'webkit'],
      referencePipeline: {
        decoder: {
          name: 'sharp',
          version: '0.35.3',
          output: 'straight-alpha-rgba8-srgb',
        },
        oracle: {
          repository: 'https://github.com/facebook/ThreatExchange.git',
          commit: 'baefb4ed67b6cdc1d4c82dbaef858d50866ac424',
        },
      },
      gate: {
        minimumQuality: 80,
        maximumHammingDistance: 10,
      },
      documentedExceptions: [{
        fixture: 'opaque-p3-png',
        runtime: 'browser',
        engine: 'firefox',
        maximumDistance: 12,
        category: 'icc-color-management',
      }],
    });
    expect(plan.fixtures.count).toBeGreaterThanOrEqual(8);
    expect(plan.categories).toEqual(expect.arrayContaining([
      'alpha',
      'exif-orientation',
      'format:jpeg',
      'format:png',
      'format:webp',
      'icc:p3',
      'icc:srgb',
    ]));
    expect(plan.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.fixtureBytesSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('allows a bounded repeat count', () => {
    const result = runPlan('--', '--repeat', '3');

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ repeatCount: 3 });
  });

  it.each([
    ['--repeat', '0'],
    ['--repeat', '11'],
    ['--unknown', 'value'],
    ['--repeat', '2', '--repeat', '3'],
  ])('rejects invalid arguments %s', (...arguments_) => {
    const result = runPlan(...arguments_);

    expect(result.status).not.toBe(0);
  });

  it('rejects fixture paths outside the manifest directory', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pdq-adapter-manifest-'));
    const manifest = join(directory, 'manifest.json');
    writeFileSync(manifest, JSON.stringify({
      schemaVersion: 1,
      corpus: 'pdq-adapter-tolerance-v1',
      fixtures: [{
        id: 'escaped',
        file: '../outside.png',
        sha256: '0'.repeat(64),
        format: 'png',
        mediaType: 'image/png',
        categories: ['format:png'],
        provenance: { kind: 'generated', recipe: 'invalid test fixture' },
      }],
    }));

    try {
      const result = runPlan('--manifest', manifest);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('must stay within the manifest directory');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
