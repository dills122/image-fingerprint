import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const THRESHOLDS = [0, 32, 64, 80];
const ENTROPY_THRESHOLDS = [0, 1000, 2000, 3000];
const EDGE_THRESHOLDS = [0, 10, 30, 60];
const RANGE_THRESHOLDS = [0, 32, 64];
const SPATIAL_POLICY = {
  maximumScaleDeviationPermille: 150,
  maximumTranslationDeviationPermille: 100,
  minimumMatchedRegions: 2,
  minimumQueryCoverage: 0.25,
  minimumCandidateCoverage: 0.25,
  requirePolarity: true,
};

const parseArguments = (arguments_) => {
  let manifest;
  let output;
  for (let index = 0; index < arguments_.length; index += 2) {
    if (arguments_[index] === '--manifest') manifest = resolve(arguments_[index + 1]);
    else if (arguments_[index] === '--output') output = resolve(arguments_[index + 1]);
    else throw new Error('Usage: v2-development.mjs --manifest FILE --output FILE');
  }
  if (manifest === undefined || output === undefined) {
    throw new Error('Usage: v2-development.mjs --manifest FILE --output FILE');
  }
  return { manifest, output };
};

const crop = (source, x, y, width, height) => {
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * source.width + x) * 4;
    data.set(source.data.subarray(start, start + width * 4), row * width * 4);
  }
  return { format: 'rgba8', width, height, data };
};

const transform = (source, mode) => {
  if (mode === 'center') {
    const width = Math.max(16, Math.floor(source.width * 0.7));
    const height = Math.max(16, Math.floor(source.height * 0.7));
    return crop(source, Math.floor((source.width - width) / 2), Math.floor((source.height - height) / 2), width, height);
  }
  if (mode === 'asymmetric') {
    const width = Math.max(16, Math.floor(source.width * 0.62));
    const height = Math.max(16, Math.floor(source.height * 0.82));
    return crop(source, 0, Math.floor((source.height - height) / 3), width, height);
  }
  const width = Math.max(16, Math.floor(source.width * 0.5));
  const height = Math.max(16, Math.floor(source.height * 0.65));
  return crop(source, source.width - width, Math.floor((source.height - height) / 4), width, height);
};

const metrics = (decisions) => {
  const counts = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 };
  decisions.forEach(({ positive, matches }) => {
    if (positive && matches) counts.truePositive += 1;
    else if (positive) counts.falseNegative += 1;
    else if (matches) counts.falsePositive += 1;
    else counts.trueNegative += 1;
  });
  return {
    ...counts,
    precision: counts.truePositive + counts.falsePositive === 0
      ? null : counts.truePositive / (counts.truePositive + counts.falsePositive),
    recall: counts.truePositive / (counts.truePositive + counts.falseNegative),
    falsePositiveRate: counts.falsePositive / (counts.falsePositive + counts.trueNegative),
  };
};

const createPairs = (sources) => {
  const pairs = [];
  for (const source of sources) {
    for (const mode of ['center', 'asymmetric', 'severe']) {
      pairs.push({
        left: `${source.id}:original`,
        right: `${source.id}:${mode}`,
        positive: true,
        domain: source.domain,
      });
    }
  }
  for (let left = 0; left < sources.length; left += 1) {
    for (let right = left + 1; right < sources.length; right += 1) {
      for (const [leftVariant, rightVariant] of [
        ['original', 'original'],
        ['center', 'center'],
        ['original', 'center'],
      ]) {
        pairs.push({
          left: `${sources[left].id}:${leftVariant}`,
          right: `${sources[right].id}:${rightVariant}`,
          positive: false,
          domain: null,
        });
      }
    }
  }
  return pairs;
};

const eligibleFingerprint = (fingerprint, profile) => {
  const seen = new Set();
  return {
    sourceWidth: fingerprint.sourceWidth,
    sourceHeight: fingerprint.sourceHeight,
    segments: fingerprint.segments.filter((segment) => {
      if (
        segment.entropyMilliBits < profile.minimumEntropyMilliBits
        || segment.edgeDensityPermille < profile.minimumEdgeDensityPermille
        || segment.luminanceRange < profile.minimumLuminanceRange
        || seen.has(segment.hash)
      ) return false;
      seen.add(segment.hash);
      return true;
    }),
  };
};

