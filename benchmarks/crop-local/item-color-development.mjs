import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  CROP_LOCAL_CALIBRATION_PROFILE,
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
const SIGNAL_PROFILE = {
  minimumColorSaturation: 12,
  colorAgreementDistance: 16,
  colorContradictionDistance: 48,
};
const COVERAGE_VALUES = [0.02, 0.05, 0.1];
const AGREEMENT_VALUES = [0.4, 0.5, 0.6, 0.7, 0.8];
const CONTRADICTION_VALUES = [0.1, 0.2, 0.25, 0.3];
const ZONE_VALUES = [2, 3, 4];

const parseArguments = (arguments_) => {
  let manifest;
  let baseline;
  let output;
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] === '--') continue;
    if (arguments_[index] === '--manifest') manifest = resolve(arguments_[index += 1]);
    else if (arguments_[index] === '--baseline') baseline = resolve(arguments_[index += 1]);
    else if (arguments_[index] === '--output') output = resolve(arguments_[index += 1]);
    else throw new Error('Usage: item-color-development.mjs --manifest FILE --baseline FILE --output FILE');
  }
  if (manifest === undefined || baseline === undefined || output === undefined) {
    throw new Error('Manifest, baseline report, and output are required');
  }
  return { manifest, baseline, output };
};

const metrics = (decisions, totalPositive, totalNegative) => {
  const truePositive = decisions.filter(entry => entry.positive && entry.matches).length;
  const falsePositive = decisions.filter(entry => !entry.positive && entry.matches).length;
  const falseNegative = totalPositive - truePositive;
  const trueNegative = totalNegative - falsePositive;
  return {
    truePositive,
    falsePositive,
    trueNegative,
    falseNegative,
    precision: truePositive + falsePositive === 0 ? null : truePositive / (truePositive + falsePositive),
    recall: truePositive / totalPositive,
    falsePositiveRate: falsePositive / totalNegative,
  };
};

