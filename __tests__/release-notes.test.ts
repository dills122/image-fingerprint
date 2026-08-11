import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const validator = resolve('scripts/validate-release-notes.mjs');

describe('curated release notes', () => {
  it('validates the notes for the current package version', () => {
    expect(execFileSync(process.execPath, [validator], { encoding: 'utf8' })).toContain(
      'Validated curated release notes: docs/releases/0.1.1.md',
    );
  });

  it('rejects a release document with a missing required section', () => {
    const root = mkdtempSync(join(tmpdir(), 'image-fingerprint-release-notes-'));
    try {
      mkdirSync(join(root, 'docs', 'releases'), { recursive: true });
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ name: 'image-fingerprint', version: '0.1.1' }),
      );
      cpSync(resolve('docs/releases/0.1.1.md'), join(root, 'docs', 'releases', '0.1.1.md'));
      const incomplete = join(root, 'docs', 'releases', '0.1.1.md');
      const contents = readFileSync(incomplete, 'utf8');
      writeFileSync(incomplete, contents.replace('## Breaking changes', '## Migration notes'));

      expect(() =>
        execFileSync(process.execPath, [validator, '--root', root], {
          encoding: 'utf8',
          stdio: 'pipe',
        }),
      ).toThrow(/missing "## Breaking changes"/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
