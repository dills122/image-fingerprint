import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  summarizeCropLocalMeasurements,
  transformCropLocalCalibration,
} from './calibration-corpus.mjs';

const BASE_FINGERPRINT_PROFILE = {
  maximumDimension: 768,
  maximumFeatures: 128,
  maximumFeaturesPerCell: 12,
  fastThreshold: 20,
  verificationMaximumDimension: 96,
  colorVerificationMaximumDimension: 64,
};
const EXPANDED_FINGERPRINT_PROFILE = {
  ...BASE_FINGERPRINT_PROFILE,
  maximumFeatures: 192,
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
const STRONG_VERIFICATION_PROFILE = {
  minimumInlierRatio: 0.25,
  denseMinimumAgreement: 0.8,
  denseMaximumContradiction: 0.1,
  sparseMinimumAgreement: 0.9,
  sparseMaximumContradiction: 0,
  minimumInformativeZones: 4,
  minimumColorAgreement: 0.75,
  maximumColorContradiction: 0.05,
  minimumColorZones: 3,
};
const BALANCED_VERIFICATION_PROFILE = {
  minimumInlierRatio: 0.25,
  minimumSpatialZones: 3,
  denseMinimumAgreement: 0.72,
  denseMaximumContradiction: 0.12,
  sparseMinimumAgreement: 0.85,
  sparseMaximumContradiction: 0,
  minimumInformativeZones: 4,
  minimumColorAgreement: 0.7,
  maximumColorContradiction: 0.05,
  minimumColorZones: 3,
};
const PROFILE_DEFINITIONS = [
  {
    id: 'frozen-item-color-v0',
    fingerprint: 'base',
    comparison: LOCKED_LOCAL_PROFILE,
  },
  {
    id: 'card-ratio-fallback',
    fingerprint: 'base',
    comparison: { ...LOCKED_LOCAL_PROFILE, ...STRONG_VERIFICATION_PROFILE },
  },
  {
    id: 'card-ratio-zones-fallback',
    fingerprint: 'base',
    comparison: {
      ...LOCKED_LOCAL_PROFILE,
      ...STRONG_VERIFICATION_PROFILE,
      minimumSpatialZones: 3,
    },
  },
  {
    id: 'card-expanded-features',
    fingerprint: 'expanded',
    comparison: LOCKED_LOCAL_PROFILE,
  },
  {
    id: 'card-expanded-ratio-fallback',
    fingerprint: 'expanded',
    comparison: { ...LOCKED_LOCAL_PROFILE, ...STRONG_VERIFICATION_PROFILE },
  },
  {
    id: 'card-additive-zones-locked-fallback',
    fingerprint: 'base',
    comparison: LOCKED_LOCAL_PROFILE,
    fallbackComparison: {
      ...LOCKED_LOCAL_PROFILE,
      minimumInlierRatio: 0.25,
      minimumSpatialZones: 3,
    },
    selectionCandidate: true,
  },
  {
    id: 'card-additive-zones-balanced-fallback',
    fingerprint: 'base',
    comparison: LOCKED_LOCAL_PROFILE,
    fallbackComparison: { ...LOCKED_LOCAL_PROFILE, ...BALANCED_VERIFICATION_PROFILE },
    selectionCandidate: true,
  },
  {
    id: 'card-additive-zones-strong-fallback',
    fingerprint: 'base',
    comparison: LOCKED_LOCAL_PROFILE,
    fallbackComparison: {
      ...LOCKED_LOCAL_PROFILE,
      ...STRONG_VERIFICATION_PROFILE,
      minimumSpatialZones: 3,
    },
    selectionCandidate: true,
  },
];
const TRANSFORMATIONS = ['center', 'asymmetric', 'severe'];

const parseArguments = arguments_ => {
  let manifest;
  let output;
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] === '--') continue;
    if (arguments_[index] === '--manifest') manifest = resolve(arguments_[index += 1]);
    else if (arguments_[index] === '--output') output = resolve(arguments_[index += 1]);
    else throw new Error('Usage: mtg-card-development.mjs --manifest FILE --output FILE');
  }
  if (manifest === undefined || output === undefined) throw new Error('Manifest and output are required');
  return { manifest, output };
};

