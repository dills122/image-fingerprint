import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const THRESHOLDS = [16, 24, 32, 48, 64, 80, 96, 112, 128];
const BIT_BALANCES = [0, 16, 32, 48, 64];
const CHILD_HASH_CANDIDATES = [
  { regionAlgorithm: 'blockhash-v1', minimumQualities: [0] },
  { regionAlgorithm: 'pdq-v1', minimumQualities: [0, 25, 50] },
];

const percentile = (values, fraction) => {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)];
};

const summarize = (values) => ({
  count: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  maximum: values.length === 0 ? null : Math.max(...values),
});

const parseArguments = (arguments_) => {
  if (arguments_.length === 1 && arguments_[0] === '--plan-only') {
    return { planOnly: true };
  }
  let manifest;
  let output;
  for (let index = 0; index < arguments_.length; index += 2) {
    if (arguments_[index] === '--manifest') manifest = resolve(arguments_[index + 1]);
    else if (arguments_[index] === '--output') output = resolve(arguments_[index + 1]);
    else throw new Error('Usage: met-quality.mjs --manifest FILE --output FILE');
  }
  if (manifest === undefined || output === undefined) {
    throw new Error('Usage: met-quality.mjs --manifest FILE --output FILE');
  }
  return { planOnly: false, manifest, output };
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
  const width = Math.max(16, Math.floor(source.width * 0.62));
  const height = Math.max(16, Math.floor(source.height * 0.82));
  return crop(source, 0, Math.floor((source.height - height) / 3), width, height);
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

const run = async ({ manifest: manifestPath, output }) => {
  const require = createRequire(import.meta.url);
  const { decodeImage } = require('../../lib/node.js');
  const { compareFingerprints, fingerprintPixels } = require('../../lib/core/index.js');
  const { compareCropBlockSegments, fingerprintCropBlockExperiment } = require('../../lib/core/algorithms/crop-block/index.js');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const root = dirname(manifestPath);
  const images = [];
  for (const entry of manifest.images) {
    const original = await decodeImage(join(root, entry.file));
    images.push({ id: `${entry.objectID}:original`, objectID: entry.objectID, source: original });
    images.push({ id: `${entry.objectID}:center`, objectID: entry.objectID, source: transform(original, 'center') });
    images.push({ id: `${entry.objectID}:asymmetric`, objectID: entry.objectID, source: transform(original, 'asymmetric') });
  }
  const pairs = [];
  for (const entry of manifest.images) {
    pairs.push({ left: `${entry.objectID}:original`, right: `${entry.objectID}:center`, positive: true, transform: 'center-crop-49%-area' });
    pairs.push({ left: `${entry.objectID}:original`, right: `${entry.objectID}:asymmetric`, positive: true, transform: 'asymmetric-crop-50.8%-area' });
  }
  for (let left = 0; left < manifest.images.length; left += 1) {
    for (let right = left + 1; right < manifest.images.length; right += 1) {
      pairs.push({
        left: `${manifest.images[left].objectID}:original`,
        right: `${manifest.images[right].objectID}:original`,
        positive: false,
        transform: 'unrelated-originals',
      });
      pairs.push({
        left: `${manifest.images[left].objectID}:center`,
        right: `${manifest.images[right].objectID}:center`,
        positive: false,
        transform: 'unrelated-sibling-crops',
      });
    }
  }
  const cropFingerprints = new Map(images.map((image) => [image.id, fingerprintCropBlockExperiment(image.source, {
    preprocessing: 'area-box', maximumSegments: 16, fallback: 'empty',
  })]));
  const qualityControls = [];
  for (const minimumBitBalance of BIT_BALANCES) {
    for (const requirePolarity of [false, true]) {
      for (const minimumQueryCoverage of [0.25, 0.5]) {
        qualityControls.push({
          minimumBitBalance,
          requirePolarity,
          minimumQueryCoverage,
          sweep: THRESHOLDS.map((threshold) => ({
            threshold,
            ...metrics(pairs.map((pair) => {
              const evidence = compareCropBlockSegments(
                cropFingerprints.get(pair.left).segments,
                cropFingerprints.get(pair.right).segments,
                'one-to-one', threshold,
                { allowFallback: false, minimumBitBalance, requirePolarity },
              );
              return { positive: pair.positive, matches: evidence.matchedRegions >= 1 && evidence.queryCoverage >= minimumQueryCoverage };
            })),
          })),
        });
      }
    }
  }
  const childHashBakeoff = [];
  for (const candidate of CHILD_HASH_CANDIDATES) {
    const fingerprints = new Map();
    const generationTimes = [];
    const outputBytes = [];
    for (const image of images) {
      const started = performance.now();
      const fingerprint = fingerprintCropBlockExperiment(image.source, {
        preprocessing: 'area-box',
        maximumSegments: 16,
        fallback: 'empty',
        regionAlgorithm: candidate.regionAlgorithm,
      });
      generationTimes.push(performance.now() - started);
      outputBytes.push(Buffer.byteLength(JSON.stringify(fingerprint)));
      fingerprints.set(image.id, fingerprint);
    }
    const qualities = [...fingerprints.values()].flatMap((fingerprint) => (
      fingerprint.segments.flatMap((segment) => (
        segment.quality === undefined ? [] : [segment.quality]
      ))
    ));
    childHashBakeoff.push({
      regionAlgorithm: candidate.regionAlgorithm,
      generationMilliseconds: summarize(generationTimes),
      outputBytes: summarize(outputBytes),
      childQuality: summarize(qualities),
      policies: candidate.minimumQualities.map((minimumQuality) => ({
        minimumQuality,
        requirePolarity: true,
        minimumQueryCoverage: 0.25,
        sweep: THRESHOLDS.map((threshold) => {
          const comparisonTimes = [];
          const result = metrics(pairs.map((pair) => {
            const started = performance.now();
            const evidence = compareCropBlockSegments(
              fingerprints.get(pair.left).segments,
              fingerprints.get(pair.right).segments,
              'one-to-one', threshold,
              { allowFallback: false, minimumQuality, requirePolarity: true },
            );
            comparisonTimes.push(performance.now() - started);
            return {
              positive: pair.positive,
              matches: evidence.matchedRegions >= 1 && evidence.queryCoverage >= 0.25,
            };
          }));
          return { threshold, ...result, comparisonMilliseconds: summarize(comparisonTimes) };
        }),
      })),
    });
  }
  const baselines = ['blockhash-v1', 'pdq-v1'].map((algorithm) => {
    const options = algorithm === 'pdq-v1'
      ? { algorithm }
      : { algorithm, bitsPerSide: 16, method: 2 };
    const fingerprints = new Map(images.map((image) => [image.id, fingerprintPixels(image.source, options)]));
    return {
      algorithm,
      sweep: THRESHOLDS.map((threshold) => ({
        threshold,
        ...metrics(pairs.map((pair) => ({
          positive: pair.positive,
          matches: compareFingerprints(fingerprints.get(pair.left), fingerprints.get(pair.right)).distance <= threshold,
        }))),
      })),
    };
  });
  const report = {
    profileVersion: 1,
    corpus: manifest.corpus,
    sourceManifest: manifestPath,
    sourceObjects: manifest.images.map(({ objectID, title, objectURL, sha256, license }) => ({ objectID, title, objectURL, sha256, license })),
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    counts: {
      sourceImages: manifest.images.length,
      positivePairs: pairs.filter((pair) => pair.positive).length,
      negativePairs: pairs.filter((pair) => !pair.positive).length,
    },
    selectedGenerationProfile: { preprocessing: 'area-box', maximumSegments: 16, fallback: 'empty' },
    qualityControls,
    childHashBakeoff,
    baselines,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  return { output, counts: report.counts };
};

try {
  const options = parseArguments(process.argv.slice(2));
  const result = options.planOnly
    ? { corpus: 'met-open-access-crop-block-v1', thresholds: THRESHOLDS, bitBalances: BIT_BALANCES, localOnly: true }
    : await run(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Met crop-block quality: ${error.message}\n`);
  process.exitCode = 2;
}
