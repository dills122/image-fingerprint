import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { summarizeCropLocalMeasurements } from './calibration-corpus.mjs';
import {
  createMtgCardHoldoutPairs,
  MTG_CARD_HOLDOUT_ERAS,
  MTG_CARD_RECALL_HOLDOUT_PROFILE,
  transformMtgCardHoldout,
  validateMtgCardHoldoutManifest,
} from './mtg-card-holdout-corpus.mjs';

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

const parseArguments = arguments_ => {
  let manifest;
  let developmentReport;
  let output;
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] === '--') continue;
    if (arguments_[index] === '--manifest') manifest = resolve(arguments_[index += 1]);
    else if (arguments_[index] === '--development-report') developmentReport = resolve(arguments_[index += 1]);
    else if (arguments_[index] === '--output') output = resolve(arguments_[index += 1]);
    else throw new Error('Usage: mtg-card-holdout.mjs --manifest FILE --development-report FILE --output FILE');
  }
  if (manifest === undefined || developmentReport === undefined || output === undefined) {
    throw new Error('Manifest, development report, and output are required');
  }
  return { manifest, developmentReport, output };
};

const rate = (count, total) => total === 0 ? null : count / total;

const metrics = decisions => {
  const positives = decisions.filter(({ positive }) => positive);
  const negatives = decisions.filter(({ positive }) => !positive);
  const truePositive = positives.filter(({ status }) => status === 'match').length;
  const falsePositive = negatives.filter(({ status }) => status === 'match').length;
  return {
    truePositive,
    falsePositive,
    trueNegative: negatives.length - falsePositive,
    falseNegative: positives.length - truePositive,
    recall: rate(truePositive, positives.length),
    falsePositiveRate: rate(falsePositive, negatives.length),
  };
};

const aggregate = (decisions, manifests) => ({
  ...metrics(decisions),
  positiveByTransformation: Object.fromEntries(
    MTG_CARD_RECALL_HOLDOUT_PROFILE.transformations.map(transformation => [
      transformation,
      metrics(decisions.filter(entry => entry.positive && entry.transformation === transformation)),
    ]),
  ),
  positiveByEra: Object.fromEntries(MTG_CARD_HOLDOUT_ERAS.map(({ id: era }) => [
    era,
    metrics(decisions.filter(entry => entry.positive && entry.era === era)),
  ])),
  negativeByPairing: Object.fromEntries(
    MTG_CARD_RECALL_HOLDOUT_PROFILE.negativePairings.map(pairing => {
      const transformation = pairing.join('::');
      return [transformation, metrics(decisions.filter(entry => !entry.positive && entry.transformation === transformation))];
    }),
  ),
  matchedNegativeMetadata: decisions.filter(entry => !entry.positive && entry.status === 'match').slice(0, 25).map(entry => ({
    ...entry,
    leftSource: manifests.get(entry.left.slice(0, entry.left.indexOf(':'))),
    rightSource: manifests.get(entry.right.slice(0, entry.right.indexOf(':'))),
  })),
});

