import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const DETECTOR_PROFILE = {
  fastThreshold: 20,
  contiguousPixels: 9,
  maximumKeypoints: 64,
  maximumKeypointsPerCell: 6,
  cellSize: 32,
  minimumDescriptorBitBalance: 32,
  maximumDimension: 512,
};
const MATCH_PROFILES = [
  { maximumDescriptorDistance: 32, ratioPermille: 700, maximumColorDistance: 24 },
  { maximumDescriptorDistance: 48, ratioPermille: 800, maximumColorDistance: 24 },
  { maximumDescriptorDistance: 64, ratioPermille: 900, maximumColorDistance: 24 },
  { maximumDescriptorDistance: 32, ratioPermille: 700, maximumColorDistance: 48 },
  { maximumDescriptorDistance: 48, ratioPermille: 800, maximumColorDistance: 48 },
  { maximumDescriptorDistance: 64, ratioPermille: 900, maximumColorDistance: 48 },
  { maximumDescriptorDistance: 48, ratioPermille: 800, maximumColorDistance: 96 },
  { maximumDescriptorDistance: 64, ratioPermille: 900, maximumColorDistance: 96 },
];
const MINIMUM_INLIERS = [3, 4, 6, 8];
const MINIMUM_INLIER_RATIOS = [0.2, 0.4];
const MAXIMUM_VERIFICATION_COLOR_DISTANCES = [1, 2, 4, 8, 16];
const MAXIMUM_RESIDUAL_PERMILLE = 8;

const parseArguments = (arguments_) => {
  let manifest;
  let output;
  for (let index = 0; index < arguments_.length; index += 2) {
    if (arguments_[index] === '--manifest') manifest = resolve(arguments_[index + 1]);
    else if (arguments_[index] === '--output') output = resolve(arguments_[index + 1]);
    else throw new Error('Usage: development.mjs --manifest FILE --output FILE');
  }
  if (manifest === undefined || output === undefined) {
    throw new Error('Usage: development.mjs --manifest FILE --output FILE');
  }
  return { manifest, output };
};

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
    const width = Math.max(40, Math.floor(source.width * 0.7));
    const height = Math.max(40, Math.floor(source.height * 0.7));
    return crop(source, Math.floor((source.width - width) / 2), Math.floor((source.height - height) / 2), width, height);
  }
  if (mode === 'asymmetric') {
    const width = Math.max(40, Math.floor(source.width * 0.62));
    const height = Math.max(40, Math.floor(source.height * 0.82));
    return crop(source, 0, Math.floor((source.height - height) / 3), width, height);
  }
  const width = Math.max(40, Math.floor(source.width * 0.5));
  const height = Math.max(40, Math.floor(source.height * 0.65));
  return crop(source, source.width - width, Math.floor((source.height - height) / 4), width, height);
};

const createPairs = (sources) => {
  const pairs = [];
  for (const source of sources) {
    for (const mode of ['center', 'asymmetric', 'severe']) {
      pairs.push({ left: `${source.id}:original`, right: `${source.id}:${mode}`, positive: true, domain: source.domain });
    }
  }
  for (let left = 0; left < sources.length; left += 1) {
    for (let right = left + 1; right < sources.length; right += 1) {
      for (const [leftVariant, rightVariant] of [
        ['original', 'original'], ['center', 'center'], ['original', 'center'],
      ]) {
        pairs.push({
          left: `${sources[left].id}:${leftVariant}`,
          right: `${sources[right].id}:${rightVariant}`,
          positive: false,
          domain: null,
          domainPair: [sources[left].domain, sources[right].domain].sort().join('::'),
        });
      }
    }
  }
  return pairs;
};

