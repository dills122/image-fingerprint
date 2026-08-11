import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildMtgCardHoldoutManifest,
  createMtgCardHoldoutPairs,
  MTG_CARD_HOLDOUT_ERAS,
  MTG_CARD_RECALL_HOLDOUT_PROFILE,
  transformMtgCardHoldout,
  validateMtgCardHoldoutManifest,
} from '../benchmarks/crop-local/mtg-card-holdout-corpus.mjs';

const uuid = (prefix: number, sequence: number): string => (
  `${prefix.toString(16).padStart(8, '0')}-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`
);

const developmentReport = {
  study: 'crop-local-card-recall-mtg-development',
  sourceProvenance: [{
    id: uuid(9, 1),
    name: 'Excluded card',
    sha256: 'f'.repeat(64),
  }],
};

const images = () => MTG_CARD_HOLDOUT_ERAS.flatMap(({ id: era }, eraIndex) => (
  Array.from({ length: 25 }, (_, index) => {
    const sequence = eraIndex * 25 + index + 1;
    const id = uuid(1, sequence);
    return {
      id,
      oracleId: uuid(2, sequence),
      illustrationId: uuid(3, sequence),
      name: `Holdout card ${sequence}`,
      set: `T${eraIndex + 1}`,
      collectorNumber: String(sequence),
      era,
      releasedAt: `${MTG_CARD_HOLDOUT_ERAS[eraIndex].releasedAfter.slice(0, 4)}-06-01`,
      layout: 'normal',
      style: index % 2 === 0 ? 'normal' : 'showcase',
      colorCategory: ['W', 'U', 'B', 'R', 'G'][index % 5],
      primaryType: index % 2 === 0 ? 'Creature' : 'Instant',
      rarity: index % 2 === 0 ? 'common' : 'rare',
      file: `images/${id}.jpg`,
      sha256: sequence.toString(16).padStart(64, '0'),
      byteLength: 10_000 + sequence,
      width: 488,
      height: 680,
      sourceType: 'scryfall-normal-jpeg',
      scryfallURL: `https://scryfall.com/card/t${eraIndex + 1}/${sequence}/holdout-card-${sequence}`,
      imageURL: `https://cards.scryfall.io/normal/front/0/0/${id}.jpg`,
      rights: 'Wizards of the Coast card image; local research fixture, not redistributed',
    };
  })
));

const build = (selectedImages = images()) => buildMtgCardHoldoutManifest({
  images: selectedImages,
  developmentReport,
  developmentReportSha256: 'a'.repeat(64),
  createdAt: '2026-08-10T20:00:00.000Z',
  acquisition: { source: 'Scryfall API', requestCount: 8 },
});

describe('MTG card-recall untouched holdout contract', () => {
  it('freezes 100 source-disjoint printings, 300 positives, and 14,850 negatives', () => {
    const manifest = build();
    expect(manifest).toMatchObject({
      corpus: 'crop-local-card-recall-mtg-holdout-v1',
      policy: 'frozen-card-recall-development-profile',
      selection: {
        sourcesPerEra: 25,
        totalSources: 100,
        transformations: ['center', 'severe', 'normalized-capture'],
        totalPositivePairs: 300,
        totalNegativePairs: 14_850,
        gate: {
          minimumRecallGain: 0.05,
          maximumAdditionalFalsePositives: 0,
        },
      },
    });
    expect(validateMtgCardHoldoutManifest(manifest, developmentReport)).toBe(manifest);
    const pairs = createMtgCardHoldoutPairs(manifest.images);
    expect(pairs.filter(({ positive }) => positive)).toHaveLength(300);
    expect(pairs.filter(({ positive }) => !positive)).toHaveLength(14_850);
  });

  it('requires unique print, oracle, art, name, and pixel identities outside development', () => {
    for (const field of ['id', 'oracleId', 'illustrationId', 'name', 'sha256'] as const) {
      const duplicate = images();
      duplicate[1] = { ...duplicate[1], [field]: duplicate[0][field] };
      expect(() => build(duplicate), field).toThrow(/duplicate MTG holdout identity/u);
    }
    const overlap = images();
    overlap[0] = {
      ...overlap[0],
      id: developmentReport.sourceProvenance[0].id,
    };
    expect(() => build(overlap)).toThrow('overlaps development data');
  });

  it('creates deterministic normalized-capture evidence separately from fixed crops', () => {
    const source = {
      format: 'rgba8' as const,
      width: 100,
      height: 140,
      data: Uint8Array.from({ length: 100 * 140 * 4 }, (_, index) => index % 251),
    };
    const first = transformMtgCardHoldout(source, 'normalized-capture', uuid(1, 1));
    const second = transformMtgCardHoldout(source, 'normalized-capture', uuid(1, 1));
    expect(first).toEqual(second);
    expect(first.width).toBeLessThan(source.width);
    expect(first.height).toBeLessThan(source.height);
    expect(first.data).not.toEqual(source.data.slice(0, first.data.length));
    expect(() => transformMtgCardHoldout(source, 'perspective', uuid(1, 1))).toThrow(
      'unsupported MTG card holdout transformation',
    );
  });

  it('keeps the success gate fixed in the shared profile', () => {
    expect(MTG_CARD_RECALL_HOLDOUT_PROFILE.gate).toEqual({
      minimumRecallGain: 0.05,
      maximumAdditionalFalsePositives: 0,
      minimumNormalizedCaptureRecall: 0.2,
      requireNormalizedCaptureNotWorseThanFrozen: true,
    });
  });

  it('exposes the acquisition plan without making network requests', () => {
    const output = execFileSync(process.execPath, [
      resolve('benchmarks/crop-local/prepare-mtg-card-holdout.mjs'),
      '--plan-only',
    ], { encoding: 'utf8' });
    expect(JSON.parse(output)).toMatchObject({
      totalSources: 100,
      totalPositivePairs: 300,
      totalNegativePairs: 14_850,
      sourcePixels: 'local-only-outside-repository',
      rights: 'Wizards of the Coast card images are not redistributed',
    });
  });

  it('retains the single-pass holdout failure without post-hoc threshold tuning', () => {
    const report = JSON.parse(readFileSync(resolve(
      'benchmarks/crop-local/mtg-card-holdout-node22-2026-08-10.json',
    ), 'utf8'));

    expect(report).toMatchObject({
      study: 'crop-local-card-recall-v0-untouched-mtg-holdout',
      policyMode: 'frozen-single-pass',
      counts: {
        sourceImages: 100,
        positivePairs: 300,
        negativePairs: 14_850,
      },
      quality: {
        baseline: {
          truePositive: 133,
          falsePositive: 1,
        },
        candidate: {
          truePositive: 160,
          falsePositive: 1,
        },
        gate: {
          observedAdditionalFalsePositives: 0,
          observedNormalizedCaptureRecall: 0.15,
          observedFrozenNormalizedCaptureRecall: 0.1,
          lostBaselineMatches: 0,
          pass: false,
        },
      },
      decision: {
        qualityGate: 'failed',
        publicProfile: 'blocked',
        thresholdsRetunedOnHoldout: false,
      },
      negativeLabelAudit: {
        manualReview: {
          reviewedPairs: 1,
          validFalsePositives: 1,
          relatedOrMislabeledPairs: 0,
        },
      },
    });
    expect(report.quality.recallGain).toBeCloseTo(0.09);
  });
});
