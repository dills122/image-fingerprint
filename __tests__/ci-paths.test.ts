import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const classifier = resolve('.github/scripts/classify-ci-paths.sh');

const classify = (paths: string[]) => {
  const directory = mkdtempSync(join(tmpdir(), 'image-fingerprint-ci-paths-'));
  const input = join(directory, 'paths.txt');
  try {
    writeFileSync(input, paths.length === 0 ? '' : `${paths.join('\n')}\n`);
    const output = execFileSync('sh', [classifier, input], { encoding: 'utf8' });
    return Object.fromEntries(
      output.trim().split('\n').map((line) => line.split('=')),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe('CI path classification', () => {
  it('runs only the site build for a site-only pull request', () => {
    expect(classify(['site/src/pages/index.astro'])).toEqual({
      quality: 'false',
      dependencies: 'false',
      package: 'false',
      oracle: 'false',
      browser: 'false',
      site: 'true',
    });
  });

  it('skips compute jobs for documentation-only changes', () => {
    expect(classify(['README.md', 'docs/modernization/README.md'])).toEqual({
      quality: 'false',
      dependencies: 'false',
      package: 'false',
      oracle: 'false',
      browser: 'false',
      site: 'false',
    });
  });

  it('runs browser and package checks without the oracle for browser code', () => {
    expect(classify(['src/browser/decode-image.ts'])).toEqual({
      quality: 'true',
      dependencies: 'false',
      package: 'true',
      oracle: 'false',
      browser: 'true',
      site: 'false',
    });
  });

  it('isolates oracle fixture and harness changes', () => {
    expect(classify(['tools/pdq-oracle/main.cpp'])).toEqual({
      quality: 'true',
      dependencies: 'false',
      package: 'false',
      oracle: 'true',
      browser: 'false',
      site: 'false',
    });
  });

  it('runs every check when the CI workflow changes', () => {
    expect(classify(['.github/workflows/ci.yml'])).toEqual({
      quality: 'true',
      dependencies: 'true',
      package: 'true',
      oracle: 'true',
      browser: 'true',
      site: 'true',
    });
  });
});