const run = async ({ manifest: manifestPath, output }) => {
  const require = createRequire(import.meta.url);
  const { decodeImage } = require('../../lib/node.js');
  const {
    compareCropKeypointFingerprints,
    fingerprintCropKeypointExperiment,
  } = require('../../lib/core/algorithms/crop-keypoint/index.js');
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const root = dirname(manifestPath);
  const fingerprints = new Map();
  const sources = [];
  const generationTimes = [];
  const keypointCounts = [];
  const outputBytes = [];
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
      const started = performance.now();
      const fingerprint = fingerprintCropKeypointExperiment(pixels, DETECTOR_PROFILE);
      generationTimes.push(performance.now() - started);
      keypointCounts.push(fingerprint.keypoints.length);
      outputBytes.push(Buffer.byteLength(JSON.stringify(fingerprint)));
      fingerprints.set(`${entry.id}:${variant}`, fingerprint);
    }
  }
  const pairs = createPairs(sources);
  const profiles = [];
  for (const matchProfile of MATCH_PROFILES) {
    const comparisonTimes = [];
    const evidence = pairs.map((pair) => {
      const started = performance.now();
      const result = compareCropKeypointFingerprints(
        fingerprints.get(pair.left), fingerprints.get(pair.right),
        {
          ...matchProfile,
          minimumInliers: 1,
          minimumInlierRatio: 0,
          maximumResidualPermille: MAXIMUM_RESIDUAL_PERMILLE,
          maximumVerificationColorDistance: 255,
        },
      );
      comparisonTimes.push(performance.now() - started);
      return {
        ...pair,
        inliers: result.inliers.length,
        inlierRatio: result.inlierRatio,
        verificationMeanColorDistance: result.verificationMeanColorDistance,
        verificationSamples: result.verificationSamples,
      };
    });
    for (const minimumInliers of MINIMUM_INLIERS) {
      for (const minimumInlierRatio of MINIMUM_INLIER_RATIOS) {
        for (const maximumVerificationColorDistance of MAXIMUM_VERIFICATION_COLOR_DISTANCES) {
        const decisions = evidence.map((entry) => ({
          ...entry,
          matches: entry.inliers >= minimumInliers
            && entry.inlierRatio >= minimumInlierRatio
            && entry.verificationSamples >= 16
            && entry.verificationMeanColorDistance !== null
            && entry.verificationMeanColorDistance <= maximumVerificationColorDistance,
        }));
        profiles.push({
          ...matchProfile,
          maximumResidualPermille: MAXIMUM_RESIDUAL_PERMILLE,
          minimumInliers,
          minimumInlierRatio,
          maximumVerificationColorDistance,
          ...metrics(decisions),
          positiveByDomain: Object.fromEntries(manifest.selection.domains.map((domain) => [
            domain,
            metrics(decisions.filter((decision) => decision.positive && decision.domain === domain)),
          ])),
          negativeByDomainPair: Object.fromEntries(
            [...new Set(decisions.filter((decision) => !decision.positive).map(({ domainPair }) => domainPair))]
              .sort()
              .map((domainPair) => [
                domainPair,
                metrics(decisions.filter((decision) => !decision.positive && decision.domainPair === domainPair)),
              ]),
          ),
          comparisonMilliseconds: summarize(comparisonTimes),
        });
        }
      }
    }
  }
  const eligible = profiles.filter((profile) => profile.falsePositiveRate <= 0.005);
  const best = eligible.sort((left, right) => right.recall - left.recall || left.falsePositive - right.falsePositive)[0] ?? null;
  const developmentGate = {
    maximumFalsePositiveRate: 0.005,
    minimumRecall: 0.2,
    bestEligibleProfile: best,
    pass: best !== null && best.recall >= 0.2,
  };
  const report = {
    profileVersion: 1,
    study: 'crop-keypoint-fast-brief-v0-development',
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
    detectorProfile: DETECTOR_PROFILE,
    profileGrid: {
      matchProfiles: MATCH_PROFILES,
      minimumInliers: MINIMUM_INLIERS,
      minimumInlierRatios: MINIMUM_INLIER_RATIOS,
      maximumVerificationColorDistances: MAXIMUM_VERIFICATION_COLOR_DISTANCES,
      maximumResidualPermille: MAXIMUM_RESIDUAL_PERMILLE,
    },
    resources: {
      generationMilliseconds: summarize(generationTimes),
      comparisonMilliseconds: profiles[0]?.comparisonMilliseconds ?? summarize([]),
      keypointCount: summarize(keypointCounts),
      outputBytes: summarize(outputBytes),
    },
    developmentGate,
    limitations: [
      'This already-inspected corpus is development evidence, not a holdout.',
      'The v0 descriptor is not rotation invariant and uses only one processed scale per image.',
      'The grid fixes detector density and geometric residual while screening match policy.',
      'The retained report records the selected profile; exhaustive grid rows remain local-only.',
    ],
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  return { output, counts: report.counts, developmentGate };
};

try {
  process.stdout.write(`${JSON.stringify(await run(parseArguments(process.argv.slice(2))), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`crop-keypoint development: ${error.message}\n`);
  process.exitCode = 2;
}
