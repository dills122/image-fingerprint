import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  createCropLocalCalibrationPairs,
  CROP_LOCAL_ITEM_COLOR_HOLDOUT_PROFILE,
  summarizeCropLocalMeasurements,
  transformCropLocalCalibration,
  validateCropLocalCalibrationManifest,
} from './calibration-corpus.mjs';

const FINGERPRINT_PROFILE = {
  maximumDimension: 768,
  maximumFeatures: 128,
  maximumFeaturesPerCell: 12,
  fastThreshold: 20,
  verificationMaximumDimension: 96,
  colorVerificationMaximumDimension: 64,
};
const LOCKED_LOCAL_PROFILE = {
  maximumDescriptorDistance: 48,
  ratioPermille: 700,
  maximumResidualPermille: 6,
  minimumInliers: 4,
  minimumInlierRatio: 0.5,
  minimumSpatialZones: 4,
  minimumInformativeCoverage: 0.02,
  denseInformationCutoff: 0.4,
  denseMinimumAgreement: 0.65,
  denseMaximumContradiction: 0.2,
  sparseMinimumAgreement: 0.8,
  sparseMaximumContradiction: 0,
  minimumInformativeZones: 3,
};

const parseArguments = (arguments_) => {
  let manifest;
  let output;
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] === '--') continue;
    if (arguments_[index] === '--manifest') manifest = resolve(arguments_[index += 1]);
    else if (arguments_[index] === '--output') output = resolve(arguments_[index += 1]);
    else throw new Error('Usage: item-color-holdout.mjs --manifest FILE --output FILE');
  }
  if (manifest === undefined || output === undefined) throw new Error('Manifest and output are required');
  return { manifest, output };
};

const metrics = (decisions) => {
  const counts = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 };
  for (const { positive, matches } of decisions) {
    if (positive && matches) counts.truePositive += 1;
    else if (positive) counts.falseNegative += 1;
    else if (matches) counts.falsePositive += 1;
    else counts.trueNegative += 1;
  }
  return {
    ...counts,
    precision: counts.truePositive + counts.falsePositive === 0
      ? null : counts.truePositive / (counts.truePositive + counts.falsePositive),
    recall: counts.truePositive / (counts.truePositive + counts.falseNegative),
    falsePositiveRate: counts.falsePositive / (counts.falsePositive + counts.trueNegative),
  };
};

const aggregate = (decisions, domains) => ({
  ...metrics(decisions),
  positiveByDomain: Object.fromEntries(domains.map(domain => [
    domain,
    metrics(decisions.filter(entry => entry.positive && entry.domain === domain)),
  ])),
  negativeByDomainPair: Object.fromEntries(
    [...new Set(decisions.filter(entry => !entry.positive).map(({ domainPair }) => domainPair))]
      .sort()
      .map(domainPair => [
        domainPair,
        metrics(decisions.filter(entry => !entry.positive && entry.domainPair === domainPair)),
      ]),
  ),
});

