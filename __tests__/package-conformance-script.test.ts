import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const runPlan = (script: string, ...arguments_: string[]) => spawnSync(
  process.execPath,
  [script, '--plan-only', ...arguments_],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
  },
);

describe('packed package conformance scripts', () => {
  it('plans isolated CommonJS, ESM, and TypeScript consumers', () => {
    const result = runPlan('scripts/packed-package-smoke.mjs');

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      profileVersion: 1,
      packageSource: 'packed-tarball',
      runtimeConsumers: ['commonjs', 'esm'],
      typeScriptResolutions: ['node16', 'nodenext', 'bundler'],
      packageSubpaths: [
        '.',
        './node',
        './core',
        './browser',
        './lib/block-hash',
        './package.json',
      ],
    });
  });

  it('plans all browser engines on the main thread and in a worker', () => {
    const result = runPlan('scripts/browser-engine-smoke.mjs');

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      profileVersion: 1,
      packageSource: 'packed-tarball',
      browsers: ['chromium', 'firefox', 'webkit'],
      contexts: ['main-thread', 'module-worker'],
      pixelFormats: ['gray8', 'rgb8', 'rgba8'],
    });
  });

  it.each([
    'scripts/packed-package-smoke.mjs',
    'scripts/browser-engine-smoke.mjs',
  ])('rejects unknown arguments in %s', (script) => {
    const result = runPlan(script, '--unknown');

    expect(result.status).not.toBe(0);
  });
});
