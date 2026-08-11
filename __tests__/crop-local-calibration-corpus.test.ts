import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCropLocalCalibrationManifest,
  collectExcludedCropLocalSourceKeys,
  compactCropLocalCalibrationReport,
  createCropLocalCalibrationPairs,
  CROP_LOCAL_CALIBRATION_PROFILE,
  CROP_LOCAL_ITEM_COLOR_HOLDOUT_PROFILE,
  transformCropLocalCalibration,
  summarizeCropLocalMeasurements,
  validateCropLocalCalibrationManifest,
} from '../benchmarks/crop-local/calibration-corpus.mjs';
import { createCropLocalSyntheticFixture } from '../benchmarks/crop-local/synthetic-fixtures.mjs';

const generator = 'benchmarks/crop-local/prepare-calibration-corpus.mjs';

const exclusions = () => [
  {
    corpus: 'crop-local-development-v1',
    manifestSha256: 'a'.repeat(64),
    manifest: {
      corpus: 'crop-local-development-v1',
      images: [{
        id: 'old-commons-900001',
        pageId: 900_001,
        sha256: 'e'.repeat(64),
      }],
    },
  },
  {
    corpus: 'crop-local-source-disjoint-v1',
    manifestSha256: 'b'.repeat(64),
    manifest: {
      corpus: 'crop-local-source-disjoint-v1',
      images: [{
        id: 'old-generated',
        domain: 'card-layout',
        sourceType: 'deterministic-generated',
        generator: 'benchmarks/crop-block/prepare-mixed-corpus.mjs',
        seed: 5_000,
        style: 2,
        sha256: 'f'.repeat(64),
      }],
    },
  },
];

const images = (profile = CROP_LOCAL_CALIBRATION_PROFILE) => {
  let sequence = 1;
  return profile.domains.flatMap((domain) => (
    Array.from({ length: profile.sourcesPerDomain }, (_, index) => {
      const current = sequence;
      sequence += 1;
      const common = {
        id: `${domain}-${String(index).padStart(3, '0')}`,
        domain,
        file: `images/${domain}-${String(index).padStart(3, '0')}.png`,
        width: 900,
        height: 700,
        byteLength: 1_000 + current,
        sha256: current.toString(16).padStart(64, '0'),
        license: 'CC0-1.0',
        licenseURL: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attributionRequired: false,
      };
      if (domain === 'photograph' || domain === 'portrait' || domain === 'document') {
        const pageId = 10_000 + current;
        return {
          ...common,
          sourceType: 'wikimedia-commons',
          title: `${domain} ${index}`,
          pageId,
          descriptionURL: `https://commons.wikimedia.org/wiki/File:${pageId}`,
          imageURL: `https://upload.wikimedia.org/${pageId}.png`,
          apiQueryURL: `https://commons.wikimedia.org/w/api.php?page=${pageId}`,
        };
      }
      return {
        ...common,
        sourceType: 'deterministic-generated',
        title: `${domain} ${index}`,
        generator,
        seed: (profile.syntheticStyle === 4 ? 200_000 : 100_000) + index,
        style: profile.syntheticStyle,
      };
    })
  ));
};

const build = (selectedImages = images()) => buildCropLocalCalibrationManifest({
  images: selectedImages,
  exclusions: exclusions(),
  commonsStartOffset: 2_000,
  syntheticSeedOffset: 100_000,
  createdAt: '2026-08-10T22:00:00.000Z',
});

const holdoutExclusions = () => [...exclusions(), {
  corpus: CROP_LOCAL_CALIBRATION_PROFILE.corpus,
  manifestSha256: 'c'.repeat(64),
  manifest: {
    corpus: CROP_LOCAL_CALIBRATION_PROFILE.corpus,
    images: [{ id: 'calibration-source', sha256: 'd'.repeat(64) }],
  },
}];

