import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

  it('runs the browser gate when its Crop-Local fixture module changes', () => {
    expect(classify(['scripts/browser-smoke-crop-local-fixtures.mjs'])).toEqual({
      quality: 'true',
      dependencies: 'false',
      package: 'false',
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

  it('runs quality checks for curated release notes', () => {
    expect(classify(['docs/releases/0.2.0.md'])).toEqual({
      quality: 'true',
      dependencies: 'false',
      package: 'false',
      oracle: 'false',
      browser: 'false',
      site: 'false',
    });
  });
});

describe('required check contracts', () => {
  it('keeps the permanent CI gate name', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(workflow).toMatch(/\n {2}required:\n(?:.|\n)*? {4}name: Required CI\n/);
  });

  it('keeps the permanent CodeQL gate name', () => {
    const workflow = readFileSync('.github/workflows/codeql.yml', 'utf8');
    expect(workflow).toMatch(/\n {2}required:\n(?:.|\n)*? {4}name: Required CodeQL\n/);
  });

  it('documents both required contexts as branch-protection contracts', () => {
    const contract = readFileSync('.github/REQUIRED_CHECKS.md', 'utf8');
    expect(contract).toContain('`Required CI`');
    expect(contract).toContain('`Required CodeQL`');
  });

  it('publishes curated notes instead of a generated commit log', () => {
    const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
    expect(workflow).toContain(
      'body_path: docs/releases/${{ needs.verify.outputs.package_version }}.md',
    );
    expect(workflow).toContain('run: pnpm release:notes:check');
    expect(workflow).not.toContain('generate_release_notes: true');
  });
});