const run = async ({ manifest: manifestPath, baseline: baselinePath, output }) => {
  const manifestBytes = await readFile(manifestPath);
  const baselineBytes = await readFile(baselinePath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const baseline = JSON.parse(baselineBytes.toString('utf8'));
  validateCropLocalCalibrationManifest(manifest);
  if (
    baseline.study !== 'crop-local-multiscale-binary-v0-typescript-independent-calibration'
    || baseline.developmentCorpus !== CROP_LOCAL_CALIBRATION_PROFILE.corpus
    || baseline.manifestSha256 !== createHash('sha256').update(manifestBytes).digest('hex')
  ) throw new Error('Baseline report does not match the inspected calibration corpus');
  if (!Array.isArray(baseline.selectedFalsePositiveEvidence)) {
    throw new Error('Baseline report must retain every selected false-positive pair');
  }
  const require = createRequire(import.meta.url);
  const { decodeImage } = require('../../lib/node.js');
  const {
    compareCropLocalItemSourceToCrop,
    fingerprintCropLocalItemExperiment,
  } = require('../../lib/core/algorithms/crop-local/index.js');
  const generationTimes = [];
  const outputBytes = [];
  const fingerprints = new Map();
  const sources = [];
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
      outputBytes.push(Buffer.byteLength(JSON.stringify(fingerprint)));
      fingerprints.set(`${entry.id}:${variant}`, fingerprint);
    }
  }
  const pairs = [];
  for (const source of sources) {
    for (const variant of CROP_LOCAL_CALIBRATION_PROFILE.transformations) {
      pairs.push({
        left: `${source.id}:original`,
        right: `${source.id}:${variant}`,
        positive: true,
        domain: source.domain,
        domainPair: null,
      });
    }
  }
  for (const entry of baseline.selectedFalsePositiveEvidence) {
    pairs.push({
      left: entry.left,
      right: entry.right,
      positive: false,
      domain: null,
      domainPair: entry.domainPair,
    });
  }
  const comparisonTimes = [];
  const evidence = pairs.map((pair) => {
    const started = performance.now();
    const result = compareCropLocalItemSourceToCrop(
      fingerprints.get(pair.left),
      fingerprints.get(pair.right),
      {
        ...LOCKED_LOCAL_PROFILE,
        ...SIGNAL_PROFILE,
        minimumColorInformativeCoverage: 0,
        minimumColorAgreement: 0,
        maximumColorContradiction: 1,
        minimumColorZones: 1,
      },
    );
    comparisonTimes.push(performance.now() - started);
    return {
      ...pair,
      localMatches: result.local.status === 'match',
      ...result.color,
    };
  });
  const baselineFalsePositives = evidence.filter(entry => !entry.positive);
  if (baselineFalsePositives.some(entry => !entry.localMatches)) {
    throw new Error('Retained baseline false-positive evidence no longer reproduces exactly');
  }
  const totalPositive = baseline.counts.positivePairs;
  const totalNegative = baseline.counts.negativePairs;
  const domains = manifest.selection.domains;
  const profiles = [];
  for (const minimumColorInformativeCoverage of COVERAGE_VALUES) {
    for (const minimumColorAgreement of AGREEMENT_VALUES) {
      for (const maximumColorContradiction of CONTRADICTION_VALUES) {
        for (const minimumColorZones of ZONE_VALUES) {
          const decisions = evidence.map((entry) => {
            const applicable = entry.informativeCoverage >= minimumColorInformativeCoverage
              && entry.informativeZones >= minimumColorZones;
            return {
              ...entry,
              matches: entry.localMatches && (!applicable || (
                entry.agreementScore >= minimumColorAgreement
                && entry.contradictionScore <= maximumColorContradiction
              )),
            };
          });
          profiles.push({
            ...SIGNAL_PROFILE,
            minimumColorInformativeCoverage,
            minimumColorAgreement,
            maximumColorContradiction,
            minimumColorZones,
            ...metrics(decisions, totalPositive, totalNegative),
            positiveByDomain: Object.fromEntries(domains.map(domain => {
              const entries = decisions.filter(item => item.positive && item.domain === domain);
              const truePositive = entries.filter(item => item.matches).length;
              return [domain, { truePositive, falseNegative: entries.length - truePositive, recall: truePositive / entries.length }];
            })),
            survivingFalsePositiveByDomainPair: Object.fromEntries(
              [...new Set(baselineFalsePositives.map(entry => entry.domainPair))].sort().map(domainPair => [
                domainPair,
                decisions.filter(item => !item.positive && item.domainPair === domainPair && item.matches).length,
              ]),
            ),
          });
        }
      }
    }
  }
  const eligible = profiles.filter(profile => (
    profile.recall >= 0.2
    && profile.falsePositiveRate <= 0.005
    && Object.values(profile.positiveByDomain).filter(domain => domain.recall >= 0.1).length >= 4
  ));
  const selected = eligible.sort((left, right) => (
    right.recall - left.recall
    || left.falsePositive - right.falsePositive
    || right.minimumColorAgreement - left.minimumColorAgreement
    || left.maximumColorContradiction - right.maximumColorContradiction
  ))[0] ?? null;
  const selectedEvidence = selected === null ? [] : evidence.filter(entry => {
    const applicable = entry.informativeCoverage >= selected.minimumColorInformativeCoverage
      && entry.informativeZones >= selected.minimumColorZones;
    return !entry.positive && entry.localMatches && (!applicable || (
      entry.agreementScore >= selected.minimumColorAgreement
      && entry.contradictionScore <= selected.maximumColorContradiction
    ));
  });
  const report = {
    profileVersion: 1,
    study: 'crop-local-item-color-v0-development-on-inspected-calibration',
    policyMode: 'development-selection',
    developmentCorpus: manifest.corpus,
    sourceManifest: 'local-only/crop-local-independent-calibration-v1/manifest.json',
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    baselineReportSha256: createHash('sha256').update(baselineBytes).digest('hex'),
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    counts: {
      sourceImages: sources.length,
      positivePairs: totalPositive,
      baselineFalsePositivePairsRechecked: baselineFalsePositives.length,
      negativePairsRepresented: totalNegative,
      profiles: profiles.length,
    },
    fingerprintProfile: FINGERPRINT_PROFILE,
    lockedLocalProfile: LOCKED_LOCAL_PROFILE,
    fixedSignalProfile: SIGNAL_PROFILE,
    resources: {
      generationMilliseconds: summarizeCropLocalMeasurements(generationTimes),
      comparisonMilliseconds: summarizeCropLocalMeasurements(comparisonTimes),
      outputBytes: summarizeCropLocalMeasurements(outputBytes),
    },
    selectedProfile: selected,
    developmentGate: {
      minimumRecall: 0.2,
      maximumFalsePositiveRate: 0.005,
      domainGuardrail: 'at least 10% recall in four of five domains',
      pass: selected !== null,
    },
    selectedSurvivingFalsePositives: selectedEvidence,
    profiles,
    limitations: [
      'This corpus was previously inspected and is now development data; this report is not independent validation.',
      'Only baseline matches are rechecked because the item-color signal is a veto and cannot create new matches.',
      'The selected color policy must be frozen before evaluation on a new source-disjoint untouched corpus.',
      'Color is supplemental evidence and remains inconclusive for grayscale or weakly saturated template content.',
      'The internal profile is not exported or assigned public compatibility meaning.',
    ],
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  return {
    output,
    counts: report.counts,
    selectedProfile: report.selectedProfile,
    developmentGate: report.developmentGate,
    resources: report.resources,
  };
};

try {
  const result = await run(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`crop-local item-color development: ${error.stack ?? error.message}\n`);
  process.exitCode = 2;
}
