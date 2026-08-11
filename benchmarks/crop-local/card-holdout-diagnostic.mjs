import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import {
  summarizeCropLocalMeasurements,
  transformCropLocalCalibration,
} from './calibration-corpus.mjs';
import { createCropLocalSyntheticFixture } from './synthetic-fixtures.mjs';

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
const TRANSFORMATIONS = ['center', 'asymmetric', 'severe'];

const parseArguments = arguments_ => {
  let holdoutReport;
  let output;
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] === '--') continue;
    if (arguments_[index] === '--holdout-report') holdoutReport = resolve(arguments_[index += 1]);
    else if (arguments_[index] === '--output') output = resolve(arguments_[index += 1]);
    else throw new Error('Usage: card-holdout-diagnostic.mjs --holdout-report FILE --output FILE');
  }
  if (holdoutReport === undefined || output === undefined) {
    throw new Error('Holdout report and output are required');
  }
  return { holdoutReport, output };
};

const countsBy = (entries, key) => Object.fromEntries(
  [...new Set(entries.map(entry => entry[key]))].sort().map(value => [
    value,
    entries.filter(entry => entry[key] === value).length,
  ]),
);

const summarize = entries => ({
  pairs: entries.length,
  matches: entries.filter(({ status }) => status === 'match').length,
  candidateStage: entries.filter(({ candidateMatches }) => candidateMatches >= LOCKED_LOCAL_PROFILE.minimumInliers).length,
  geometryStage: entries.filter(({ transform }) => transform !== null).length,
  grayscaleVerificationStage: entries.filter(({ localStatus }) => localStatus === 'match').length,
  colorSupporting: entries.filter(({ itemSignal }) => itemSignal === 'supporting').length,
  colorInconclusive: entries.filter(({ itemSignal }) => itemSignal === 'inconclusive').length,
  localOutcome: countsBy(entries, 'localReason'),
  finalFailureReason: countsBy(entries.filter(({ status }) => status !== 'match'), 'reason'),
  sourceFeatures: summarizeCropLocalMeasurements(entries.map(({ sourceFeatures }) => sourceFeatures)),
  cropFeatures: summarizeCropLocalMeasurements(entries.map(({ cropFeatures }) => cropFeatures)),
  candidateMatches: summarizeCropLocalMeasurements(entries.map(({ candidateMatches }) => candidateMatches)),
  geometricInliers: summarizeCropLocalMeasurements(entries.map(({ geometricInliers }) => geometricInliers)),
});

