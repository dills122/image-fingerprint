import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  CROP_LOCAL_ITEM_COLOR_HOLDOUT_PROFILE,
  summarizeCropLocalMeasurements,
  transformCropLocalCalibration,
  validateCropLocalCalibrationManifest,
} from './calibration-corpus.mjs';
import {
  buildCropLocalItemColorRetrievalIndex,
  CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT,
  CROP_LOCAL_ITEM_COLOR_RETRIEVAL_PROFILE,
  loadCropLocalItemColorRetrievalIndex,
  queryCropLocalItemColorRetrievalIndex,
  serializeCropLocalItemColorRetrievalIndex,
} from './item-color-retrieval-index.mjs';

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
const DEVELOPMENT_EVIDENCE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'retrieval-development-node22-2026-08-09.json',
);
const CUTOFFS = [1, 10, CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT];
const SCALING_REFERENCE_COUNTS = [10_000, 100_000, 1_000_000];

const parseArguments = (arguments_) => {
  let manifest;
  let output;
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] === '--') continue;
    if (arguments_[index] === '--manifest') manifest = resolve(arguments_[index += 1]);
    else if (arguments_[index] === '--output') output = resolve(arguments_[index += 1]);
    else throw new Error('Usage: item-color-retrieval-holdout.mjs --manifest FILE --output FILE');
  }
  if (manifest === undefined || output === undefined) {
    throw new Error('Manifest and output are required');
  }
  return { manifest, output };
};

const recallAt = (entries, cutoff) => (
  entries.length === 0
    ? null
    : entries.filter(({ rank }) => rank !== null && rank <= cutoff).length / entries.length
);

const summarizeRanks = entries => ({
  queries: entries.length,
  notRetrievedAtK: entries.filter(({ rank }) => rank === null).length,
  recall: Object.fromEntries(CUTOFFS.map(cutoff => [cutoff, recallAt(entries, cutoff)])),
});

const groupedRankSummary = (entries, values, field) => Object.fromEntries(values.map(value => [
  value,
  summarizeRanks(entries.filter(entry => entry[field] === value)),
]));

