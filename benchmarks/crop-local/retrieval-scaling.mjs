import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { relative, resolve } from 'node:path';
import {
  buildCropLocalItemColorRetrievalIndex,
  CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT,
  loadCropLocalItemColorRetrievalIndex,
  queryCropLocalItemColorRetrievalIndex,
  serializeCropLocalItemColorRetrievalIndex,
} from './item-color-retrieval-index.mjs';

const PLAN = Object.freeze({
  profileVersion: 1,
  study: 'crop-local-item-color-retrieval-mechanical-scaling-v1',
  referenceCounts: [500, 1_000, 2_000],
  queriesPerScale: 40,
  featuresPerReference: 96,
  queryFeatures: 72,
  broadFeaturesPerReference: 32,
  broadTokenValuesPerPosition: 512,
  descriptorTokenBits: 16,
  candidateLimit: CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT,
  corpus: 'deterministic-generated-descriptor-mechanics-only',
  assertions: [
    'loaded-ranking-exact',
    'true-source-recall-at-1',
    'candidate-limit-bounded',
  ],
  optimizationAcceptance: [
    'candidate-ranking-sha256-unchanged-at-every-scale',
    'index-statistics-unchanged-at-every-scale',
    '2000-reference-query-p50-lower-than-full-sort-baseline',
  ],
});

const parseArguments = (arguments_) => {
  let output;
  let baseline;
  let planOnly = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--') continue;
    if (argument === '--plan-only') planOnly = true;
    else if (argument === '--output') output = resolve(arguments_[index += 1]);
    else if (argument === '--baseline') baseline = resolve(arguments_[index += 1]);
    else throw new Error('Usage: retrieval-scaling.mjs [--plan-only] [--baseline FILE] [--output FILE]');
  }
  if (planOnly && (output !== undefined || baseline !== undefined)) {
    throw new Error('--plan-only cannot be combined with output or baseline');
  }
  return { baseline, output, planOnly };
};

const mix = (input) => {
  let value = input >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
};

const descriptor = (referenceIndex, featureIndex) => {
  let output = '';
  for (let position = 0; position < 16; position += 1) {
    const seed = (
      Math.imul(referenceIndex + 1, 0x9e3779b1)
      ^ Math.imul(featureIndex + 1, 0x85ebca6b)
      ^ Math.imul(position + 1, 0xc2b2ae35)
    );
    const value = featureIndex < PLAN.broadFeaturesPerReference
      ? mix(seed) % PLAN.broadTokenValuesPerPosition
      : mix(seed) & 0xffff;
    output += value.toString(16).padStart(4, '0');
  }
  return output;
};

const fingerprint = (referenceIndex, featureCount = PLAN.featuresPerReference) => ({
  experimentalProfile: 'crop-local-item-color-v0',
  local: {
    features: Array.from({ length: featureCount }, (_, featureIndex) => ({
      descriptor: descriptor(referenceIndex, featureIndex),
    })),
  },
});

const idWidth = referenceCount => String(referenceCount - 1).length;
const referenceId = (referenceIndex, referenceCount) => (
  `reference-${String(referenceIndex).padStart(idWidth(referenceCount), '0')}`
);

const queryIndexes = (referenceCount) => {
  const count = Math.min(PLAN.queriesPerScale, referenceCount);
  return Array.from(
    { length: count },
    (_, index) => Math.floor(index * (referenceCount - 1) / Math.max(1, count - 1)),
  );
};

const summarize = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = fraction => sorted[Math.min(
    sorted.length - 1,
    Math.floor(sorted.length * fraction),
  )];
  return {
    count: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    maximum: sorted.at(-1),
  };
};

const memory = () => {
  globalThis.gc?.();
  const usage = process.memoryUsage();
  return { heapUsedBytes: usage.heapUsed, residentSetBytes: usage.rss };
};

const measureQueries = (index, referenceCount) => {
  const rows = [];
  for (const referenceIndex of queryIndexes(referenceCount)) {
    const started = performance.now();
    const result = queryCropLocalItemColorRetrievalIndex(
      index,
      fingerprint(referenceIndex, PLAN.queryFeatures),
      PLAN.candidateLimit,
    );
    rows.push({
      referenceIndex,
      expectedId: referenceId(referenceIndex, referenceCount),
      milliseconds: performance.now() - started,
      ...result,
    });
  }
  return rows;
};

