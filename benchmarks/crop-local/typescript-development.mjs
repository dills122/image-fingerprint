import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  createCropLocalCalibrationPairs,
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
};
const COMPARISON_PROFILE = {
  maximumDescriptorDistance: 48,
  ratioPermille: 700,
  maximumResidualPermille: 6,
};
const GEOMETRY_MINIMUM_INLIERS = [4, 6, 8];
const GEOMETRY_MINIMUM_INLIER_RATIOS = [0.25, 0.4, 0.5];
const GEOMETRY_MINIMUM_ZONES = [2, 3, 4];
const LOCKED_GEOMETRY_PROFILE = {
  minimumInliers: 4,
  minimumInlierRatio: 0.5,
  minimumZones: 4,
};
const DENSE_INFORMATION_CUTOFF = [0.35, 0.4, 0.5];
const DENSE_MINIMUM_AGREEMENT = [0.65, 0.75, 0.85];
const DENSE_MAXIMUM_CONTRADICTION = [0.1, 0.2];
const SPARSE_MINIMUM_AGREEMENT = [0.8, 0.85, 0.9];
const SPARSE_MAXIMUM_CONTRADICTION = [0, 0.001, 0.002, 0.005];
const MINIMUM_ZONES = [3, 4, 6];
const LOCKED_VERIFICATION_PROFILE = {
  minimumInformativeCoverage: 0.02,
  denseInformationCutoff: 0.4,
  denseMinimumAgreement: 0.65,
  denseMaximumContradiction: 0.2,
  sparseMinimumAgreement: 0.8,
  sparseMaximumContradiction: 0,
  minimumInformativeZones: 3,
};

const parseArguments = (arguments_) => {
  const manifests = [];
  let output;
  let lockedDevelopmentProfile = false;
  let expandedNegatives = false;
  let summaryOnly = false;
  let calibration = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] === '--') continue;
    if (arguments_[index] === '--manifest') manifests.push(resolve(arguments_[index += 1]));
    else if (arguments_[index] === '--output') output = resolve(arguments_[index += 1]);
    else if (arguments_[index] === '--locked-development-profile') lockedDevelopmentProfile = true;
    else if (arguments_[index] === '--expanded-negatives') expandedNegatives = true;
    else if (arguments_[index] === '--summary-only') summaryOnly = true;
    else if (arguments_[index] === '--calibration') calibration = true;
    else throw new Error('Usage: typescript-development.mjs --manifest FILE [--manifest FILE] --output FILE [--locked-development-profile] [--expanded-negatives] [--summary-only] [--calibration]');
  }
  if (
    manifests.length === 0 || output === undefined
    || (calibration && (!lockedDevelopmentProfile || !summaryOnly || expandedNegatives))
  ) {
    throw new Error('Calibration requires one locked, summary-only, non-expanded evaluation');
  }
  return { manifests, output, lockedDevelopmentProfile, expandedNegatives, summaryOnly, calibration };
};

const summary = summarizeCropLocalMeasurements;

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

