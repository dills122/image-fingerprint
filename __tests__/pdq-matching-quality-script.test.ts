import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildSolringManifest,
  parseSolringCornersCsv,
} from '../benchmarks/pdq/matching-quality-corpus.mjs';

const script = 'benchmarks/pdq/matching-quality.mjs';
const csv = [
  'img_path,card_id,set_code,frame_number,corner0_x,corner0_y,corner1_x,corner1_y,corner2_x,corner2_y,corner3_x,corner3_y,num_good_matches,matching_area_pct',
  'data/frames/a-0000.jpg,card-a,aaa,0,0.1,0.1,0.8,0.1,0.8,0.8,0.1,0.8,100,0.49',
  'data/frames/a-0060.jpg,card-a,aaa,60,0.2,0.2,0.9,0.2,0.9,0.9,0.2,0.9,100,0.49',
  'data/frames/a-0120.jpg,card-a,aaa,120,0.1,0.2,0.8,0.2,0.8,0.9,0.1,0.9,100,0.49',
  'data/frames/b-0000.jpg,card-b,bbb,0,0.1,0.1,0.8,0.1,0.8,0.8,0.1,0.8,100,0.49',
  'data/frames/b-0060.jpg,card-b,bbb,60,0.2,0.2,0.9,0.2,0.9,0.9,0.2,0.9,100,0.49',
  'data/frames/b-0120.jpg,card-b,bbb,120,0.1,0.2,0.8,0.2,0.8,0.9,0.1,0.9,100,0.49',
].join('\n');

const createManifest = () => {
  const directory = mkdtempSync(join(tmpdir(), 'image-hash-matching-plan-'));
  const rows = parseSolringCornersCsv(csv);
  const manifest = buildSolringManifest(rows, {
    datasetRevision: '11f4c7ba2201dfc67df88093ed49ca8013f23b14',
    fileMetadata: Object.fromEntries(rows.map((row, index) => [
      row.imagePath,
      { byteLength: index + 1, sha256: index.toString(16).padStart(64, '0') },
    ])),
  });
  const path = join(directory, 'manifest.json');
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return path;
};

describe('PDQ matching-quality benchmark script', () => {
  it('publishes a deterministic plan without requiring corpus image bytes', () => {
    const manifest = createManifest();
    const run = () => spawnSync(process.execPath, [
      script,
      '--manifest',
      manifest,
      '--plan-only',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    const first = run();
    const second = run();

    expect(first.status, first.stderr).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    expect(JSON.parse(first.stdout)).toMatchObject({
      profileVersion: 1,
      mode: 'plan',
      algorithm: 'pdq-v1',
      matchingGoal: 'exact-printing',
      fixtureCount: 6,
      pairCount: 10,
      relationships: { matches: 8, nonMatches: 2 },
      scopes: { fullImage: 5, cropRegion: 5 },
      startingPolicy: { maxDistance: 31, minQuality: 50 },
      sourceImages: 'local-only',
    });
  });

  it.each([
    { arguments_: [] },
    { arguments_: ['--manifest'] },
    { arguments_: ['--unknown'] },
    { arguments_: ['--manifest', 'one.json', '--manifest', 'two.json'] },
  ])('rejects invalid arguments $arguments_', ({ arguments_ }) => {
    const result = spawnSync(process.execPath, [script, ...arguments_], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
  });
});