describe('Crop-Local independent calibration corpus', () => {
  it('freezes 500 source-disjoint sources and 1,500 transformations', () => {
    const manifest = build();
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      corpus: 'crop-local-independent-calibration-v1',
      policy: 'locked-development-profile',
      selection: {
        sourcesPerDomain: 100,
        totalSources: 500,
        transformations: ['center', 'asymmetric', 'severe'],
        totalTransformations: 1_500,
      },
    });
    expect(manifest.images).toHaveLength(500);
    expect(validateCropLocalCalibrationManifest(
      manifest,
      exclusions().map(({ manifest: excluded }) => excluded),
    )).toBe(manifest);
  });

  it('uses a distinct style-4 contract for the untouched item-color holdout', () => {
    const manifest = buildCropLocalCalibrationManifest({
      images: images(CROP_LOCAL_ITEM_COLOR_HOLDOUT_PROFILE),
      exclusions: holdoutExclusions(),
      commonsStartOffset: 6_000,
      syntheticSeedOffset: 200_000,
      createdAt: '2026-08-10T23:00:00.000Z',
      profile: CROP_LOCAL_ITEM_COLOR_HOLDOUT_PROFILE,
    });
    expect(manifest).toMatchObject({
      corpus: 'crop-local-item-color-holdout-v1',
      policy: 'locked-item-color-profile',
      selection: {
        syntheticStyle: 4,
        excludedCorpora: expect.arrayContaining([
          expect.objectContaining({ corpus: 'crop-local-independent-calibration-v1' }),
        ]),
      },
    });
    expect(validateCropLocalCalibrationManifest(
      manifest,
      holdoutExclusions().map(({ manifest: excluded }) => excluded),
      CROP_LOCAL_ITEM_COLOR_HOLDOUT_PROFILE,
    )).toBe(manifest);
  });

  it('reproduces the retained style-3 and style-4 card fixture checksums', () => {
    const digest = (style: number, seed: number) => createHash('sha256')
      .update(createCropLocalSyntheticFixture('card-layout', seed, style))
      .digest('hex');
    expect(digest(3, 100_000)).toBe(
      '02851d25101a4046804369d71a235fd29a3efc5ae81b556026332042ab0664d3',
    );
    expect(digest(4, 200_000)).toBe(
      '0efe4b183f0b4d5a3810fe47ac467e1e497dd7587a853900587c0b9bb11f1f9a',
    );
    expect(() => createCropLocalSyntheticFixture('document', 1, 4)).toThrow(
      'unsupported crop-local synthetic domain',
    );
  });

  it('collects page, pixel, and generated identities from development manifests', () => {
    const keys = collectExcludedCropLocalSourceKeys(
      exclusions().map(({ manifest }) => manifest),
    );
    expect(keys).toContain('commons-page:900001');
    expect(keys).toContain(`sha256:${'f'.repeat(64)}`);
    expect(keys).toContain(
      'generated:benchmarks/crop-block/prepare-mixed-corpus.mjs:card-layout:2:5000',
    );
  });

  it('rejects overlap, duplicate bytes, unsafe paths, and incomplete domain counts', () => {
    const overlapping = images();
    overlapping[0] = { ...overlapping[0], pageId: 900_001 };
    expect(() => build(overlapping)).toThrow('overlaps development data');

    const duplicate = images();
    duplicate[1] = { ...duplicate[1], sha256: duplicate[0].sha256 };
    expect(() => build(duplicate)).toThrow('duplicate calibration image sha256');

    const unsafe = build();
    unsafe.images[0].file = '../outside.png';
    expect(() => validateCropLocalCalibrationManifest(unsafe)).toThrow('stay under images');

    const incomplete = images().slice(1);
    expect(() => build(incomplete)).toThrow('exactly 500 images');
  });

  it('applies the frozen crop transformations deterministically', () => {
    const source = {
      format: 'rgba8',
      width: 100,
      height: 80,
      data: Uint8Array.from({ length: 100 * 80 * 4 }, (_, index) => index % 251),
    };
    const center = transformCropLocalCalibration(source, 'center');
    const asymmetric = transformCropLocalCalibration(source, 'asymmetric');
    const severe = transformCropLocalCalibration(source, 'severe');
    expect([center.width, center.height]).toEqual([70, 56]);
    expect([asymmetric.width, asymmetric.height]).toEqual([62, 65]);
    expect([severe.width, severe.height]).toEqual([50, 52]);
    expect(center.data.slice(0, 4)).toEqual(source.data.slice(((12 * 100) + 15) * 4, ((12 * 100) + 15) * 4 + 4));
    expect(() => transformCropLocalCalibration(source, 'rotation')).toThrow('unsupported');
  });

  it('pairs every original once and adds only same-template hard-negative variants', () => {
    const sources = images().map(({ id, domain }) => ({ id, domain }));
    const pairs = createCropLocalCalibrationPairs(sources);
    const positives = pairs.filter(({ positive }) => positive);
    const negatives = pairs.filter(({ positive }) => !positive);
    expect(positives).toHaveLength(1_500);
    expect(negatives).toHaveLength(144_550);
    expect(negatives.filter(({ left, right }) => (
      left.endsWith(':asymmetric') || right.endsWith(':asymmetric')
    ))).toHaveLength(19_800);
  });

  it('summarizes calibration-scale timing arrays without spreading them onto the call stack', () => {
    const values = Array.from({ length: 146_050 }, (_, index) => index % 1_001);
    expect(summarizeCropLocalMeasurements(values)).toEqual({
      count: 146_050,
      p50: 500,
      p95: 950,
      maximum: 1_000,
    });
  });

  it('compacts false-positive evidence while retaining provenance and decision fields', () => {
    const report = compactCropLocalCalibrationReport({
      study: 'crop-local-multiscale-binary-v0-typescript-independent-calibration',
      sourceManifest: '/private/local/manifest.json',
      sourceProvenance: [{ id: 'source-a' }],
      counts: { sourceImages: 500, positivePairs: 1_500, negativePairs: 144_550 },
      finalDevelopmentGate: { pass: false },
      selectedFalsePositiveEvidence: [
        { left: 'a:original', right: 'b:original', domainPair: 'photograph::photograph' },
        { left: 'c:asymmetric', right: 'd:asymmetric', domainPair: 'card-layout::card-layout' },
      ],
    });
    expect(report.sourceManifest).toBe(
      'local-only/crop-local-independent-calibration-v1/manifest.json',
    );
    expect(report.falsePositiveEvidence).toMatchObject({
      count: 2,
      byDomainPair: {
        'card-layout::card-layout': 1,
        'photograph::photograph': 1,
      },
      byVariantPair: { 'asymmetric::asymmetric': 1, 'original::original': 1 },
    });
    expect(report.sourceProvenance).toEqual([{ id: 'source-a' }]);
    expect(report.decision.thresholdsRetunedOnCalibration).toBe(false);
  });

  it('exposes a network-free plan for the resumable local-only builder', () => {
    const output = execFileSync(process.execPath, [
      resolve('benchmarks/crop-local/prepare-calibration-corpus.mjs'),
      '--plan-only',
    ], { encoding: 'utf8' });
    expect(JSON.parse(output)).toMatchObject({
      totalSources: 500,
      totalTransformations: 1_500,
      requiredExcludedManifests: 2,
      sourcePixels: 'local-only-outside-repository',
      resumable: true,
    });
  });
});