const createPairs = (sources, expandedNegatives, calibration) => {
  if (calibration) return createCropLocalCalibrationPairs(sources);
  const pairs = [];
  for (const source of sources) {
    for (const mode of ['center', 'asymmetric', 'severe']) {
      pairs.push({ left: `${source.id}:original`, right: `${source.id}:${mode}`, positive: true, domain: source.domain });
    }
  }
  for (let left = 0; left < sources.length; left += 1) {
    for (let right = left + 1; right < sources.length; right += 1) {
      const variants = [
        ['original', 'original'],
      ];
      variants.push(['center', 'center'], ['original', 'center']);
      if (expandedNegatives) variants.push(
        ['original', 'asymmetric'], ['asymmetric', 'asymmetric'],
      );
      for (const [leftVariant, rightVariant] of variants) {
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

const aggregate = (decisions, domains) => ({
  ...metrics(decisions),
  positiveByDomain: Object.fromEntries(domains.map((domain) => [
    domain,
    metrics(decisions.filter((entry) => entry.positive && entry.domain === domain)),
  ])),
  negativeByDomainPair: Object.fromEntries(
    [...new Set(decisions.filter((entry) => !entry.positive).map(({ domainPair }) => domainPair))]
      .sort()
      .map((domainPair) => [
        domainPair,
        metrics(decisions.filter((entry) => !entry.positive && entry.domainPair === domainPair)),
      ]),
  ),
});

const run = async ({
  manifests: manifestPaths,
  output,
  lockedDevelopmentProfile,
  expandedNegatives,
  summaryOnly,
  calibration,
}) => {
  const require = createRequire(import.meta.url);
  const { decodeImage } = require('../../lib/node.js');
  const {
    compareCropLocalSourceToCrop,
    fingerprintCropLocalExperiment,
  } = require('../../lib/core/algorithms/crop-local/index.js');
  const manifestInputs = await Promise.all(manifestPaths.map(async (path) => {
    const bytes = await readFile(path);
    const manifest = JSON.parse(bytes.toString('utf8'));
    if (manifest.corpus === CROP_LOCAL_CALIBRATION_PROFILE.corpus) {
      validateCropLocalCalibrationManifest(manifest);
    }
    return { path, bytes, root: dirname(path), manifest };
  }));
  const domains = manifestInputs[0].manifest.selection.domains;
  if (manifestInputs.some(({ manifest }) => (
    JSON.stringify(manifest.selection.domains) !== JSON.stringify(domains)
  ))) throw new Error('All manifests must use the same ordered domains');
  if (calibration && (
    manifestInputs.length !== 1
    || manifestInputs[0].manifest.corpus !== CROP_LOCAL_CALIBRATION_PROFILE.corpus
  )) throw new Error('Calibration mode requires the independent calibration manifest');
  const sources = [];
  const fingerprints = new Map();
  const generationTimes = [];
  const featureCounts = [];
  const outputBytes = [];
  for (const { manifest, root } of manifestInputs) {
    for (const entry of manifest.images) {
      if (sources.some(({ id }) => id === entry.id)) throw new Error(`Duplicate source ID ${entry.id}`);
      const encoded = await readFile(join(root, entry.file));
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
        const fingerprint = fingerprintCropLocalExperiment(pixels, FINGERPRINT_PROFILE);
        generationTimes.push(performance.now() - started);
        featureCounts.push(fingerprint.features.length);
        outputBytes.push(Buffer.byteLength(JSON.stringify(fingerprint)));
        fingerprints.set(`${entry.id}:${variant}`, fingerprint);
      }
    }
  }
  const pairs = createPairs(sources, expandedNegatives, calibration);
  const comparisonTimes = [];
  const lockedComparisonTimes = [];
  const evidence = pairs.map((pair) => {
    const started = performance.now();
    const result = compareCropLocalSourceToCrop(
      fingerprints.get(pair.left),
      fingerprints.get(pair.right),
      calibration ? {
        ...COMPARISON_PROFILE,
        minimumInliers: LOCKED_GEOMETRY_PROFILE.minimumInliers,
        minimumInlierRatio: LOCKED_GEOMETRY_PROFILE.minimumInlierRatio,
        minimumSpatialZones: LOCKED_GEOMETRY_PROFILE.minimumZones,
        ...LOCKED_VERIFICATION_PROFILE,
      } : {
        ...COMPARISON_PROFILE,
        minimumInliers: 2,
        minimumInlierRatio: 0,
        minimumSpatialZones: 1,
        minimumInformativeCoverage: 0,
        denseInformationCutoff: 0,
        denseMinimumAgreement: 0,
        denseMaximumContradiction: 1,
        sparseMinimumAgreement: 0,
        sparseMaximumContradiction: 1,
        minimumInformativeZones: 1,
      },
    );
    (calibration ? lockedComparisonTimes : comparisonTimes).push(performance.now() - started);
    return {
      ...pair,
      candidateMatches: result.candidateMatches,
      geometricInliers: result.geometricInliers,
      retainedModels: result.retainedModels,
      geometryMatches: calibration ? result.transform !== null : false,
      ...result.verification,
    };
  });
  const candidateGate = aggregate(evidence.map((entry) => ({
    ...entry, matches: entry.candidateMatches >= 4,
  })), domains);
  const candidatePass = candidateGate.recall >= 0.35
    && Object.values(candidateGate.positiveByDomain).every(({ recall }) => recall >= 0.2);
  const lockedSummary = lockedDevelopmentProfile && summaryOnly;
  const geometryProfiles = [];
  const geometryInliers = lockedSummary
    ? [LOCKED_GEOMETRY_PROFILE.minimumInliers] : GEOMETRY_MINIMUM_INLIERS;
  const geometryRatios = lockedSummary
    ? [LOCKED_GEOMETRY_PROFILE.minimumInlierRatio] : GEOMETRY_MINIMUM_INLIER_RATIOS;
  const geometryZones = lockedSummary
    ? [LOCKED_GEOMETRY_PROFILE.minimumZones] : GEOMETRY_MINIMUM_ZONES;
  for (const minimumInliers of geometryInliers) {
    for (const minimumInlierRatio of geometryRatios) {
      for (const minimumZones of geometryZones) {
        const decisions = evidence.map((entry) => ({
          ...entry,
          matches: entry.retainedModels.some((model) => (
            model.inliers >= minimumInliers
            && model.inlierRatio >= minimumInlierRatio
            && Math.min(model.queryZones, model.candidateZones) >= minimumZones
          )),
        }));
        geometryProfiles.push({
          minimumInliers,
          minimumInlierRatio,
          minimumZones,
          ...aggregate(decisions, domains),
        });
      }
    }
  }
  const eligibleGeometry = geometryProfiles.filter((profile) => (
    profile.recall >= 0.3 && profile.falsePositiveRate <= 0.03
  ));
  const selectedGeometry = lockedDevelopmentProfile
    ? geometryProfiles.find((profile) => (
      profile.minimumInliers === LOCKED_GEOMETRY_PROFILE.minimumInliers
      && profile.minimumInlierRatio === LOCKED_GEOMETRY_PROFILE.minimumInlierRatio
      && profile.minimumZones === LOCKED_GEOMETRY_PROFILE.minimumZones
    ))
    : (eligibleGeometry.sort((left, right) => (
      right.recall - left.recall || left.falsePositive - right.falsePositive
    ))[0] ?? geometryProfiles.sort((left, right) => (
      left.falsePositiveRate - right.falsePositiveRate || right.recall - left.recall
    ))[0]);
  if (selectedGeometry === undefined) throw new Error('Locked geometry profile was not evaluated');
  const geometryPass = selectedGeometry.recall >= 0.3
    && selectedGeometry.falsePositiveRate <= 0.03;
  for (let index = 0; !calibration && index < pairs.length; index += 1) {
    const pair = pairs[index];
    const started = performance.now();
    const result = compareCropLocalSourceToCrop(
      fingerprints.get(pair.left),
      fingerprints.get(pair.right),
      {
        ...COMPARISON_PROFILE,
        minimumInliers: selectedGeometry.minimumInliers,
        minimumInlierRatio: selectedGeometry.minimumInlierRatio,
        minimumSpatialZones: selectedGeometry.minimumZones,
        minimumInformativeCoverage: 0,
        denseInformationCutoff: 0,
        denseMinimumAgreement: 0,
        denseMaximumContradiction: 1,
        sparseMinimumAgreement: 0,
        sparseMaximumContradiction: 1,
        minimumInformativeZones: 1,
      },
    );
    lockedComparisonTimes.push(performance.now() - started);
    evidence[index] = {
      ...pair,
      candidateMatches: result.candidateMatches,
      geometricInliers: result.geometricInliers,
      retainedModels: result.retainedModels,
      geometryMatches: result.transform !== null,
      ...result.verification,
    };
  }
  const profiles = [];
  const denseCutoffs = lockedSummary
    ? [LOCKED_VERIFICATION_PROFILE.denseInformationCutoff] : DENSE_INFORMATION_CUTOFF;
  const denseAgreements = lockedSummary
    ? [LOCKED_VERIFICATION_PROFILE.denseMinimumAgreement] : DENSE_MINIMUM_AGREEMENT;
  const denseContradictions = lockedSummary
    ? [LOCKED_VERIFICATION_PROFILE.denseMaximumContradiction] : DENSE_MAXIMUM_CONTRADICTION;
  const sparseAgreements = lockedSummary
    ? [LOCKED_VERIFICATION_PROFILE.sparseMinimumAgreement] : SPARSE_MINIMUM_AGREEMENT;
  const sparseContradictions = lockedSummary
    ? [LOCKED_VERIFICATION_PROFILE.sparseMaximumContradiction] : SPARSE_MAXIMUM_CONTRADICTION;
  const informativeZones = lockedSummary
    ? [LOCKED_VERIFICATION_PROFILE.minimumInformativeZones] : MINIMUM_ZONES;
  for (const denseInformationCutoff of denseCutoffs) {
    for (const denseMinimumAgreement of denseAgreements) {
      for (const denseMaximumContradiction of denseContradictions) {
        for (const sparseMinimumAgreement of sparseAgreements) {
          for (const sparseMaximumContradiction of sparseContradictions) {
            for (const minimumInformativeZones of informativeZones) {
          const decisions = evidence.map((entry) => ({
            ...entry,
            matches: entry.geometryMatches
              && entry.informativeCoverage >= 0.02
              && entry.informativeZones >= minimumInformativeZones
              && (entry.informativeCoverage >= denseInformationCutoff
                ? (entry.agreementScore >= denseMinimumAgreement
                  && entry.contradictionScore <= denseMaximumContradiction)
                : (entry.agreementScore >= sparseMinimumAgreement
                  && entry.contradictionScore <= sparseMaximumContradiction)),
          }));
          profiles.push({
            minimumInformativeCoverage: 0.02,
            denseInformationCutoff,
            denseMinimumAgreement,
            denseMaximumContradiction,
            sparseMinimumAgreement,
            sparseMaximumContradiction,
            minimumInformativeZones,
            insufficientEvidencePositive: evidence.filter((entry) => (
              entry.positive && entry.geometryMatches
              && (entry.informativeCoverage < 0.02
                || entry.informativeZones < minimumInformativeZones)
            )).length,
            ...aggregate(decisions, domains),
          });
        }
      }
    }
        }
      }
    }
  const eligible = profiles.filter((profile) => profile.falsePositiveRate <= 0.005);
  const best = eligible.sort((left, right) => (
    right.recall - left.recall || left.falsePositive - right.falsePositive
  ))[0] ?? null;
  const lockedFinal = profiles.find((profile) => (
    profile.minimumInformativeCoverage === LOCKED_VERIFICATION_PROFILE.minimumInformativeCoverage
    && profile.denseInformationCutoff === LOCKED_VERIFICATION_PROFILE.denseInformationCutoff
    && profile.denseMinimumAgreement === LOCKED_VERIFICATION_PROFILE.denseMinimumAgreement
    && profile.denseMaximumContradiction === LOCKED_VERIFICATION_PROFILE.denseMaximumContradiction
    && profile.sparseMinimumAgreement === LOCKED_VERIFICATION_PROFILE.sparseMinimumAgreement
    && profile.sparseMaximumContradiction === LOCKED_VERIFICATION_PROFILE.sparseMaximumContradiction
    && profile.minimumInformativeZones === LOCKED_VERIFICATION_PROFILE.minimumInformativeZones
  )) ?? null;
  const selectedFinal = lockedDevelopmentProfile ? lockedFinal : best;
  const finalPolicyPass = selectedFinal !== null
    && selectedFinal.recall >= 0.2
    && selectedFinal.falsePositiveRate <= 0.005
    && Object.values(selectedFinal.positiveByDomain).filter(({ recall }) => recall >= 0.1).length >= 4;
  const selectedFalsePositiveEvidence = selectedFinal === null ? [] : evidence.flatMap((entry) => {
    const matches = entry.geometryMatches
      && entry.informativeCoverage >= selectedFinal.minimumInformativeCoverage
      && entry.informativeZones >= selectedFinal.minimumInformativeZones
      && (entry.informativeCoverage >= selectedFinal.denseInformationCutoff
        ? (entry.agreementScore >= selectedFinal.denseMinimumAgreement
          && entry.contradictionScore <= selectedFinal.denseMaximumContradiction)
        : (entry.agreementScore >= selectedFinal.sparseMinimumAgreement
          && entry.contradictionScore <= selectedFinal.sparseMaximumContradiction));
    if (entry.positive || !matches) return [];
    return [{
      left: entry.left,
      right: entry.right,
      domainPair: entry.domainPair,
      candidateMatches: entry.candidateMatches,
      geometricInliers: entry.geometricInliers,
      informativeCoverage: entry.informativeCoverage,
      agreementScore: entry.agreementScore,
      contradictionScore: entry.contradictionScore,
      informativeZones: entry.informativeZones,
    }];
  });
  const pass = candidatePass && geometryPass && finalPolicyPass;
  const report = {
    profileVersion: 1,
    study: calibration
      ? 'crop-local-multiscale-binary-v0-typescript-independent-calibration'
      : lockedDevelopmentProfile
        ? 'crop-local-multiscale-binary-v0-typescript-locked-source-disjoint'
      : 'crop-local-multiscale-binary-v0-typescript-development',
    policyMode: lockedDevelopmentProfile ? 'locked-development-profile' : 'development-selection',
    developmentCorpus: manifestInputs.length === 1
      ? manifestInputs[0].manifest.corpus
      : manifestInputs.map(({ manifest }) => manifest.corpus),
    sourceManifest: manifestPaths.length === 1 ? manifestPaths[0] : manifestPaths,
    manifestSha256: manifestInputs.length === 1
      ? createHash('sha256').update(manifestInputs[0].bytes).digest('hex')
      : manifestInputs.map(({ bytes }) => createHash('sha256').update(bytes).digest('hex')),
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    sourceProvenance: manifestInputs.flatMap(({ manifest }) => (
      manifest.images.map(({ file: _file, ...entry }) => entry)
    )),
    counts: {
      sourceImages: sources.length,
      positivePairs: pairs.filter(({ positive }) => positive).length,
      negativePairs: pairs.filter(({ positive }) => !positive).length,
      profiles: profiles.length,
    },
    fingerprintProfile: FINGERPRINT_PROFILE,
    comparisonProfile: { ...COMPARISON_PROFILE, ...selectedGeometry },
    resources: {
      generationMilliseconds: summary(generationTimes),
      exploratoryComparisonMilliseconds: summary(comparisonTimes),
      lockedComparisonMilliseconds: summary(lockedComparisonTimes),
      featureCount: summary(featureCounts),
      outputBytes: summary(outputBytes),
    },
    candidateGate: {
      minimumRecall: 0.35,
      minimumPerDomainRecall: 0.2,
      pass: candidatePass,
      ...candidateGate,
    },
    geometryGate: {
      minimumRecall: 0.3,
      maximumFalsePositiveRate: 0.03,
      pass: geometryPass,
      selectedProfile: selectedGeometry,
      evaluatedProfiles: geometryProfiles.length,
      ...(summaryOnly ? {} : { profiles: geometryProfiles }),
    },
    finalDevelopmentGate: {
      minimumRecall: 0.2,
      maximumFalsePositiveRate: 0.005,
      domainGuardrail: 'at least 10% recall in four of five domains',
      policyPass: finalPolicyPass,
      pass,
      selectedProfile: selectedFinal,
      bestEligibleProfile: best,
    },
    selectedFalsePositiveEvidence,
    ...(summaryOnly ? {} : { profiles, selectedPairEvidence: evidence }),
    limitations: [
      lockedDevelopmentProfile
        ? 'The geometry and verification policies were frozen before this source-disjoint run.'
        : 'This corpus has already been inspected and is development evidence only.',
      lockedDevelopmentProfile
        ? (calibration
          ? 'Calibration negatives include every unrelated original pair plus same-template screenshot and card hard negatives.'
          : 'This 3,675-negative confirmation is too small for final statistical calibration.')
        : 'The compact verifier grid is selected here and requires a later locked fresh holdout.',
      'The internal profile is not exported or assigned public compatibility meaning.',
      calibration
        ? 'Calibration uses one locked policy pass and does not select or sweep thresholds.'
        : expandedNegatives
        ? 'Expanded negatives reuse five variant pairings per unrelated source pair and are correlated.'
        : 'Negative sampling uses three variant pairings per unrelated source pair.',
    ],
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  return {
    output,
    counts: report.counts,
    candidateGate: { recall: candidateGate.recall, falsePositiveRate: candidateGate.falsePositiveRate },
    geometryGate: {
      pass: geometryPass,
      recall: selectedGeometry.recall,
      falsePositiveRate: selectedGeometry.falsePositiveRate,
      selectedProfile: selectedGeometry,
    },
    finalDevelopmentGate: report.finalDevelopmentGate,
    resources: report.resources,
  };
};

try {
  const result = await run(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`crop-local TypeScript development: ${error.stack ?? error.message}\n`);
  process.exitCode = 2;
}
