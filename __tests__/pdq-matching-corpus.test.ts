import { describe, expect, it } from 'vitest';
import {
  buildSolringManifest,
  parseGitLfsPointer,
  parseSolringCornersCsv,
  validateMatchingManifest,
} from '../benchmarks/pdq/matching-quality-corpus.mjs';

const csv = [
  'img_path,card_id,set_code,frame_number,corner0_x,corner0_y,corner1_x,corner1_y,corner2_x,corner2_y,corner3_x,corner3_y,num_good_matches,matching_area_pct',
  'data/frames/a-0000.jpg,card-a,aaa,0,0.1,0.2,0.8,0.2,0.8,0.9,0.1,0.9,100,0.49',
  'data/frames/a-0060.jpg,card-a,aaa,60,0.2,0.1,0.9,0.2,0.8,0.8,0.1,0.7,110,0.45',
  'data/frames/a-0120.jpg,card-a,aaa,120,0.1,0.1,0.9,0.1,0.9,0.9,0.1,0.9,120,0.64',
  'data/frames/b-0000.jpg,card-b,bbb,0,0.1,0.1,0.8,0.1,0.8,0.8,0.1,0.8,90,0.49',
  'data/frames/b-0060.jpg,card-b,bbb,60,0.2,0.2,0.9,0.2,0.9,0.9,0.2,0.9,95,0.49',
  'data/frames/b-0120.jpg,card-b,bbb,120,0.1,0.2,0.8,0.2,0.8,0.9,0.1,0.9,105,0.49',
].join('\n');

describe('Sol Ring matching corpus preparation', () => {
  it('parses Git LFS image pointers and ignores ordinary image bytes', () => {
    expect(parseGitLfsPointer([
      'version https://git-lfs.github.com/spec/v1',
      `oid sha256:${'a'.repeat(64)}`,
      'size 51554',
      '',
    ].join('\n'))).toEqual({
      sha256: 'a'.repeat(64),
      byteLength: 51_554,
    });
    expect(parseGitLfsPointer('\u00ff\u00d8ordinary jpeg bytes')).toBeNull();
  });

  it('rejects malformed Git LFS pointers', () => {
    expect(() => parseGitLfsPointer([
      'version https://git-lfs.github.com/spec/v1',
      'oid sha256:not-a-hash',
      'size 0',
    ].join('\n'))).toThrow('LFS');
  });

  it('parses the published corner metadata into typed rows', () => {
    expect(parseSolringCornersCsv(csv)[0]).toEqual({
      imagePath: 'data/frames/a-0000.jpg',
      cardId: 'card-a',
      setCode: 'aaa',
      frameNumber: 0,
      corners: [
        { x: 0.1, y: 0.2 },
        { x: 0.8, y: 0.2 },
        { x: 0.8, y: 0.9 },
        { x: 0.1, y: 0.9 },
      ],
      goodMatches: 100,
      matchingAreaFraction: 0.49,
    });
  });

  it('creates adjacent-frame positives and representative hard negatives in both scopes', () => {
    const rows = parseSolringCornersCsv(csv);
    const fileMetadata = Object.fromEntries(rows.map((row, index) => [
      row.imagePath,
      {
        byteLength: 1_000 + index,
        sha256: index.toString(16).padStart(64, '0'),
      },
    ]));

    const manifest = buildSolringManifest(rows, {
      datasetRevision: '11f4c7ba2201dfc67df88093ed49ca8013f23b14',
      fileMetadata,
    });

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      corpus: 'pdq-mtg-solring-calibration-v1',
      source: {
        license: 'CC-BY-SA-4.0',
        revision: '11f4c7ba2201dfc67df88093ed49ca8013f23b14',
        sourceImages: 'local-only',
      },
    });
    expect(manifest.fixtures).toHaveLength(6);
    expect(manifest.fixtures[0]).toMatchObject({
      id: 'aaa-0000',
      file: 'data/frames/a-0000.jpg',
      identity: { namespace: 'scryfall-card-id', value: 'card-a' },
      regions: {
        cardBounds: { units: 'normalized', x: 0.1, y: 0.2, width: 0.7, height: 0.7 },
      },
    });

    const positivePairs = manifest.pairs.filter(pair => pair.expected === 'match');
    const negativePairs = manifest.pairs.filter(pair => pair.expected === 'non-match');
    expect(positivePairs).toHaveLength(8);
    expect(negativePairs).toHaveLength(2);
    expect(new Set(manifest.pairs.map(pair => pair.scope))).toEqual(
      new Set(['full-image', 'crop-region']),
    );
    expect(negativePairs[0]).toMatchObject({
      expected: 'non-match',
      transformations: ['different-printing', 'shared-artwork'],
    });
  });

  it('rejects malformed CSV rows and unsafe image paths', () => {
    expect(() => parseSolringCornersCsv('wrong,header\nvalue')).toThrow('header');
    expect(() => parseSolringCornersCsv(csv.replace(
      'data/frames/a-0000.jpg',
      '../outside.jpg',
    ))).toThrow('path');
  });

  it('requires file metadata for every fixture', () => {
    expect(() => buildSolringManifest(parseSolringCornersCsv(csv), {
      datasetRevision: '11f4c7ba2201dfc67df88093ed49ca8013f23b14',
      fileMetadata: {},
    })).toThrow('metadata');
  });

  it('validates the generated matching manifest contract', () => {
    const rows = parseSolringCornersCsv(csv);
    const manifest = buildSolringManifest(rows, {
      datasetRevision: '11f4c7ba2201dfc67df88093ed49ca8013f23b14',
      fileMetadata: Object.fromEntries(rows.map((row, index) => [
        row.imagePath,
        { byteLength: index + 1, sha256: index.toString(16).padStart(64, '0') },
      ])),
    });

    expect(validateMatchingManifest(manifest)).toBe(manifest);
  });

  it('rejects crop pairs without named regions and duplicate pair ids', () => {
    const rows = parseSolringCornersCsv(csv);
    const manifest = buildSolringManifest(rows, {
      datasetRevision: '11f4c7ba2201dfc67df88093ed49ca8013f23b14',
      fileMetadata: Object.fromEntries(rows.map((row, index) => [
        row.imagePath,
        { byteLength: index + 1, sha256: index.toString(16).padStart(64, '0') },
      ])),
    });
    const invalidRegion = structuredClone(manifest);
    invalidRegion.pairs.find(pair => pair.scope === 'crop-region')!.left.region = 'missing';
    expect(() => validateMatchingManifest(invalidRegion)).toThrow('region');

    const duplicatePair = structuredClone(manifest);
    duplicatePair.pairs[1].id = duplicatePair.pairs[0].id;
    expect(() => validateMatchingManifest(duplicatePair)).toThrow('duplicate pair');
  });

  it('rejects labels that contradict exact-printing identities', () => {
    const rows = parseSolringCornersCsv(csv);
    const manifest = buildSolringManifest(rows, {
      datasetRevision: '11f4c7ba2201dfc67df88093ed49ca8013f23b14',
      fileMetadata: Object.fromEntries(rows.map((row, index) => [
        row.imagePath,
        { byteLength: index + 1, sha256: index.toString(16).padStart(64, '0') },
      ])),
    });
    const contradictory = structuredClone(manifest);
    contradictory.pairs.find(pair => pair.expected === 'non-match')!.expected = 'match';

    expect(() => validateMatchingManifest(contradictory)).toThrow('identity');
  });
});