const selectSources = manifest => {
  if (!Array.isArray(manifest.catalog)) throw new Error('MTG fixture manifest must contain a catalog');
  const sources = manifest.catalog.filter(entry => (
    entry.enabled !== false
    && typeof entry.scryfallId === 'string'
    && typeof entry.referenceImage === 'string'
    && typeof entry.apiUrl === 'string'
  ));
  if (sources.length < 50) throw new Error('MTG development requires at least 50 enabled Scryfall fixtures');
  if (new Set(sources.map(({ scryfallId }) => scryfallId)).size !== sources.length) {
    throw new Error('MTG development sources must have unique Scryfall printing IDs');
  }
  return sources;
};

const createPairs = sources => {
  const positives = sources.flatMap(source => TRANSFORMATIONS.map(transformation => ({
    left: `${source.id}:original`,
    right: `${source.id}:${transformation}`,
    positive: true,
    transformation,
  })));
  const negatives = [];
  for (let left = 0; left < sources.length; left += 1) {
    for (let right = left + 1; right < sources.length; right += 1) {
      for (const [leftVariant, rightVariant] of [
        ['original', 'original'],
        ['original', 'asymmetric'],
        ['asymmetric', 'asymmetric'],
      ]) {
        negatives.push({
          left: `${sources[left].id}:${leftVariant}`,
          right: `${sources[right].id}:${rightVariant}`,
          positive: false,
          transformation: `${leftVariant}::${rightVariant}`,
        });
      }
    }
  }
  return [...positives, ...negatives];
};

const measurements = values => summarizeCropLocalMeasurements(values);

const metrics = evidence => {
  const truePositive = evidence.filter(entry => entry.positive && entry.status === 'match').length;
  const falsePositive = evidence.filter(entry => !entry.positive && entry.status === 'match').length;
  const positives = evidence.filter(entry => entry.positive).length;
  const negatives = evidence.length - positives;
  const rate = (count, total) => total === 0 ? null : count / total;
  return {
    truePositive,
    falsePositive,
    trueNegative: negatives - falsePositive,
    falseNegative: positives - truePositive,
    recall: rate(truePositive, positives),
    falsePositiveRate: rate(falsePositive, negatives),
    positiveCandidateRate: rate(evidence.filter(entry => entry.positive && entry.candidate).length, positives),
    positiveGeometryRate: rate(evidence.filter(entry => entry.positive && entry.geometry).length, positives),
    positiveGrayscaleRate: rate(evidence.filter(entry => entry.positive && entry.localStatus === 'match').length, positives),
    negativeCandidateRate: rate(evidence.filter(entry => !entry.positive && entry.candidate).length, negatives),
    negativeGeometryRate: rate(evidence.filter(entry => !entry.positive && entry.geometry).length, negatives),
    fallbackPromotions: evidence.filter(entry => entry.fallbackPromoted).length,
  };
};