const run = async ({ manifest: manifestPath, output }) => {
  const require = createRequire(import.meta.url);
  const { decodeImage } = require('../../lib/node.js');
  const {
    compareCropBlockSpatial,
    fingerprintCropBlockV2Experiment,
  } = require('../../lib/core/algorithms/crop-block/index.js');
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const root = dirname(manifestPath);
  const raw = new Map();
  const sources = [];
  for (const entry of manifest.images) {
    const encoded = await readFile(join(root, entry.file));
    if (createHash('sha256').update(encoded).digest('hex') !== entry.sha256) {
      throw new Error(`SHA-256 mismatch for ${entry.id}`);
    }
    const original = await decodeImage(encoded);
    sources.push({ id: entry.id, domain: entry.domain });
    for (const [variant, pixels] of [
      ['original', original],
      ['center', transform(original, 'center')],
      ['asymmetric', transform(original, 'asymmetric')],
      ['severe', transform(original, 'severe')],
    ]) {
      raw.set(`${entry.id}:${variant}`, fingerprintCropBlockV2Experiment(pixels, {
        preprocessing: 'area-box',
        gridSize: 300,
        minimumArea: 500,
        maximumSegments: 16,
        fallback: 'empty',
        regionAlgorithm: 'blockhash-v1',
        deduplicateChildHashes: false,
      }));
    }
  }
  const pairs = createPairs(sources);
  const profiles = [];
  for (const minimumEntropyMilliBits of ENTROPY_THRESHOLDS) {
    for (const minimumEdgeDensityPermille of EDGE_THRESHOLDS) {
      for (const minimumLuminanceRange of RANGE_THRESHOLDS) {
        const profile = {
          minimumEntropyMilliBits,
          minimumEdgeDensityPermille,
          minimumLuminanceRange,
          deduplicateChildHashes: true,
        };
        const fingerprints = new Map([...raw].map(([id, fingerprint]) => [
          id, eligibleFingerprint(fingerprint, profile),
        ]));
        profiles.push({
          ...profile,
          segmentCounts: {
            empty: [...fingerprints.values()].filter(({ segments }) => segments.length === 0).length,
            total: [...fingerprints.values()].reduce((total, fingerprint) => total + fingerprint.segments.length, 0),
          },
          sweep: THRESHOLDS.map((threshold) => {
            const decisions = pairs.map((pair) => ({
              ...pair,
              matches: compareCropBlockSpatial(
                fingerprints.get(pair.left),
                fingerprints.get(pair.right),
                threshold,
                SPATIAL_POLICY,
              ).matches,
            }));
            return {
              threshold,
              ...metrics(decisions),
              positiveByDomain: Object.fromEntries(manifest.selection.domains.map((domain) => [
                domain,
                metrics(decisions.filter((decision) => decision.positive && decision.domain === domain)),
              ])),
            };
          }),
        });
      }
    }
  }
  const report = {
    profileVersion: 1,
    study: 'crop-block-v2-development-grid',
    developmentCorpus: manifest.corpus,
    sourceManifest: manifestPath,
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    counts: {
      sourceImages: sources.length,
      positivePairs: pairs.filter((pair) => pair.positive).length,
      negativePairs: pairs.filter((pair) => !pair.positive).length,
      profiles: profiles.length,
    },
    fixedGenerationProfile: {
      preprocessing: 'area-box',
      gridSize: 300,
      minimumArea: 500,
      maximumSegments: 16,
      fallback: 'empty',
      regionAlgorithm: 'blockhash-v1',
    },
    fixedSpatialPolicy: SPATIAL_POLICY,
    grid: {
      thresholds: THRESHOLDS,
      entropyMilliBits: ENTROPY_THRESHOLDS,
      edgeDensityPermille: EDGE_THRESHOLDS,
      luminanceRange: RANGE_THRESHOLDS,
    },
    profiles,
    limitations: [
      'This corpus was already inspected and is development evidence only.',
      'The fixed spatial policy is an initial screen, not a selected production policy.',
      'Any selected candidate requires a fresh independently sampled holdout.',
    ],
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  return { output, counts: report.counts };
};

try {
  process.stdout.write(`${JSON.stringify(await run(parseArguments(process.argv.slice(2))), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`crop-block v2 development: ${error.message}\n`);
  process.exitCode = 2;
}