const run = async ({ manifest: manifestPath, developmentReport: developmentPath, output }) => {
  const manifestBytes = await readFile(manifestPath);
  const developmentBytes = await readFile(developmentPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const developmentReport = JSON.parse(developmentBytes.toString('utf8'));
  validateMtgCardHoldoutManifest(manifest, developmentReport);
  if (manifest.selection.developmentReportSha256 !== createHash('sha256').update(developmentBytes).digest('hex')) {
    throw new Error('MTG holdout manifest does not match the development exclusion report');
  }
  const require = createRequire(import.meta.url);
  const { decodeImage } = require('../../lib/node.js');
  const {
    compareCropLocalCardRecallExperiment,
    compareCropLocalItemSourceToCrop,
    CROP_LOCAL_CARD_RECALL_V0_DEVELOPMENT_POLICY,
    CROP_LOCAL_ITEM_COLOR_V0_POLICY,
    fingerprintCropLocalItemExperiment,
  } = require('../../lib/core/algorithms/crop-local/index.js');
  const fingerprints = new Map();
  const generationTimes = [];
  const outputBytes = [];
  const featureCounts = [];
  for (const entry of manifest.images) {
    const encoded = await readFile(join(dirname(manifestPath), entry.file));
    if (
      encoded.length !== entry.byteLength
      || createHash('sha256').update(encoded).digest('hex') !== entry.sha256
    ) throw new Error(`MTG holdout checksum mismatch for ${entry.id}`);
    const original = await decodeImage(encoded);
    for (const [variant, pixels] of [
      ['original', original],
      ...MTG_CARD_RECALL_HOLDOUT_PROFILE.transformations.map(mode => [
        mode,
        transformMtgCardHoldout(original, mode, entry.id),
      ]),
    ]) {
      const started = performance.now();
      const fingerprint = fingerprintCropLocalItemExperiment(pixels, FINGERPRINT_PROFILE);
      generationTimes.push(performance.now() - started);
      outputBytes.push(Buffer.byteLength(JSON.stringify(fingerprint)));
      featureCounts.push(fingerprint.local.features.length);
      fingerprints.set(`${entry.id}:${variant}`, fingerprint);
    }
  }
  const sources = manifest.images.map(({ id, era }) => ({ id, era }));
  const pairs = createMtgCardHoldoutPairs(sources);
  const baselineTimes = [];
  const candidateTimes = [];
  const evidence = pairs.map(pair => {
    const source = fingerprints.get(pair.left);
    const crop = fingerprints.get(pair.right);
    let started = performance.now();
    const baseline = compareCropLocalItemSourceToCrop(source, crop, LOCKED_LOCAL_PROFILE);
    baselineTimes.push(performance.now() - started);
    started = performance.now();
    const candidate = compareCropLocalCardRecallExperiment(source, crop);
    candidateTimes.push(performance.now() - started);
    return {
      ...pair,
      baseline: {
        status: baseline.status,
        localStatus: baseline.local.status,
        itemSignal: baseline.itemSignal,
        reason: baseline.reasons[0],
        localReason: baseline.local.reasons[0],
      },
      candidate: {
        status: candidate.status,
        fallbackPromoted: candidate.fallbackPromoted,
        reason: candidate.reasons[0],
        fallbackLocal: candidate.fallback?.local ?? null,
        fallbackColor: candidate.fallback?.color ?? null,
      },
    };
  });
  const baselineDecisions = evidence.map(entry => ({
    ...entry,
    status: entry.baseline.status,
  }));
  const candidateDecisions = evidence.map(entry => ({
    ...entry,
    status: entry.candidate.status,
  }));
  const manifestMetadata = new Map(manifest.images.map(entry => [entry.id, {
    id: entry.id,
    oracleId: entry.oracleId,
    illustrationId: entry.illustrationId,
    name: entry.name,
    set: entry.set,
    collectorNumber: entry.collectorNumber,
    era: entry.era,
    layout: entry.layout,
    style: entry.style,
    colorCategory: entry.colorCategory,
  }]));
  const baseline = aggregate(baselineDecisions, manifestMetadata);
  const candidate = aggregate(candidateDecisions, manifestMetadata);
  const additionalFalsePositives = evidence.filter(entry => (
    !entry.positive && entry.baseline.status !== 'match' && entry.candidate.status === 'match'
  ));
  const lostBaselineMatches = evidence.filter(entry => (
    entry.baseline.status === 'match' && entry.candidate.status !== 'match'
  ));
  const positivePromotions = evidence.filter(entry => (
    entry.positive && entry.baseline.status !== 'match' && entry.candidate.status === 'match'
  ));
  const captureBaseline = baseline.positiveByTransformation['normalized-capture'];
  const captureCandidate = candidate.positiveByTransformation['normalized-capture'];
  const recallGain = candidate.recall - baseline.recall;
  const gate = {
    ...MTG_CARD_RECALL_HOLDOUT_PROFILE.gate,
    observedRecallGain: recallGain,
    observedAdditionalFalsePositives: additionalFalsePositives.length,
    observedNormalizedCaptureRecall: captureCandidate.recall,
    observedFrozenNormalizedCaptureRecall: captureBaseline.recall,
    lostBaselineMatches: lostBaselineMatches.length,
    pass: recallGain >= MTG_CARD_RECALL_HOLDOUT_PROFILE.gate.minimumRecallGain
      && additionalFalsePositives.length <= MTG_CARD_RECALL_HOLDOUT_PROFILE.gate.maximumAdditionalFalsePositives
      && captureCandidate.recall >= MTG_CARD_RECALL_HOLDOUT_PROFILE.gate.minimumNormalizedCaptureRecall
      && captureCandidate.recall >= captureBaseline.recall
      && lostBaselineMatches.length === 0,
  };
  const report = {
    profileVersion: 1,
    study: 'crop-local-card-recall-v0-untouched-mtg-holdout',
    policyMode: 'frozen-single-pass',
    thresholdSelection: 'none-on-holdout',
    sourceManifest: 'local-only/crop-local-card-recall-mtg-holdout-v1/manifest.json',
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    developmentReport: developmentPath.split('/').pop(),
    developmentReportSha256: createHash('sha256').update(developmentBytes).digest('hex'),
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    counts: {
      sourceImages: manifest.images.length,
      positivePairs: pairs.filter(({ positive }) => positive).length,
      negativePairs: pairs.filter(({ positive }) => !positive).length,
    },
    corpus: {
      eras: manifest.selection.eras,
      sourceUniqueness: manifest.selection.sourceUniqueness,
      transformations: manifest.selection.transformations,
      negativePairings: manifest.selection.negativePairings,
      acquisition: manifest.acquisition,
      pixelPolicy: manifest.redistribution,
      coverage: {
        sets: new Set(manifest.images.map(({ set }) => set)).size,
        layouts: Object.fromEntries([...new Set(manifest.images.map(({ layout }) => layout))].sort().map(value => [
          value, manifest.images.filter(({ layout }) => layout === value).length,
        ])),
        styles: Object.fromEntries([...new Set(manifest.images.map(({ style }) => style))].sort().map(value => [
          value, manifest.images.filter(({ style }) => style === value).length,
        ])),
        colors: Object.fromEntries([...new Set(manifest.images.map(({ colorCategory }) => colorCategory))].sort().map(value => [
          value, manifest.images.filter(({ colorCategory }) => colorCategory === value).length,
        ])),
      },
    },
    sourceProvenance: manifest.images.map(({ file: _file, imageURL: _imageURL, ...entry }) => entry),
    fingerprintProfile: FINGERPRINT_PROFILE,
    lockedLocalProfile: LOCKED_LOCAL_PROFILE,
    lockedItemColorProfile: CROP_LOCAL_ITEM_COLOR_V0_POLICY,
    cardRecallDevelopmentPolicy: CROP_LOCAL_CARD_RECALL_V0_DEVELOPMENT_POLICY,
    resources: {
      generationMilliseconds: summarizeCropLocalMeasurements(generationTimes),
      outputBytes: summarizeCropLocalMeasurements(outputBytes),
      featureCount: summarizeCropLocalMeasurements(featureCounts),
      baselineComparisonMilliseconds: summarizeCropLocalMeasurements(baselineTimes),
      candidateComparisonMilliseconds: summarizeCropLocalMeasurements(candidateTimes),
    },
    quality: {
      baseline,
      candidate,
      recallGain,
      positivePromotions: positivePromotions.length,
      additionalFalsePositiveEvidence: additionalFalsePositives.slice(0, 25),
      lostBaselineMatchEvidence: lostBaselineMatches.slice(0, 25),
      gate,
    },
    negativeLabelAudit: {
      contract: 'Every source has a unique name, oracle ID, illustration ID, printing ID, and encoded SHA-256.',
      implication: 'Reported negatives exclude same-card reprints and same-illustration printings by construction; any reported match still requires visual review.',
      baselineReportedMatches: baseline.falsePositive,
      candidateReportedMatches: candidate.falsePositive,
      additionalCandidateMatches: additionalFalsePositives.length,
    },
    decision: {
      qualityGate: gate.pass ? 'passed' : 'failed',
      publicProfile: 'blocked',
      thresholdsRetunedOnHoldout: false,
      reason: gate.pass
        ? 'The internal card fallback passed its bounded untouched quality gate; public non-quality gates remain.'
        : 'The internal card fallback did not pass every predeclared untouched quality gate.',
    },
    limitations: [
      'Normalized-capture positives simulate post-extraction crop, exposure, white-balance, resolution, and blur; they are not real device captures.',
      'The study has 100 sources and 14,850 negatives, so zero observed additional false positives retains a nonzero confidence bound.',
      'Card images remain local-only and are not redistributed in this repository.',
      'Passing does not establish retrieval, public schema, serialized-size, browser-fixture, or production-latency readiness.',
    ],
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  return {
    output,
    counts: report.counts,
    baseline: { recall: baseline.recall, falsePositive: baseline.falsePositive },
    candidate: { recall: candidate.recall, falsePositive: candidate.falsePositive },
    gate,
  };
};

try {
  const result = await run(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`MTG card holdout: ${error.stack ?? error.message}\n`);
  process.exitCode = 2;
}
