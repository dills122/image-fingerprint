import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const runPlan = (seed: string) => spawnSync(
  process.execPath,
  [
    'scripts/pdq-differential.mjs',
    '--plan-only',
    '--count',
    '9',
    '--seed',
    seed,
  ],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
  },
);

describe('PDQ differential script', () => {
  it('creates a deterministic, balanced input plan', () => {
    const first = runPlan('0x12345678');
    const second = runPlan('0x12345678');

    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toBe(first.stdout);

    const plan = JSON.parse(first.stdout) as Record<string, unknown>;
    expect(plan).toMatchObject({
      profileVersion: 1,
      mode: 'plan',
      seed: '0x12345678',
      count: 9,
      formats: {
        gray8: 3,
        rgb8: 3,
        rgba8: 3,
      },
    });
    expect(plan.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.oracleInputSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes the input checksums when the seed changes', () => {
    const first = runPlan('1');
    const second = runPlan('2');

    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    expect(JSON.parse(first.stdout)).not.toMatchObject({
      sourceSha256: JSON.parse(second.stdout).sourceSha256,
      oracleInputSha256: JSON.parse(second.stdout).oracleInputSha256,
    });
  });

  it('keeps zero distinct from the former nonzero fallback seed', () => {
    const zero = runPlan('0');
    const nonzero = runPlan('0x6d2b79f5');

    expect(zero.status, zero.stderr).toBe(0);
    expect(nonzero.status, nonzero.stderr).toBe(0);
    expect(JSON.parse(zero.stdout)).not.toMatchObject({
      sourceSha256: JSON.parse(nonzero.stdout).sourceSha256,
      oracleInputSha256: JSON.parse(nonzero.stdout).oracleInputSha256,
    });
  });

  it.each([
    ['--count', '0'],
    ['--count', '100001'],
    ['--seed', '-1'],
    ['--unknown', 'value'],
  ])('rejects invalid arguments %s %s', (flag, value) => {
    const result = spawnSync(
      process.execPath,
      ['scripts/pdq-differential.mjs', '--plan-only', flag, value],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
  });
});