const run = async ({ manifest: manifestPath, output }) => {
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const selected = selectSources(manifest);
  const require = createRequire(import.meta.url);
  const { decodeImage } = require('../../lib/node.js');
  const {
    compareCropLocalItemSourceToCrop,
    CROP_LOCAL_CARD_RECALL_V0_DEVELOPMENT_POLICY,
    fingerprintCropLocalItemExperiment,
  } = require('../../lib/core/algorithms/crop-local/index.js');
  const implementedProfile = PROFILE_DEFINITIONS.find(({ id }) => (
    id === 'card-additive-zones-balanced-fallback'
  ));
  const optionsMatch = (expected, implemented) => Object.entries(expected).every(([key, value]) => (
    implemented[key] === value
  ));
  if (
    !optionsMatch(
      implementedProfile.comparison,
      CROP_LOCAL_CARD_RECALL_V0_DEVELOPMENT_POLICY.primary,
    )
    || !optionsMatch(
      implementedProfile.fallbackComparison,
      CROP_LOCAL_CARD_RECALL_V0_DEVELOPMENT_POLICY.fallback,
    )
  ) throw new Error('MTG development benchmark has drifted from the implemented card profile');
  const sourceProvenance = [];
  const decoded = new Map();
  for (const entry of selected) {
    const path = resolve(dirname(manifestPath), entry.referenceImage);
    const encoded = await readFile(path);
    const pixels = await decodeImage(encoded);
    const id = entry.scryfallId;
    decoded.set(`${id}:original`, pixels);
    for (const transformation of TRANSFORMATIONS) {
      decoded.set(`${id}:${transformation}`, transformCropLocalCalibration(pixels, transformation));
    }
    sourceProvenance.push({
      id,
      name: entry.name,
      set: entry.set,
      collectorNumber: entry.collectorNumber,
      scryfallURL: entry.apiUrl,
      sha256: createHash('sha256').update(encoded).digest('hex'),
      byteLength: encoded.length,
      width: pixels.width,
      height: pixels.height,
    });
  }
  const fingerprintProfiles = {
    base: BASE_FINGERPRINT_PROFILE,
    expanded: EXPANDED_FINGERPRINT_PROFILE,
  };
  const fingerprints = new Map();
  const generation = {};
  for (const [profileId, profile] of Object.entries(fingerprintProfiles)) {
    const times = [];
    const bytes = [];
    const features = [];
    for (const [key, pixels] of decoded) {
      const started = performance.now();
      const fingerprint = fingerprintCropLocalItemExperiment(pixels, profile);
      times.push(performance.now() - started);
      bytes.push(Buffer.byteLength(JSON.stringify(fingerprint)));
      features.push(fingerprint.local.features.length);
      fingerprints.set(`${profileId}:${key}`, fingerprint);
    }
    generation[profileId] = {
      profile,
      milliseconds: measurements(times),
      outputBytes: measurements(bytes),
      featureCount: measurements(features),
    };
  }
  const sources = sourceProvenance.map(({ id }) => ({ id }));
  const pairs = createPairs(sources);
  const profiles = [];
  const comparisonCache = new Map();
  const compare = (fingerprintProfile, pair, comparisonProfile) => {
    const key = `${fingerprintProfile}:${pair.left}:${pair.right}:${JSON.stringify(comparisonProfile)}`;
    const cached = comparisonCache.get(key);
    if (cached !== undefined) return cached;
    const started = performance.now();
    const result = compareCropLocalItemSourceToCrop(
      fingerprints.get(`${fingerprintProfile}:${pair.left}`),
      fingerprints.get(`${fingerprintProfile}:${pair.right}`),
      comparisonProfile,
    );
    const output = { result, milliseconds: performance.now() - started };
    comparisonCache.set(key, output);
    return output;
  };
  let frozenEvidence;
  for (const definition of PROFILE_DEFINITIONS) {
    const times = [];
    const evidence = pairs.map(pair => {
      const primary = compare(definition.fingerprint, pair, definition.comparison);
      let result = primary.result;
      let milliseconds = primary.milliseconds;
      let fallbackUsed = false;
      let fallbackPromoted = false;
      if (definition.fallbackComparison !== undefined && result.status !== 'match') {
        const fallback = compare(definition.fingerprint, pair, definition.fallbackComparison);
        fallbackUsed = true;
        fallbackPromoted = fallback.result.status === 'match';
        if (fallbackPromoted) result = fallback.result;
        milliseconds += fallback.milliseconds;
      }
      times.push(milliseconds);
      return {
        ...pair,
        status: result.status,
        localStatus: result.local.status,
        reason: result.reasons[0],
        localReason: result.local.reasons[0],
        candidate: result.local.candidateMatches >= definition.comparison.minimumInliers,
        geometry: result.local.transform !== null,
        candidateMatches: result.local.candidateMatches,
        geometricInliers: result.local.geometricInliers,
        grayscaleVerification: result.local.verification,
        colorVerification: result.color,
        fallbackUsed,
        fallbackPromoted,
      };
    });
    if (definition.id === 'frozen-item-color-v0') frozenEvidence = evidence;
    const frozenFalsePositiveKeys = new Set((frozenEvidence ?? []).filter(entry => (
      !entry.positive && entry.status === 'match'
    )).map(entry => `${entry.left}:${entry.right}`));
    profiles.push({
      id: definition.id,
      fingerprintProfile: definition.fingerprint,
      comparisonProfile: definition.comparison,
      fallbackComparisonProfile: definition.fallbackComparison ?? null,
      ...metrics(evidence),
      positiveByTransformation: Object.fromEntries(TRANSFORMATIONS.map(transformation => [
        transformation,
        metrics(evidence.filter(entry => entry.positive && entry.transformation === transformation)),
      ])),
      comparisonMilliseconds: measurements(times),
      falsePositiveEvidence: evidence.filter(entry => !entry.positive && entry.status === 'match').slice(0, 25),
      additionalFalsePositiveEvidence: evidence.filter(entry => (
        !entry.positive
        && entry.status === 'match'
        && !frozenFalsePositiveKeys.has(`${entry.left}:${entry.right}`)
      )).slice(0, 25),
      representativeFalseNegatives: evidence.filter(entry => entry.positive && entry.status !== 'match').slice(0, 10),
    });
  }
  const frozen = profiles.find(({ id }) => id === 'frozen-item-color-v0');
  const candidateIds = new Set(PROFILE_DEFINITIONS.filter(({ selectionCandidate }) => selectionCandidate).map(({ id }) => id));
  const eligible = profiles.filter(profile => (
    candidateIds.has(profile.id)
    && profile.falsePositive <= frozen.falsePositive
    && profile.recall >= frozen.recall + 0.05
  ));
  const selectedProfile = eligible.sort((left, right) => (
    right.recall - left.recall
    || left.comparisonMilliseconds.p95 - right.comparisonMilliseconds.p95
    || left.id.localeCompare(right.id)
  ))[0] ?? null;
  const report = {
    profileVersion: 1,
    study: 'crop-local-card-recall-mtg-development',
    selectionUse: 'development-policy-selection',
    sourceManifest: 'local-only/MTG-Card-Analyzer/test/regression/fixtures/manifest.json',
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    corpus: {
      sources: sources.length,
      positivePairs: pairs.filter(({ positive }) => positive).length,
      negativePairs: pairs.filter(({ positive }) => !positive).length,
      transformations: TRANSFORMATIONS,
      negativePairings: ['original::original', 'original::asymmetric', 'asymmetric::asymmetric'],
      selection: 'all enabled catalog entries with a unique Scryfall printing ID and local reference image',
      pixelPolicy: 'local-only external fixtures; no Scryfall or Wizards pixels are copied into this repository',
      provenance: 'printing identity and Scryfall URL come from the external MTG-Card-Analyzer fixture manifest; encoded SHA-256 is computed locally',
    },
    sourceProvenance,
    generation,
    profiles,
    selection: {
      rule: 'highest recall among additive fallback profiles with no additional development false positives and at least five percentage points recall gain over frozen-item-color-v0',
      selectedProfile: selectedProfile?.id ?? null,
      frozenRecall: frozen.recall,
      selectedRecall: selectedProfile?.recall ?? null,
      frozenFalsePositive: frozen.falsePositive,
      selectedFalsePositive: selectedProfile?.falsePositive ?? null,
    },
    limitations: [
      'This inspected corpus is development data and cannot validate the selected profile.',
      'The positives are deterministic crops of clean scans, not camera captures or perspective transforms.',
      'No additional development false positives would not preserve the frozen independent false-positive result for a new profile.',
      'A further untouched, source-disjoint, MTG-relevant holdout with predeclared gates is required before any success claim.',
      'Source pixels are subject to their upstream rights and remain outside this repository.',
    ],
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  return { output, corpus: report.corpus, selection: report.selection, profiles: profiles.map(profile => ({
    id: profile.id,
    recall: profile.recall,
    falsePositive: profile.falsePositive,
    positiveGeometryRate: profile.positiveGeometryRate,
  })) };
};

try {
  const result = await run(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`crop-local MTG card development: ${error.stack ?? error.message}\n`);
  process.exitCode = 2;
}