const run = async ({ manifest: manifestPath, output }) => {
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  validateCropLocalCalibrationManifest(
    manifest,
    [],
    CROP_LOCAL_ITEM_COLOR_HOLDOUT_PROFILE,
  );
  const require = createRequire(import.meta.url);
  const { decodeImage } = require('../../lib/node.js');
  const {
    compareCropLocalItemSourceToCrop,
    CROP_LOCAL_ITEM_COLOR_V0_POLICY,
    fingerprintCropLocalItemExperiment,
  } = require('../../lib/core/algorithms/crop-local/index.js');
  const sources = [];
  const fingerprints = new Map();
  const generationTimes = [];
  const featureCounts = [];
  const outputBytes = [];
  for (const entry of manifest.images) {
    const encoded = await readFile(join(dirname(manifestPath), entry.file));
    if (createHash('sha256').update(encoded).digest('hex') !== entry.sha256) {
      throw new Error(`SHA-256 mismatch for ${entry.id}`);
    }
    const original = await decodeImage(encoded);
    sources.push({ id: entry.id, domain: entry.domain });
    for (const [variant, pixels] of [
      ['original', original],
      ['center', transformCropLocalCalibration(original, 'center')],
      ['asymmetric', transformCropLocalCalibration(original, 'asymmetric')],
      ['severe', transformCropLocalCalibration(original, 'severe')],
    ]) {
      const started = performance.now();
      const fingerprint = fingerprintCropLocalItemExperiment(pixels, FINGERPRINT_PROFILE);
      generationTimes.push(performance.now() - started);
      featureCounts.push(fingerprint.local.features.length);
      outputBytes.push(Buffer.byteLength(JSON.stringify(fingerprint)));
      fingerprints.set(`${entry.id}:${variant}`, fingerprint);
    }
  }
  const pairs = createCropLocalCalibrationPairs(sources);
  const comparisonTimes = [];
  const evidence = pairs.map((pair) => {
    const started = performance.now();
    const result = compareCropLocalItemSourceToCrop(
      fingerprints.get(pair.left),
      fingerprints.get(pair.right),
      LOCKED_LOCAL_PROFILE,
    );
    comparisonTimes.push(performance.now() - started);
    return {
      ...pair,
      matches: result.status === 'match',
      status: result.status,
      itemSignal: result.itemSignal,
      localStatus: result.local.status,
      candidateMatches: result.local.candidateMatches,
      geometricInliers: result.local.geometricInliers,
      localVerification: result.local.verification,
      colorVerification: result.color,
      reasons: result.reasons,
    };
  });
  const domains = manifest.selection.domains;
  const selected = aggregate(evidence, domains);
  const domainPasses = Object.values(selected.positiveByDomain).filter(domain => domain.recall >= 0.1).length;
  const pass = selected.recall >= 0.2
    && selected.falsePositiveRate <= 0.005
    && domainPasses >= 4;
  const falsePositives = evidence.filter(entry => !entry.positive && entry.matches);
  const report = {
    profileVersion: 1,
    study: 'crop-local-item-color-v0-independent-holdout',
    policyMode: 'frozen-single-pass',
    developmentCorpus: manifest.corpus,
    sourceManifest: 'local-only/crop-local-item-color-holdout-v1/manifest.json',
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    sourceProvenance: manifest.images.map(({ file: _file, ...entry }) => entry),
    counts: {
      sourceImages: sources.length,
      positivePairs: pairs.filter(pair => pair.positive).length,
      negativePairs: pairs.filter(pair => !pair.positive).length,
      profiles: 1,
    },
    fingerprintProfile: FINGERPRINT_PROFILE,
    lockedLocalProfile: LOCKED_LOCAL_PROFILE,
    lockedItemColorProfile: CROP_LOCAL_ITEM_COLOR_V0_POLICY,
    resources: {
      generationMilliseconds: summarizeCropLocalMeasurements(generationTimes),
      comparisonMilliseconds: summarizeCropLocalMeasurements(comparisonTimes),
      featureCount: summarizeCropLocalMeasurements(featureCounts),
      outputBytes: summarizeCropLocalMeasurements(outputBytes),
    },
    qualityGate: {
      minimumRecall: 0.2,
      maximumFalsePositiveRate: 0.005,
      domainGuardrail: 'at least 10% recall in four of five domains',
      domainPasses,
      pass,
      selectedProfile: selected,
    },
    falsePositiveEvidence: {
      count: falsePositives.length,
      representative: falsePositives.slice(0, 25),
    },
    decision: {
      qualityGate: pass ? 'passed' : 'failed',
      publicProfile: 'blocked-pending-non-quality-gates',
      thresholdsRetunedOnHoldout: false,
    },
    limitations: [
      'The frozen local and item-color policies were evaluated once without threshold selection.',
      'Color remains inconclusive for grayscale or weakly saturated template content.',
      'Passing quality alone does not satisfy size, performance, retrieval, browser-fixture, schema, or maintainer-approval gates.',
      'Source pixels remain local-only; this report retains provenance and hashes.',
    ],
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  return {
    output,
    qualityGate: report.qualityGate,
    falsePositiveEvidence: report.falsePositiveEvidence,
    resources: report.resources,
  };
};

try {
  const result = await run(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`crop-local item-color holdout: ${error.stack ?? error.message}\n`);
  process.exitCode = 2;
}