const run = async ({ holdoutReport: reportPath, output }) => {
  const reportBytes = await readFile(reportPath);
  const holdout = JSON.parse(reportBytes.toString('utf8'));
  if (
    holdout.study !== 'crop-local-item-color-v0-independent-holdout'
    || holdout.policyMode !== 'frozen-single-pass'
    || holdout.qualityGate?.selectedProfile?.positiveByDomain?.['card-layout']?.truePositive !== 45
  ) throw new Error('Input is not the recorded frozen item-color holdout report');
  const provenance = holdout.sourceProvenance.filter(entry => entry.domain === 'card-layout');
  if (provenance.length !== 100) throw new Error('Recorded holdout must contain 100 card-layout sources');
  const require = createRequire(import.meta.url);
  const { decodeImage } = require('../../lib/node.js');
  const {
    compareCropLocalCardRecallExperiment,
    compareCropLocalItemSourceToCrop,
    CROP_LOCAL_ITEM_COLOR_V0_POLICY,
    fingerprintCropLocalItemExperiment,
  } = require('../../lib/core/algorithms/crop-local/index.js');
  const evidence = [];
  const fingerprints = new Map();
  for (const entry of provenance) {
    const encoded = createCropLocalSyntheticFixture('card-layout', entry.seed, entry.style);
    const hash = createHash('sha256').update(encoded).digest('hex');
    if (hash !== entry.sha256) throw new Error(`Generated holdout checksum mismatch for ${entry.id}`);
    const original = await decodeImage(encoded);
    const source = fingerprintCropLocalItemExperiment(original, FINGERPRINT_PROFILE);
    fingerprints.set(`${entry.id}:original`, source);
    for (const transformation of TRANSFORMATIONS) {
      const crop = fingerprintCropLocalItemExperiment(
        transformCropLocalCalibration(original, transformation),
        FINGERPRINT_PROFILE,
      );
      fingerprints.set(`${entry.id}:${transformation}`, crop);
      const result = compareCropLocalItemSourceToCrop(source, crop, LOCKED_LOCAL_PROFILE);
      const cardResult = compareCropLocalCardRecallExperiment(source, crop);
      evidence.push({
        id: entry.id,
        transformation,
        status: result.status,
        localStatus: result.local.status,
        itemSignal: result.itemSignal,
        reason: result.reasons[0],
        localReason: result.local.reasons[0],
        sourceFeatures: result.local.sourceFeatures,
        cropFeatures: result.local.cropFeatures,
        candidateMatches: result.local.candidateMatches,
        geometricInliers: result.local.geometricInliers,
        bestRetainedModel: result.local.retainedModels[0] ?? null,
        transform: result.local.transform,
        grayscaleVerification: result.local.verification,
        colorVerification: result.color,
        cardStatus: cardResult.status,
        cardFallbackPromoted: cardResult.fallbackPromoted,
      });
    }
  }
  const reproducedMatches = evidence.filter(({ status }) => status === 'match').length;
  if (reproducedMatches !== 45) {
    throw new Error(`Expected to reproduce 45 card matches, received ${reproducedMatches}`);
  }
  const negativeEvidence = [];
  for (let left = 0; left < provenance.length; left += 1) {
    for (let right = left + 1; right < provenance.length; right += 1) {
      for (const [leftVariant, rightVariant] of [
        ['original', 'original'],
        ['original', 'asymmetric'],
        ['asymmetric', 'asymmetric'],
      ]) {
        const result = compareCropLocalCardRecallExperiment(
          fingerprints.get(`${provenance[left].id}:${leftVariant}`),
          fingerprints.get(`${provenance[right].id}:${rightVariant}`),
        );
        negativeEvidence.push({
          left: `${provenance[left].id}:${leftVariant}`,
          right: `${provenance[right].id}:${rightVariant}`,
          primaryStatus: result.primary.status,
          cardStatus: result.status,
          fallbackPromoted: result.fallbackPromoted,
          fallbackLocal: result.fallback?.local ?? null,
          fallbackColor: result.fallback?.color ?? null,
        });
      }
    }
  }
  const outputReport = {
    profileVersion: 1,
    study: 'crop-local-item-color-v0-card-holdout-post-hoc-diagnostic',
    selectionUse: 'diagnosis-only-not-policy-selection',
    sourceReport: reportPath.split('/').pop(),
    sourceReportSha256: createHash('sha256').update(reportBytes).digest('hex'),
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    corpus: {
      name: holdout.developmentCorpus,
      sources: provenance.length,
      positivePairs: evidence.length,
      generatedStyle: 4,
      seedRange: [Math.min(...provenance.map(({ seed }) => seed)), Math.max(...provenance.map(({ seed }) => seed))],
      pixelPolicy: 'regenerated from the retained CC0 generator; pixels are not committed',
      checksumsVerified: provenance.length,
    },
    fingerprintProfile: FINGERPRINT_PROFILE,
    lockedLocalProfile: LOCKED_LOCAL_PROFILE,
    lockedItemColorProfile: CROP_LOCAL_ITEM_COLOR_V0_POLICY,
    aggregate: summarize(evidence),
    byTransformation: Object.fromEntries(TRANSFORMATIONS.map(transformation => [
      transformation,
      summarize(evidence.filter(entry => entry.transformation === transformation)),
    ])),
    selectedCardProfilePostHoc: {
      positiveMatches: evidence.filter(({ cardStatus }) => cardStatus === 'match').length,
      positivePairs: evidence.length,
      positiveRecall: evidence.filter(({ cardStatus }) => cardStatus === 'match').length / evidence.length,
      fallbackPositivePromotions: evidence.filter(({ cardFallbackPromoted }) => cardFallbackPromoted).length,
      frozenNegativeMatches: negativeEvidence.filter(({ primaryStatus }) => primaryStatus === 'match').length,
      cardNegativeMatches: negativeEvidence.filter(({ cardStatus }) => cardStatus === 'match').length,
      negativePairs: negativeEvidence.length,
      additionalNegativeMatches: negativeEvidence.filter(({ fallbackPromoted }) => fallbackPromoted).length,
      negativeFalsePositiveRate: negativeEvidence.filter(({ cardStatus }) => cardStatus === 'match').length / negativeEvidence.length,
      representativeAdditionalNegativeMatches: negativeEvidence.filter(({ fallbackPromoted }) => fallbackPromoted).slice(0, 30),
      interpretation: 'Post-hoc stress evidence only; the profile was selected on separate MTG development data, but this holdout was already inspected and cannot validate it.',
    },
    representativeFailures: evidence.filter(({ status }) => status !== 'match').slice(0, 30),
    conclusion: 'The recorded card-layout holdout is used only to localize failures. It is invalid for selecting a replacement profile.',
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(outputReport, null, 2)}\n`);
  return { output, aggregate: outputReport.aggregate, byTransformation: outputReport.byTransformation };
};

try {
  const result = await run(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`crop-local card holdout diagnostic: ${error.stack ?? error.message}\n`);
  process.exitCode = 2;
}