const runScale = (referenceCount) => {
  let references = Array.from({ length: referenceCount }, (_, referenceIndex) => ({
    id: referenceId(referenceIndex, referenceCount),
    fingerprint: fingerprint(referenceIndex),
  }));
  const beforeBuild = memory();
  let started = performance.now();
  let index = buildCropLocalItemColorRetrievalIndex(references);
  const buildMilliseconds = performance.now() - started;
  const afterBuild = memory();

  started = performance.now();
  const serialized = serializeCropLocalItemColorRetrievalIndex(index);
  const serializationMilliseconds = performance.now() - started;
  const serializedBytes = Buffer.byteLength(serialized);
  const builtRows = measureQueries(index, referenceCount);

  references = null;
  index = null;
  const beforeLoad = memory();
  started = performance.now();
  const loaded = loadCropLocalItemColorRetrievalIndex(serialized);
  const loadMilliseconds = performance.now() - started;
  const afterLoad = memory();
  const loadedRows = measureQueries(loaded, referenceCount);

  const builtRankings = builtRows.map(({ candidates }) => candidates);
  const loadedRankings = loadedRows.map(({ candidates }) => candidates);
  const serializedBuiltRankings = JSON.stringify(builtRankings);
  const serializedLoadedRankings = JSON.stringify(loadedRankings);
  const loadedRankingExact = serializedBuiltRankings === serializedLoadedRankings;
  const trueSourceAtOne = loadedRows.filter(row => row.candidates[0]?.id === row.expectedId).length;
  const boundedCandidates = loadedRows.every(row => row.candidates.length <= PLAN.candidateLimit);
  if (!loadedRankingExact || trueSourceAtOne !== loadedRows.length || !boundedCandidates) {
    throw new Error(`retrieval scaling assertions failed at ${referenceCount} references`);
  }

  return {
    referenceCount,
    queries: loadedRows.length,
    index: {
      serializedFormat: 'deterministic-json-v1',
      serializedBytes,
      bytesPerReference: serializedBytes / referenceCount,
      sha256: createHash('sha256').update(serialized).digest('hex'),
      ...loaded.document.statistics,
    },
    resources: {
      buildMilliseconds,
      serializationMilliseconds,
      loadMilliseconds,
      buildHeapGrowthBytes: afterBuild.heapUsedBytes - beforeBuild.heapUsedBytes,
      buildResidentSetGrowthBytes: afterBuild.residentSetBytes - beforeBuild.residentSetBytes,
      loadHeapGrowthBytes: afterLoad.heapUsedBytes - beforeLoad.heapUsedBytes,
      loadResidentSetGrowthBytes: afterLoad.residentSetBytes - beforeLoad.residentSetBytes,
      queryMilliseconds: summarize(loadedRows.map(({ milliseconds }) => milliseconds)),
    },
    selectivity: {
      candidatesWithEvidence: summarize(loadedRows.map(row => row.candidatesWithEvidence)),
      candidatesWithEvidenceFraction: summarize(
        loadedRows.map(row => row.candidatesWithEvidence / referenceCount),
      ),
      postingEntriesVisited: summarize(loadedRows.map(row => row.postingEntriesVisited)),
      postingEntriesVisitedPerReference: summarize(
        loadedRows.map(row => row.postingEntriesVisited / referenceCount),
      ),
    },
    exactness: {
      loadedRankingExact,
      candidateRankingSha256: createHash('sha256')
        .update(serializedLoadedRankings)
        .digest('hex'),
      trueSourceRecallAt1: trueSourceAtOne / loadedRows.length,
      candidateLimitBounded: boundedCandidates,
    },
  };
};

const run = () => ({
  ...PLAN,
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    exposedGarbageCollector: typeof globalThis.gc === 'function',
  },
  scales: PLAN.referenceCounts.map(runScale),
});

try {
  const { baseline, output, planOnly } = parseArguments(process.argv.slice(2));
  const current = planOnly ? PLAN : run();
  let report = current;
  if (baseline !== undefined) {
    const baselineReport = JSON.parse(await readFile(baseline, 'utf8'));
    const comparisons = current.scales.map((scale, index) => ({
      referenceCount: scale.referenceCount,
      rankingExact: scale.exactness.candidateRankingSha256
        === baselineReport.scales[index]?.exactness?.candidateRankingSha256,
      indexStatisticsExact: JSON.stringify({
        indexedTokens: scale.index.indexedTokens,
        postingEntries: scale.index.postingEntries,
        droppedHighFrequencyTokens: scale.index.droppedHighFrequencyTokens,
      }) === JSON.stringify({
        indexedTokens: baselineReport.scales[index]?.index?.indexedTokens,
        postingEntries: baselineReport.scales[index]?.index?.postingEntries,
        droppedHighFrequencyTokens: baselineReport.scales[index]?.index?.droppedHighFrequencyTokens,
      }),
      queryP50Change: scale.resources.queryMilliseconds.p50
        / baselineReport.scales[index].resources.queryMilliseconds.p50 - 1,
      queryP95Change: scale.resources.queryMilliseconds.p95
        / baselineReport.scales[index].resources.queryMilliseconds.p95 - 1,
    }));
    if (comparisons.some(result => !result.rankingExact || !result.indexStatisticsExact)) {
      throw new Error('retrieval optimization changed ranking or index statistics');
    }
    const accepted = comparisons.at(-1).queryP50Change < 0;
    report = {
      profileVersion: 1,
      study: 'crop-local-item-color-retrieval-ranking-optimization-v1',
      baseline: relative(process.cwd(), baseline),
      accepted,
      decision: accepted ? 'accept' : 'reject-query-p50-not-lower-at-largest-scale',
      comparisons,
      baselineReport,
      optimizedReport: current,
    };
  }
  if (output !== undefined) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(output === undefined ? report : { output, ...report })}\n`);
} catch (error) {
  process.stderr.write(`crop-local retrieval scaling: ${error.message}\n`);
  process.exitCode = 2;
}
