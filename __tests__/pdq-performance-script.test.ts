import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const script = 'benchmarks/pdq/core-performance.mjs';
const browserScript = 'benchmarks/pdq/browser-performance.mjs';

const runPlan = (...arguments_: string[]) => spawnSync(
  process.execPath,
  [script, '--plan-only', ...arguments_],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
  },
);

describe('PDQ performance benchmark script', () => {
  it('publishes a deterministic, versioned plan before measuring', () => {
    const first = runPlan();
    const second = runPlan();

    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toBe(first.stdout);

    const plan = JSON.parse(first.stdout) as {
      readonly sourceSha256: string;
      readonly workloads: readonly {
        readonly id: string;
        readonly width: number;
        readonly height: number;
        readonly pixels: number;
        readonly rgbSha256: string;
      }[];
    };

    expect(plan).toMatchObject({
      profileVersion: 1,
      mode: 'plan',
      algorithm: 'pdq-v1',
      warmupCount: 5,
      sampleCount: 30,
      percentileMethod: 'nearest-rank',
      implementations: ['typescript', 'same-source-wasm'],
      adapterFixture: {
        format: 'png',
        compressionLevel: 3,
        generatedOutsideTiming: true,
        maximumEncodedBytes: 32 * 1024 * 1024,
      },
      runtimes: {
        node: true,
        browsers: ['chromium', 'firefox', 'webkit'],
      },
      workloads: [
        {
          id: 'region-0.25mp',
          width: 500,
          height: 500,
          pixels: 250_000,
          budgets: {
            coreP95Ms: 20,
            adapterTotalP95Ms: 100,
            browserMainThreadMaxMs: 50,
          },
        },
        {
          id: 'scan-2mp',
          width: 1600,
          height: 1250,
          pixels: 2_000_000,
          budgets: {
            coreP95Ms: 100,
            adapterTotalP95Ms: 400,
            browserWorkerHeartbeatP95Ms: 50,
          },
        },
        {
          id: 'high-resolution-12mp',
          width: 4000,
          height: 3000,
          pixels: 12_000_000,
          budgets: {
            coreP95Ms: 500,
            adapterTotalP95Ms: 2_000,
            browserWorkerHeartbeatP95Ms: 50,
            nodeCoreIncrementalPeakRssMiB: 384,
            nodeAdapterIncrementalPeakRssMiB: 512,
          },
        },
      ],
      wasmBudgets: {
        rawBytes: 300 * 1024,
        gzipBytes: 150 * 1024,
        warmInitializationP95Ms: 50,
      },
      wasmDecision: {
        minimumSpeedupAt2And12Mp: 2,
        requireExactConformance: true,
        advanceWhenTypeScriptMissesBudget: true,
        automaticRuntimeSelection: false,
      },
    });

    expect(plan.sourceSha256).toBe(
      'e9483b984a88c90ef32d9f50c5f2151d9b9889cdaf1fdc2eee6b2efc54b71fc3',
    );
    expect(plan.workloads.map(({ id, width, height, pixels }) => ({
      id,
      width,
      height,
      pixels,
    }))).toEqual([
      { id: 'region-0.25mp', width: 500, height: 500, pixels: 250_000 },
      { id: 'scan-2mp', width: 1600, height: 1250, pixels: 2_000_000 },
      { id: 'high-resolution-12mp', width: 4000, height: 3000, pixels: 12_000_000 },
    ]);
    expect(plan.workloads.map(workload => workload.rgbSha256)).toEqual([
      'bc15c26f3d18e556197bab6e239f01bf956b9a145de8a31dc45b3c961076e4a4',
      '997509fe419bda35ddc1733a8c05579f61add6e855c68cf354c5c92381d4b633',
      'eefa435db71bf9f7b82be897c58ae49850797efcd9bd1d5bd8ffb027fbcd2254',
    ]);
  });

  it('allows bounded warmup and retained-sample overrides', () => {
    const result = runPlan('--warmups', '2', '--samples', '10');

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      warmupCount: 2,
      sampleCount: 10,
    });
  });

  it('uses the same frozen plan for the browser matrix', () => {
    const nodePlan = runPlan();
    const browserPlan = spawnSync(
      process.execPath,
      [browserScript, '--plan-only'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(browserPlan.status, browserPlan.stderr).toBe(0);
    expect(browserPlan.stdout).toBe(nodePlan.stdout);
  });

  it('loads the browser harness module from its served benchmark route', () => {
    expect(readFileSync('benchmarks/pdq/browser-performance.html', 'utf8')).toContain(
      'src="/benchmarks/pdq/browser-performance-page.mjs"',
    );
  });

  it('resolves the benchmark worker relative to its module URL', () => {
    expect(readFileSync('benchmarks/pdq/browser-performance-page.mjs', 'utf8')).toContain(
      "new URL('./browser-performance-worker.mjs', import.meta.url)",
    );
  });

  it.each([
    ['--warmups', '-1'],
    ['--warmups', '21'],
    ['--samples', '4'],
    ['--samples', '101'],
    ['--unknown', 'value'],
    ['--samples', '30', '--samples', '31'],
  ])('rejects invalid arguments %s %s', (...arguments_) => {
    const result = runPlan(...arguments_);

    expect(result.status).not.toBe(0);
  });
});