const run = async ({ manifest: manifestPath, output }) => {
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  validateCropLocalCalibrationManifest(manifest, [], CROP_LOCAL_ITEM_COLOR_HOLDOUT_PROFILE);

  const developmentBytes = await readFile(DEVELOPMENT_EVIDENCE);
  const development = JSON.parse(developmentBytes.toString('utf8'));
  if (
    development.study !== 'crop-local-v0-indexed-retrieval-development'
    || development.selectedProfile?.name !== 'idf-stop20-16'
    || development.selectedProfile?.substringBits !== 16
    || development.selectedProfile?.deduplicateWithinImage !== true
    || development.selectedProfile?.idf !== true
    || development.selectedProfile?.maximumDocumentFrequency !== 0.2
  ) throw new Error('retrieval development evidence does not match the frozen index profile');

  const require = createRequire(import.meta.url);
  const { decodeImage } = require('../../lib/node.js');
  const {
    compareCropLocalItemSourceToCrop,
    CROP_LOCAL_ITEM_COLOR_V0_POLICY,
    fingerprintCropLocalItemExperiment,
  } = require('../../lib/core/algorithms/crop-local/index.js');

  const references = [];
  const queries = [];
  const referenceFingerprintTimes = [];
  const queryFingerprintTimes = [];
  for (const entry of manifest.images) {
    const encoded = await readFile(join(dirname(manifestPath), entry.file));
    if (createHash('sha256').update(encoded).digest('hex') !== entry.sha256) {
      throw new Error(`SHA-256 mismatch for ${entry.id}`);
    }
    const pixels = await decodeImage(encoded);
    let started = performance.now();
    const referenceFingerprint = fingerprintCropLocalItemExperiment(pixels, FINGERPRINT_PROFILE);
    referenceFingerprintTimes.push(performance.now() - started);
    references.push({
      id: entry.id,
      domain: entry.domain,
      fingerprint: referenceFingerprint,
    });
    for (const transformation of CROP_LOCAL_ITEM_COLOR_HOLDOUT_PROFILE.transformations) {
      started = performance.now();
      const fingerprint = fingerprintCropLocalItemExperiment(
        transformCropLocalCalibration(pixels, transformation),
        FINGERPRINT_PROFILE,
      );
      queryFingerprintTimes.push(performance.now() - started);
      queries.push({ sourceId: entry.id, domain: entry.domain, transformation, fingerprint });
    }
  }
  const referenceById = new Map(references.map(reference => [reference.id, reference]));

  const groundTruthVerificationTimes = [];
  for (const query of queries) {
    const started = performance.now();
    const evidence = compareCropLocalItemSourceToCrop(
      referenceById.get(query.sourceId).fingerprint,
      query.fingerprint,
      LOCKED_LOCAL_PROFILE,
    );
    groundTruthVerificationTimes.push(performance.now() - started);
    query.verifierAccepted = evidence.status === 'match';
  }

  let started = performance.now();
  const builtIndex = buildCropLocalItemColorRetrievalIndex(references);
  const buildMilliseconds = performance.now() - started;
  started = performance.now();
  const serializedIndex = serializeCropLocalItemColorRetrievalIndex(builtIndex);
  const serializationMilliseconds = performance.now() - started;
  const indexBytes = Buffer.byteLength(serializedIndex);
  started = performance.now();
  const index = loadCropLocalItemColorRetrievalIndex(serializedIndex);
  const loadMilliseconds = performance.now() - started;

  const queryTimes = [];
  const candidateSetSizes = [];
  const candidatesWithEvidence = [];
  const postingEntriesVisited = [];
  const retrieval = queries.map((query) => {
    const queryStarted = performance.now();
    const result = queryCropLocalItemColorRetrievalIndex(
      index,
      query.fingerprint,
      CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT,
    );
    const queryMilliseconds = performance.now() - queryStarted;
    queryTimes.push(queryMilliseconds);
    candidateSetSizes.push(result.candidates.length);
    candidatesWithEvidence.push(result.candidatesWithEvidence);
    postingEntriesVisited.push(result.postingEntriesVisited);
    const rankIndex = result.candidates.findIndex(candidate => candidate.id === query.sourceId);
    return {
      ...query,
      candidates: result.candidates,
      rank: rankIndex < 0 ? null : rankIndex + 1,
      queryMilliseconds,
    };
  });

  const candidateVerificationTimes = [];
  const pipelineTimes = [];
  const falseMatchEvidence = [];
  let candidateComparisons = 0;
  let pipelineComparisons = 0;
  let trueSourceMatches = 0;
  let unrelatedCandidateMatches = 0;
  let correctFirstMatch = 0;
  let incorrectFirstMatch = 0;
  let noVerifiedMatch = 0;
  for (const query of retrieval) {
    let firstMatch = null;
    let verificationMillisecondsUntilFirst = 0;
    for (const [candidateIndex, candidate] of query.candidates.entries()) {
      const comparisonStarted = performance.now();
      const evidence = compareCropLocalItemSourceToCrop(
        referenceById.get(candidate.id).fingerprint,
        query.fingerprint,
        LOCKED_LOCAL_PROFILE,
      );
      const elapsed = performance.now() - comparisonStarted;
      candidateVerificationTimes.push(elapsed);
      candidateComparisons += 1;
      if (firstMatch === null) {
        pipelineComparisons += 1;
        verificationMillisecondsUntilFirst += elapsed;
      }
      if (evidence.status !== 'match') continue;
      const trueSource = candidate.id === query.sourceId;
      if (trueSource) trueSourceMatches += 1;
      else {
        unrelatedCandidateMatches += 1;
        if (falseMatchEvidence.length < 25) {
          falseMatchEvidence.push({
            sourceId: query.sourceId,
            candidateId: candidate.id,
            domain: query.domain,
            candidateDomain: referenceById.get(candidate.id).domain,
            transformation: query.transformation,
            rank: candidateIndex + 1,
            itemSignal: evidence.itemSignal,
            reasons: evidence.reasons,
          });
        }
      }
      if (firstMatch === null) firstMatch = { id: candidate.id, trueSource };
    }
    pipelineTimes.push(query.queryMilliseconds + verificationMillisecondsUntilFirst);
    if (firstMatch === null) noVerifiedMatch += 1;
    else if (firstMatch.trueSource) correctFirstMatch += 1;
    else incorrectFirstMatch += 1;
  }

  const verifierAccepted = retrieval.filter(query => query.verifierAccepted);
  const allPositiveSummary = summarizeRanks(retrieval);
  const verifierAcceptedSummary = summarizeRanks(verifierAccepted);
  const bytesPerReference = indexBytes / references.length;
  const report = {
    profileVersion: 1,
    study: 'crop-local-item-color-v0-indexed-retrieval-holdout',
    policyMode: 'frozen-retrieval-and-directional-verifier',
    corpus: manifest.corpus,
    sourceManifest: 'local-only/crop-local-item-color-holdout-v1/manifest.json',
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    sourceProvenance: manifest.images.map(({ file: _file, ...entry }) => entry),
    counts: {
      references: references.length,
      positiveQueries: queries.length,
      verifierAcceptedQueries: verifierAccepted.length,
    },
    frozenRetrievalProfile: {
      ...CROP_LOCAL_ITEM_COLOR_RETRIEVAL_PROFILE,
      candidateLimit: CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT,
      selectedFrom: 'benchmarks/crop-local/retrieval-development-node22-2026-08-09.json',
      selectionEvidenceSha256: createHash('sha256').update(developmentBytes).digest('hex'),
      selectionNote: 'The 50-reference development study selected the token profile and reached 100% verifier-accepted recall@20; K=50 was fixed before this holdout run as a conservative bounded margin.',
    },
    fingerprintProfile: FINGERPRINT_PROFILE,
    lockedLocalProfile: LOCKED_LOCAL_PROFILE,
    lockedItemColorProfile: CROP_LOCAL_ITEM_COLOR_V0_POLICY,
    retrieval: {
      allPositiveQueries: allPositiveSummary,
      verifierAcceptedQueries: verifierAcceptedSummary,
      verifierAcceptedByDomain: groupedRankSummary(
        verifierAccepted,
        CROP_LOCAL_ITEM_COLOR_HOLDOUT_PROFILE.domains,
        'domain',
      ),
      verifierAcceptedByTransformation: groupedRankSummary(
        verifierAccepted,
        CROP_LOCAL_ITEM_COLOR_HOLDOUT_PROFILE.transformations,
        'transformation',
      ),
      candidateSetSize: summarizeCropLocalMeasurements(candidateSetSizes),
      candidatesWithEvidence: summarizeCropLocalMeasurements(candidatesWithEvidence),
      postingEntriesVisited: summarizeCropLocalMeasurements(postingEntriesVisited),
    },
    index: {
      serializedFormat: index.document.postingEncoding === undefined
        ? 'deterministic-json-ordinal-arrays-v1'
        : `deterministic-json-${index.document.postingEncoding}`,
      serializedBytes: indexBytes,
      bytesPerReference,
      sha256: createHash('sha256').update(serializedIndex).digest('hex'),
      ...index.document.statistics,
    },
    resources: {
      referenceFingerprintMilliseconds: summarizeCropLocalMeasurements(referenceFingerprintTimes),
      queryFingerprintMilliseconds: summarizeCropLocalMeasurements(queryFingerprintTimes),
      groundTruthVerificationMilliseconds: summarizeCropLocalMeasurements(groundTruthVerificationTimes),
      indexBuildMilliseconds: buildMilliseconds,
      indexSerializationMilliseconds: serializationMilliseconds,
      indexLoadMilliseconds: loadMilliseconds,
      retrievalQueryMilliseconds: summarizeCropLocalMeasurements(queryTimes),
      candidateVerificationMilliseconds: summarizeCropLocalMeasurements(candidateVerificationTimes),
      stopAtFirstMatchPipelineMilliseconds: summarizeCropLocalMeasurements(pipelineTimes),
    },
    finalVerifiedOutcomes: {
      allTopKCandidateComparisons: candidateComparisons,
      stopAtFirstMatchComparisons: pipelineComparisons,
      trueSourceMatchesWithinTopK: trueSourceMatches,
      unrelatedCandidateMatchesWithinTopK: unrelatedCandidateMatches,
      firstVerifiedCandidate: {
        correctSource: correctFirstMatch,
        unrelatedSource: incorrectFirstMatch,
        noMatch: noVerifiedMatch,
        correctSourceRecall: correctFirstMatch / queries.length,
        correctSourceRecallAmongVerifierAccepted: correctFirstMatch / verifierAccepted.length,
      },
      retrievalMissedFrozenVerifierMatches: verifierAccepted.filter(({ rank }) => rank === null).length,
      verifierRejectedTrueSources: queries.length - verifierAccepted.length,
      representativeUnrelatedMatches: falseMatchEvidence,
    },
    evaluationGate: {
      metric: `candidate recall@${CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT} for frozen-verifier-accepted queries`,
      minimum: 0.98,
      observed: verifierAcceptedSummary.recall[CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT],
      pass: verifierAcceptedSummary.recall[CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT] >= 0.98,
      verifierThresholdsRetunedOnHoldout: false,
      retrievalProfileRetunedOnHoldout: false,
    },
    scalingProjections: {
      basis: 'Arithmetic projections use the observed 500-reference JSON bytes/reference and a fixed K=50; they are not measurements of larger indexes.',
      scenarios: SCALING_REFERENCE_COUNTS.map(referenceCount => ({
        referenceCount,
        projectedSerializedIndexBytesAtObservedRate: Math.round(bytesPerReference * referenceCount),
        maximumVerifierComparisonsPerQuery: CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT,
        verifierComparisonReductionVersusExhaustive: 1 - (CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT / referenceCount),
      })),
    },
    limitations: [
      'The locked corpus contains only 500 references; it measures correctness and costs at that size, not posting-list growth, ranking quality, or latency at production scale.',
      'Serialized index bytes exclude the crop-local item-color reference fingerprints that the directional verifier must also retain.',
      'Linear byte projections assume the observed bytes/reference remains stable, while token vocabulary, document frequency, and JSON overhead can change materially with corpus size.',
      'No query-latency projection is made because a larger provenance-safe corpus was not available and posting-list traversal depends on corpus composition.',
      'Retrieval-conditioned unrelated comparisons are not an exhaustive false-positive-rate estimate and do not replace the independent verifier quality report.',
      'A verifier match remains directional visual consistency, not cryptographic identity or proof that template-only crops depict the same item.',
      'Fingerprints and source pixels remain local-only; the index and retrieval path are internal benchmark artifacts and are not public package APIs.',
    ],
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  return {
    output,
    counts: report.counts,
    retrieval: report.retrieval,
    index: report.index,
    resources: report.resources,
    finalVerifiedOutcomes: report.finalVerifiedOutcomes,
    evaluationGate: report.evaluationGate,
  };
};

try {
  process.stdout.write(`${JSON.stringify(await run(parseArguments(process.argv.slice(2))), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`crop-local item-color retrieval holdout: ${error.stack ?? error.message}\n`);
  process.exitCode = 2;
}
